---
title: Testing a Chrome MV3 extension's privacy gates with Playwright
date: 2026-09-29
last_updated: 2026-09-30
category: best-practices
module: apps/extension e2e gates
problem_type: best_practice
component: testing_framework
severity: high
applies_when:
  - "Writing Playwright tests that load an unpacked Chrome MV3 extension in headless CI"
  - "Proving an extension makes no network requests or WebSocket connections"
  - "Proving a host web page can't see any sign of a content script"
  - "Upgrading Playwright, Chromium or axe under existing privacy or accessibility gates"
  - "Walking a page's Tab order with Playwright after the test clicked or focused something"
  - "Running gates over several page states that need stored data or async rendering"
  - "Stopping or stalling an MV3 service worker from a test to prove a page survives it"
  - "Testing a page that goes back in history when it has nowhere else to go"
  - "Proving a hidden page never painted a single visible frame, or measuring how fast it was revealed"
  - "Testing a timer or countdown whose end time lives in the service worker"
tags: [playwright, chrome-extension, manifest-v3, websocket, privacy, e2e, positive-controls, headless, keyboard, focus-order, tab-order, test-isolation, page-state, service-worker, cdp, history, requestanimationframe, fake-timers, timeout]
source: build
repo: sit-with
scope: universal
---

# Testing a Chrome MV3 extension's privacy gates with Playwright

## Context

BUO-55 (PR #4) built three CI gates for the Sit With extension. Gate A checks that nothing leaves the device. Gate B checks accessibility. Gate C checks that a web page can't see the extension. Gates A and C mean proving that something *doesn't* happen, and Playwright 1.63 has several blind spots that let a test like that pass while the extension really does leak. The test code works around each one, but the comments in it are short. What the blind spots are, and why each workaround is needed, came out of trying things in this session. That's what this doc records.

BUO-56 (PR #5) added real pages with several states each (consent given, consent withdrawn, confirming delete). Walking those states turned up three more ways a gate can report the wrong thing: a Tab walk that starts mid-page, state that carries over from one page state to the next, and checks that run before the page has drawn. Sections 6 to 8 cover them.

BUO-57 (PR #6) added the pause: a content script hides a search results page, asks the service worker whether to pause, and either reveals the page or sends the tab to a pause page. Its acceptance tests needed things Playwright has no ready API for: stopping the service worker as Chrome does when it idles, a tab with no history, proof that no frame of results was ever painted, and the end of a countdown the page doesn't own. The pause states also changed what gates A and C see. Sections 9 to 14 cover them.

## Guidance

### 1. Load the extension in the full Chromium, not the headless shell

```ts
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', // the headless shell can't load extensions
  headless: true,
  args: [`--disable-extensions-except=${BUILD_DIR}`, `--load-extension=${BUILD_DIR}`],
});
```
(`apps/extension/e2e/helpers.ts:202-207`)

- Without `channel: 'chromium'`, headless Playwright runs the headless shell. The shell starts fine but never loads the extension, so `context.waitForEvent('serviceworker')` hangs until the test times out. Nothing in the error says the extension was ignored.
- Extensions need a persistent context. A plain `chromium.launch()` + `newContext()` won't load them.
- In CI, install the full browser and skip the shell: `playwright install --with-deps --no-shell chromium` (`.github/workflows/ci.yml:43`).
- The browser revision has to match the Playwright version. Playwright 1.63.0 expects Chromium revision 1243 (the `browsers.json` inside the installed `playwright-core` package). The cloud container came with only `chromium-1194` in `/opt/pw-browsers`, which didn't match, so the browser had to be installed again. After any Playwright bump, check the revision.

### 2. Record HTTP requests and WebSockets separately, and record sockets two ways

`context.on('request')` sees HTTP requests from pages, from content scripts and from the service worker (`request.serviceWorker()` tells you which). It **never** sees WebSockets. Sockets need two separate listeners, because each one misses the other's case:

- `page.on('websocket')` catches a socket that a **content script** opens from its isolated world.
- `context.routeWebSocket(/.*/, ...)` catches only sockets opened by the page's own **main-world** scripts. It never sees content-script sockets. And once a main-world socket is routed, it stops firing `'websocket'`.

Use both, and attach the page listener to every existing page and to every new one:

```ts
const recordSocket = (url: string) => requests.push({ url, source: 'page', navigation: false });
const watchSockets = (page: Page) => page.on('websocket', (socket) => recordSocket(socket.url()));
context.pages().forEach(watchSockets);
context.on('page', watchSockets);
await context.routeWebSocket(/.*/, (socket) => { recordSocket(socket.url()); socket.close(); });
```
(`apps/extension/e2e/helpers.ts:219-226`)

### 3. Serve host pages from fixtures and count every other request

A content script's requests go out under the **host page's origin**, not `chrome-extension://<id>`. You can't pick out "the extension's traffic" by origin. Instead:

- Use `context.route` to serve the search page from a saved fixture, and abort every other `http(s)` request (`helpers.ts:228-235`). Nothing reaches the network, and a real search engine can't add noise.
- Keep the fixture free of subresources. Then the only request a clean run makes is the fixture's own navigation. Any other request, from any origin, came from the extension (`extensionTraffic`, `helpers.ts:286-292`).

### 4. Look for leaks the way the page would

To prove a page can't detect the content script, check three things:

1. **Messages.** `context.addInitScript` installs a `message` listener in the page's main world before any page script runs (`apps/extension/e2e/checks.ts:95-118`).
2. **DOM changes.** Start a `MutationObserver` on `DOMContentLoaded`, not in the init script. Starting it earlier records the parser's own `characterData` mutations as the page loads, and those show up as false positives. The fixture is static once parsed, so any mutation after that came from the extension (`checks.ts:104-117`).
3. **Final DOM.** Compare `page.content()` with the same fixture loaded in a separate `chromium.launch()` that has no extension. The two must match exactly (`apps/extension/e2e/gates/no-leaks.spec.ts:78-90`).

### 5. Give every gate a positive control, and check storage at runtime

A gate that proves something doesn't happen passes the same way whether the extension is clean or the gate has gone blind. A Playwright, Chromium or axe upgrade can blind it without any error. `apps/extension/e2e/gates/self-test.spec.ts` plants a problem for each check (a fetch and a WebSocket, a missing alt text, a hidden focus ring, a focus trap, hard-coded text, an element marked hidden that still shows (see `docs/solutions/ui-bugs/css-display-rule-overrides-hidden-attribute.md`), a `postMessage` and an attribute change) and asserts that the check catches it. The planted checks live in `apps/extension/e2e/checks.ts`, apart from the gate specs, so the self-test and the real gates run the same code.

Lint rules can ban `chrome.storage.sync`, but they can't see dynamic access like `chrome.storage[area]`. Gate A also asks the running service worker directly (`syncedStorageBytes`, `helpers.ts:250-255`):

```ts
worker.evaluate(() => chrome.storage.sync.getBytesInUse(null)); // must be 0
```

### 6. Start a Tab walk from the top of the page, not with `blur()`

A keyboard-order check presses Tab and compares what gets focus with the DOM order. If the state was set up by clicking a button halfway down the page, Tab starts from there. `element.blur()` doesn't fix it. Chrome keeps a *sequential focus navigation starting point* at the last element that was focused or clicked, and blur leaves that point where it was. In BUO-56 the settings states "withdrawn, offering delete" and "confirming delete" both click a mid-page button (`#consent-withdraw`, `#delete-start`). With `blur()` before the walk, the gate reported `Tab order ["3","4","body","0","1"]`: correct order, but starting at control 3. It looked like a real order bug in the page.

The fix is to move the starting point, not just drop focus. Put a throwaway element at the top of `body`, focus it, then remove it:

```ts
await page.evaluate(() => {
  const start = document.createElement('span');
  start.tabIndex = -1;          // focusable by script, never a Tab stop itself
  document.body.prepend(start);
  start.focus();                // moves Chrome's starting point to the top
  start.remove();
});
// the next Tab now lands on the first focusable control
```
(`apps/extension/e2e/checks.ts:20-29`, inside `keyboardProblems`)

Do this inside the check, not in each spec, so every caller (the gate and its self-test) starts the same way.

### 7. Reset app state before building each page state

The gates open one page state after another, sometimes in the same browser context: gate A loops over every state in one test (`apps/extension/e2e/gates/no-network.spec.ts:13-17`). Extension storage lives in the context's profile, so whatever one state stored (consent, a country) is still there when the next state opens. A state then renders the look of the state before it, and the gate checks the wrong screen while still passing.

`openPageState` sends `data.deleteAll` before each state's own commands, so every state is built from nothing (`apps/extension/e2e/helpers.ts:61-68`). The order that builds a state is: open the page, wait until ready, delete everything, send the state's commands, then reload (or run the state's searches, or open its fresh tab, sections 10 and 12), wait until ready again, then click (`helpers.ts:49-97`).

### 8. Make pages say when they have drawn, and prove the gate waits

Extension pages read their state from the service worker, so the first paint is an empty shell. Axe, the Tab walk and the text check all pass on an empty shell, because there's nothing on it to fail. Each page sets `body[data-ready="true"]` once it has drawn its state (`markReady`, `apps/extension/src/ui/page.ts:54-56`), and `waitReady` waits for it with a 5-second timeout (`apps/extension/e2e/helpers.ts:129-131`). A state that needs more, like a panel shown after a click, also names a `waitFor` selector in `apps/extension/e2e/pages.json`.

The wait needs its own positive control. If `waitReady` ever stopped waiting (a wrong selector, a swallowed timeout), the gates would go back to checking empty shells with no error. `self-test.spec.ts` plants a page that never sets the flag and asserts that `waitReady` rejects ("the gates refuse a page that never finishes drawing").

### 9. Stop the service worker by closing its DevTools target

Chrome stops an idle MV3 service worker after about 30 seconds, and a page has to survive that: a countdown can't restart or freeze (AE13), and the urgent route out of a pause must still work with no background (AE16). A test has to stop the worker on demand.

What didn't work, per this session: sending `ServiceWorker.stopAllWorkers` on a CDP session attached to a page. That session only reaches the page's own target, and the extension's worker kept running. What works is going through `Target`, which sees every target in the browser:

```ts
const cdp = await context.newCDPSession(page);
const workers = async () =>
  (await cdp.send('Target.getTargets')).targetInfos.filter(
    (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extensionId}/`),
  );
for (const w of await workers()) await cdp.send('Target.closeTarget', { targetId: w.targetId });
// Closing returns before the worker is gone: poll until no target is left.
for (let tries = 0; tries < 50 && (await workers()).length > 0; tries += 1) await page.waitForTimeout(100);
await cdp.detach();
```
(`stopServiceWorker`, `apps/extension/e2e/helpers.ts:309-324`; used in `apps/extension/e2e/flows/pause.spec.ts:152` and `:178`)

The next extension message starts a fresh worker. Two traps come after:

- **Playwright's old `Worker` handle is dead**, and Playwright doesn't fire `'close'` for it, so nothing tells the test the handle went stale, and a helper that looks up the worker through `context.serviceWorkers()` can be handed it. `worker.evaluate` on it hangs until the test times out, with no error that says why. Any helper that reaches storage through the worker (here `storageContents`, `syncedStorageBytes`, `expireCountdown`) must not run after a stop.
- **Read storage from an extension page instead.** Open `popup.html` in a new tab and call `chrome.storage.local.get` there (`logFromPage`, `pause.spec.ts:41-51`).

### 10. Open a "tab with no history" through the extension, not with `newPage()`

The pause page, opened with an unknown or missing view id, goes back in history so the person lands where they were. When there is nowhere to go back to, it should stay put and say the pause has ended. A tab from `context.newPage()` can't test that: it starts with an `about:blank` history entry, so `history.back()` leaves the extension page for `about:blank`, and the page under test is gone before the gate looks at it.

Open the tab the way the extension opens tabs, from the service worker, and catch it with `waitForEvent('page')` set up **before** the call:

```ts
const url = `chrome-extension://${extensionId}/pause.html#${hash}`;
const opened = context.waitForEvent('page', { predicate: (p) => p.url() === url, timeout: 5_000 });
await (await serviceWorker(context)).evaluate((target) => chrome.tabs.create({ url: target }), url);
const page = await opened;
```
(`openPageState`, the `hash` branch, `apps/extension/e2e/helpers.ts:79-88`)

A tab made by `chrome.tabs.create` has only the one entry. `emulateMedia` settings belong to the page, so the dark-mode run sets them again on the new page (`helpers.ts:88`). The page state that uses this is "unknown pause" in `apps/extension/e2e/pages.json`.

### 11. Prove no frame was shown by sampling every animation frame from the page

The guard hides a results page before it can paint, and on a repeat search the tab goes to the pause without the results ever showing (AE11). "Not visible when the test looked" doesn't prove that: a single painted frame between two checks is exactly the failure. So the test records what every frame looked like, from inside the page:

```ts
await page.exposeBinding('__gateFrame', (_source, url, shown, at) => frames.push({ url, shown, at }));
await page.addInitScript(() => {
  const tick = (at: number) => {
    if (document.documentElement && document.body) {
      window.__gateFrame(location.href, getComputedStyle(document.documentElement).visibility !== 'hidden', at);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
```
(`watchFrames`, `apps/extension/e2e/flows/pause.spec.ts:63-79`)

- The init script runs in the main world on every navigation of that page, and the binding survives navigations, so one call covers the first search, the repeat and the pause.
- Assert on the repeat's URL: it drew frames (so the watcher was running there), and none of them was shown (`pause.spec.ts:110-113`).
- The first search is the positive control. It must have at least one shown frame, or the watcher can't see a shown page at all and the "no shown frame" check proves nothing.
- The rAF timestamp counts from when the page started loading, so the first shown frame also measures the reveal time. AE45 busies the worker for 2.5 s and requires the first shown frame of the next results page before 650 ms: the guard's own 500 ms timer (`REVEAL_AFTER_MS`, `apps/extension/src/search/guard.ts:9`) plus a frame or two of slack. It also requires a hidden frame on that page, which proves the guard hid it first (`pause.spec.ts:189-218`).
- To stall the worker, start a busy loop in it with `worker.evaluate` and **don't await it** (`void worker.evaluate(...).catch(() => undefined)`, `pause.spec.ts:196-203`). The worker's thread is blocked until the loop ends, so the content script's message gets no answer. Awaiting it would block the test for the same time.

### 12. Move the service worker's end time, not the page's clock

Playwright's `context.clock` installs fake timers in pages. It can't reach the service worker, which is where the pause's end time is kept. Faking only the page's clock leaves the page and the worker disagreeing about the time, so the test would check a state the extension never reaches on its own.

Instead, the test rewrites the stored end time through the service worker, one second in the past (`expireCountdown`, `apps/extension/e2e/helpers.ts:115-127`). The pause page listens to `storage.session.onChanged` (`apps/extension/src/pause/view-store.ts:35`), so the same write also tests that the open page reacts to a change it didn't make. It's used both in a flow test (AE12, `pause.spec.ts:122`) and as a page state ("countdown over", `expireCountdown: true` in `pages.json`). Since it goes through the worker, it can't run after section 9's stop.

### 13. Allow exactly the one DOM change a guard is meant to make, and prove the rest still fail

Gate C used to fail on any DOM change to a results page. The guard now hides every results page with a `<style>` it adds at `document_start` (`apps/extension/entrypoints/search.ts:11`) and removes on reveal, so a clean run records one removal. The gate allows exactly that one signal, matched as a full string, tag and rule included:

```ts
export const HIDE_RULE_REMOVED = 'removed: <style>html{visibility:hidden!important}</style> on HTML';
export async function unexpectedSignals(page: Page) {
  return (await pageSignals(page)).filter((signal) => signal !== HIDE_RULE_REMOVED);
}
```
(`apps/extension/e2e/checks.ts:121-131`)

The add isn't seen because the observer starts on `DOMContentLoaded` (section 4), after the style went in. To make an exact match possible, the observer records a removed or added `<style>` by its `outerHTML`, not just its node name (`checks.ts:106`). An allowance that matched on node name would let the extension add or remove any style.

The allowance is a new blind spot, so it gets a positive control: `self-test.spec.ts` ("gate C allows only the guard removing its own hide rule") adds and removes a different `<style>` and requires `unexpectedSignals` to report both.

### 14. Give a test that walks every page state a time budget per state

Gate A walks every page state in one test and settles 1.5 s on each. When the pause states arrived, each running two searches, the walk passed Playwright's default 30 s test timeout on the CI runner while it still passed locally. The budget now grows with the list:

```ts
test.setTimeout(30_000 + PAGE_STATES.length * 6_000);
```
(`apps/extension/e2e/gates/no-network.spec.ts:10-12`)

A fixed timeout on a loop over `pages.json` breaks the next time someone adds a state, in CI only, and looks like a flaky runner. The other loops over `PAGE_STATES` (in gates B and C) should follow the same rule if they start to run close to the limit.

## Why This Matters

Almost every blind spot above fails **silently, and toward "pass"**. With the headless shell, no extension loads, so the no-network gate has nothing to catch. If you rely on `context.on('request')` alone, a WebSocket leak gets through. If you filter traffic by extension origin, you miss everything the content script sends. If the observer starts too early, the gate fails on noise and people learn to ignore it. State left over from the last state, or checks that run on an empty shell, test a screen nobody sees and pass. The same goes for the pause tests: a visibility check that samples now and then misses the one painted frame, and a faked page clock tests a countdown the worker never ends. The exceptions fail a page that is fine: the Tab walk that starts mid-page, a `newPage()` tab that goes back to `about:blank`, a worker handle that hangs after a stop, and a fixed timeout that runs out once the state list grows. A gate that cries wolf teaches people to skip it. A privacy product whose promise is "query text never leaves the device" can't rest on gates that are green for these reasons.

## When to Apply

- Any Playwright suite that loads an MV3 extension, in this repo or another mindmelding extension, including the later Safari and chatbot work if it runs on Chromium.
- Any time Playwright, Chromium or `@axe-core/playwright` is upgraded. Run `self-test.spec.ts` first. If a self-test fails, the gates can't be trusted until it's fixed.
- Any keyboard-order check that runs after the test clicked or focused something. Reset the starting point as in section 6.
- When a new page state is added. It gets built from a clean store (section 7), must set `data-ready` once drawn (section 8), and adds to gate A's time budget (section 14).
- Any test that needs the background gone or stuck (section 9, and the busy loop in section 11), a tab with no history (section 10), or a timer that the service worker owns (section 12).
- Any content script that is allowed to touch the host page. Allow its exact change and nothing wider, and plant a different change in the self-test (section 13).
- When a new page or content script is added. It needs to be in `apps/extension/e2e/pages.json`, and a new kind of leak needs a new planted control.

## Examples

Before, a no-network gate that passes while blind:

```ts
const context = await chromium.launchPersistentContext('', { headless: true, args: [...] }); // headless shell: no extension
context.on('request', (r) => seen.push(r.url()));                                          // WebSockets never recorded
expect(seen.filter((u) => u.startsWith(`chrome-extension://${id}`))).toEqual([]);           // content-script traffic has the page's origin
```

After: `channel: 'chromium'`, socket recording in both places, fixtures served by routing, any non-fixture request counted, and a self-test that plants a fetch and a WebSocket and requires the gate to see both (`self-test.spec.ts:20-31`).

The gate A self-test plants its socket from `page.evaluate`, so the socket opens in the main world. That exercises the `routeWebSocket` path only. The content-script (isolated-world) path through `page.on('websocket')` was confirmed by hand in BUO-55 with a planted content-script socket, and it has no checked-in control yet. A self-test that opens a socket from an isolated world would close that gap.

## Related

- PR https://github.com/mindmelding/sit-with/pull/4 (BUO-55): sections 1 to 5, merged
- PR https://github.com/mindmelding/sit-with/pull/5 (BUO-56): sections 6 to 8, merged
- PR https://github.com/mindmelding/sit-with/pull/6 (BUO-57): sections 9 to 14, open as of 2026-09-30
- Files: `apps/extension/e2e/flows/pause.spec.ts`, `apps/extension/src/search/guard.ts`, `apps/extension/e2e/pages.json`, `apps/extension/src/ui/page.ts`, `apps/extension/e2e/helpers.ts`, `apps/extension/e2e/checks.ts`, `apps/extension/e2e/gates/*.spec.ts`, `.github/workflows/ci.yml`
