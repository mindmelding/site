---
title: A fail-open cutoff checked before the writes lets a late decision act anyway
date: 2026-09-30
category: logic-errors
module: search guard and background (apps/extension/src/search/guard.ts, apps/extension/entrypoints/background.ts, packages/core/src/domain/plan-defaults.ts)
problem_type: logic_error
component: service_layer
symptoms:
  - "A search decided at about 440 ms passed the core's 450 ms late-decision check, then storage writes and the reply pushed the tab move past the content script's own 500 ms reveal"
  - The person could see results appear and then be pulled off them onto the pause page, breaking the fail-open promise
  - "Unit tests stayed green: the guard ignored late replies correctly and the core rejected late decisions correctly, each in isolation"
root_cause: async_timing
resolution_type: code_fix
severity: high
tags: [fail-open, timeout, race, cross-process, chrome-extension, content-script, service-worker, time-of-check-time-of-use, contract-test]
source: code-review
repo: sit-with
scope: universal
---

# A fail-open cutoff checked before the writes lets a late decision act anyway

## Problem

Sit With's guard is split across two processes with two timers. The content script hides a search result page and shows it again by itself after `REVEAL_AFTER_MS = 500` if the background hasn't answered (`apps/extension/src/search/guard.ts:9`). The core refuses to pause a decision made more than `LATE_DECISION_MS = 450` after the page started (`packages/core/src/domain/plan-defaults.ts:15-19`, `isLateDecision`). The core checked its cutoff where it made the decision, but the side effect, moving the tab to the pause page, happened later, after work the cutoff didn't cover.

## Symptoms

- In `CoreRuntime.judgeSearch` (`packages/core/src/runtime.ts:75-97`) the clock is read once (`ctx.clock.now()`), the pure `judgeSearch` applies `isLateDecision` against it (`packages/core/src/domain/judge.ts:100`), and only then do `saveStored` and `saveSession` run. Then the background replies, then calls `tabs.update`.
- A decision that passed at ~440 ms could reach `tabs.update` after 500 ms. By then the content script had revealed the results and was ignoring the late `pausing` reply (`tests/search-guard.test.ts`, "a late answer after the 500 ms reveal changes nothing"), so nothing stopped the tab from moving.
- ce-code-review (adversarial and correctness reviewers, confirmed by the validator) caught it on BUO-57, PR #6. No test failed, because each half was correct on its own terms.

## What Didn't Work

- **Checking the cutoff inside the decision.** A pure core can't see how long the writes and message hop after it will take. The check is a time-of-check/time-of-use gap: the clock read it uses is stale by the time anything visible happens.
- **Trusting the 50 ms margin.** `LATE_DECISION_MS` was set 50 ms under the reveal so there would be slack, but that slack only covers work after the check if that work is bounded. Storage writes in an MV3 service worker (possibly waking from idle) aren't.

## Solution

Re-check the same rule at the last point before the side effect, and when it fails, undo the decision's state rather than carrying it out. In the background (`apps/extension/entrypoints/background.ts:61-87`):

```ts
const pause = effects.find((effect) => effect.type === 'openPause');
// The last point where the extension can still decline to move the tab. If the
// decision and its writes ran past the content script's own reveal, the person is
// already looking at results: leave them there (KTD13).
if (pause && isLateDecision(message.startedAt, Date.now())) {
  reply({ ok: true, data: 'reveal' });
  await runtime.releasePause(pause.viewId).catch(() => undefined);
  return;
}
reply({ ok: true, data: pause ? 'pausing' : 'reveal' });
await carryOut(effects).catch(() => undefined);
```

- One rule, `isLateDecision`, is exported from core (`packages/core/src/api.ts:8`) and used in both places, so the core and the background can't disagree about what "late" means.
- `runtime.releasePause(viewId)` (`packages/core/src/runtime.ts:101-107`) calls `releaseView` (`packages/core/src/domain/pause.ts:88-94`), which marks that view released and drops the open pause when no other view of it is open. Otherwise a pause the person never saw would stay open in session state.
- Both sides stamp time with `Date.now()` (the content script's `now` in `apps/extension/entrypoints/search.ts:40`, the background's re-check). A wall clock is comparable across the two processes; `performance.now()` is not, because each process has its own time origin.

Because core may not import from `apps/` (AD-1), nothing in the type system ties the two numbers together. A root test does (`tests/timing-contract.test.ts`):

```ts
expect(LATE_DECISION_MS).toBeLessThanOrEqual(REVEAL_AFTER_MS - 25);
```

It also pins `isLateDecision` at its edges: exactly `LATE_DECISION_MS` is on time, one more millisecond is late, and a start time in the future counts as late.

Fixed on PR #6 (branch `claude/amazing-johnson-nb54mo`), unmerged as of this writing.

## Why This Works

The fail-open promise is about what the person sees, so the cutoff has to guard the action that changes what they see, not the computation that recommends it. Moving the check to just before `tabs.update` means every delay before it (storage writes, a service worker waking, the message hop) is counted. The remaining window, from the re-check to the tab actually moving, is a single browser call, and the 25 ms minimum gap pinned by the contract test (50 ms today) is there to cover it.

The contract test covers the other way this breaks: someone tunes one timer in one package without knowing the other exists. With the test, raising `LATE_DECISION_MS` or lowering `REVEAL_AFTER_MS` past the gap fails CI.

## Prevention

- **For any fail-open guard split across processes, find the side effect and check the cutoff right before it.** Keep the early check too: it stops wasted work. But the late check is the one that keeps the promise.
- **When the late check fails, roll back what the decision wrote**, don't only skip the effect. Here that's releasing the pause view.
- **Share one predicate** between the two check points instead of re-deriving the comparison in each.
- **Pin cross-package timing constants with a test at the repo root** when a boundary rule stops one package importing the other. State the minimum margin in the assertion, not just the ordering.
- **Stamp start times with a clock both processes can compare** (wall clock), and treat a start time in the future as late.
- **Known residual:** a released-late pause still has its `pause.shown` event in the log, because `openPause` writes that event with the decision (`packages/core/src/domain/pause.ts:47`) and `releaseView` only touches session state. Any count built on `pause.shown` will be slightly high until the release also logs, or the event moves to when the pause page actually renders.
- **Test gap:** the background's re-check lives in `apps/extension/entrypoints/background.ts` and has no unit test, and `releaseView` has no direct test. A test with a fake clock that crosses 450 ms between `judgeSearch` returning and the re-check would pin the fix itself.

## Related Issues

- BUO-57; PR #6 (https://github.com/mindmelding/sit-with/pull/6)
- `docs/solutions/security-issues/permission-guard-shares-source-of-truth-with-build.md`: a different guard that looked right in isolation because both sides of its check moved together. Here the two sides lived apart and nothing held them together.
