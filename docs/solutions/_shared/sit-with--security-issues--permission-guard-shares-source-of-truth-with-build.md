---
title: A permission guard that reads the build's own data can't catch a widening
date: 2026-09-29
category: security-issues
module: manifest check (scripts/check-manifest.mjs)
problem_type: security_issue
component: tooling
symptoms:
  - "Adding a host to packages/core/data/engines.json widened the extension's host_permissions and content-script matches, and `pnpm check:manifest` still passed"
  - The manifest lock compared the built manifest to an expected manifest generated from the same engines.json the build reads, so both sides always moved together
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [manifest, host-permissions, least-privilege, ci-gate, pinning, chrome-extension, tautological-check]
source: security-review
repo: sit-with
scope: universal
---

# A permission guard that reads the build's own data can't catch a widening

## Problem

The CI gate meant to lock the extension's permissions (R24, AE40) got its expected `host_permissions` from the same data file the build uses. A data edit that widened access changed the build and the check together, so the gate stayed green. Code review on PR #4 (BUO-55) raised it as a P1: the adversarial reviewer found it and the independent validator confirmed it.

## Symptoms

- Pushing a new host such as `www.example.com` into Bing's `hosts` in `packages/core/data/engines.json` gave the built extension access to that site's pages. `pnpm check:manifest` passed and so did every other CI check.
- The check looked strict because it compared the whole manifest for exact equality. The weak part was where the expected values came from, not how they were compared.

## What Didn't Work

- **Exact-match comparison on its own.** Before the fix, `expectedManifest()` in `scripts/check-manifest.mjs` built `host_permissions` and `content_scripts[].matches` from `resultPagePatterns(engines)`, importing `engines.json` directly. `apps/extension/wxt.config.ts:2-7` builds the real manifest from the same `resultPagePatterns(engines)` call. An exact match between two outputs of one function over one input catches drift in how the manifest is put together. It can't catch a change to the input, and the input is where a widening would come from.
- **Pinning the full Google host list as literals.** Google has one host per country domain (187 in `engines.json` today), so a literal copy in the check would be a second list to maintain and hard to review. The fix pins Google by shape plus a hash instead (below).

## Solution

`checkEngines()` in `scripts/check-manifest.mjs:41-62` checks `engines.json` against a pinned engine set, `PINNED_ENGINES` (`scripts/check-manifest.mjs:23-34`), that is written out in the check and not read from any data file:

- **Literal pins** for the exact engine ids (`bing`, `duckduckgo`, `google`) and, for every engine, its `paths` and `queryParam`. The Bing and DuckDuckGo host lists are pinned exactly too (`www.bing.com`, `duckduckgo.com`).
- **A shape pin** for Google hosts, `/^www\.google\.(com|cat|[a-z]{2})(\.[a-z]{2})?$/`. It admits `www.google.de`, `www.google.co.uk`, `www.google.com.au` and the one non-country TLD, `www.google.cat`, and rejects something like `www.google.evil.example`.
- **A hash pin** of the exact Google list: the sha256 of the hosts, sorted and joined with `\n` (`hostListHash`, `scripts/check-manifest.mjs:36-38`). A new host that fits the shape (`www.google.zz`) or a removed one still fails, with the message "the list changed … the pinned hash must be updated with Sean".

The CLI entry runs `checkEngines(engines)` next to `checkManifest(readBuiltManifest())` (`scripts/check-manifest.mjs:138`), in both `ci.yml` and `release.yml`. `expectedManifest()` still builds its host list from `resultPagePatterns(engines)`. That is safe now because the input it reads has been pinned on its own terms, and the exact-match check still catches any drift in how the build turns engines into a manifest.

Tests in `tests/check-manifest.test.ts`, under `describe('engine pin (R24)')`, plant each way the lock could be bypassed: a host added to Bing, a non-Google host added to Google, a Google-shaped host added or one removed, a new engine, and a widened DuckDuckGo path. They also check that the real list passes.

## Why This Works

A lock is only independent if what it expects comes from somewhere other than what it locks. Before the fix, the chain was `engines.json → resultPagePatterns → { build, check }`. The two branches could never disagree about the host set, so the check was a tautology for exactly the change it existed to stop. After the fix, the chain has a fixed point that only a human can move: `PINNED_ENGINES`, a literal in the check. Widening access now takes two edits in two places, and one of them is a file whose failure message says "Change scripts/check-manifest.mjs only with Sean". That puts the change where review is required (CLAUDE.md: security changes always go to Sean).

Literal, shape and hash each cover a different gap. Literals are best when the set is small. The shape keeps a large list inside a known domain family. The hash turns any change to that large list into a visible, deliberate step without a literal copy of every entry in the check.

## Prevention

- **Rule:** a guard on permissions, scopes, allowlists, CSP or any other access boundary must not take its expected values from the same source the build or runtime uses. Pin by literal, by shape or by hash, in the guard itself.
- **Review question for any "locked" check:** "If I edit the build's input data, does this check fail?" If the answer depends on a shared import (a JSON file, a config module, a helper both sides call), the check is circular for that input.
- **Test the lock by mutating the shared input, not only the output.** A test that edits the built manifest shows the comparison works. It says nothing about a change that flows through both sides. The `engine pin (R24)` tests clone `engines.json`, widen it, and assert that `checkEngines` fails.
- **Make refreshing a pin a human step.** When Google's supported domains legitimately change, recompute the hash from the sorted, `\n`-joined list, update `hostListSha256`, and get Sean's review, since it is a permission change.

```js
// Circular: expected values come from the same data as the build
const hosts = resultPagePatterns(engines); // also what wxt.config.ts uses
expect(built.host_permissions).toEqual(hosts);

// Independent: pin the input itself, then the derived comparison is safe
checkEngines(engines); // ids, paths, hosts by literal; Google by shape + sha256
```

## Related Issues

- PR #4, mindmelding/sit-with (BUO-55), open and unmerged as of this writing
- Spec requirements R24 and AE40 (least access), in the hub repo `mindmelding/idea-to-ship` at `docs/plans/2026-09-25-1208-feat-health-search-guard-plan.md`
