---
title: Linear's GitHub integration overrides the status a workflow just set
date: 2026-09-25
category: integration-issues
module: build loop
problem_type: integration_issue
component: linear
symptoms:
  - "Issue set to In Review by the workflow is back in In Progress seconds later"
  - Linear state history shows two changes six seconds apart
root_cause: async_timing
resolution_type: workflow_improvement
severity: medium
tags: [linear, github-integration, workflow-status, race]
source: build
repo: idea-to-ship
scope: universal
---

# Linear's GitHub integration overrides the status a workflow just set

## Problem
The build workflow opened a PR, then set the Linear issue to In Review. Linear's own GitHub integration saw the new PR and applied its default "PR opened → In Progress" rule a few seconds later, so the issue ended in the wrong state. Seen on BUO-38; tracked as BUO-39.

## Symptoms
- The issue shows In Progress with a "Ready for review" comment.
- State history: In Review at 13:55:21, In Progress at 13:55:27.

## Solution
Two layers:
1. In the workflow, wait about 20 seconds after `gh pr create` before setting the status, so the integration acts first and ours lands last.
2. The real fix is Linear's team setting: Settings → Teams → <team> → Workflow → Git automation. Set "PR opened" to the status the pipeline wants (In Review), or to no action.

## Why This Works
Both writers change the same field. The integration reacts to a GitHub webhook, which arrives a few seconds after the PR opens. Whoever writes last wins, so the pipeline writes last, or the integration stops writing.

## Prevention
- Any automation that sets Linear status next to a PR event should check the team's Git automation rules first.
- After changing status in a script, read it back once before trusting it.
