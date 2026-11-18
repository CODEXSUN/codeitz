# Unified Task Manager Plan

[Central Governance](../../../mcp-governance/docs/governance.md)

This is the agreed development plan. Named agents and the unified workflow are not implemented yet. Existing task-runner behavior remains documented in [Task Runner](task-runner.md).

## Purpose

Organize personal and development work from enquiry to accepted completion. Keep a clear outcome, responsible person or agent, and next action so ideas become finished work.

Codeitz owns personal focus, enquiries, tasks, agent coordination and execution records. Project Manager remains the application that owns project information, requirements, decisions and designs. Connect records through public interfaces and project identity; do not duplicate project records or write another module's tables.

## Confirmed responsibilities

| Name | Role | Responsibility |
| --- | --- | --- |
| You | Owner | Set priorities, complete human tasks, approve plans and important actions, and accept outcomes. |
| Maya | Supervisor | Clarify enquiries, organize daily focus, request your decisions and hand approved work to the appropriate project lead. |
| Arun | Project lead | Maintain project context using Project Manager records, understand workflow and codebase, plan tasks, assign workers, track blockers and review results. |
| Dev | Coding worker | Implement a scoped, approved coding task and return changes, check evidence and blockers to Arun. |
| Tara | Verification worker | Verify results against completion criteria, run permitted checks and report evidence or issues to Arun. |

Display name, role and project/task together, for example: Arun · Project lead · CRM. Names identify roles; they do not grant permissions. Begin with one worker execution at a time.

## Enquiry to completion

Enquiry → Clarify → Proposed plan → Your approval → Assigned tasks → Working → Checks → Review → Accepted → Complete.

- Capture an idea, request or personal need as an enquiry. Maya clarifies the outcome and next action before proposing work.
- Approve a small plan with completion criteria. Split it into linked human and agent tasks where needed; personal tasks do not require a repository or project lead.
- You complete your tasks. Arun coordinates project tasks; Dev performs approved coding and Tara verifies results. Tasks can also be assigned to Maya or Arun for clarification, planning and review.
- Workers report results or blockers to Arun. Review can request changes and return work to the worker while retaining previous attempts.
- Your acceptance completes the agreed outcome. A finished worker run alone does not complete the task. Human tasks use suitable evidence or your confirmation instead of code checks.
- Record blocked, changes requested and cancelled explicitly. A blocked task states what is needed and who acts next; failed checks prevent acceptance of coding results.

Plan approval and coding approval remain separate. Delegation never expands approval scope. New scope returns for your decision; no automatic commit, push or release is included.

## Minimum saved record

- Stable ID, enquiry/parent links, title, outcome and completion criteria.
- Personal area or project identity, repository mapping when needed, assignee and role.
- Priority, state, dependencies, next action and blocker.
- Approved plan, approval scope and decision history.
- Linked chat, execution attempts, activity, evidence, checks and review outcome.
- Created, updated and completed dates.

Target PostgreSQL for permanent saved records and preserve them across refresh/restart. Limit SQLite to temporary local drafts, caches and recoverable worker events. Existing SQLite records remain unchanged until a separately approved migration. Link existing chats, todos and runner executions rather than replacing their history. A unified task tracks the outcome; a runner execution records an attempt. Keep task state separate from execution state.

## Build order

1. Build the unified task record, enquiry intake, human/agent assignments and lifecycle. Establish stable links to Project Manager projects and existing runner records.
2. Add a compact Today view: your tasks, agent work, approvals, blockers and next actions. Keep active work limited and record daily outcomes.
3. Add Maya's clarification, plan proposals and explicit handoffs.
4. Add Arun's project context, task breakdown, worker assignment and review.
5. Connect Dev and Tara through the execution/check/report/review loop. Preserve separate coding approval and current records.
6. Consider parallel workers only after ownership, isolated workspaces and recovery are reliable.

First implementation scope: step 1 only, after a separate authorization. Personal skill tracking and broader automation remain later work.
