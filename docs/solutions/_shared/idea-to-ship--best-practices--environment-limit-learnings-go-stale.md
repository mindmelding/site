---
title: Learnings about tool or sandbox limits go stale, and later builds obey them
date: 2026-09-25
category: best-practices
module: compound step
problem_type: best_practice
component: docs_solutions
severity: medium
applies_when:
  - Writing a docs/solutions entry that says something "can't" be done in CI or a sandbox
tags: [compound, stale-learnings, sandbox, ci]
source: build
repo: idea-to-ship
scope: universal
---

# Learnings about tool or sandbox limits go stale, and later builds obey them

## Context
BUO-38's build couldn't run `npx wrangler dev` because the workflow's allowlist blocked it. Its compound step wrote `docs/solutions/workflow-issues/sandboxed-build-cannot-run-wrangler-dev.md` in mindmelding/site, stating the sandbox had no network and the command couldn't run. The allowlist was then fixed. BUO-42's build read the old entry and never tried `wrangler dev`: it went straight to the workaround and repeated the wrong "no network" claim in its PR.

## Guidance
- A learning about an environment limit must say what caused it (for example "blocked by the build workflow's allowlist", not "no network"), the date, and the issue or commit that could lift it.
- Word it as "check first": "as of 2026-09-25, `wrangler dev` was blocked; try it, and use the harness only if it's still refused."
- When a limit is lifted, update or retire every learning that recorded it, in the same change. Grep for the command's name across `docs/solutions/` in every repo.

## Why this matters
Compound works: later sessions do read and follow these entries. That's exactly why a stale limit costs more than a missing one. It turns a fixed problem back into a standing rule.
