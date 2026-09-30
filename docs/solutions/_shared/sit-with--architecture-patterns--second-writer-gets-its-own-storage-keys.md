---
title: When a second context must write into a single writer's state, give it its own storage keys
date: 2026-09-30
category: architecture-patterns
module: session storage and pass tokens (apps/extension/src/adapters/chrome-storage.ts, apps/extension/src/pause/view-store.ts)
problem_type: architecture_pattern
component: data_model
severity: high
root_cause: concurrency
applies_when:
  - "One owner (a background service worker, a runtime with a serial queue) saves a whole-object state blob to chrome.storage or any key-value store"
  - "A second context (an extension page, a content script, another tab) also has to add something to that state"
  - "The second context's write must survive the owner's next save, even when the owner loaded before the write landed"
  - "A token or flag written by one context is read by another to skip a check"
tags: [chrome-extension, manifest-v3, chrome-storage, storage-session, single-writer, read-modify-write, lost-update, pass-token]
source: build
repo: sit-with
scope: universal
---

# When a second context must write into a single writer's state, give it its own storage keys

## Context

Sit With keeps its per-browser-session state (`SessionState`) as one object under the `session` key in `chrome.storage.session`. `CoreRuntime` in the MV3 background is its only writer: every input runs alone through one queue, loads state, steps the pure core, and saves the whole object back (`packages/core/src/runtime.ts:33-36`).

BUO-57 (PR #6) added one exception. When the person leaves a pause, the pause page has to leave a **pass token** saying "this tab may go to its results now", so the search the page navigates back to isn't paused again. The background may be asleep or slow, and the page must never wait for it, so the page writes the token itself.

The obvious way is for the page to read the `session` blob, add the token to `passTokens`, and write the blob back. That is a lost update waiting to happen, in both directions:

- The page reads, the runtime saves its own change, the page writes: the runtime's change is gone (an open pause, a released view, a pruned token).
- The runtime loads, the page writes its token, the runtime saves the object it loaded: the token is gone and the person is paused a second time for a search they just chose to see.

`chrome.storage` has no compare-and-set or transaction, and the page and the service worker don't share a lock, so the serial queue only protects writes that go through it.

## Guidance

**Give the second writer its own keys, one per item, and have the owner treat them as a separate namespace it merges on load and deletes selectively on save.** Never let the second writer touch the owner's blob.

In Sit With:

1. **The page writes only `pass:<viewId>`.** `writePassToken` sets one key holding `{tabId, outcome, at}` and nothing else (`apps/extension/src/pause/view-store.ts:41-43`). The prefix and the `session` key are shared constants (`apps/extension/src/storage-keys.ts:7-10`) so the two sides can't drift.

2. **The owner's adapter merges the keys on load.** `createChromeStorage().loadSession` reads the whole area, collects every `pass:*` key into `SessionState.passTokens`, and remembers which ids it saw (`apps/extension/src/adapters/chrome-storage.ts:34-44`). The core sees one ordinary `passTokens` map and never learns there are two writers.

3. **The owner's save writes its blob with tokens stripped, then removes only the tokens it loaded and has since dropped** (`chrome-storage.ts:45-52`):

   ```ts
   await session.set({ [SESSION_KEY]: { ...rest, passTokens: {} } });
   const kept = new Set(Object.keys(passTokens ?? {}));
   const dropped = [...loadedPassIds].filter((viewId) => !kept.has(viewId));
   if (dropped.length > 0) await session.remove(dropped.map((viewId) => PASS_PREFIX + viewId));
   ```

   A token the page wrote after the load was never in `loadedPassIds`, so the save can't delete it. The runtime never writes a `pass:*` key, and the page never writes `session`, so neither write can overwrite the other. This relies on the owner loading before each save, one input at a time, which the serial queue guarantees.

4. **Wholesale deletes clear the namespace explicitly.** "Delete everything" calls `clearPassTokens()`, which removes every `pass:*` key in the area rather than only the ones last loaded (`chrome-storage.ts:53-57`, called from `apps/extension/entrypoints/background.ts:54`). Resetting the blob alone would leave tokens behind.

5. **Lint makes the exception exactly one page wide.** Pages are banned from touching `storage` at all; only `apps/extension/entrypoints/pause/**` may import `apps/extension/src/pause/view-store.ts` (`eslint.config.js:95-111`), and `tests/lint-rules.test.ts:104-108` proves another page importing it still fails.

### Make the token itself safe to trust

Separate keys stop lost updates. Two more rules stop the token from being wrong:

- **Match it narrowly and let it expire.** The core accepts a token only when its `tabId` equals the search's tab and `isFreshToken` holds: not in the future, and no older than `PASS_TOKEN_TTL_MS` (60 s, `packages/core/src/domain/plan-defaults.ts:22`; check at `packages/core/src/domain/pause.ts:96-98`; used in `packages/core/src/domain/judge.ts:56`). It is consumed on use, and `pruneStaleTokens` drops old ones on every runtime step (`runtime.ts:81`). Without the expiry, a token the person never used could wave a much later search in the same tab straight through.
- **Every exit writes the token first, and doesn't give up on the tab lookup too early.** The page starts `tabs.getCurrent()` at load and awaits it inside `leave()` with a 500 ms cap, then writes the token under the same cap, before navigating (`apps/extension/entrypoints/pause/main.ts:27-40`). The first version capped the lookup at 150 ms *at page load*, so a slow lookup settled to `null` for good and every later exit skipped the token. Code review caught it, and the fix on PR #6's branch (unmerged as of this writing) starts the cap when the person leaves.

## Why This Matters

A single-writer rule plus a serial queue feels like it rules out races, but it only covers writers that go through the queue. The moment a second context writes, read-modify-write on a shared blob brings back the lost update the queue was meant to prevent, and it shows up only under timing (a worker waking up, a slow disk), so tests that run each side alone pass. Here the failure is a person being paused twice for a search they already chose to see, or an open pause silently vanishing.

Separate keys make the conflict impossible by construction, not by timing. It needs no locks, no messaging round trip and no change to the pure core.

## When to Apply

- Any MV3 extension where the service worker owns a state object and a page, popup or content script must add to it without waiting on the worker.
- More generally, any key-value store without transactions where one component saves a whole document and another must append to it.
- It fits additive, per-item writes (tokens, flags, acknowledgements) that the owner consumes. If the second context needs to *change* the owner's fields, send it a message instead and let the owner apply it.

## Examples

Before (read-modify-write from the page; loses either side's update):

```ts
const { session } = await browser.storage.session.get('session');
session.passTokens[viewId] = token;
await browser.storage.session.set({ session });
```

After (the page owns one key; the owner merges and prunes):

```ts
// pause page
await browser.storage.session.set({ [PASS_PREFIX + viewId]: token });
// owner adapter: load merges pass:* into passTokens; save removes only
// loaded-then-dropped ids, so a key written after the load survives.
```

The test that pins the key property is in `tests/chrome-storage.test.ts:27-34`: load with `pass:a`, write `pass:b` straight into the area, save with no tokens, and expect `pass:b` and `session` to remain while `pass:a` is gone. Neighbouring tests prove the merge on load, that tokens never land in the `session` blob, and that `clearPassTokens` removes every pass key.
