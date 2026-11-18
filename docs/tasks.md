# Tasks

Tasks is the personal/project work register at `/work-tasks`, separate from the coding task runner at `/tasks/new`. Open it from the left rail or side menu. It follows the reviewed CRM task relationship and screen pattern using the public shared UI design system.

## Screens

- Master List v1: search, creation-date range (UTC), column search, status/pending/running filters, Columns, sorting and pagination. Click a row to open it; row actions remain independent. Date bounds restore from the URL; internal Master List search/sort/column settings retain the existing shared uncontrolled contract.
- New/edit: title, details, optional minimal contact/mobile, List in, assignee, priority, status and due date. Save lives in the shell header and supports Ctrl/Cmd+S. Existing tasks are available alongside the form. New list creation is inline and persisted.
- Show: task summary, contact/mobile, assignment, dates and lifecycle badges; Actions, Comments, Check in/out, Jobs, Charges, Schedules, Properties and Closure approvals tabs. Selection is URL state and survives refresh/Back. Properties uses the shared upsert form within the tab.
- Comments use the shared rich editor and support one-level replies. Jobs persist start/stop timestamps and show elapsed time after refresh/restart. Check-in/out records work presence without GPS collection.
- Charges store exact nonnegative decimal amounts and currency as task records; they do not initiate payments or invoices. Schedules are persisted in-app reminders, scanned every 15 seconds and caught up at startup, with once-only delivery evidence and completion/cancellation actions. No email/OS notification or automatic coding is implied.

## Tables and ownership

| Owner | PostgreSQL tables |
| --- | --- |
| master/user | users: You, Maya, Arun, Dev and Tara; role/kind directory, not authentication accounts |
| master/contact | contacts: name and optional mobile; reused by matching mobile without overwriting an existing contact |
| master/task-list | task_lists: Personal, Development and user-created lists |
| master/task-priority | task_priorities: Low, Normal, High, Urgent |
| master/task-status | task_statuses: New, Open, Won, Lost, Hold for Approval, Long Hold, Hold for Spares, Closed, Hold for Job-Out, Escalation, Re-open |
| business/task | tasks, task_comments, task_jobs, task_charges, task_schedules, task_checkpoints, task_closure_requests, task_activities |

Each module owns explicit coded migrations and seed policy under database/. The task aggregate owns its workflow children; master modules expose their reference operations through public index.ts files. No CRM data was copied.

Tables use generated integer internal IDs, immutable unique eight-character public IDs, audit/lifecycle columns, foreign keys, indexes and constraints. APIs/browser links use public IDs. Task revision locks reject stale writes. Creation and actions accept request IDs: retries return the same task/result without duplicating work, while reuse for different inputs is rejected. A unique active job, check-in and pending closure are enforced per task. Charges use numeric(14,2), never floating-point arithmetic.

## Closure and responsibility

Closed cannot be selected to bypass approval. Request closure records a reason; the local owner separately approves or rejects with a review note. Approval requires jobs stopped and check-in closed, sets Closed and cancels outstanding schedules. Closed tasks reject new work until the owner reopens them through Properties/Edit. Every accepted mutation and reminder appends activity transactionally.

Assignments to Maya/Arun/Dev/Tara record responsibility only. They do not create authenticated logins, execute agents, approve coding or hand work to the existing runner. Enquiry intake, autonomous coordination and project-manager handoff remain separate planned work.

The current authorization scope remains the single-user loopback workspace. Writes use the trusted `local-owner`; seed/scheduler operations use explicit system actors. No tenant ID is invented and no multi-user/tenant isolation is claimed. Authenticated tenant/user policy and restricted production credentials are required before cloud exposure. Tasks cannot impersonate an assignee through submitted actor fields.

## Migration, seeding and checks

Run db:migrate explicitly, then db:seed. Startup/preflight verifies readiness but never executes migrations/seeds. The ordered application history includes module-local reference migrations before tasks and their foreign keys. Seed reruns/concurrency preserve existing names, IDs and user edits. Required reference directories are seeded; contacts, tasks and workflow children follow a no-data policy. No fake tasks are inserted.

Task history migrations deliberately refuse destructive automatic rollback; recover through a reviewed backup plan. Existing Todo data/migrations, task-runner SQLite and chat SQLite remain unchanged. Todo and Task PostgreSQL pools are each capped at five connections; budget their combined maximum of ten alongside other apps.

Internal APIs are GET/POST `/api/v1/work-tasks`, GET `/options`, POST `/lists`, GET/PATCH `/{id}` and POST `/{id}/actions`. Actual schemas, date query parameters, errors and operation IDs are included in `/api/docs` and `/api/openapi.json`. Local access guards and strict validation apply to all writes.

Verified fresh/rerun migrations, concurrent/repeated seed safety, retry behavior, stale revisions, inactive/invalid references, local-request guards, comments/replies, job/check-in constraints, exact charges, scheduler delivery, approved/rejected closure and a new database connection restoring saved records. Tests use temporary PostgreSQL schemas. Browser verification used an isolated schema and covered create/assignment/contact, property save, comment/charge records, job refresh/stop, closure approval, master search/column controls and date-range refresh/Back. The temporary server/schema were removed; working task records remain unseeded.

## Compact form interaction

Task forms omit Cancel, Contact name and helper paragraphs. Mobile no precedes Contact, which remains an optional internal reference without an Optional label. Choosing a saved contact fills its mobile; changing mobile clears that reference so save can resolve/capture the correct minimal contact. No existing contact is overwritten.

Single-line controls are 44px high. Task details shows five lines and scrolls internally. Enter advances to the next input without submitting; Shift+Enter adds a details newline. Escape selects editable text; a repeated Escape moves backward. Dropdown selection/dismiss behavior remains available. Save is explicit through the shell button or Ctrl/Cmd+S.
