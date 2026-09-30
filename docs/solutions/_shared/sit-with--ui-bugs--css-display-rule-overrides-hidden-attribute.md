---
title: A CSS display rule beats the hidden attribute, and accessibility gates don't notice
date: 2026-09-29
category: ui-bugs
module: apps/extension UI pages (settings, popup)
problem_type: ui_bug
component: frontend
symptoms:
  - "Settings showed 'Set up Sit With' next to 'Withdraw consent' after consent was given"
  - The popup offered setup even when Sit With was already on
  - "axe, the keyboard walk and the catalog-text check all passed on the broken pages"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [css, hidden-attribute, display, cascade, ui-state, e2e, playwright, screenshots, gates, design-review]
source: design-review
repo: sit-with
scope: universal
---

# A CSS display rule beats the hidden attribute, and accessibility gates don't notice

## Problem

The pages show or hide controls per state by toggling the HTML `hidden` attribute. A button style that set `display` made hidden links visible anyway. In BUO-56 (PR #5) settings offered "Set up Sit With" and "Withdraw consent" at the same time, and the popup always offered setup. Every automated gate passed. The bug was found only by looking at screenshots of each state.

## Symptoms

- Settings, with consent given, showed the `#setup-again` link beside `#consent-withdraw`. The two contradict each other.
- The popup showed `#popup-setup` ("Finish setup") when Sit With was on.
- Gate B was green on both pages: axe found no violations, the keyboard walk found no trap or missing focus ring, and the catalog-text check found no hard-coded text.

## What Didn't Work

- **Relying on the gates.** None of them asks "should this be visible in this state?"
  - axe checks that what's on screen is accessible. A wrongly shown button is still an accessible button.
  - The keyboard walk checks that every visible control is reachable and focused visibly. An extra control passes.
  - The catalog-text check skips anything inside `[hidden]` (`apps/extension/e2e/checks.ts:76`, `parent.closest('script, style, [hidden]')`), and the link's text came from the catalog anyway.
- **Flow tests that only drove the happy path.** They clicked the right buttons but never asserted that the wrong ones were gone, so the extra control never failed a test.

## Solution

Three changes (commit "Stop button styles from unhiding controls, and gate it" in PR #5):

1. A global rule in `apps/extension/src/ui/base.css` so `hidden` always wins:

   ```css
   /* Styles that set display (buttons, panels) must never unhide an element. */
   [hidden] {
     display: none !important;
   }
   ```

   The rule that caused it was the shared button style, `button, a.button { … display: inline-flex; }`, applied to `<a class="button primary" id="setup-again" … hidden>` in `apps/extension/entrypoints/options/index.html` and `#popup-setup` in `apps/extension/entrypoints/popup/index.html`.

2. Flow tests in `apps/extension/e2e/flows/consent.spec.ts` now assert which controls are hidden in each state, not only which are visible. After consent, `#setup-again` is hidden. After withdrawing, `#consent-withdraw` is hidden and `#setup-again` is visible. A new test checks that the popup offers setup only until consent is given.

3. A gate B check, `hiddenButShown` in `apps/extension/e2e/checks.ts`, runs on every page state in `apps/extension/e2e/gates/a11y.spec.ts`. It fails on any element that has `[hidden]` but still renders boxes:

   ```ts
   export async function hiddenButShown(page: Page): Promise<string[]> {
     return page.evaluate(() =>
       [...document.querySelectorAll<HTMLElement>('[hidden]')]
         .filter((el) => el.getClientRects().length > 0)
         .map((el) => el.id || el.dataset.i18n || el.tagName.toLowerCase()),
     );
   }
   ```

   `apps/extension/e2e/gates/self-test.spec.ts` plants `<a id="shown" hidden>` plus a style of `a { display: inline-flex; }`, and a plain hidden `<p>`, and expects only `shown` back. That proves the check still bites.

## Why This Works

`hidden` has no special power. It works only because the browser's own stylesheet says `[hidden] { display: none }`. Author styles beat browser styles whatever their specificity, so any rule of yours that sets `display` on that element (`a.button`, `.panel`, even a bare `a`) un-hides it. The DOM still says `hidden`, so scripts, tests that read attributes and `closest('[hidden]')` filters all believe it's hidden while the user sees it.

`[hidden] { display: none !important; }` puts `hidden` back on top: an important author rule beats every normal author rule. `getClientRects()` returns an empty list for an element with `display: none` (or inside one), so a non-empty list on a `[hidden]` element is exactly the bug.

## Prevention

- Add `[hidden] { display: none !important; }` to the base stylesheet of any project that toggles `hidden` and also styles elements with `display`. If you truly need to animate or reveal a hidden element with CSS, use a class instead of fighting this rule.
- Put a hidden-but-shown check in the gate that walks every page state, with a self-test that plants the bug. Accessibility and text gates judge what's on screen; they can't tell that something shouldn't be there.
- In flow tests, assert the controls that must be absent in each state (`toBeHidden()`), not only the ones that must be present. Contradictory pairs such as "set up" and "withdraw" are the ones to pin.
- Look at a screenshot of every state of every page before calling UI work done. In this case that was the only thing that caught it.

## Related Issues

- `docs/solutions/best-practices/testing-chrome-mv3-extension-privacy-gates-with-playwright.md`: the gates and the self-test pattern this check joins.
- PR https://github.com/mindmelding/sit-with/pull/5 (BUO-56).
