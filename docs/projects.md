# Projects in Codeitz

Open `/projects` and `/github-manager` in the existing Codeitz server and shared shell. Project links, record UUIDs and coding approvals are unchanged.

## PostgreSQL data

PostgreSQL now owns all project/setup records, notes and lookups, modules and ordered child definitions, architecture, whiteboards, schemas and changelog history. The module uses the shared Codeitz Kysely/PostgreSQL connection settings. There is no runtime SQLite fallback.

Migration `20261117000900_projects_postgresql` is module-owned under `database/migrations/` and runs through `npm run db:migrate`. It preserves the existing integer IDs, UUID links, revision numbers, timestamp text and JSON strings. Legacy schema history is retained in `project_legacy_migrations`; the imported catalog seed marker is retained in `project_seed_records`. A separate future contract migration would be needed to change legacy ID formats.

`npm run db:seed` seeds the actual filesystem catalog once on a fresh database; it never creates sample projects or overwrites an imported catalog. Existing note lookup defaults remain project-scoped and deduplicated. New projects are registered after scaffold creation succeeds. External folders added after the catalog seed are not silently imported.

## Local cutover and recovery

1. Stop Codeitz and back up the existing project SQLite file and PostgreSQL database.
2. Run `npm run db:migrate`.
3. Run `npm run db:import:projects` (defaults to `.codeitz/projects/projects.sqlite`, or pass an explicit source path).
4. Run `npm run db:seed`, then preflight and start Codeitz.

The importer reads SQLite in a consistent read-only transaction, validates integrity and foreign keys, locks the PostgreSQL destination, refuses occupied destinations and atomically copies/verifies every row. IDs, references, content, positions and timestamps are compared before commit; generated identity sequences advance beyond imported integers. Repeats with the same source are no-ops. A changed source is rejected instead of replacing live PostgreSQL data.

The verified import record remains in PostgreSQL. Local SQLite sources and the retired standalone Project Manager were moved to the Recycle Bin after confirmation and record verification. Recovery exports remain unchanged. Historical import tools are offline recovery utilities only. Rollback after PostgreSQL writes requires explicit data reconciliation.

## Production

Use the same migrations and seeders against the production PostgreSQL database via environment settings. Local development uses loopback PostgreSQL; remote/cloud connections require `PGSSLMODE=verify-full`, trusted CA configuration when needed, and a dedicated restricted database role. Keep credentials in the deployment environment. Transfer existing PostgreSQL data through a backed-up database restore; do not seed over or re-import into a populated destination. No cloud server or production database has been provisioned by this local cutover.

Task-runner history and agent chat also use PostgreSQL. GitHub repository inspection/actions still use local Git, not the project database.

## Project workspace tabs

Project details expose Overview, Notes, Modules, Tasks, Review, Architect, White Board, Schema and Changelog. Migration 002 adds distinct project-owned child tables for notes, modules, architectures, whiteboards and schema designs, plus an append-only local changelog. Updates check record revision to prevent overwriting another editor's changes. Each read and write is scoped to a catalogued project. Saved content remains available when Codeitz is offline.

Notes and module descriptions use the shared `WorkspaceEditor`, adapted from the CODEXSUN reference editor with its MIT attribution retained in the UI package. It supports formatted text, headings, lists, links, images, code, Markdown, HTML and a sandboxed preview. Save is explicit; tab changes warn before discarding unsaved edits. Save before leaving the project via shell navigation. Modules document responsibilities; they do not create runtime modules.

Architect supports movable blocks, editable properties and directional connections. White Board embeds Excalidraw and saves elements, scene settings and image files with the record; drawing fonts are served locally. Scenes/content are limited to 10 MiB. Schema uses MasterListV1 with a right-side form, typed columns, primary/required flags and reference descriptions. These are schema designs, not executable database migrations. No application schema is modified by saving a design.

Tasks and Review read Codeitz's public task API. The workspace refreshes every ten seconds without replacing an open editor. Goals start planning only. Reports include plans/results, changed files, saved checks and links to the runner. Task actions verify the task's project owner before forwarding to Codeitz. Codeitz enforces review eligibility: only completed current results with passing checks can be accepted; changes requested creates a follow-up draft. Audit checks saved evidence, not a fresh execution of tests. Coding/check approvals remain inside Codeitz.

Changelog combines local content history and live Codeitz task activity (latest 500 entries). A task plan passing its evidence audit does not mean coding was executed or its eventual result accepted. This remains a local workspace tool; local-request guards do not implement multi-user identity or tenant authorization.

### Notes reader/editor

Notes uses cards instead of the master table. Open a card to read; choose Edit note to enable the editor. Add note opens an empty full-page editor. The list and project tabs are hidden until Back to notes is selected. Save writes to PostgreSQL and returns to reader mode. Category and assignment are stored by the imported note-properties schema; tags are derived from #tags in content. Reader content is rendered non-editable using the shared editor schema with its toolbar hidden. Existing revision checks prevent stale saves from overwriting a newer edit.

### Note-specific persistence API

Notes now uses validated project-scoped endpoints under `/api/v1/projects/:area/:name/notes`: GET lists notes, POST creates a note (201), GET `/:id` reads it and PATCH `/:id` updates it. PATCH requires the saved positive revision; stale writes return 409, missing/cross-project notes 404 and invalid input 400. Category and assignment, title, HTML content, status, timestamps and revision are persisted in PostgreSQL. Content/history saves are atomic. These operations work independently of task-runner availability. Existing workspace APIs remain compatible for other tabs.

The Notes editor loads the latest saved version before editing, uses shared FormSelect and UpsertFormField controls, and validates with the same note-fields schema as the backend. Invalid submissions preserve the draft and focus a linked field summary. Reader properties are displayed as information; edit controls are full-width with helper text. Saves return immediately after PostgreSQL acknowledgement; background workspace refresh does not block editing. The list retains compact rows, no previews, and full-title hover text as requested.

## Versioned APIs and clean browser routes

Project module APIs now use `/api/v1/projects`. Workspace reads/content saves, planning handoff, project-scoped task actions and note APIs share this prefix. `/api/health` remains the existing shared readiness contract. Legacy `/api/projects` requests redirect with HTTP 307 to the versioned equivalent, preserving request method/body; old hash navigation links are replaced with clean paths.

API documentation is available at `/api/docs`, with the OpenAPI 3.1 specification at `/api/openapi.json`. Both enforce the local same-origin guard. The product-owned specification documents operations, parameters, request/response schemas, errors, scope requirements and NDJSON creation events; the shared framework renders/serves documentation. This is HTTP API alignment with development governance, not a runtime MCP authorization/registration implementation.

Browser paths: `/projects/overview`, `/projects`, `/projects/new`, `/settings/appearance`, and `/projects/{area}-{name}` (for example `/projects/devkit-codeitz`). Tab names extend the project path: `/notes`, `/modules`, `/tasks`, `/review`, `/architectures`, `/whiteboards`, `/schemas`, `/changelog`. Saved records append their UUID; edit mode appends `/edit`, and new records use `/new`. Project area filters use `/projects?area=apps` or `area=devkit`. Missing/invalid records show an error instead of silently opening another project.

Refresh and direct links restore the same project, tab, saved record, reader/edit mode and project area filter. Browser Back/Forward restores these supported states. Saved content loads from PostgreSQL. Unsaved note contents are never placed in URLs; refreshing an editor restores its saved version, with existing unsaved-change warnings retained. Shared MasterListV1 internal search/sort/pagination remains owned by its existing uncontrolled contract; it is not claimed as URL-restored state.

### Note property lookups

Category and Status use the public FormLookup with autocomplete and an explicit Create action. GET `/api/v1/projects/:area/:name/notes/options` loads choices; POST `/options/:kind` creates a category/status with `{label}`. Choices are stored per project in `project_note_options`, deduplicated case-insensitively after trimming, and available after reload. Existing categories/statuses and defaults are included. Failed creates do not report success.

The PostgreSQL schema preserves existing note rows while allowing custom note statuses (1–100 characters); module/task statuses retain their own rules. The note's project remains bound through the validated route and PostgreSQL project foreign key; no project control or submitted project field is needed. Properties spacing/helper text is compact. New options are persisted when Create is selected; assigning one to a note still requires Save note.

### Module design workspace

Add module opens a popup. Saved modules open shared animated tabs for Details, API routes, Actions, Events, Tables & fields and Dependencies. Public InlineDetails/InlineEdit controls provide explicit Save/Cancel and validation feedback. Tables use MasterListV1; field types, primary/required/unique flags, defaults and references are editable inline. Table preview reflects saved schema definitions without querying or changing application tables.

Module GET/POST/PATCH APIs use /api/v1/projects/:area/:name/modules. The project PostgreSQL migration stores ordered child definitions in PostgreSQL, with atomic saves, project scope checks, changelog entries and revision conflict protection. Existing modules retain their content. Definitions document intended APIs/actions/events; saving them does not execute or deploy them.

Module URLs retain the selected section and table UUID. Refresh restores the saved module, section and selected table.

Module child sections now use the same labeled InlineDetails rows as Details instead of MasterList grids. Each saved definition has its own compact heading and editable property rows; schema preview uses matching summary rows. The project-level module index remains MasterListV1.

## Order, active status and task progress

Projects have a positive Order no and Active/Inactive status stored in PostgreSQL. New projects default to the next order and Active; optional API fields preserve older creation clients. The list sorts ascending by order, then owner for ties. Use each card's Edit action to update settings. Inactive projects retain all history and running work; new plans are blocked until reactivated.

Task completion displays completed, non-dropped coding tasks divided by all recorded, non-dropped coding tasks. No tasks or an unavailable task runner shows a text state rather than an estimated project percentage. Migration 20261117001200 preserves the existing initial list order and all project IDs/content.


## Refresh the project list

Run `npm run projects:sync` explicitly to append newly added workspace apps/devkit products. It is repeatable and preserves saved IDs, order/status, content and history. Retired Project Manager records remain available through their historical links but are excluded from the project card list.

## Agent coding blueprint

Keep compact lists for review; use each row's Definition details action for full API/action/event/dependency definitions. Tables and Fields are separate tabs. Fields provides a table selector, searchable field list and Add/Edit/Remove controls. These edit saved design records, never application database columns.

| Area | Minimum useful definition |
| --- | --- |
| Module | Code, owner, version, responsibility, data scope and PostgreSQL schema when it owns tables |
| API/route | Method, path, purpose, permission, explicit request and response JSON definitions |
| Action | Name, responsibility, permission, input/output JSON definitions |
| Event | Name, published/subscribed direction, purpose and payload JSON definition |
| Dependency | Module/package/service, purpose and public contract |
| Table/field | Table name, field name/type, exact SQL type, identity choice, required/key/unique flags, defaults and references |

Use an explicit empty JSON object when there is no input. Record SQL length/precision in SQL type, such as VARCHAR(32) or NUMERIC(12,2). Do not store database passwords, tokens or connection credentials in definitions. Existing records retain their IDs and hidden metadata; optional ownership/type metadata requires no database schema migration.

Open Project → Blueprint to check missing details, conflicting routes, unresolved recorded references, type mismatches and database ownership. Click an issue to open its module/section. The check covers completeness and basic JSON syntax, not full JSON Schema semantics, database execution, functional completion or permission to run code. Draft scopes and deferred runtime features remain explicit in module descriptions/status.

Export JSON produces `codeitz.project-blueprint` version 1, with exact saved definitions, module revisions, issues and a definition fingerprint. JSON schema fields remain the saved JSON text and should be parsed by consumers. Read-only API: `GET /api/v1/projects/{area}/{name}/blueprint`, under the existing local access guard. Use the export for script/agent planning; automatic code generation and task-runner approval behavior are unchanged.


### Field popup and automation detail review

Choose PostgreSQL type using the searchable Lookup. VARCHAR shows Length; DECIMAL/NUMERIC show Precision and Scale. The form builds one exact SQL type (for example VARCHAR(120), NUMERIC(12,2)); length is not stored twice. Type changes reset incompatible sizing and identity choices. Existing definitions are read unchanged until explicitly saved.

Record field purpose and validation rules, required/primary/unique/index choices, identity or default SQL expression, reference table.column and On delete behavior. Reference Lookup lists this module's saved fields; enter another project module's table.column explicitly when needed. Blueprint resolves references across recorded project modules. Defaults and descriptions are definitions, never executed as SQL.

Blueprint now also reports missing table/field purposes, unconfirmed index choices, missing reference delete behavior, invalid sizing and incompatible identity/nullability. Resolve gaps from source or a confirmed design; do not invent values to make the check pass. API schemas should describe path/query/body inputs and success/error outputs; action descriptions record business rules, event descriptions record when they occur, dependency contracts identify public interfaces. These remain reviewed definitions, not an automatic implementation guarantee. New optional index/reference metadata stays in existing PostgreSQL JSON records; no data migration or rewrite is needed.


### Module review and owner approval

Open a module → Review & finalise. Review audits saved definitions and lists gaps with links back to the relevant sections. Resolve findings and project-wide code/table/route conflicts before approval. Read the saved definition, confirm the review checkbox, then enter your private owner approval key and select Approve & finalise.

Set `CODEITZ_OWNER_APPROVAL_KEY` to a private random value of at least 16 characters in Codeitz's server `.env`; the example leaves it blank. Never put it in agent prompts, task records or frontend environment variables. Approval is disabled when it is unconfigured. The endpoint accepts only the configured key, under the existing local/same-origin guard; other users may review but cannot approve without that key. This is single-owner key protection, not an authenticated multi-user identity system, and cannot isolate agents that already have access to your private server files.

PostgreSQL `module_approvals` records owner identity (`workspace-owner`), exact revision, timestamp, definition fingerprint, immutable snapshot and passing audit evidence. A unique module/revision constraint makes retries idempotent. No approval seed is created. Later edits retain earlier approvals and mark them stale, including edits made through the generic workspace endpoint. API responses and exported blueprints include current approval metadata; the review endpoint provides historical snapshots. Blueprint `ownerApproved` requires current approvals on every module plus a passing current definition check. Completeness (`readyForCoding`) remains separate from owner approval.

New endpoints: GET `/api/v1/projects/{area}/{name}/modules/{id}/review` and POST `/api/v1/projects/{area}/{name}/modules/{id}/approve`. Approval requires current `revision`, `confirmed: true` and the private `ownerKey`. The key is neither returned nor stored in approval history. Snapshot approval covers saved module definitions, not proof that implementation works. Task-runner coding approvals remain separate. Existing modules remain unapproved until you explicitly approve them.
