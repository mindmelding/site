---
title: "Resolved: the build loop blocked wrangler dev (an allowlist gap, not a network limit)"
date: 2026-09-25
category: workflow-issues
module: site-worker
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - "Verifying a change to worker.js or another Cloudflare Worker in an autonomous build-loop session (Linear-triggered build, CI agent) rather than an interactive laptop session"
  - "A plan or issue prescribes `npx wrangler dev` + `curl` as the verification method"
tags: [cloudflare-workers, wrangler, sandbox, verification, resolved]
status: resolved
resolved_by: "idea-to-ship 4d3b719 (BUO-40)"
---

# Resolved: the build loop blocked wrangler dev (an allowlist gap, not a network limit)

> **Resolved 2026-09-25 (BUO-40).** The cause was the build workflow's command allowlist, not the network: GitHub's runners have normal network access. The build and review workflows now allow shell commands (idea-to-ship commit 4d3b719). **Use `npx wrangler dev` and `curl http://localhost:8787/...` to verify Worker changes.** Fall back to the harness below only if a command is actually refused, and say so in the PR. Kept for history; BUO-42's build followed the old advice and skipped `wrangler dev` without trying it.

## Context

BUO-38 (add `robots.txt` and a dynamic `sitemap.xml` to `worker.js`) prescribed `npx wrangler dev` plus `curl` as the verification method, matching this repo's own convention (no test runner; `worker.js`'s routing comment and the issue's Notes both point at `wrangler dev`). In the autonomous build-loop session, every network-touching Bash command — `npx wrangler ...`, `curl` to an external host, even `git remote show origin` — returned `This command requires approval` instead of running, with no user present to grant it. `npx` needs the network to fetch `wrangler` (it is not vendored in this repo; there is no `package.json`/`node_modules`), so this blocks at the first step, not partway through a run.

## Guidance

When `wrangler dev` (or any tool `npx` would need to fetch) is unavailable, don't spend turns retrying the same blocked command. Build a small local Node harness that simulates the platform's static-asset routing well enough to exercise the actual `worker.js` `fetch` handler, and run the plan's test scenarios against that instead:

- Resolve static assets the same way `wrangler.jsonc`'s config implies (here: `assets.directory: "."`, `html_handling: "auto-trailing-slash"`, `.assetsignore` exclusions) — serve a matching file directly, mimicking Cloudflare serving assets before the Worker ever runs.
- Fall through to `(await import("worker.js")).default.fetch(request, { ASSETS: { fetch: sameAssetResolver } })` for any path with no matching static asset, so the Worker's own logic (and its own calls to `env.ASSETS.fetch`) run for real, not a mock of the outcome.
- Drive it with the plan's actual acceptance criteria (status codes, content-types, body contents) and print pass/fail per check.

This is a substitute for `wrangler dev`, not a replacement for it — say so explicitly in the PR/verification writeup rather than presenting harness output as if it came from the real tool.

## Why This Matters

The issue's own acceptance criteria said "show each criterion with a check you ran... `npx wrangler dev` plus `curl`, and include the commands and output." Silently substituting a hand-rolled harness without disclosure would misrepresent what was actually verified. Discovering the network block by trial and error (multiple distinct `This command requires approval` failures across `npx`, `curl`, and even read-only `git remote show`) costs several turns; a future agent hitting the same sandbox can skip straight to the harness approach.

## When to Apply

- Any autonomous/headless build session (GitHub Actions-triggered Linear build, CI agent) working on a Cloudflare Worker + static-assets repo with no build step and no vendored `wrangler`.
- Symptom to recognize immediately: any Bash command needing outbound network (`npx <pkg>`, `curl <external-url>`, `git remote show`, `git fetch` on some hosts) returns `This command requires approval` with no way to grant it non-interactively — stop retrying and switch to a local simulation.

## Examples

The harness used for BUO-38 (kept out of the repo, written to `/tmp` for the session): resolves `/<path>` -> `<path>.html` or `<path>/index.html` per Cloudflare's `auto-trailing-slash` rule, treats an exact-match static file as served-before-Worker, and otherwise calls the real `worker.js` default export's `fetch(request, { ASSETS })`. It caught real behavior (e.g. `/sitemap.xml` correctly falling through to the Worker because no static file matches it) that a hand-written mock of expected responses would not have exercised.

## Related
- Linear BUO-38, PR for `mindmelding/site` (robots.txt + sitemap.xml)
