# Todos

Open `/todos` from the shared Codeitz side menu. Uses the public `@workspace/ui/blocks/todo-workspace` block and the current app theme.

- Add a title, priority, category, due date, workspace project and visibility. New todos are private and open by default.
- Click the title or pencil to edit inline; Save persists the edit, Cancel keeps the saved record. Completion and visibility buttons save immediately.
- Drag the handle above/below another row; Alt+ArrowUp/Alt+ArrowDown provides keyboard ordering. Order saves atomically.
- Project selectors show actual workspace products with initial icons. Project associations are saved as stable owner paths. Category menus list existing saved categories. Use + Add category at the bottom, enter its name inline and confirm. Category creation persists immediately in SQLite, independently of the todo; selecting it is included in the next todo save.
- Visibility and project filters use `/todos?visibility=public&project=devkit%2Fuiux`; defaults are omitted. Refresh and Back/Forward restore filters. Public is local metadata, not internet publication or per-user authorization.

## Storage and API

The todos module owns PostgreSQL tables `todos`, `todo_categories`, `todo_state` and `todo_imports` in the configured Codeitz database/schema. PostgreSQL is the only runtime writer for these records. Tasks and chat keep their separate SQLite stores.

The previous `.codeitz/todos/todos.sqlite` remains a retained migration source. A consistent verified backup and private import report live under ignored `.codeitz/migrations/`. A cutover marker blocks the legacy SQLite adapter from reopening/writing this source; there is no silent database fallback or automatic synchronization.

`GET /api/v1/todos` returns saved todos, projects, categories and collection revision. `POST /api/v1/todos` creates, `PATCH /api/v1/todos/{id}` edits, `DELETE /api/v1/todos/{id}` soft-deletes, and `POST /api/v1/todos/reorder` saves the full ordered ID list. All writes require the last read revision. Stale writes return 409, reload current records, and retain an unsuccessful inline edit for review. Failed writes are not displayed as saved. Refocusing the browser refreshes the list.

Requests use the existing loopback/same-origin access guard. Invalid dates, options, projects, unknown fields and incomplete/duplicate orders are rejected. OpenAPI details are at `/api/docs` and `/api/openapi.json`; governance routing checks include this module.

## Earlier SQLite verification

Codeitz verification passes 29 tests, including database reads after store/server restart, every editable field, ordering, soft deletion, stale revisions, invalid requests and access boundaries. Browser verification uses a separate temporary database for creation, inline title/priority/project edits, categories, due dates, completion, visibility, URL history, pointer dragging, keyboard ordering and refresh persistence. Existing task records and the working Todos list are preserved.

## Timer and scheduler

The separate timer icon opens a date-and-time popover in the device timezone. On a new/edited todo it sets the draft schedule; save the todo to persist it. On a saved row, Save schedule persists immediately; Clear cancels the schedule. Dates convert to UTC for storage and display in local time.

While Codeitz runs, its todos module scans PostgreSQL every 15 seconds and persists a due reminder once. Open scheduled lists refresh periodically; due rows show Reminder due. Startup catches reminders missed while the server was stopped. Completed and deleted todos are skipped. Rescheduling resets delivery state. This is an in-app reminder scheduler; it does not start Codex or send email/OS notifications.

Categories live in PostgreSQL todo_categories with case-insensitive duplicate handling. Existing category values are imported without removing records. scheduledAt/remindedAt are stored with the todo; older records default to no schedule. The new POST /api/v1/todos/categories endpoint uses the same revision and local-access checks. Tests cover independent categories, duplicates, exact scheduled time, once-only delivery, clearing, rescheduling and startup catch-up.

## Category management

Open Todo categories in the side menu at `/todos/categories`. Shared MasterListV1 lists category names and current todo counts with search, sorting, pagination and row actions. New/Edit use a shared popup form; Delete asks for confirmation.

PATCH `/api/v1/todos/categories` accepts revision, name and nextName. DELETE on the same collection accepts revision and name. Local-request guards and strict validation apply. Renames update linked todo categories atomically, including soft-deleted rows; deletion clears assignments but preserves todos. Case-insensitive duplicate renames and stale collection revisions return 409. Unknown categories return 404. The popup retains failed input and refreshes stale records for retry. Category changes now persist in PostgreSQL. Deletion soft-deletes the category and clears linked todo assignments while retaining historical category identity.

## PostgreSQL migration and seeder audit — 2026-11-17

- `npm run db:status` inspects migration history; `npm run db:migrate` explicitly runs module-local Kysely migrations. Nothing migrates or seeds automatically on startup. Preflight checks connectivity and required tables/state without writing.
- `npm run db:seed` is repeatable and concurrent-safe. Todo/category business defaults use a no-data policy: do not fabricate personal tasks or categories. Only the singleton collection revision is bootstrapped if missing; existing revision and data are retained.
- `npm run db:import:todos` locks legacy writes, takes and compares a consistent SQLite backup, imports all rows transactionally, verifies all legacy fields/IDs/category assignments/order/revision and records a checksum. A repeat import with the same source is a no-op; a changed source or nonempty unregistered destination is refused. It does not overwrite later PostgreSQL edits.
- Actual local import: 10 todo rows (6 current, 4 soft-deleted), 4 categories, revision 35. IDs, content, priorities, dates/times, reminder flags, project/visibility, order and timestamps matched. Category-only names remain available. Original actor/category timestamps did not exist in SQLite: import provenance uses `system:sqlite-import` and import time for category audit timestamps.
- Tables use integer identity primary keys, unique eight-character cryptographically generated public IDs, audit columns, constraints, category foreign keys and relevant order/reminder indexes. Public-ID conflicts retry at most five attempts without masking other constraint failures.
- Compatibility exception: imported todo UUIDs remain in unique `legacy_id` and are returned/accepted by existing APIs, while new todo IDs use eight lowercase letters/numbers. Category APIs retain existing name-based contracts and strings. The existing `todos` folder owns this coordinated migration, including categories; a separate folder/API redesign is outside this migration.
- Scope exception: this remains the existing single-user loopback workspace, with trusted local operations recorded as `local-owner`, scheduler/import system actors and no multi-tenant identity claim. No tenant key is fabricated. Cloud/multi-tenant rollout requires authenticated scope and tenant-safe constraints before exposure. Existing local `.env` still uses the local postgres administrator; production needs a restricted application role and verified TLS.
- The migration has no destructive automated down operation. A rollback after PostgreSQL writes requires an explicit reviewed recovery/export; do not simply re-enable the frozen SQLite source and lose newer work.

Live PostgreSQL integration tests use a random temporary schema and cover fresh/rerun migration, seed reruns, full import/deleted records, duplicate import refusal, concurrent revision conflicts, ID collisions, updates, category rename/delete, order, scheduler, restart and API access guards. Ordinary isolated compatibility tests continue to inject their own temporary SQLite store; production uses PostgreSQL only for todos.
