---
title: Intl reports ICU canonical time zone IDs, not current IANA names, in Chrome and Node
date: 2026-09-29
category: logic-errors
module: country suggestion (packages/core/src/domain/country.ts)
problem_type: logic_error
component: service_layer
symptoms:
  - "suggestCountry never matched the America/Indiana/ and America/Kentucky/ prefix check for people in those zones when run in Chrome"
  - "Unit tests passed because they fed IANA spellings such as America/Indiana/Indianapolis, which V8 never reports"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
framework_version: node 22.22.2 (ICU 78.2)
tags: [intl, timezone, iana, icu, cldr, v8, chrome-extension, test-fixtures]
source: pr-feedback
repo: sit-with
scope: universal
---

# Intl reports ICU canonical time zone IDs, not current IANA names, in Chrome and Node

## Problem

Sit With suggests a country for the emergency number from the browser's locale and `Intl.DateTimeFormat().resolvedOptions().timeZone` (read in `apps/extension/src/ui/page.ts:48`). The zone lookup in `suggestCountry` matched US zones by the current IANA prefixes `America/Indiana/` and `America/Kentucky/`. V8 does not return those names for the two most-populated zones in that group. It returns the ICU (CLDR) canonical ID, which is often an older IANA alias. So the prefix check never fired in Chrome for Indianapolis or Louisville, and a person with a region-less locale such as `en` got no suggestion. The correctness reviewer found it in the BUO-56 code review on PR #5, and the review's validator confirmed it.

## Symptoms

- In Chrome, a person in Indianapolis or Louisville whose browser language names no region got no country suggestion. Nothing errored; the lookup just returned undefined.
- The unit tests for `suggestCountry` passed, because the fixtures used `America/Indiana/Indianapolis`, a string the runtime never produces.

## What Didn't Work

- Keying on the IANA `zone1970.tab` names alone. That is the right list for tzdata, but it is not what ECMAScript runtimes built on ICU return.
- Trusting a green test run. The test fed the input the author expected, not the input the runtime gives, so it proved nothing about Chrome.

## Solution

Map the ICU canonical IDs as well, keep the IANA prefixes for runtimes that do report current names, and test with both spellings. From `packages/core/src/domain/country.ts:43-54` (fixed in PR #5, open as of this writing):

```ts
  // ICU canonical names Chrome reports for zones otherwise written America/Indiana/… and America/Kentucky/….
  'America/Indianapolis': 'US',
  'America/Fort_Wayne': 'US',
  'America/Knox_IN': 'US',
  'America/Louisville': 'US',
  ...
function countryFromZone(timeZone: string): string | undefined {
  if (timeZone.startsWith('Australia/')) return 'AU';
  if (timeZone.startsWith('America/Indiana/') || timeZone.startsWith('America/Kentucky/')) return 'US';
  return ZONE_COUNTRY[timeZone];
}
```

`packages/core/test/country.test.ts:47-49` now covers `America/Indiana/Indianapolis`, `America/Indianapolis` and `America/Louisville`.

## Why This Works

ECMA-402 has `resolvedOptions().timeZone` return the canonicalized zone, and V8 canonicalizes through ICU, whose canonical IDs come from CLDR. CLDR froze many IDs before later IANA renames, so it keeps the old name as canonical. Checked in this session on Node 22.22.2 with ICU 78.2 (same V8/ICU path as Chrome):

| Input | `resolvedOptions().timeZone` |
|---|---|
| `America/Indiana/Indianapolis` | `America/Indianapolis` |
| `America/Kentucky/Louisville` | `America/Louisville` |
| `America/Fort_Wayne` | `America/Indianapolis` |
| `America/Knox_IN` | `America/Indiana/Knox` |
| `Asia/Kolkata` | `Asia/Calcutta` |

Not every zone in a renamed group is affected: `America/Indiana/Knox` stays as it is, so the prefix check still earns its place. Mapping both spellings covers ICU-based runtimes and any runtime that reports current IANA names. `America/Fort_Wayne` and `America/Knox_IN` never come back from V8 (they canonicalize to other IDs), so their map entries are harmless extras.

## Prevention

- Any lookup keyed on time zone names must accept the ICU canonical ID. Take test inputs from what the runtime reports, for example `new Intl.DateTimeFormat('en', { timeZone: z }).resolvedOptions().timeZone`, not from the IANA list.
- When a table is keyed on current IANA names, add a test that round-trips each key through `Intl` and fails if the canonical form is missing from the table.
- The `Asia/Kolkata` to `Asia/Calcutta` case is the one most likely to bite elsewhere: any per-zone table for India keyed on `Asia/Kolkata` misses in Chrome.

## Related Issues

- PR #5 (BUO-56), https://github.com/mindmelding/sit-with/pull/5
