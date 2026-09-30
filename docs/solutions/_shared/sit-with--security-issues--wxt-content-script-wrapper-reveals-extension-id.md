---
title: WXT's content-script wrapper tells the host page the extension is there
date: 2026-09-29
category: security-issues
module: apps/extension content script
problem_type: security_issue
component: frontend
symptoms:
  - "Gate C (no-leaks) fails: the search page's `message` listener sees `{type: '<extensionId>:<entrypoint>:wxt:content-script-started', ...}`"
  - A document CustomEvent whose name contains the extension id fires on every page the content script matches
root_cause: wrong_api
resolution_type: code_fix
severity: high
framework_version: wxt 0.21.4
tags: [wxt, content-script, extension-fingerprinting, privacy, postmessage, define-unlisted-script, chrome-extension]
source: build
repo: sit-with
scope: universal
---

# WXT's content-script wrapper tells the host page the extension is there

## Problem

In WXT 0.21.4, every script built with `defineContentScript` runs inside a `ContentScriptContext`. When it starts, that context announces itself to the host page, twice. It posts a `window.postMessage` to `'*'` and dispatches a `document` CustomEvent, and both carry the extension id. Any script on the page can tell the extension is installed and learn which one it is. For Sit With, the search page must never be able to detect the extension (R30, AE46), so this is a privacy leak. It would be one for any extension whose users would not want a site to know it's installed.

## Symptoms

- The no-leaks gate (`apps/extension/e2e/gates/no-leaks.spec.ts`, test "the search page sees no sign of the extension") failed. Its main-world `message` listener recorded `message: {"type":"<extensionId>:leak:wxt:content-script-started",...}`. `leak` was the name of the entrypoint under test.
- The same startup fires a `document` event named `<extensionId>:<entrypoint>:wxt:content-script-started`. Nothing in the page's DOM changes, so a DOM-diff check alone misses both signals.

## What Didn't Work

- **`noScriptStartedPostMessage: true`.** Early research suggested this option, which WXT's docs say will become the default. It stops only the `postMessage`. `stopOldScripts()` still dispatches the `document` CustomEvent unconditionally, and its name contains the extension id. A Chrome Web Store id is public and stable, so a page that targets this extension can listen for that exact event name. The option's own docs (`wxt/dist/types.d.mts`, around line 778) say the custom event is WXT's replacement for the postMessage, so waiting for the new default won't fix this either.
- **Relying on the existing no-leak checks.** Gate C originally probed `chrome-extension://` fetches and DOM changes only, and both signals got past it. The gate only caught the leak after it gained main-world listeners for `message` and for the named event.

## Solution

Build the content script with `defineUnlistedScript`, which has no `ContentScriptContext`, and declare it in the manifest yourself.

Before (the default WXT way; leaks):

```ts
// entrypoints/search.content.ts
export default defineContentScript({
  matches: searchResultPages,
  runAt: 'document_start',
  noScriptStartedPostMessage: true, // not enough: the document event still fires
  main(ctx) { /* ... */ },
});
```

After:

```ts
// apps/extension/entrypoints/search.ts
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

export default defineUnlistedScript(() => { /* ... */ });
```

```ts
// apps/extension/wxt.config.ts (manifest section)
const searchResultPages = resultPagePatterns(engines); // generated from core data

content_scripts: [
  {
    matches: searchResultPages,
    js: ['search.js'],
    run_at: 'document_start',
    all_frames: false,
  },
],
```

WXT emits an unlisted script as `<entrypoint>.js` at the output root (`.output/chrome-mv3/search.js`), which is the file the manifest entry names. The same generated `searchResultPages` list feeds `host_permissions`, so the two cannot drift apart.

## Why This Works

Paths under `wxt/dist/` below are inside the installed `wxt` package in `node_modules`.

WXT's isolated-world content-script entry (`wxt/dist/virtual/content-script-isolated-world-entrypoint.mjs`) always calls `main(new ContentScriptContext(import.meta.env.ENTRYPOINT, options))`. The context's constructor calls `stopOldScripts()` (`wxt/dist/utils/content-script-context.mjs:48`), which does this (lines 167-177):

```js
stopOldScripts() {
  document.dispatchEvent(new CustomEvent(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, { detail: {...} }));
  if (!this.options?.noScriptStartedPostMessage) window.postMessage({
    type: ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, ...
  }, "*");
}
```

`SCRIPT_STARTED_MESSAGE_TYPE` is `getUniqueEventName("wxt:content-script-started")`, which is `` `${browser?.runtime?.id}:${import.meta.env.ENTRYPOINT}:${eventName}` `` (`wxt/dist/utils/internal/custom-events.mjs:15-17`). WXT uses this handshake so a re-injected script can invalidate the old one during development and updates. The cost is that the page sees it too.

The unlisted-script entry (`wxt/dist/virtual/unlisted-script-entrypoint.mjs`) only initialises plugins and calls `definition.main()`. It creates no context, dispatches no events and posts no messages. The built `search.js` contains no `content-script-started` string.

## Prevention

- In any extension that must stay invisible to pages, do not use `defineContentScript`. Use `defineUnlistedScript` and declare `content_scripts` in `wxt.config.ts`. A comment there explains why, so nobody "tidies" it back.
- Going without the context means going without what it provides: `ctx.onInvalidated`, `ctx.isValid`, ctx-scoped listeners and timers, the `wxt:locationchange` watcher, and the `createShadowRootUi`/`createIntegratedUi` helpers that take `ctx`. If you need any of these, write your own version that sends nothing to the page.
- Keep a gate that listens in the page's main world before any script runs. `watchPages()` in `apps/extension/e2e/checks.ts` adds a `message` listener, listeners for `<id>:search:wxt:content-script-started` and plain `wxt:content-script-started`, and a post-parse MutationObserver. The test also expects the finished page to match the same fixture loaded without the extension. Fetch and DOM checks alone don't see postMessage or CustomEvent traffic.
- When upgrading WXT, grep the built content script for `content-script-started` and `postMessage`. A new version could add a similar handshake to other entry types.

## Related Issues

- Linear BUO-55; PR https://github.com/mindmelding/sit-with/pull/4 (open as of this writing).
- Spec requirements R30 and AE46 (the search page cannot detect the extension) in the hub's `docs/specs/health-search-guard/`.
