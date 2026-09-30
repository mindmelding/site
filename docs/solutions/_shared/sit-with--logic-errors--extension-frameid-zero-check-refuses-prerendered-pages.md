---
title: A "frameId === 0" sender check silently refuses pages Chrome prerendered
date: 2026-09-30
category: logic-errors
module: apps/extension background message routing
problem_type: logic_error
component: frontend
symptoms:
  - "A search opened from the address bar shows its results with no pause, though the same search typed again pauses"
  - "The background answers the content script's search message with `{ ok: false, code: 'refused' }` and no error is logged"
  - "Unit tests of the sender check pass, because every fixture uses `frameId: 0`"
root_cause: wrong_api
resolution_type: code_fix
severity: high
framework_version: chrome 106+
tags: [chrome-extension, manifest-v3, runtime-onmessage, message-sender, frameid, frametype, prerender, speculation-rules, content-script, fail-safe]
source: code-review
repo: sit-with
scope: universal
---

# A "frameId === 0" sender check silently refuses pages Chrome prerendered

## Problem

The Sit With background only answers a search message when it comes from its own content script in the top frame of a tab. It tested "top frame" as `sender.frameId === 0`. That holds for a normal page load but not for a page Chrome prerendered: a prerendered main frame gets a non-zero `frameId` and keeps it after the person opens the page. Chrome often prerenders search results from the address bar, so the check refused one of the most common ways a search arrives.

## Symptoms

- The background's `runtime.onMessage` listener (`apps/extension/entrypoints/background.ts:101-124`) falls through to `sendResponse({ ok: false, code: 'refused' })` for the activated prerender.
- The content script's guard (`apps/extension/src/search/guard.ts`) treats any answer other than `'pausing'` as "reveal", so the results appear and no pause opens. Nothing errors and nothing is logged.
- This fails safe. The person sees their results, and urgent help is never blocked. But the core feature quietly misses the path, and no test or gate noticed.

## What Didn't Work

- **Unit tests of the sender check.** The table in `tests/shell-messages.test.ts` built every accepted sender with `frameId: 0`. It tested the check exactly as written, so it could not show that the check's idea of a top frame was wrong.
- **The e2e gates.** They load pages with a normal navigation, where the main frame's id is 0. No spec drives a prerender and then activates it, so the gap stayed hidden.
- **The content script's prerender handling.** The guard already waits for `prerenderingchange` before it sends anything (`apps/extension/src/search/guard.ts:76-79`), which is correct. That is exactly why the bug only hit activated prerenders: the message always came from a document that had been prerendered.

ce-code-review's correctness reviewer found it by reading the code (confidence anchor 50, so it went to residual risk rather than the must-fix list). It was fixed in the same PR.

## Solution

Accept the outermost frame as well as frame 0 (`apps/extension/src/messages/search.ts:48-56`):

```ts
// Before
sender.id === runtimeId &&
sender.frameId === 0 &&
// ...

// After
sender.id === runtimeId &&
(sender.frameId === 0 || sender.frameType === 'outermost_frame') &&
// ...
```

`SearchSender` gains an optional `frameType?: string` field, so tests and older Chrome builds without it still type-check. Two rows were added to the table in `tests/shell-messages.test.ts:49-58`:

```ts
['a prerendered page, once shown (outermost frame, non-zero id)', { id: ID, url: SEARCH, frameId: 7, frameType: 'outermost_frame', tab }, true],
['a sub-frame that is not the outermost frame', { id: ID, url: SEARCH, frameId: 7, frameType: 'sub_frame', tab }, false],
```

## Why This Works

A tab's `frameId` names a frame, not a position. Chrome gives the main frame of a normal load id 0, but a prerender builds its page in a separate frame tree first, and that main frame gets its own non-zero id. When the person opens the page, Chrome swaps the prerendered frame into the tab rather than creating a new one, so the id stays the same. From then on the page is the tab's top-level document, but it doesn't have `frameId === 0`.

Since Chrome 106, `runtime.MessageSender` also carries `frameType` and `documentLifecycle`. `frameType` says what the frame is: `'outermost_frame'` for the tab's top-level document (an activated prerender included), `'sub_frame'` for an iframe, and `'fenced_frame'` for a fenced frame. Testing it asks the question the check meant to ask. Sub-frames and fenced frames are still refused. `frameId === 0` stays in the check so it still works where `frameType` is missing.

## Prevention

- **Read "top frame" as `frameType === 'outermost_frame'`, not `frameId === 0`.** Keep `frameId === 0` only as a fallback. This applies anywhere extension code equates frame 0 with the main frame, not just `runtime.onMessage` senders.
- **`frameType` alone doesn't say the page is showing.** A document that is still prerendering is also `'outermost_frame'`, and its `documentLifecycle` is `'prerender'`. Sit With is fine because its content script says nothing until `prerenderingchange`, and the guard tests prove that (`tests/search-guard.test.ts`, "while prerendering, stays hidden and sends nothing until the page is shown"). If a content script could message while prerendering, also require `sender.documentLifecycle === 'active'`, or the background will act on a page nobody has opened.
- **Put a prerendered sender in every sender-check test table.** Add an accepted row with a non-zero `frameId` and `frameType: 'outermost_frame'`, and a refused row for `'sub_frame'`. A table where every accepted row uses `frameId: 0` can't catch this.
- **A fail-safe fallback can hide a broken feature.** "Reveal on any other answer" is the right default, but it means a wrong refusal looks the same as "not a worry search". A refusal from a sender that passed every other check (our id, a search URL, a real tab) deserves a test, or a debug-only signal.

## Remaining check

Not yet verified end to end. No e2e spec prerenders a Google results page and then activates it, so the fix rests on Chrome's documented `MessageSender` fields and the unit table. The check still to do is to drive a real prerender (from the address bar, or through speculation rules on a fixture page), activate it, and confirm the background accepts the message and the pause opens.

## Related Issues

- Linear BUO-57; PR https://github.com/mindmelding/sit-with/pull/6 (open as of this writing).
- `docs/solutions/security-issues/wxt-content-script-wrapper-reveals-extension-id.md` covers the same content script, on what the host page can see. That doc is about leaks to the page, this one about the background's sender check. They don't overlap, but read both before changing how the content script starts or talks to the background.
- `docs/solutions/best-practices/testing-chrome-mv3-extension-privacy-gates-with-playwright.md` covers the e2e gates. An activated-prerender spec would belong alongside them.
