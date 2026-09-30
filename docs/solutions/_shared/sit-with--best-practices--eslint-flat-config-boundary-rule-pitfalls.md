---
title: ESLint flat-config restriction rules that silently miss when guarding architectural boundaries
date: 2026-09-29
category: best-practices
module: lint boundary rules
problem_type: best_practice
component: tooling
severity: high
applies_when:
  - "Using ESLint restriction rules (no-restricted-properties, no-restricted-imports, no-restricted-syntax) to enforce an architectural or privacy boundary"
  - Banning a chained member access such as chrome.storage.sync or browser.runtime.setUninstallURL
  - Allowing one sub-path of a package while banning the rest of it
  - Generating import bans from Node's builtinModules list
  - Layering a second no-restricted-syntax block for a narrower set of files in flat config
tags: [eslint, flat-config, lint-rules, architecture-boundaries, no-restricted-syntax, no-restricted-imports, testing]
source: build
repo: sit-with
scope: universal
---

# ESLint flat-config restriction rules that silently miss when guarding architectural boundaries

## Context

BUO-55 (PR #4, open as of this writing) used ESLint 10 flat config to enforce Sit With's boundaries: the core package stays pure, nothing goes to synced storage or an uninstall page, and extension pages import only display helpers. Four of the obvious rule configurations looked right, linted the repo clean, and would have let the banned code through. None of them errors or warns when it matches nothing. A lint rule that guards a boundary fails open, so a mistake only shows up if you lint code that should fail.

Each pitfall below was reproduced against ESLint 10.11.0 with `Linter.verify` in this session.

## Guidance

### (a) `no-restricted-properties` does not see chained members

`no-restricted-properties` matches only when the object is a plain identifier. `{ object: 'chrome', property: 'sync' }` and `{ object: 'storage', property: 'sync' }` both report nothing on `chrome.storage.sync.get()`, because the object of `.sync` is the member expression `chrome.storage`. The same goes for `browser.runtime.setUninstallURL`.

Use `no-restricted-syntax` selectors instead. To defeat aliases (`const s = chrome.storage; s.sync`), ban the property whatever the object is called, and cover the other spellings too:

```js
const NO_SYNC = 'No synced storage (AD-6): data stays on this device.';
const bannedCalls = [
  { selector: "MemberExpression[property.name='sync']", message: NO_SYNC },
  { selector: "MemberExpression[computed=true][property.value='sync']", message: NO_SYNC },
  { selector: "ObjectPattern > Property[key.name='sync']", message: NO_SYNC },
  { selector: 'Literal[value=/^sync:/]', message: NO_SYNC },            // WXT storage keys
  { selector: 'TemplateElement[value.raw=/^sync:/]', message: NO_SYNC },
  { selector: "MemberExpression[property.name='setUninstallURL']", message: 'No uninstall page (AD-6).' },
];
```

Dynamic access (`storage[area]`) is still invisible to lint. Here a runtime gate checks that synced storage stays empty, so both layers are needed.

### (b) `group` patterns cannot re-include a child of an excluded path

`no-restricted-imports` `group` patterns follow gitignore semantics, where a negation cannot re-include something under an excluded parent. `group: ['@sit-with/core/*', '!@sit-with/core/display/*']` still reports `@sit-with/core/display/index`. Use a `regex` pattern with a negative lookahead:

```js
{ regex: '^@sit-with/core(?!/display/[^/]+$)', message: 'Pages may import only @sit-with/core/display/* (AD-1).' }
```

This bans the package root and every sub-path except exactly one level under `display/`.

### (c) Groups built from `builtinModules` also match relative imports

Mapping `builtinModules` to `group` patterns (`[name, name + '/*']`) blocked `./domain/engines.ts`, because `domain` is a Node built-in and a gitignore-style pattern with no slash matches a path segment at any depth. Any core folder that shares a name with a built-in (`domain`, `events`, `stream`, `path` …) hits this. Use one regex over the bare names, anchored at both ends:

```js
{ regex: `^(${builtinModules.map((n) => n.replace(/[/.]/g, '\\$&')).join('|')})(/.*)?$`, message: PURE_CORE }
```

Keep a separate `group: ['node:*']` for the prefixed form.

### (d) A later config block replaces the rule, it does not merge it

In flat config, when two blocks both set `no-restricted-syntax` for a file, the later block's options replace the earlier one's. They are not concatenated. A core-only block that sets `['error', ...coreOnlySyntax]` quietly drops the global `sync` and uninstall bans for core files. Re-spread the shared list in every block that sets the rule:

```js
// global block
'no-restricted-syntax': ['error', ...bannedCalls],
// core block
'no-restricted-syntax': ['error', ...bannedCalls, ...coreOnlySyntax],
```

The same applies to `no-restricted-imports` and `no-restricted-globals`.

### (e) Test the guard rules by linting known-bad snippets

A boundary rule that has been weakened, misconfigured or overridden still passes `eslint .` on a clean tree. Pin each rule with a test that lints bad code through the ESLint API, using the real config and a realistic file path, and filter the results to the guard rule ids so unrelated rules don't make the test fragile:

```ts
const eslint = new ESLint({ cwd: repoRoot });
const GUARDS = new Set(['no-restricted-globals', 'no-restricted-imports', 'no-restricted-syntax', 'no-console']);

async function ruleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .map((m) => m.ruleId ?? `fatal: ${m.message}`)
    .filter((id) => GUARDS.has(id) || id.startsWith('fatal'));
}

expect(await ruleIds('const area = chrome.storage;\narea.sync.get();', CORE)).toContain('no-restricted-syntax');
expect(await ruleIds("import * as d from '@sit-with/core/display/index';\nd;", POPUP)).toEqual([]);
```

Include allowed cases too (a display import from a page, `chrome.storage.local`, `new Date(0)`), so a rule that got too broad also fails. Keep fatal parse errors in the results so a snippet that doesn't parse can't pass by producing no rule messages.

## Why This Matters

Restriction rules report only matches. A selector that never matches, a negation that never re-includes, or an override that drops half the list all look the same as a clean codebase. In this project those rules stand in for privacy promises: query text never leaves the device and nothing syncs. A silent miss there breaks a promise to users without anyone noticing. The snippet tests caught (a), (b) and (c) during the build. Each looked right when read and passed `eslint .`.

## When to Apply

- Any time ESLint enforces a layering, purity, privacy or security boundary, not just style.
- Whenever you add a second block for a narrower glob that sets a restriction rule the base config already sets.
- When you upgrade ESLint or typescript-eslint. Rerun the snippet tests; they are how you notice a change in matching semantics.

## Examples

Real config and tests: `eslint.config.js` (the `bannedCalls` list, the core block, and the pages block with the lookahead regex) and `tests/lint-rules.test.ts` (known-bad and known-good snippets per boundary).

| Intent | Silently misses | Works |
|---|---|---|
| Ban `chrome.storage.sync` | `no-restricted-properties` `{ object: 'chrome', property: 'sync' }` | `no-restricted-syntax` `MemberExpression[property.name='sync']` |
| Pages import only `core/display/*` | `group: ['@sit-with/core/*', '!@sit-with/core/display/*']` | `regex: '^@sit-with/core(?!/display/[^/]+$)'` |
| Ban bare Node built-ins | `builtinModules.map((n) => ({ group: [n, n + '/*'] }))` (also blocks `./domain/x.ts`) | one anchored `regex` over the names |
| Add core-only syntax bans | core block sets `['error', ...coreOnlySyntax]` | core block sets `['error', ...bannedCalls, ...coreOnlySyntax]` |

## Related

- PR https://github.com/mindmelding/sit-with/pull/4 (BUO-55)
