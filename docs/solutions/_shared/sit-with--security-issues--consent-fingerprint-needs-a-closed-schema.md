---
title: A consent fingerprint over a data schema only works if the schema is closed
date: 2026-09-29
category: security-issues
module: consent version (packages/core/src/consent-version.ts)
problem_type: security_issue
component: data_model
symptoms:
  - A later slice could add a field to any event payload, or start keeping topic labels, without changing the pinned consent fingerprint
  - Consents given under the old scope stayed "current" after what was kept had grown
root_cause: missing_validation
resolution_type: code_fix
severity: high
tags: [consent, json-schema, fingerprint, pinning, closed-schema, data-minimisation, re-consent, stored-state]
source: security-review
repo: sit-with
scope: universal
---

# A consent fingerprint over a data schema only works if the schema is closed

## Problem

Sit With asks for consent again when what it reads or keeps changes (AD-16). The trigger is a sha256 fingerprint pinned in `packages/core/src/consent-version.ts:6`, recomputed by `tests/consent-version.test.ts:20-33` over the manifest's permissions and hosts, `EVENT_TYPES`, and the whole `packages/core/schemas/stored-state.schema.json`. The first version of that schema was open in the places later slices will fill, so what was kept could grow while the fingerprint stayed the same. Code review on PR #5 (BUO-56) raised it: the adversarial reviewer found it and the validator confirmed it.

## Symptoms

- Event payloads were typed as an open map, `"additionalProperties": { "type": ["string", "number", "boolean", "null"] }`. Any slice could add `payload.topicLabel = "chest pain"` to `search.counted` and the schema file would not change.
- `aggregates`, `topics` and `corrections` were bare `{ "type": "array" }`. A slice could start storing symptom labels in `topics` with no schema edit.
- In both cases the fingerprint test stayed green, `CONSENT_VERSION` stayed at 1, and a person who agreed to the earlier, smaller scope would not be asked again.

## What Didn't Work

- **Pinning the hash of the schema file on its own.** The pin catches any edit to the file. It can't catch a change the file already allows. An open schema describes a set of shapes, and the hash pins the description, not the data. Growth inside the allowed set needs no edit, so nothing trips.
- **Relying on code review of the slice that starts writing something new.** The point of the pin is that a person's consent doesn't depend on a reviewer noticing that a new payload field is sensitive.

## Solution

Close the schema everywhere, so storing anything new requires editing the file, which changes the fingerprint (PR #5, `packages/core/schemas/stored-state.schema.json`):

- **Every event type gets its own closed payload** through `allOf` with one `if`/`then` per type (`stored-state.schema.json:71-369`). Types a slice writes today define their fields with `additionalProperties: false`, such as `settings.changed` (`field` const `country`, `value` a two-letter code or null) and `consent.given` (`version`). Types nothing writes yet are pinned to an empty payload with `maxProperties: 0`. The `$comment` at line 370 says the slice that starts writing a type defines its payload there.
- **Sections no slice owns yet are pinned empty** with `maxItems: 0` (`aggregates`, `topics`, `corrections`, lines 373-387). The slice that starts writing one has to define its items, and that edit moves the fingerprint.
- **The schema is tested against what the code actually writes.** `packages/core/test/state.test.ts:50-81` runs real commands through `applyCommandStep` (give consent, confirm a country, withdraw, clear, give again) and validates every resulting state with Ajv. The same block plants a topic label, an extra `query` field on `consent.given`, and a field on `search.counted`, and asserts each is rejected.

The fingerprint was re-pinned. `CONSENT_VERSION` stayed 1 because nothing had shipped yet.

```jsonc
// Before: open, so new fields and new sections need no schema edit
"payload": { "type": "object", "additionalProperties": { "type": ["string", "number", "boolean", "null"] } }
"topics": { "type": "array" }

// After: closed per type; unowned sections pinned empty
{ "if": { "properties": { "type": { "const": "search.counted" } } },
  "then": { "properties": { "payload": { "type": "object", "maxProperties": 0 } } } }
"topics": { "type": "array", "maxItems": 0 }
```

## Why This Works

A fingerprint over a schema can only notice changes to the schema's text. For it to track what is kept, every change to what is kept has to be a change to that text. A closed schema makes that true: nothing is allowed unless the file names it. An open one lets the data grow inside the file's existing permission.

The write-validation test closes the other gap. A closed schema that the code doesn't follow would fail at runtime or drift into disuse. Checking every state the commands produce keeps the schema describing the code, and not a hope about it. If a command in that test starts writing a new field without a schema edit, the test fails first. Editing the schema to make it pass then fails the fingerprint test. Either way the change reaches the step that says "bump CONSENT_VERSION, with Sean".

This complements [permission-guard-shares-source-of-truth-with-build.md](permission-guard-shares-source-of-truth-with-build.md). That learning says to pin the guard's expected values, not derive them from the build's input. This one says the thing you pin has to be closed, or the pin is exact about a shape that still lets anything through.

## Prevention

- **Rule:** when a hash, version or snapshot of a schema stands in for "what we collect", the schema must be closed. Use `additionalProperties: false` on every object, a discriminated payload per record type, and `maxItems: 0` (or `maxProperties: 0`) for anything reserved for later.
- **Review question:** "Could a later change store something new here without editing this file?" If yes, the pin doesn't guard that path.
- **Test the schema against real writes, not hand-written fixtures.** Drive the actual command or reducer path and validate each state it produces, so the schema can't drift from the code.
- **Plant the widening in a test.** Assert that an extra payload field, a new item in a reserved section, and a new top-level key are all rejected. That proves the schema is closed where it matters.
- **Open a reserved section in the same PR that first writes to it,** with its item shape defined there, and expect the fingerprint and consent version to move with it.

## Related Issues

- PR #5, mindmelding/sit-with (BUO-56), open and unmerged as of this writing (not checked against GitHub; `gh` was unavailable)
- [permission-guard-shares-source-of-truth-with-build.md](permission-guard-shares-source-of-truth-with-build.md): the complementary rule, pin rather than derive
- AD-16 (consent version) in the hub repo `mindmelding/idea-to-ship`, `docs/specs/health-search-guard/`
