---
title: claude-code-action hides which commands it blocked
date: 2026-09-25
category: integration-issues
module: build loop
problem_type: integration_issue
component: github_actions
symptoms:
  - "Run summary shows permission_denials_count: 17 with no detail"
  - "PR says a command 'requires approval' although it looks allowed"
root_cause: missing_tooling
resolution_type: workflow_improvement
severity: medium
tags: [claude-code-action, allowedtools, permissions, observability]
source: build
repo: idea-to-ship
scope: universal
---

# claude-code-action hides which commands it blocked

## Problem
In CI there's no one to approve a command, so anything outside `--allowedTools` is refused. The action hides Claude's transcript by default (`show_full_output: false`), so the run only shows a count of refusals. BUO-38's build had 17 and couldn't run the local-server check the issue asked for. Tracked as BUO-40.

## Symptoms
- `permission_denials_count` in the result block, and no list.
- Claude works around the block (BUO-38 wrote a Node harness instead of running `wrangler dev`), which can hide the gap entirely.

## Solution
Give the Claude step an `id`, then read `steps.<id>.outputs.execution_file` after it runs:
- Print `.permission_denials[]` from the last `result` entry to `$GITHUB_STEP_SUMMARY`: tool name plus the command.
- Upload the file as an artifact (private repo, 14-day retention) for full debugging.

Allowlist entries are prefix matches. `Bash(curl -s http://localhost:*)` does not match `curl -s localhost:8787` or `curl -sS http://localhost:8787`, so list the variants a build really uses.

## Prevention
- Read the blocked list after the first run of any new workflow.
- Update (same day, BUO-42): a narrow Bash allowlist turned out to be the wrong tool. The second build hit 22 blocks, all housekeeping (`rm` of scratch files, `git checkout -- <file>`, `cd`, `command -v`, the skills' own helper scripts). Meanwhile `node`, `python3` and `npm run` were allowed and can do anything a shell can, so the list protected nothing. The build and review now allow `Bash` with a short denylist (`git push`, `env`, `printenv`). The real protections are elsewhere: no push credentials in the checkout, the Linear key and bot token live only in the workflow's own steps, and only the BUO team can trigger a build.
