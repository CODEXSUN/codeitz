# Work record

## Task runner record and connection fixes

Read the latest 30,000 work-record characters. Recovered interrupted tasks append an app work-record failure; concurrent reads share recovery. Added side navigation and local Codex Settings with diagnostics, refresh, and Windows terminal sign-in. Local CLI and browser Settings both report connected. Verified typecheck, frontend build, 11 tests, and governance audit. No login/logout was performed.

## Existing local Codex connection

Removed Theme & components controls from Codeitz pages. Settings now offers Connect local Codex using the existing CLI session. Removed the fresh-login action and endpoint.

## Running-server Codex detection

Reproduced spawn codex ENOENT on port 4310. Added installed Windows Codex discovery when the IDE server PATH omits the CLI. Reused the existing signed-in session; no login launched or auth files copied. Verified the running setup endpoint reports connected, typecheck/build and 13 tests pass, and governance audit is clean.

## Live runner and task records

Refactored the task workspace with a real local worker indicator, three-stage progress, SSE activity, and separate task review/history. Added SQLite runner storage with one-time transactionally imported JSON backups; app work records remain append-only. Added saved-evidence audit, archive, recoverable drop for completed tasks, and restore. Existing authentication and separate plan/code/check approval steps remain. Verified real local Codex emits live start/final activity without modifying files, SQLite migration/restart, streaming/reconnect state, record lifecycle guards, and passing package checks.

## Completion review

Added final result review with changes and checks, Accept result, and feedback-based Request changes. Follow-ups are linked drafts saved transactionally with the original review; no agent runs until the user starts planning, and coding approval stays separate. Corrected stale check-pending summaries from saved outcomes while preserving raw coding reports and old notes. Verified review persistence/idempotence, follow-up planning guards and parent context, local route restrictions, 19 passing tests, typecheck/build, and governance audit. Browser-checked final summary and feedback form; real task review decisions remain untouched.

## Project Manager connection

Added task-ID URL entry, project-owner filtered records, and return navigation to Project Manager (default port 4312). Reused the framework local-request guard. Public task APIs and separate plan/code/check approvals remain. Verified build/typecheck, 19 tests, governance audit, and browser project-filter navigation.

## Repository tool wiring

Audited the copied GitHub/version tools, added the missing changelog parser, and adapted paths and version handling to this standalone app. Added docs/CHAGELOG.md at version 0.1.0, dry-run bump/Git previews, and version consistency checks in verification. Git helper defaults to audit-only and publishing stays separate/interactive. Tested version changes only in disposable fixtures; no app version bump, Git staging/commit/push/pull, or SSH-key operation was performed.

## Initial GitHub publication 1.0.1

Prepared application and lock-root version 1.0.1 with the matching changelog state and release entry. Connected origin to CODEXSUN/codeitz and preserved its existing initial README/ignore history. Release checks include app verification, tool tests, read-only version/Git previews, and exclusion of local environment, runtime database, build output, and node_modules. Shared dependency versions remain unchanged.

## Shared main layout

Replaced the app-local shell with MainLayout from @workspace/ui/layouts/main-layout. Shared side menu, top menu/search, app header, workspace canvas, and status bar now compose Codeitz. App-owned navigation, project links, existing task URL selection, and page content remain wired. Status reports the actual task stream/worker phase and package version. No shared layout or styles were copied into Codeitz. Verified shared UI build, Codeitz typecheck/build, 23 tests, version/governance checks, and browser side-menu navigation, top-menu search navigation, sidebar toggle, and status/version display. Preserved the existing .gitignore changes; no commit, push, or version bump.

## Settings sections

Aligned Codeitz settings with UIUX using shared AppearanceSettings and the existing provider/reset action. Added Application, Appearance, and Codex sections. Codex shows actual local CLI connection/version, existing session, and current execution scope, with the existing reconnect action and error output. No credential collection, new login, or unconnected configuration controls. Verified typecheck/build, 23 tests, version/governance checks, and browser appearance/palette selection; restored original preferences after verification.

## Full-screen and stream stability

Matched UIUX MainLayout sizing with h-screen w-full. Removed app-local cursor overrides in favor of shared UI rules. Added one app-owned TaskStreamProvider used by pages and status bar; shell status subscribes to a stable phase string rather than every activity event. Page navigation preserves the task connection and records. Initial Codex setup displays Checking rather than a false disconnected label. Verified typecheck/build, 23 tests, version/governance checks, full viewport width without horizontal overflow, navigation, appearance changes (restored original choice), and existing Codex connection. No commit, push, version bump, or runtime task changes.

## Codeitz task 2f238bb0-7615-4943-9ed3-dd39a95168e0

- Updated: 2026-11-16T15:20:11.089Z
- Goal: Read-only integration audit: inspect the public task, review and audit contracts used by Project Manager. Report the expected owner scope, planning-only handoff, review eligibility and audit behavior. Do not edit files, run coding, install dependencies or change project state. Return findings and any integration gaps.
- Status: planned
- Changes: None recorded
- Checks: Not run
- Review: Not reviewed
- Parent task: None
- Follow-up task: None
- Next: Review the plan, then explicitly start coding.

Read-only integration audit finished. No files changed, APIs invoked, or builds/tests run.

Findings:
- Owner scope: Codeitz accepts discovered apps/<name>, devkit/<name>, and infrastructure/database-manager owners, validating real workspace directories. Project Manager supports apps/devkit only and verifies task membership before forwarding review/audit actions. Owner filters are presentation, not identity or tenant authorization.
- Planning handoff: POST /api/tasks accepts {owner, goal}, returns 202, and starts read-only planning. Coding and checks require separate step requests. Project Manager’s adapter exposes no coding/check action. Planning still saves task records and app work-record entries.
- Review: POST /api/tasks/:id/review requires a completed, current task and an idle runner. Acceptance requires a result and nonempty, all-passing saved checks. Changes requested requires trimmed feedback up to 3,000 characters and transactionally creates a same-owner draft. Identical reviews are idempotent; conflicting decisions are rejected. Follow-ups require separate planning and coding approval.
- Task audit: POST /api/tasks/:id/audit compares saved plan, work-record task ID, activity, and completion checks against currently declared scripts. It does not rerun checks; it appends audit activity. Noncompleted tasks can pass. Active tasks are rejected.
- Governance audit is separate: structural checks, optional selected subsets, no business-correctness guarantee. Project Manager’s adapter currently uses task audits only.

Integration gaps:
- GET /api/tasks can recover interrupted tasks and migrate completion summaries, writing SQLite and app work records. Project Manager’s ordinary reads therefore are not guaranteed side-effect-free.
- Acceptance checks saved checks only; audit additionally requires every currently declared check. A record can be accepted yet fail its evidence audit.
- Public task response types exist, but request/review response envelopes remain implicit; Project Manager trusts largely unvalidated JSON.
- Codeitz task actions use task IDs without an expected-owner contract. Local-request protection does not implement actor/tenant authorization.
- Planning creation has no idempotency key; a timeout followed by retry can create duplicate work.

Proposed implementation plan, subject to separate authorization:
1. Codeitz task-runner: separate pure reads from recovery/migration and align acceptance evidence with audit policy.
2. Codeitz contracts: define request/response envelopes, expected-owner validation, and retry-safe planning semantics.
3. Project Manager projects adapter: consume those public contracts, validate responses, and preserve explicit planning-only handoff.

Appropriate future checks: cross-owner rejection, reads without writes, timeout/retry deduplication, separate plan/code/check transitions, review eligibility/idempotency, atomic follow-up creation, and acceptance/audit consistency. Existing test source covers several lifecycle cases; tests were not executed.

Blockers: none for this audit. Implementation requires separate authorization; actor/tenant enforcement also needs an agreed trusted identity contract.

## 2026-11-16 — Codeitz routing adoption

- Migrated Codeitz module clients and routes to `/api/v1`; clean paths now own task selection, records, Settings sections and governance audit state. Added history subscriptions, canonical URL cleanup and missing-record handling.
- Added local-only `/api/docs` and `/api/openapi.json` with module-owned operation descriptions, parameters, request/response schemas and errors. Startup rejects registered versioned operations without documentation. Existing Project Manager links and task API aliases remain compatible; other apps were not migrated.
- Added the selectable Codeitz routing source check to product/workspace governance audits; non-Codeitz owners explicitly skip it. Checks cover source wiring, not runtime browser correctness.
- Verification: typecheck, build, all 26 tests, version check and governance audit passed (24 owners, 10 products, zero violations). Browser checks passed for settings Back/Forward/refresh, record filters and selected-record refresh, opening a task in the runner, audit tab/custom-check refresh and live individual routing audit, plus `/api/docs`. Existing four saved tasks remain accessible; no task execution or record actions were started for browser verification.
- No dependency installation, database schema changes, commit or push. Existing build warnings about shared client directives and bundle size remain.

## App UI reuse migration — 2026-11-16

Replaced reusable local settings nav, stage progress, activity feed, check output, task record renderer and audit progress with public shared UI imports. Business contracts, callbacks, routes and APIs retained. Typecheck/build and 26 tests pass; browser checked Settings and Task records navigation.

## 2026-11-16 — Flatten governance audit page

- Removed the inner side menu, duplicate brand and top bar. Governance audit now renders directly inside the shared Codeitz workspace with standard page spacing.
- Verified typecheck, frontend build and live browser rendering. Audit controls and URL state are preserved. No commit or push.

## 2026-11-16 — Database-backed Todos

- Reviewed the supplied Todos reference; added the compact Todos page with shared theme, menus, project initial icons, inline edits, due dates/status, visibility, soft deletion and pointer/keyboard reordering.
- Added the reusable public TodoWorkspace block and UIUX preview/usage. Codeitz owns its module contracts, guarded versioned routes, OpenAPI and SQLite persistence; no reference app code/styles were copied.
- SQLite stores all saved fields and order separately from task-runner records. Transactions and collection revisions reject stale writers; the UI applies saved server snapshots, retains failed edits and restores URL filters through history.
- Codeitz typecheck/build, 29 tests, version/governance checks passed. Browser checks used isolated temporary records and verified metadata, ordering, filters and refresh persistence. The working list remains unseeded. No commit or push.
- Final shared verification: packages/ui build and 24 tests passed; UIUX typecheck/build passed. Temporary browser server stopped; the existing working server remains running.

## 2026-11-16 — Todos category and edit stability fixes

- Audited public shared TodoWorkspace reuse, guarded SQLite writes, project initial icons, saved ordering and metadata persistence.
- Typed categories now update the unsaved todo selection immediately and are included in Save; Enter/check selection remains supported. Cancel still preserves the stored record.
- Reserved save-status space and row height, and focused the inline editor without scrolling. Browser measurement confirmed identical row top (299px) and height (72px) before and during editing.
- Isolated browser category Save/refresh passed; existing persistence tests cover server/store restart, order and all editable fields. Shared UI build and 27 tests passed. No commit or push.

## 2026-11-16 — Category dropdown and timer scheduling

- Replaced category live typing with an existing-category list and bottom + Add category action, inline Save/Cancel and independent revision-checked SQLite persistence. Saved categories survive without todos; existing categories are imported and case variants reuse the saved name.
- Added a separate timer icon with local date/time input and UTC storage. Domain-owned 15-second scans persist due reminders once, skip finished/deleted items, and catch missed reminders on startup. Clearing/rescheduling is saved. No automatic Codex execution or external notification was added.
- Verified 32 Codeitz tests, shared UI build/27 tests, UIUX typecheck/build and browser category add/select/refresh, timer save/refresh, composer behavior and automatic due indication using isolated records. Existing records preserved; temporary server stopped. No commit or push.

## 2026-11-16 — Agent chat with local Codex

- Reviewed the reference Agent Chat pattern and added a themed Agent space with bottom composer, project/mode selection, Markdown replies, copy, saved-history drawer, real activity and Stop. Reused a new public shared UI block and added its UIUX preview/usage. Chat content is lazy-loaded with shared loading/error boundaries.
- Connected the existing signed-in local Codex CLI through a public read-only runner interface. Explore/Plan/Review read governance, project instructions, latest work records and recent saved messages. No fresh login, automatic coding, desktop-thread sync or extra external provider was added.
- SQLite stores conversations, user/assistant messages, public activity, idempotent request IDs and completion/error/cancel/interruption states. Reconnect restores persisted snapshots. Startup records interrupted replies without rerunning them. Coding stays in the task runner approval flow.
- Added versioned/local-guarded chat APIs, OpenAPI contracts, clean browser routes/query state and routing-audit coverage. HTTP tests now isolate runtime databases from working records.
- Verification: Codeitz typecheck/build, 38 tests, version check and governance audit passed (24 owners, 10 products, zero violations). Shared UI build/33 tests and UIUX typecheck/build passed. Browser used a temporary database and the real existing Codex session: reply completed, activity streamed, history/refresh/Back restored saved messages. Temporary server stopped; no commit or push.

## 2026-11-16 — Approved chat plan task handoff

- Added Approve plan & create task to completed Plan-mode replies. The server derives the project, original goal and exact plan from SQLite and creates a planned task through the runner's public contract; no AI execution, coding or checks occur during creation.
- Stored unique pending/ready chat→task reservations and approval timestamps in chat SQLite, plus task→chat provenance in runner SQLite. Retry/restart reuses the reserved ID and existing task without resetting progress. The existing coding approval remains a separate action.
- Added Open task and View source chat navigation, strict/local-guarded API/OpenAPI wiring, and shared UI callback/preview updates.
- Verified Codeitz typecheck/build, 41 tests, versions and governance audit; shared UI build/34 tests and UIUX typecheck/build passed. Isolated browser checks confirmed approval→same-project planned task, separate coding button and persistent bidirectional navigation after reload. No coding started in browser verification; temporary server stopped. No commit or push.

## 2026-11-16 — Focused task runner interface

- Reviewed repeated status, oversized worker sidebar and scattered plan/results content. Replaced the runner composition with a compact task summary, one next-action area and Plan/Results/Activity tabs using existing shared components.
- Active work opens Activity, ready plans open Plan, and coded/completed/failed tasks open Results unless a tab was explicitly selected. Tab URL state restores on refresh/Back and rejects invalid values. Collapsed secondary file lists and task metadata; reused shared CheckResults for expandable check output.
- Simplified new-task form and completed review presentation. Preserved separate approvals, result acceptance/change requests, linked follow-ups, source-chat links, existing SQLite data and the single task stream. No backend behavior changed.
- Verified Codeitz typecheck/build, all 41 tests, versions and governance audit (zero violations). Browser checks covered completed/planned/new-task views, tab selection/refresh/Back, check/file expansion and opening/canceling the unsent follow-up form. No task actions were submitted, records modified, commit or push performed.

## 2026-11-17 — Outer agent rails

- Reused the shared AgentWorkspace layout for left and right icon rails with shortcuts to existing pages and settings. Preserved the existing side menu, workspace, top menu and status bar.
- Corrected settings-section typing for active rail selection. No backend or stored-data changes.
- Typecheck and build passed. Browser checks confirmed rail navigation, sidebar collapse/expand and full-width layout without horizontal overflow. No commit or push.

## 2026-11-17 — Unified task manager plan

- Documented the enquiry-to-completion plan for human and agent tasks, confirmed Maya/Arun/Dev/Tara responsibilities, record ownership, separate approvals and incremental build order in [Unified Task Manager](unified-task-manager.md).
- Documentation only; no agents, workflow, code or database changes implemented. Checked document links and diff formatting.

## 2026-11-17 — PostgreSQL main database plan

- Updated governance and Codeitz guidance: PostgreSQL owns permanent records; SQLite is for temporary local data. Existing stores remain authoritative until a separately approved migration preserves records and links.
- Added planned PostgreSQL variables with an empty password to local environment configuration and its example. No application role/database creation, connection wiring, migration or record changes. Documentation/configuration only.

## 2026-11-17 — Personal dashboard scaffold

- Added `/dashboard`, first left-rail/sidebar navigation and dashboard home breadcrumb while preserving existing workspace and legacy task routes.
- Composed shared UI with saved task/todo/chat/product summaries, decisions, pipeline, available activity and clearly labelled personal growth, writing, enquiry and named-agent scaffolds. Reused the app's existing task stream; no execution actions start from viewing the dashboard.
- No new tables, migration, sample records or PostgreSQL runtime changes. Typecheck/build and three routing tests passed; live browser verified direct route, saved summaries, task navigation, rail return and no horizontal page overflow.

## 2026-11-17 — Wider dashboard and pastel borders

- Removed the dashboard maximum-width cap; content uses 90% of its available container on larger screens with compact mobile margins. Kept the existing shell unchanged.
- Reused shared cards with neutral surfaces, pastel borders, metric icons and hover/focus feedback. Summary cards link to existing todos/task records; focus and decision headings also link to their pages. Planned sections remain informational.
- Typecheck/build and diff checks passed. Browser verified neutral cards, width, no horizontal overflow and todo-card navigation back through the dashboard rail. No data changes.

## 2026-11-17 — Focused dashboard content

- Shortened dashboard descriptions and removed task/chat/todo/project navigation buttons duplicated in the rails. Kept manual summary refresh and clickable summary cards/records.
- Preserved saved data, counts and planned-state labels. Typecheck and build verified.

## 2026-11-17 — Compact dashboard update time

- Replaced verbose stream/refresh status with a refresh icon and relative last-successful-summary time (Just now, m/h/d ago). Exact timestamp remains available on hover; failed refreshes retain the previous successful timestamp.
- Typecheck and build passed. No data or execution changes.

## 2026-11-17 — Header timestamp refresh action

- Moved the relative timestamp and refresh icon into one top-right header button; removed the separate Refresh summary button and status row. Kept accessible refresh labeling and exact-time tooltip.
- Typecheck/build passed. No data changes.

## 2026-11-17 — Visible summary refresh

- Timestamp button reloads the saved summaries and shows Refreshing with a spinning icon while requests run. Disabled repeated clicks during refresh; successful refresh resets the timestamp and failures retain the existing warning.
- Typecheck and build passed.

## 2026-11-17 — Reference card and table dashboard

- Matched the supplied reference with compact clickable metric cards, colored left accents, paired personal/agent summary tables and full-width activity rows with timestamps aligned right.
- Reused shared Card/Table controls, kept real saved counts and task links, and retained planned-state labels and header refresh. Typecheck/build and live browser appearance passed. No data changes.

## 2026-11-17 — Smooth metric card hover

- Added gentle lift and shadow transitions to clickable dashboard metric cards, matching keyboard focus and respecting reduced-motion preferences.
- Typecheck/build passed; no data changes.

## 2026-11-17 — Workload header alignment

- Moved Personal workload and Current execution workload to the right of their card headers, with wrapping on narrow screens.
- Typecheck passed. Presentation only.

## 2026-11-17 — Dashboard section spacing

- Increased space between dashboard sections to 32px on small screens and 40px on larger screens. Kept card content compact.
- Production build passed.

## 2026-11-17 — Todo composer focus

- Shared TodoWorkspace focuses the composer after initial loading and successful creation, waiting for save completion before restoring focus. Enter can be used to add consecutive todos; existing values and persistence are unchanged.

## 2026-11-17 — Todo category management

- Added a separate `/todos/categories` page and sidebar link using public MasterListV1 with popup create/edit and confirmed deletion.
- Added guarded, revision-checked rename/delete APIs and OpenAPI entries. Updates preserve todo content, rename linked assignments or clear them on deletion, including soft-deleted rows to prevent category resurrection.
- Typecheck/build and all seven todo tests passed, covering duplicate/stale rejection, linked data, deletion and reopen persistence. Browser verified the real list and edit popup without saving or deleting working records. No PostgreSQL migration or commit/push.

## 2026-11-17 — Todos and categories PostgreSQL cutover

- Added explicit module-owned Kysely migration, no-business-data seeder, PostgreSQL repository and local connection/preflight wiring. Normal startup never migrates or seeds; todos have no runtime SQLite fallback. Tasks and chat remain unchanged in SQLite.
- Imported and field-verified 10 todo rows (6 current, 4 deleted), 4 categories and collection revision 35. Preserved legacy UUID references, category assignments, order, dates/times, reminder flags and timestamps. Generated separate public IDs; new todos use eight-character IDs. Retained SQLite source plus a verified private backup/report and blocked legacy writes after cutover.
- Migration/seed/import reruns passed without duplicates or overwriting user records. Live PostgreSQL tests cover fresh schema, seed concurrency, import integrity, ID collisions/exhaustion, revision conflicts, category actions, ordering, scheduling, separate reconnection and local API guards. All 43 tests, typecheck/build and governance audit (24 owners, 10 products, zero violations) passed. Preflight was checked on an unoccupied test port because the working server owns 4310.
- Browser verified the migrated six-todo list and four-category Master List; no working records were edited during browser checks. Documented compatibility/local-identity exceptions and recovery limitations in docs/todos.md. Existing local postgres credentials retained; restricted production identity remains separate setup. No commit or push.

## 2026-11-17 — Tasks work register and CRM workflow pattern

- Reviewed the requested CRM task module and screenshots, then built Codeitz-owned Tasks at /work-tasks with a rail/sidebar entry, separate from coding runner routes.
- Added 13 PostgreSQL tables across five master owners and the business/task aggregate: users, minimal contacts, lists, priorities, statuses, tasks and seven workflow children. Applied ordered coded migrations, seeded required assignee/reference directories, reran seed safely and left tasks/contacts unseeded. Existing 10 Todo rows and 4 categories remain intact.
- Added shared Master List/date range/column controls and full-row navigation, upsert create/edit/property forms, rich comments/replies, check-in/out, persistent job timers, exact charges, once-only schedule reminders and closure request/review. Separate closure approval is enforced; active jobs/check-ins block acceptance. Added strict/public contracts, OpenAPI, revision locks, retry-safe requests and audit activity. Named-agent assignment does not execute agents.
- Verified all 44 Codeitz tests including live PostgreSQL fixtures, typecheck/build, fresh/rerun migrations, seed concurrency, persistence, request guards and approved/rejected closure. Browser used an isolated schema for form save, contact/assignment, jobs/refresh, properties, charges/comments, closure approval, search/column controls and date refresh/Back. Test server/schema/runtime removed; working task data unchanged.
- Extended public MasterListV1 with opt-in row navigation and matching UIUX example/usage. Shared UI build/36 tests passed. Governance audit passed with zero violations; documented local identity/cloud limitations and recovery policy. No commit or push.

- Final follow-up: full-row navigation verified by clicking an assignee cell in an isolated browser schema. UIUX typecheck passed; all 36 shared UI tests passed. The second test server/schema/runtime were gracefully removed.

## 2026-11-17 — Minimal task form and keyboard travel

- Removed Cancel, Contact name, helper paragraphs and empty recent-record sidebar. Moved Contact below Mobile no; kept its optional internal relationship and existing persistence contracts.
- Enabled shared 44px input sizing, five-line fixed/scrolling task details and opt-in Enter/Escape navigation. Save remains explicit; Shift+Enter retains newlines.
- Browser confirmed equal control heights, stable 118px details height with overflowing content, forward/reverse navigation, Escape selection and no Enter submission. No working records were created or altered during verification.

## 2026-11-17 — Compact task list header

- Removed the task-list title/description and list Refresh button, reduced top padding to 12px and inset the New task action by 16px. Detail refresh remains available.
- Typecheck and build passed. No data changes.

## 2026-11-17 — Created-date filter dropdown

- Added public FormDateRangeFilter with a calendar-range icon, paired shared date inputs, active indication and Clear dates. Codeitz Tasks replaces its exposed date controls with this dropdown; URL filtering is preserved. UIUX includes preview and usage.
- Shared UI build, Codeitz typecheck/build and UIUX typecheck passed. Browser verified popover layout, date selection updating the URL and clearing the filter. No record changes.

## 2026-11-17 — Task breadcrumb emphasis

- Added optional shared breadcrumb emphasis and applied it to the current Tasks breadcrumb at 16px/semibold. Moved the list New task action another 16px left; other breadcrumb defaults stay unchanged.
- Shared UI build, Codeitz typecheck/build and UIUX typecheck verified.

## 2026-11-17 — New task button hover

- Added a smooth 200ms lift and shadow to New task, including keyboard focus and reduced-motion support.
- Production build passed. Presentation only.

## 2026-11-17 — Compact Master List pagination

- Reduced shared pagination padding/gaps and scoped the single-line control token to 32px within the footer. Kept page-size options, navigation and normal form input sizing unchanged.

## 2026-11-17 — Aligned search strip tools

- Added the shared hover/focus tooltip to the created-date filter. Master List toolbar icon buttons now match the search input's control-height token and align evenly at the right with consistent spacing. Popup controls and pagination retain their own sizing.

## 2026-11-17 — Table-aligned New task action

- Replaced the fixed button margin with the list's responsive 5% header inset. Browser measurement confirmed matching table/button right edges. Typecheck/build passed; no data changes.

## 2026-11-17 — New task icon

- Added a decorative plus icon to the existing New task action. Production build passed.

## 2026-11-17 — Task form outer spacing

- Reduced new/edit form outer side margins from 5% to 3% and vertical padding from 24px to 16px. Internal controls and layout are unchanged. Production build passed.

## 2026-11-17 — Slim task details scrollbar

- Added opt-in shared Textarea slimScrollbar styling and enabled it on task details. Uses a 3px themed scrollbar on Chromium, thin on Firefox and a wider touch fallback; fixed five-line scrolling is preserved. UIUX demonstrates the option.

## 2026-11-17 — Remove duplicate sidebar entries

- Removed Dashboard, Tasks and Todos from the side menu while preserving their rail shortcuts and routes. Dynamic submenus/history remain deferred. Typecheck/build passed.

## 2026-11-17 — Compact task form density

- Added opt-in shared compact form density with 12px form/section padding and gaps. Tasks uses 16px page side margins and 12px vertical spacing; input geometry remains unchanged. UIUX demonstrates the shared option.

## 2026-11-17 — Responsive task form width

- Set new/edit forms to 90% width on larger screens, with 16px small-screen margins and 24–32px top spacing. Kept compact internal spacing. Production build passed.

## 2026-11-17 — Save task alignment

- Aligned Save task with the responsive new/edit form right edge and the Properties form workspace edge. Retained small-screen margins. Typecheck/build passed.

## 2026-11-17 — Task runner rail cleanup

- Removed Task runner from the left rail; side-menu entry and routes remain available. Production build passed.

## 2026-11-17 — Dashboard default landing

- Root navigation now opens /dashboard. Explicit legacy task, records and project-owner handoff links retain their existing destinations. Routing tests, typecheck and build passed.


## 2026-11-17 — Project Manager and GitHub Manager merged into Codeitz

- Moved project and GitHub API/frontend modules, public contracts, historical SQL migrations and regression tests into Codeitz. One server, MainLayout, theme provider, navigation and API documentation now serve `/projects`, `/projects/overview`, project tabs/records and `/github-manager`.
- Preserved project creation with streamed scaffold progress; notes and custom note lookups; nested module designs; architecture, whiteboards and schema designs; project task/review/audit/changelog features; GitHub discovery, filters, file previews/grouping, guarded selected commits and separate push. Repository version/bump/changelog/SSH tools remain available through Codeitz scripts. No live commit, push or fresh login was performed.
- Projects use the same in-process task runner through its public interface. Planning does not approve coding. Clean task links and legacy project API redirects remain supported; browser refresh and Back were checked.
- Stopped the former Project Manager watcher/server. Copied all 18 existing SQLite tables using SQLite backup and verified schema/row checksums, foreign keys and integrity. All 9 project records, 3 notes, 2 modules, 1 architecture, 1 whiteboard, 1 schema and 23 project changelog entries are preserved, including module children and lookup records. Active data: `.codeitz/projects/projects.sqlite`. Existing runner/chat SQLite and PostgreSQL Todos/Tasks were not migrated or overwritten.
- This is application consolidation, not a project-data conversion. The existing project SQLite schema is retained pending a separately reviewed PostgreSQL migration. New permanent SQL modules follow governance's PostgreSQL standard.
- Archived the original standalone repository, uncommitted work, original data and Git history at `../../.archive/project-manager-20261117`. It is excluded from active product/repository discovery. Its historical project card remains readable, is marked merged, and cannot start new coding plans.
- Validation: typecheck/build and all 65 tests passed, including PostgreSQL suites, retained project/GitHub regression tests, transfer overwrite protection, identical records after reopen and same-runner plan-only handoff. After final import-boundary cleanup, 21 affected tests plus typecheck/build passed. Governance passed for 23 owners/9 active products with zero violations; version remains 1.0.1. Browser verified integrated project tabs, preserved notes, refresh/Back and repository cards. Source/active database checksums still match after integrated reads.


## 2026-11-17 — Projects PostgreSQL cutover

- Added module-owned Kysely migration `20261117000900_projects_postgresql`, typed PostgreSQL repositories and an idempotent real-workspace catalog seeder. Existing applied migrations were not rewritten. Projects no longer opens or writes SQLite at runtime.
- Stopped Codeitz for cutover and created `.codeitz/projects/projects.pre-postgresql.sqlite`. Imported all 18 SQLite tables into PostgreSQL atomically, preserving 9 projects/setup rows, 3 notes, 2 modules, 1 architecture, 1 whiteboard, 1 schema, 23 changelog entries, 17 note options and every module child/history/seed row. Integer IDs, UUID links, order, revisions, timestamp text and JSON strings are unchanged. Source schema history now lives in `project_legacy_migrations`; source seed history in `project_seed_records`.
- Verified all imported fields row by row before commit, advanced generated identity sequences, recorded the source checksum and installed a local cutover marker. Repeated import/seed preserved all rows. Changed sources and nonempty destinations are rejected; revision conflicts and scoped writes remain transactional. SQLite is retained only as an unchanged recovery copy; the obsolete SQLite-to-SQLite transfer helper is retired under ignored runtime artifacts.
- Local startup/preflight now checks the Projects schema and matching cutover record when a local legacy source exists. Existing PG settings serve local development and verified-TLS cloud connections. The same migrations/seeders are documented for production; no cloud database, deployment or credentials were created or changed.
- Validation: typecheck/build, 65 tests including all PostgreSQL suites, version checks and governance passed (23 owners, 9 active products, zero violations). Recovery/import tests also verify independent connections, concurrent edits, sequence continuity, no duplicate import and source preservation. All 9 live workspace API responses retained original record fields and links. Browser verified saved notes and module UUID links after refresh. Codeitz was restarted and again returned all 9 projects with the same runner connection; all 18 table comparisons and SQLite backup comparison still pass.
- Task runner, agent chat and their approvals/history are unchanged; their remaining SQLite stores require later authorized migration steps. No commit or push.


## 2026-11-17 — PostgreSQL-only runtime; legacy-file cleanup pending

- Migrated the remaining coding task store and agent-chat store to module-owned PostgreSQL schemas/migrations `20261117001000_runner_postgresql` and `20261117001100_chat_postgresql`. Preserved all 4 tasks, 61 events, metadata, 1 conversation, 2 messages, 4 chat activity rows and all source IDs/timestamps/body text. Projects and Todos were reverified against their legacy imports, including all 10 Todo legacy IDs.
- Converted runner activity writes and chat services/routes to asynchronous durable PostgreSQL operations. Streaming publishes saved activity; Stop, recovery, idempotent chat-plan handoff and separate coding/check approvals remain covered. Fixed a PostgreSQL snapshot race by re-reading a worker's latest saved state before marking interruption. No runtime SQLite fallback or automatic JSON import remains.
- Moved the legacy Todo SQLite writer into disposable test fixtures. Offline read-only import readers remain available for migration/recovery; normal application startup uses PostgreSQL only. Test schemas are prepared before server startup and test files run serially to avoid concurrent schema introspection/drop races.
- Validation: typecheck/build, all 66 tests, version check and governance audit passed (23 owners/9 products/zero violations). Live health, task/chat/project APIs and pages returned 200 with the preserved records. No fresh login, commit or push.
- Before requested cleanup, exported all 8 legacy SQLite databases to ignored `.codeitz/migrations/retired-database-records.json`, verified the retired Project Manager Git history bundle, and saved its uncommitted tracked patch. The recovery JSON is not a runtime store.
- Physical cleanup is NOT complete: automatic approval review blocked both permanent and explicitly scoped file-removal commands (reason returned: blocked by policy). No legacy files or archived application were deleted. Recoverable removal through the Windows interface requires action-time confirmation. PostgreSQL migration and audits are complete; legacy files remain inactive pending that cleanup.


## 2026-11-17 — Confirmed recoverable legacy cleanup completed

- With explicit confirmation, moved the retired `.archive/project-manager-20261117` directory and 25 legacy SQLite files/sidecars/markers from `.codeitz/` to the Windows Recycle Bin. Nothing was permanently erased; shared UI/framework dependency targets remain present.
- Verified zero matching local SQLite files remain in `.codeitz/` and the retired folder is absent. PostgreSQL project/task/chat records match the unchanged recovery export: 9 projects, 4 coding tasks, 61 task events, 1 conversation and 2 messages, including all preserved project children/history. No database writes were performed for cleanup.
- All three recovery artifact SHA-256 hashes are unchanged. Nine live Codeitz pages/APIs returned 200. No app code, commit or push.

## 2026-11-17 — Isolated local Docker deployment

- Adapted the reference container/setup/update pattern into Codeitz-owned `.container/`, `setup.sh` and `update.sh`. Native development stays on 4310; the isolated production-mode test uses 127.0.0.1:4410, separate PostgreSQL/workspace/state volumes and generated private deployment credentials.
- Linux image builds shared framework/UI and Codeitz, includes the pinned Codex CLI, and initializes a persistent editable workspace. Includes the Database Manager scaffold required by the audit inventory. No development `.env`, credentials, SQLite, recovery exports or existing database records are copied into the image.
- Setup explicitly migrates/seeds a fresh database. Updates guard active workers, back up PostgreSQL with a verified archive/checksum, migrate without reseeding and verify health/API access. Existing workspace files are retained. Failed migrations require inspection rather than automatic database rollback.
- Verified clean installation, update, PostgreSQL record/workspace persistence, full container stop/start, backup restoration into a disposable database, Linux typecheck/build, dashboard rendering, APIs, activity stream and cross-origin rejection. Removed the separate disposable clean-install deployment after verification. Native development environment hash and health remained unchanged.
- Docker Codex is installed but has no host credentials; no fresh login or coding execution was performed. Cloud deployment remains a separate step, with private access only until public authentication is implemented. No commit or push.
- Final Docker governance audit: 4 owners, zero violations. All three containers healthy; final update retained the verification Todo and the native development environment remained unchanged.

## 2026-11-17 — Simplify project navigation
- Removed Projects, Project overview and GitHub Manager entries from the inner side menu. Projects and GitHub Manager remain on the primary rail.
- Removed the workspace Project overview screen and route; /projects/overview now resolves as missing. Individual project detail overview tabs and all project/GitHub records remain unchanged.
- Six routing/navigation checks passed; verified frontend build and typecheck.

## 2026-11-17 — Dedicated local port pair

- Set web 4300 and API 4305; updated environment defaults, development commands, strict Vite binding/API forwarding and applicable local navigation links. Existing unrelated work preserved.
- Typecheck and resolved Vite listener/proxy audit passed. No database migration/reset or production deployment. UIUX restart and web/API forwarding were verified live; other apps require their own terminal restart to adopt new settings. See central local-ports guide.

## 2026-11-17 — Project order, active status and task completion
- Added module-owned PostgreSQL migration for order_no and active, preserving the existing order and all nine project rows/IDs plus child record counts. Private preservation snapshot retained under ignored .codeitz/migrations.
- New-project fields use next order/Active defaults. Cards show order, active status and recorded coding-task completion, with a shared Edit dialog to save order/status and project change history. Inactive projects cannot start a new plan; existing tasks and history remain.
- Updated public contracts, OpenAPI and offline v1-import verification compatibility. Typecheck/build and 17 PostgreSQL-backed project/navigation/import tests passed; no cloud deployment, commit or push.

- Browser verified sorted numbered cards, active badges, shared completion meters (UIUX: 2/3 tasks, 67%), next default order 10, Active default and saved settings in Edit. Temporary verification server stopped after checks.

## 2026-11-17 — Compact Projects list header
- Removed the Projects and Your projects headings inside the list, retained the breadcrumb and area filter, trimmed top spacing, and aligned the compact New project button with the 90% content width.
- Reused the task-list button hover lift/shadow and reduced-motion behavior. Typecheck and frontend build passed; no database or deployment changes.

## 2026-11-17 — Compact responsive project cards
- Reduced card padding/content and switched to responsive one/two/three/four-column layouts. Kept order/name, type, active/setup status, compact task progress and Plan/Edit/Tasks actions. Purpose, path and audit details remain on the project detail screen.
- Shared components and existing hover/reduced-motion behavior reused. Typecheck and frontend build passed; no data changes.

## 2026-11-17 — Project card title and indicators
- Moved order/name to the first card row, with App/Devkit on the right and an accessible green active dot (muted when inactive). Reused ProgressMeter with a two-pixel height.
- Typecheck and frontend build passed; no data changes.

## 2026-11-17 — Refresh current project cards
- Removed retired Project Manager from the card list while preserving its stored content/history and historical links.
- Explicit catalog sync added devkit/codeship and apps/core-app to PostgreSQL, appending their order without overwriting existing project settings. Added projects:sync for future refreshes; repeat execution added no duplicates.
- Typecheck/build and the PostgreSQL catalog-refresh test passed. Verified 10 visible workspace projects and unchanged historical project rows. No commit or push.

## 2026-11-17 — Requested project ordering
- Saved Platform first, Billing fourth and core-app fifth in PostgreSQL. Remaining visible projects keep their relative order with sequential order numbers; retired historical record untouched.
- Verified requested positions and unchanged project fields/IDs/status; recorded order changes in project history. No code, commit or push.

## 2026-11-17 — Record Platform source modules in Codeitz
- With confirmed scope, populated Platform's PostgreSQL module records from its current source: Identity, Access, Tenant, Domain, Service registry, Installation, Audit and Schema control.
- Recorded 24 source-defined API routes/actions, 14 tables with columns/references, dependencies, source version and responsibilities. Five implemented modules are Active; Service registry, Installation and Audit remain Draft for deferred runtime work. No invented event publishers or live installation/forwarding claims.
- Validated all payloads against the module contract and read back every saved record and child definition; eight module-history entries added, Platform project settings preserved. Private before/after evidence remains ignored in .codeitz. Platform application code, databases, credentials and services were not modified.

## 2026-11-17 — Simplify module API route view
- API route definitions now display/edit Method and Path only. Stored summary, permission and request/response definitions remain intact.
- Typecheck and frontend build passed; no database changes.

## 2026-11-17 — Single-row API routes
- Replaced per-route labeled detail blocks with shared Table and InlineEdit controls: serial, method and path in one row. Visible field headings and API route numbering labels removed; accessible names and inline save behavior retained.
- Typecheck and frontend build passed; saved route metadata unchanged.

## 2026-11-17 — Edit an API route as one row
- Each route now has one pencil action. Editing opens three shared inputs for serial position, method and path, with one Save/Cancel pair. Saving reorders the route when needed and preserves its UUID and hidden metadata; Cancel/Escape discard the draft.
- Typecheck and frontend build passed. Browser verification could not run because the browser connection was unavailable. No database records changed during implementation.

## 2026-11-17 — Minimal module collections
- Actions, Events, Tables and Dependencies now share the compact serial/name/detail row layout, with one pencil and row-level Save/Cancel. Minimal fields: action description, event direction, table description and dependency kind. Tables keep their Fields drill-down; hidden definitions and IDs are preserved.
- Typecheck and frontend build passed. Live browser verified action edit/save, table/dependency edit/cancel, and Events empty state. Pencil remains in edit mode without unintended submission. Saving an unchanged action advanced its normal revision/history; no definition values were changed during verification.

## 2026-11-17 — Separate fields and focused agent blueprints

- Split Tables and Fields into separate module tabs. Added URL-restored table selection, field list/search/columns, complete field editor and confirmed removal of a saved definition. Legacy tables/{id} links redirect to fields/{id}. Changes affect Codeitz design records, not application database columns.
- Added full definition dialogs behind compact API/action/event/dependency rows. Added optional module data scope/schema and field SQL type/identity metadata to the public contract; legacy records remain readable without a database migration.
- Added Project Blueprint view and guarded read-only export API, missing-detail/conflict/reference checks, stable definition fingerprint and JSON download with saved module revisions. No code generation or task-runner approval changes.
- Enriched 136 Platform field definitions from reviewed migration source with exact SQL types and identity metadata, preserving prior fields/IDs. Recorded confirmed master/public ownership and the actual schema guard trigger function. Deferred service forwarding/installation/audit runtime scope stays documented as draft; no Platform source/database/runtime changes.
- Typecheck/build and focused unit/PostgreSQL tests passed. Browser verified Fields/table selection and Add form, full API definition dialog, Blueprint completeness view and an actual exported JSON file containing all eight modules. Field add/edit/remove persistence tested only in disposable schemas. Existing live field definitions were not removed.


## 2026-11-17 — Compact API and field grids

Changed API routes and Fields to compact spreadsheet-style tables with vertical cell borders and tighter rows. Preserved route editing, field actions, shared UI components, search and pagination. No data changes. Validation: typecheck and build passed; diff whitespace check passed.

## 2026-11-17 — Consistent list header construction

- Shared AppHeader now keeps actions at 32px inside a 40px rail, uses the Tasks hover/focus lift with reduced-motion support, and makes the current breadcrumb semibold. MainLayout defaults to workspace action alignment; gallery import actions explicitly retain edge alignment. Shared workspace-list-content aligns list/table right edges with the header.
- Existing list shells and duplicate list headings were audited and adapted, including Billing financial lists, Codeship operations lists and Codeitz Todo Categories. UIUX live preview and typed usage use the shared content class. Governance and new-app template capture the construction rule. No Project Manager changes/builds.
- Shared UI build, nine app typechecks/builds, 13 governance tests and two Master List tests passed. UIUX browser measured header 40px and New 32px with table outer-edge alignment. UIUX suite has 15 passes and one unrelated Login example parity failure from ongoing auth-template work; those auth files were preserved.


## 2026-11-17 — Field definitions for automation

Refined field popup with shared searchable PostgreSQL type Lookup, conditional length/precision/scale inputs, reference Lookup, index choice and On delete behavior. Exact SQL type remains the single sizing value. Added field validation and Blueprint gaps for purposes, indexing, sizing and reference behavior. Existing definitions and IDs remain unchanged until saved; optional metadata persists in PostgreSQL JSON records without migration. Documented input expectations and limits. Typecheck, build and 20 focused unit/PostgreSQL integration tests passed (none skipped).


## 2026-11-17 — Owner module approval

Added Review & finalise with live definition audit, explicit confirmation and private server owner-key approval. PostgreSQL migration 20261117001300 adds immutable revision snapshots, owner/time, fingerprints and audit evidence; retries reuse the same approval and later edits require reapproval. Read APIs, review history and blueprint exports expose verification metadata. Approval does not start coding. Existing records remain unapproved; no owner key or approval was generated. Applied additive local migration successfully. Typecheck/build passed, 18 focused unit/PostgreSQL tests passed; the extended approval/conflict regression also passed. Documented key configuration and single-owner trust limits.

## 2026-11-17 — All list presentation audit

- Audited Tasks, Todo Categories, Todos, Projects, project Notes/Modules/Architect/White Board/Schema/Tasks/Review/Changelog/Blueprint, GitHub repositories, Task records and governance product/check lists. Kept card selectors, inline planning, editors and custom field-definition grids as functional workflows.
- Standardized outer list spacing, removed duplicate page headings in Todos/task history/governance, moved project sublist New actions and workspace audit action to the app header, and removed redundant header padding/hover patches. Nested editors and destructive/action semantics remain unchanged.
- Fixed scrollbar-dependent header drift in shared MainLayout; live Projects and Tasks right edges matched within 0.02px. Verified project Modules has a single 32px New action in the 40px app header, plus live GitHub/Todos/Task records/governance pages with no duplicate h1. Proof: docs/list-header-audit.jpg.
- Shared UI build and Codeitz typecheck/build passed. Eight focused field/navigation/routing checks passed; one routing integration check failed in the existing module-approvals migration because module_id uuid references id text. That unrelated migration was not modified. Existing Codeitz API was reused; no second API was started. Project Manager was not changed or built.

- 2026-11-18: Opted this app into the shared one-time Silver rollout in provider and first-paint initialization; white/grey HTML fallback. Preserves mode, component defaults and subsequent Appearance choices. Shared UI source colour audit and representative UIUX screenshots verified; app typecheck and final production build passed. Project Manager excluded.


## 2026-11-18 — Projects and Modules sync

Added /sync using shared UI, with connected apps, incoming drafts, outgoing queue, activity and per-table Draft → Confirmed policies. Scoped token/secret exchange supports both directions; receiver secrets are hashed and outgoing secrets are read from named server environment variables. PostgreSQL migration 20261118002000 adds durable identity, deferred transactional capture, baseline fingerprints, activities, queue, incoming drafts and table policies; existing data is baselined without export. Module children travel atomically with stable IDs. Manual confirmation/rejection, explicit conflict replacement, stale review checks, deduplication, no echo, retry/receipts, initial snapshot export and deletion drafts are wired. Confirmation never grants module or coding approval. Applied migration locally; no real connections, exports, cloud deployment or approvals were created. Typecheck/build passed; 27 focused regression/integration tests passed, plus final sync/routing checks (6 tests) after isolation, identity and documentation refinements. Two isolated PostgreSQL schemas and real loopback HTTP servers verified both directions, drafts, conflicts, rejects, rollback, IDs, restart reads, deletion, scope and credentials. No commit or push. See docs/sync.md for setup.


## 2026-11-18 — Release audit and Codeship handoff, 1.0.2

Audited the accumulated Codeitz changes and Projects/Modules sync. Full suite passed 80 tests with PostgreSQL enabled and no skips; typecheck/build, release tools, version checks, governance (11 products/25 owners) and Compose configuration passed. Cleared the nonempty password example, added container environment bindings for owner approval/default sync secret, and derived first image naming from the current package version. Bumped package/lock/changelog to 1.0.2 and consolidated verified changes into the release entry. Audit evidence and Codeship prerequisites are in docs/release-audit-1.0.2.md. No deployment or live records were changed; deployment remains with Codeship. Release authorized for publication to origin/main after staged-file review; Git publication result is reported with the resulting commit.


## 2026-11-18 — Clear local/cloud workflow and development-first sync

Replaced the Connected apps grid with small Local & cloud cards and clean /sync/connections/{id} detail pages. Preset cloud production URL, project choices and project/module transfer actions explain what data moves and where. Credentials remain under connection settings. Get from cloud uses a scoped authenticated read/export and stages local drafts without changing remote project/module records; the cloud records the requested export activity. Sending defaults off and requires an explicit reviewed selection. Ordinary local edits are held, even when manual sending is enabled; retries cannot release held data. Preview fingerprints reject stale sends and cloud still confirms its incoming drafts. Source labels identify the connection in review. Existing data, credentials and history are retained by additive migration 20261118003000; queued/failed unsent items become held and already-sent receipts may continue polling. Startup preflight checks the new columns. Applied the migration locally; no real cloud requests, connections, sends or approvals were made. Typecheck/build, 23 PostgreSQL/routing/project tests and governance audit (13 products, 27 owners) passed. Both peers need the updated API for pull. No commit, push or deployment performed in this step.

## 2026-11-18 — CodeShip Devkits deployment

CodeShip now owns setup/update via this repository's root shell delegates. Codeitz 1.0.2 runs in group devkits at loopback 4451 using a separate copy of native PostgreSQL data (55 tables, 11 projects; IDs verified). Native port 4305 and its source database remain healthy and unchanged. The Docker private-postgres transport is explicit; arbitrary remote plaintext hosts still fail validation (new transport test passed). Shared local Docker request policy preserves Host/Origin checks, tested against the deployed API.

The supplied Codeitz image contract includes Git and pinned Codex CLI; versions were executed successfully in the container. Persistent workspace/runtime/CLI volumes are retained, with no host login copied. The copied instance starts automatic scheduling paused to avoid duplicate native jobs. Setup and a subsequent update succeeded through CodeShip's shell entry points. Native developer work is preserved; no Git publishing occurred in this task.


## 2026-11-18 — Real native/Docker connection and sync verification

Connected native :4305 and Docker production :4451 for devkit/codeitz, preserving the VPS connection. Stored peer secrets privately in native .env and Codeship's encrypted environment. Corrected the copied Docker sync identity and added explicit Docker Desktop bridge URL support; an isolated regression test and typecheck passed. Updated only Codeitz through the Codeship-owned lifecycle and reapplied its authoritative native-registry secret. Both replacements passed health verification without recopying/reseeding records. Live tests passed selected local-to-Docker sending, draft/confirmation, stable child IDs, invalid credentials, duplicate receipts, Docker-to-native pulls, Docker-initiated pulls through the bridge, conflict review and project-draft rejection. Cleaned up disposable module records; retained activity evidence. Both peers finish with sending OFF and no pending drafts. No real user project/module records, coding approvals or VPS deployment changed. See docs/sync-docker-verification-2026-11-18.md. No commit or push performed.


## 2026-11-18 — Audited sync controls and tagged deployment contract

- Prepared 1.0.3 with the user-authorized current changes after audit.
- Projects/modules synchronization direction controls and manual confirmation; separate native/Docker settings and persistent workspace; pinned GitHub release contract with CodeShip-only lifecycle. Typecheck/build and all 83 PostgreSQL-enabled tests passed without skips. Pending target migrations are checked/backed up by CodeShip.
- GitHub helper publication/tag and tagged CI/runtime outcomes are recorded by their actual later stages; no unexecuted deployment is claimed here.


## 2026-11-18 — Controlled tagged workflow dispatch

- GitHub accepted the first release branch/tag but no workflow run was registered. Added an explicit tag-selected dispatch path for controlled bootstrap/retry. Earlier tags remain intact. A pushed tag is not a verified image; deployment remains gated on successful CI and release manifests. Prepared 1.0.4; no new database migration.


## 2026-11-18 — Sync audit log release 1.0.5

Recorded the read-only local/Docker sync audit: both connections active, sending OFF, stable connection/review history across repeat reads, no pending drafts/conflicts/failures, and 11 projects/10 modules per instance with no temporary verification modules. Earlier Codeship replacement preserved connection IDs and the distinct Docker identity. No new restart was performed; full approval-history persistence after a new restart remains untested in this audit. Prepared package/lock/changelog 1.0.5 with no new migration or runtime/deployment change. Existing pinned sibling commits and base image are retained. All 83 PostgreSQL-enabled tests passed with no skips; typecheck/build, version checks and release-contract validation passed. Verified all three pinned sibling commits exist on GitHub. Publishing through the authorized GitHub release helper; tagged workflow and manifest are checked after publication.


## 2026-11-18 — All-app source inventory refreshed and synced

Collected current source definitions across 13 apps/devkits into 134 source-backed modules, 365 API routes, 159 tables and 1,617 fields. Appended Automation/Texlinks/Zetro project records; created 125 module records and refreshed 9 while retaining all original module/collection/table/field IDs and historical retired Project Manager data. Compiled migrations through a dummy recording driver, not business databases. Expanded the local/Docker peer scopes, manually selected/confirmed 147 snapshots and 3 identity-metadata corrections, and verified all 135 stored module records match across native :4305 and Docker :4451. Both peers finish with sending OFF, no pending drafts/failures and confirmed selected receipts; held local activity remains unsent. Before/after task/todo/approval ID fingerprints match. Source blueprint completeness remains a review task (948 findings); governance flags UIUX missing contracts and src/api/modules. Did not invent source permissions/schemas or change other app code to hide findings. No VPS traffic, deployment, final module/coding approval, commit or push. Detailed report: docs/workspace-source-refresh-2026-11-18.md; private recovery/evidence exports: .codeitz/refresh-workspace/.

## 2026-11-18 — Final audited tagged handoff

- All 83 PostgreSQL-enabled tests passed without skips; workspace source-refresh records and all original project identities are retained. Published dependency pins and complete file-dependency checks are ready for tagged CI. Docker replacement remains a separate CodeShip stage; no database migration is introduced.


## 2026-11-18 — Fresh source data to Docker, then pull to native PostgreSQL

Started stopped native Codeitz :4305, captured private before snapshots and refreshed all 14 current app/devkit source inventories. Collected 157 source-backed modules, 455 routes, 181 tables and 1,885 fields. Preserved exact saved-code identity matching to avoid collisions between similarly named API/web modules and tenant variants. Posted/confirmed 165 selected updates to Docker :4451 first, checked native module records still matched the original baseline, then pulled and confirmed those 165 snapshots into native PG. Added 23 module definitions and refreshed 134; ABConnect was added to the project catalog. All 15 project rows and 158 module rows (including historical retired data) now match between instances. Nine protected tables retain their before/after counts/ID hashes, both readiness probes pass, no drafts/failures remain, and sending stays OFF on both connections. Design completeness remains separate (1,466 review items); no module/coding approvals were granted. No VPS traffic, deployment, code change, seed/reset, commit or push. See docs/docker-first-source-refresh-2026-11-18.md; private evidence under the ignored current-data-refresh directory.


## 2026-11-18 — Latest data refresh and sync audit publication, 1.0.7

Recorded the subsequent read-only audit of native :4305 and Docker :4451: both retain 15 projects and 158 modules with matching content, original module/collection/field IDs and saved review history. All 165 Docker-first updates and native pull confirmations are recorded; sending remains OFF with zero pending drafts/failures. Added the Docker-first source refresh report, updated package/lock/changelog to 1.0.7 and retained current published dependency pins. This is documentation/version publication only; no app code, schema, runtime records or deployment changes are included. Publishing through the authorized release helper; tagged workflow/manifest are verified after push.

- 2026-11-18: App-owned UI extraction completed: shared DetailTable, DiagramEditor, SchemaFieldsEditor, lazy Whiteboard and Public Site Controls, plus existing Checkbox/Button/Tabs/CheckResults reuse where relevant. New UIUX pages expose live previews, usage and public imports. Shared extraction tests (4), UIUX route/form tests (13), and affected app typechecks/builds passed. Findings: mcp-governance/records/app-ui-reuse-audit-2026-11-18.md. Ecommerce/Project Manager excluded.

## 2026-11-18 — Local Docker release 1.0.7 verified

Recovered CodeShip's failed 1.0.12 registry/update stage through the reviewed shell entry; unchanged retry passed, without a source fix or claimed root cause. Deployed Codeitz v-1.0.7 (d4ad35c450a550687a39e3b68d0f1ececacc7fc1) through CodeShip after verified GitHub archive checksum/image identity; stalled GHCR transfer was cancelled to use the supported fallback. No pending migrations; data copy and migrations skipped. Exact before/after hashes match for all 53 PostgreSQL tables and 4,751 rows, including 15 projects and 158 modules. Readiness, origin guard, image identity and fresh metrics passed. Dashboard/Projects/Tasks/Settings/Sync/API docs and dashboard assets return successfully. Connections unchanged, sending OFF, zero pending/failed sync items. Native development and concurrent source changes preserved. No commit or push.



### 2026-11-18 local Docker port contract

Compose now declares `127.0.0.1:14305:4305`. Compose configuration validated without starting containers. Runtime rollout belongs to this app's chat using CodeShip and an approved release; this contract edit does not certify a changed running listener. Preserve private relays, credentials and data.

## 2026-11-19 — PostgreSQL and worker recovery audit, 1.0.8

Added bounded read-only startup readiness with explicit transient classification, idle-pool error containment, database readiness, recoverable/bounded worker activity and idempotent chat terminal persistence. Scoped Tailwind discovery and aligned the Docker4305/14305 contract. Final candidate typecheck/build and all94 PostgreSQL-enabled tests passed with no skips. No schema migration or real record change; Docker53-table/4751-row hashes unchanged. Shared install incident/restoration, exact dependency pins, timings and limitations are recorded in supervisor-audit-20261119.md. Prepared1.0.8 through the release helper; hosted clean-source workflow/manifest remain mandatory before CodeShip deployment. No Docker deployment, native restart or fresh login performed.

## 2026-11-19 — Clean-database readiness fixture correction, 1.0.9

The v-1.0.8 clean-source workflow completed dependency installation/typecheck/frontend build but found a test fixture leaking Projects readiness into the unprovisioned default schema (92 passed, one failed, one Linux skip for the Windows-only CLI case). The tag remains immutable and has no approved image. Corrected fixture database injection including explicit undefined, added an absent-default-schema regression, and made the overload fixture wait for actual job completion rather than a short polling deadline. Six server checks and the corrected burst check passed; final full/local and hosted outcomes are recorded in supervisor-audit-20261119.md. No runtime/schema/data change beyond the previously audited recovery implementation; no deployment or native restart.

Final1.0.9 candidate verification: all95 PostgreSQL-enabled tests passed with zero skips in242491.10 ms; typecheck and production build (1m5s) passed. Version/release-contract checks passed. Actual tagged CI/manifest outcome is recorded after publication; no deployment is claimed.

## 2026-11-19 — Whiteboard preview cards, 1.0.10

Replaced White Board master table with shared preview cards and per-record editor pages. Cards retain title/status/date and use CardLink hover/focus. Shared UI 0.1.16 is pinned at 87f82393904777775b40922139740e070dd6bd20. First save retains returned scene before ID remount; serialization waits for hydration. Browser E2E on isolated PostgreSQL schema drew text in Excalidraw, saved draft, reopened, saved active and retrieved after refresh; card navigation and Back/Forward passed with no browser errors. Database regression covers drawing content, status/revision persistence and stale-edit rejection. No migration or production record writes. Release and local Docker verification are recorded after tagged CI. Unrelated local extraction edits excluded.

Final local candidate: typecheck passed; production build 3.53s; all 95 PostgreSQL-enabled tests passed, zero skips/failures (152367.19ms). Exact-candidate browser test drew “Idea → Draft → Saved / Codeitz 1.0.10”, saved draft then active without refresh, retained one nondeleted text element at revision2, and retrieved its preview after refresh. Mobile360px document width360px, preview loaded; desktop and card navigation passed. Earlier test invocation from an incorrectly nested checkout failed 13 path-dependent fixtures; corrected workspace layout passed all95. No production data changed.

## Local Docker verification — complete

Codeitz1.0.10 is healthy at http://127.0.0.1:14305, mapping127.0.0.1:14305:4305, revision6e095f59b6dce7c1c489af7b042e78e14545ecbb and running image sha256:64658bbb7c29c2c7e6f86621c8fd75204963f1029467df331ff10cb706d5296a. CodeShip operation2026-11-19T02-39-42-327Z succeeded: registry/replacement/verification passed; native migration, data copy, workspace initialization and both database migrations skipped. All53 PostgreSQL table hashes /4751 rows unchanged, including identities, connections and history. Other container IDs unchanged. SendingOFF, pending0/failed0. Live/ready/dashboard/project-whiteboard/API docs200; foreign-Origin403; fresh metrics verified by shared tooling.

Deployed browser smoke test displayed the existing integration-whiteboard preview card and opened its Excalidraw editor with no browser errors. No production writes were made. Separate synthetic browser drawing schemas were removed after the E2E audit. Evidence remains ignored locally in .codeitz/whiteboard-docker-gallery.jpg and whiteboard-release-gallery.jpg. No remaining release/deployment blocker. VPS is outside this local verification.

## 2026-11-19 — Responsive Codeitz rails, 1.0.11

App-owned mobile policy uses shared useIsMobile and AgentWorkspace visibility props. Below768px, both rails collapse and their actions appear in the existing MainLayout drawer, including tools otherwise absent from the desktop sidebar; Settings remains in its shared footer. Shared desktop breakpoint768px and above retains both56px rails. CSS hides mobile rails on first paint. No shared UI changes.

Actual browser E2E:360px document/canvas360px, both rails0px. All13 tool routes opened correctly and drawer closed after every selection. Settled768px document768/canvas346 with desktop sidebar and56px rails retained;1920px document1920/canvas1498. No JS errors or document overflow. Captured360/drawer/768/1920 screenshots in ignored .codeitz/mobile-fixed-*.jpg. Sidecar/package and unrelated extraction edits excluded from the release. No database changes.

1.0.11 final verification: typecheck passed, build6.81s, all95 PostgreSQL-enabled tests passed with zero skips/failures in258275.82ms. Tagged CI/immutable manifest and selected Docker rollout remain mandatory next stages.


## 2026-11-19 — Zetro sidecar composition (source only)

Added the optional shared MainLayout assistant entry via public @workspace/sdk/zetro-sidecar, with the original Zetro logo and configurable exact VITE_ZETRO_ORIGIN. Zetro owns company login, permissions and private conversations; the host supplies an unverified app label only. No business API, grant, database or running container was changed. Release this additive shell edit only after the shared UI sidecar export, SDK0.1.7 (ede6b4e4effcb84f5838223f67d7b0aba64a1811) and Zetro owner endpoint are available in frozen release pins. Preserve other in-flight owner edits; this note does not publish or deploy the host. Central integration/audit: ../../zetro/docs/chat-sidecar-audit-20261119.md (business apps) or ../../../apps/zetro/docs/chat-sidecar-audit-20261119.md (devkits).

## Mobile navigation release — completed

Codeitz1.0.11 is published at e4ee1e46e6ac85861e8bb377bbf5f34358843b9f /v-1.0.11. Workflow44448622314 succeeded:95 hosted tests,94 passed,0 failures and1 expected Linux skip for Windows CLI discovery; local Windows95/95,0 skips. Clean hosted frontend3.00s; image build2.85s. Image sha256:20406dbaac2995f77deab0fb95aa41b43a2904d6bfa5d6b247662104d72461c5; archive SHA2566c1a088a106e82bdc4561fc0333a8d1a824d0bddad395efc9670e48fae3a9bf0.

First deployment admission encountered the already-acquired Platform lock and made no changes. After Platform released it, selected CodeShip1.0.19 operation2026-11-19T03-11-37-959Z succeeded. The stalled owned GHCR transfer was stopped for the supported authenticated/checksummed archive fallback. Data copy/workspace initialization/native and PostgreSQL migrations skipped; registry/replacement/readiness/image identity/origin guard/fresh metrics passed. Running1.0.11 at127.0.0.1:14305:4305, healthy. All53 table hashes/4751 rows unchanged before/after deployment and deployed browser audit; sibling IDs unchanged during this operation, sync sendingOFF, pending0/failed0.

Actual deployed screenshot/DOM checks:360px document and Workspace canvas360px, rails0/0;768px document768/canvas346, rails56/56;1920px document1920/canvas1498, rails56/56. The existing768px shared desktop breakpoint is deliberately retained. Mobile drawer exposes all rail tools; fixture tests exercised13 destinations and automatic dismissal, live Projects selection/dismissal passed. No browser errors or page overflow. Screenshots: ignored .codeitz/mobile-live-360.jpg, mobile-live-drawer.jpg, mobile-live-768.jpg and mobile-live-1920.jpg. Native sidecar/package/extraction work preserved and excluded. No remaining owned blocker; no additional redeployment needed.

## 2026-11-19 — Shared PostgreSQL startup pool, 1.0.12 candidate

Normal startup previously created5 compatible pools atmax5 each (25potential). createServer now owns one unchanged max5 pool and injects borrowed module stores. Explicit database handles and project/runtime targets remain distinct and caller-owned. Injected service/repository implementations retain their supplied close contracts. Task/Todo repositories retain their standalone default ownership but accept borrowing when app-composed. The owner shutdown hook is registered before module hooks, so reverse-order close drains module work before one final pool destroy. Preflight uses a separate short-lived pool that closes before app startup. No schema/role/security-target change or reduced worker/backpressure bound. Supplied host census reduces103potential to83 (44business+34Platform+5Codeitz) against97 ordinary slots; this is a connection envelope, not measured exhaustion.

Focused tests3/3 passed: parallel requests through six module/readiness APIs plus25 concurrent SQL operations stay within5 same-role/database sessions; owner closes once after hooks and rejects later queries; separate app/project/runtime schemas retain marker identity and caller pools remain usable after close. A child app using its normal default factory survived real idle proxy loss, returned failed module reads/503readiness during outage, recovered all module reads and its saved marker, then shut down cleanly. The actual PostgreSQL service was never stopped.

Additional shutdown review: Todo and business-task timer callbacks now retain one in-flight scan promise, stop admission during close, and await that scan before module close. A delayed-scan regression verifies both scans complete while the database remains usable, then one pool end occurs and no timer restarts. Focused pool/recovery/shutdown tests4/4 pass. Initial98-test full suite passed; final99-test suite includes this last shutdown fix.

Final pool candidate: all99 PostgreSQL-enabled tests passed, zero failures/skips,115714.12ms; typecheck passed. Pre-scheduler-fix98-test pass and earlier fixture-only failures are superseded by this full final run. Frontend build passed20.18s; no frontend feature change. Source is ready for review, but no v-1.0.12 tag/image/deployment is claimed: verified drawing-producer remediation/final artifact check remains a release gate. No PostgreSQL restart, migration, reset, seed of real records or worker-limit reduction was performed.

Published pool source:7b26c68bf07208d9d6bb49f567e0f03257a44703 on main; candidate version1.0.12 only, no release tag/CI image or Docker deployment yet. Concrete blocker: verified shared drawing producer remediation/exact final dependency handoff is not available. Approved runtime remains1.0.11; no pool update operation or lock change was attempted.

## 2026-11-19 — Final1.0.12 source verification

UI0.1.18 pinned at6bd08d1c5dd555f01cabae70b19af492f6abe29a. Fresh independent source clones/installations (no shared node_modules junction) built Framework0.2.0 and the exact producer. Producer and app full npm audits report0known advisories. App root policy preserves prior Nanoid range rules, adds editor3.3.20/converter5.1.16 ancestry rules and reviewed lodash-es4.18.1; its prior KaTeX0.19.1 is aligned to the producer-tested0.18.10. Both producer and consumer resolution are covered. The actual Codeitz production build emits242 inspected drawing modules at Nanoid3.3.20/5.1.16, lodash-es4.18.1 and KaTeX0.18.10. A build plugin now fails for unreviewed emitted versions or missing graph evidence; regression tests reject old0.16.47 and an empty graph. This is version/advisory evidence, not a general exploit or vulnerability-free claim.

User-authorized isolated headless Edge/Playwright tested the compiled Codeitz app against a disposable PostgreSQL schema. Actual pointer rectangle saved as draft, PNG preview loaded, ellipse edit/statusactive persisted, and refresh retained both original shapes. Actual Mermaid dialog insertion with requested math syntax and Verified label persisted5new elements, without page errors. An initial test input clicked the covered raw radio rather than its visible label; corrected selector passed. An initial Mermaid insertion occurred before its debounced preview updated; the requested-label assertion caught it, and waiting for the new preview passed. No user Chrome/profile or real records were changed. Fixture schema removed after app close. Local evidence: .codeitz/final12-host-browser.json, final12-mermaid-browser.json, final12-host-preview.png and final12-mermaid-saved.png.

Runtime faults: native SHOW originally reported0for statement/lock/idle-transaction/transaction deadlines. Only the default app-owned runtime factory now installs per-session server limits: statement15s, lock5s, idle transaction15s and total transaction30s, with existing max5 and acquisition5s unchanged. Ordinary openDatabase()/migration CLI and explicit caller-owned handles keep their original settings. No global/role configuration changes. Persistent checked-out client error handling contains fatal server transaction evictions while query failures still reject. Actual PostgreSQL17 tests verify server57014 statement cancellation and idle backend state,55P03 blocked-row rollback/retry, idle and total transaction backend termination/new-PID recovery with uncommitted rows rolled back, and unchanged CLI settings. No blanket no-hang/throughput claim is made.

Final fresh-install local verification: typecheck and production build2.10s passed; all106 PostgreSQL-enabled tests passed0skips/failures in129619.28ms. This supersedes the earlier99-test pool-only gate. Immutable tagged CI/manifest remain required after publication. Docker rollout must reconcile actual image/data/operation lock after the supervisor stability handoff; no engine start/restart or bulk rollout is authorized.

Published immutable1.0.12 source:da1a24359e26c9969193225033ae90a53e9344ac /v-1.0.12. Tagged workflow44531157164 is pending; deployment has not been attempted.


## 2026-11-20 — Shared centered global loader

User requested one small centered spinner for all loading, without per-page loading text or separate spinners. Shared UI GlobalLoader now renders one 16px indicator centered in the viewport across concurrent callers. AsyncState, auth/forms, lists/lookups, record details and pending toast notifications share it; errors, empty states, disabled-action protections and saved operational progress remain. App-specific loading placeholders use the public shared component. Existing unrelated source edits preserved. This product typecheck passed against the shared UI build. Desktop/mobile dark/reduced-motion and concurrent-request/cleanup checks passed in the shared browser fixture. No app release, local Docker/VPS deployment or Cloudflare change. See packages/ui/docs/global-loader.md; private verification at devkit/codeship/.codeship/verification/global-loader-20261120.

## 2026-11-20 — Cloud Codeitz account permission repair

User requested live VPS authentication diagnosis and Codeitz access for admin@tenant.com. Read-only checks found Codeitz1.0.16 and Platform1.0.19, active production service/tenant installation, configured Codeitz service credentials and the required browser-service-context route. The active tenant administrator had no direct or role-derived Codeitz grant. Using the deployed Platform gateway repository, added only codeitz/workspace:read and codeitz/workspace:manage; its transaction recorded app-access audit evidence. Readback confirmed the active grant. No user role, password, other app grant, business record, source on the VPS, container or deployment was changed. Browser sign-in verification awaits the user's private login in the opened Codeitz cloud tab; successful dashboard access is not yet claimed.

Cloud browser verification completed: the user signed in privately as admin@tenant.com. The live https://codeitz.codexsun.com/dashboard displayed the Admin user menu, dashboard records, v1.0.16 and Task stream connected / Worker idle, with no access-denied message. The signed-in tab was retained. No password was read, entered or changed by the agent; no coding or business mutation was performed for verification.

## 2026-11-21 — Mobile Todos row actions

The existing public @workspace/ui/blocks/todo-workspace now renders reminder, visibility, edit and delete inside one three-dot menu. Wider wrapping titles and full-row mobile composer/edit fields reduce crowding; completion and drag handles remain visible. Existing Todo API callbacks and PostgreSQL persistence are unchanged. Shared UI typecheck/build and isolated 320–1280px action/browser checks passed. This task does not publish or deploy; independent clean 1.0.19 promotion remains separate.

## 2026-11-21 — Mobile Todos deployed: 1.0.20

Shared UI 0.1.24 (e2b096c05506deabfdb3e87275ae7d6a9d951908) and Codeitz 1.0.20 (5e57c0e19d25b62826361f7f7a4363a1e3845c20) published through their GitHub helpers. CI 44883038846 succeeded. Released CodeShip43/app update.sh promoted the same sha256:98e01b00b4909545724dd37ba39e4dbd4e80dde4bd9b7ef428e3c421215dc2eb image local→staging→cloud; each update exited0 and is healthy. Migrations, imports and workspace copies skipped. Local installed mobile menu/cancel checks, Admin→SA/tab/refresh/task/chat/logout tests passed; staging same auth/streams and empty Todo layout passed without adding records. Local 53 table hashes/4754 rows and persistent volumes unchanged; cloud data snapshot unchanged with three todos and 173 pending drafts, sending off. All unselected container identities/images unchanged. Production checks were bounded updater readiness/image/data preservation, not functional tests. Private deployment evidence: .codeitz/mobile20-release/deployment-receipt.json. Preserve all unrelated native dirty work.

## 23 November 2026 — Desktop/web consolidation, local only

- Consolidated Desktop frontend/Tauri, persistent agent runtime and supervisor tools into the main Codeitz repository. Preserved the isolated source, historical workers, active dependency trees and existing dirty web work; no source directory was deleted or replaced wholesale.
- Shared product streaming modules now live under src/shared/streaming; both web and Desktop use the same public shared UI package and common Vite UI resolution. Reused the existing compact-message extension as a dependency. Root package commands expose both entry points without changing product versions or root dependency requirements.
- Repaired an incomplete shared-UI dependency junction using an existing UI0.1.24 install with identical dependency requirements. Preserved the old junction/target and all package contents. This also resolved the web baseline's 30 implicit-any errors without rewriting its unfinished modules. Desktop callbacks received explicit types where needed for the shared declarations.
- Both frontend builds and TypeScript checks pass; 21 focused Desktop checks pass. All ten Desktop full-app fixture stages pass with owned disposable PostgreSQL, deterministic provider and native bridge; no live model/native installation claim. Built web user/Admin/SA login smoke passed with synthetic signed-out responses and zero page errors. Deleted temporary Playwright path replaced by an overridable local test-tool path; pinned tool installed offline from cache with scripts disabled, no browser download.
- Existing records/permissions are checked read-only before/after; original configuration and installed application remain unchanged. No broker restart, new application database, data import/migration, release, deployment, commit or push.
- Evidence and source baseline: ignored .codeitz/consolidation-20261123. Entry-point/data/dependency boundaries: docs/desktop-web-consolidation.md. Final native-check and preservation receipt follow below when completed.

- Final verified consolidation: native cargo check --locked --offline passed. Read-only before/after hashes and grants match across all 11 Desktop and 55 web tables. All 264 pre-existing eligible source files checked; existing changes preserved apart from the documented narrow wiring/append-only edits. Original command definitions, dependency requirements, main lockfile and private installed configuration remain unchanged. Both entries resolve the same shared UI; old dependency targets remain accessible. No commit/push/deployment.

## Released 1.0.20 baseline reconciliation

The following entries are retained from the verified released work record. Existing local history, Desktop consolidation and unfinished work remain above; this reconciliation does not publish or deploy them.

### 2026-11-19 original shared Platform login

Approved clean v-1.0.12 baseline, preserving unfinished owner checkout. Shared WorkspaceAccessGate/SDK0.1.8 current session/logout and exact transport; direct streams remain app-owned. Versioned public presentation metadata contains only auth availability, is transport-checked and documented. Authenticated workspace route protected. All106 tests passed on disposable PG18.7 after canonical checkout invocation and documenting new routes. Initial default tests failed SSL before writes; retries used disposable credentials only. Whole subset-workspace audit reports omitted add-on/DatabaseManager folders; no scaffolding invented to hide it. No migration or Cloudflare edit. Deployment pending.

### 2026-11-20 native/Docker cookie compatibility

SDK0.1.9/1ac4441efc2280c89f3348f5f51fc03ca6e57907 selects the expected host/deployment cookie rather than rejecting an unrelated native/Docker cookie. Twenty SDK tests pass. App dependency pin updated; UI and API behavior otherwise unchanged. No migration. User explicitly reaffirmed that this chat should continue local and VPS deployment despite another chat reporting a local-only hold. Final matching verification pending.

### 2026-11-20 failed build and logo repair

Isolated clean1.0.14 snapshot preserves concurrent stream/tab edits in previous workspace. Initial tagged source-preparation failed with generic sanitized output; unchanged retry passed source assembly, so no unproven dependency/schema workaround applied. Original login referenced absent /logo files. Bundle app-owned Bot light/dark assets shared by original login and header. SDK0.1.9/auth retained; no migration. Next1.0.15 tagged workflow and VPS-only verification pending; local Docker/Cloudflare unchanged.

Typecheck and version/release-contract checks passed. Local production build attempted before dependency extraction completed and failed module resolution; not counted as passing. Full isolated GitHub CI remains the required build/test gate before any VPS update.

### 2026-11-20 explicit tenant-to-SA login

User authorized same CodeShip1.0.27 route wiring, release and VPS-only deployment. Original shared login/SDK reused with app route adapter; explicit SA/admin/user entry requests credentials, preserves prior cookie on failed login, returns to / after success and still verifies permissions. No grant/schema/dependency or Cloudflare change. Concurrent owner source preserved; checks/tagged release and VPS/browser verification pending. Local Docker deployment stopped.

Local verification complete: 109 disposable PostgreSQL tests plus typecheck/build and three route checks passed. VPS rollout must use the clean GitHub CodeShip1.0.28 updater and successful tagged image only; no live browser/function tests, source fixes, Cloudflare changes or local production replacement. Publication/CI/deployment pending.


## 2026-11-21 — Tab-authenticated task/chat streams, 1.0.18

Prepared from clean published1.0.17 at2e7075b4d1aa399142c02b9ee682394ab5d35fa8. Both raw EventSource consumers bypassed the SDK tab-selector header; replace them with one bounded fetch/SSE helper using appFetch on every attempt. Preserve task/chat message handling, original shared WorkspaceAccessGate/privileged login, public app-brand assets and all dependency pins. Close cancels readers and fetch; 401/403 stop reconnecting and show paused access. No credential enters a stream URL. No shared SDK change, schema migration, real-record write or deployment.

Verification:117/117 PostgreSQL-enabled local tests pass with no skips/failures (115056.86ms), typecheck and production build2.07s pass. Includes seven parser/cancel/reconnect/auth-denial/sibling tests plus a real pinned-SDK0.1.12 header test using independent client processes on both endpoints. A disposable local original-Platform-source/Codeitz fixture passed nine HTTP auth boundary checks and eight fresh-profile headless Edge assertions: original sign-in/logo load, two accounts sharing one browser cookie jar, task/chat streams, reload, logout with sibling preserved and same-tab account switching. Nine browser stream responses were HTTP200 with distinct tab selectors; no browser errors. Wrong selectors401, cross-session CSRF403, foreign Origin403 and wrong tenant403 passed against the real local Platform implementation. This is local source acceptance, not a VPS functional test.

Private proof: .codeitz/tab-stream-release/{full-tests.log,http-auth-proof.json,browser-ui-proof.json,browser-original-login.png,browser-connected.png}. First fixture rejected a test credential-reference name; corrected it. First browser attempt used an exact password label despite its required marker; corrected only the locator. Original dirty primary1.0.12 and dirty1.0.14 snapshot, sidecar/extraction/other UI changes were preserved and excluded. Fixture cleanup and tagged CI/image outcomes are recorded separately after completion; promotion remains coordinator-owned and not performed by this task.

Fixture cleanup confirmed: both temporary servers closed and all four owned codeitz_sse_* databases removed. User browser profiles, installed databases, local/staging/VPS containers and workspace volumes were untouched.

## 2026-11-21 — Shared login roles, 1.0.19

From clean published 1.0.18; pin shared UI 0.1.23 at 5c481fbb67511cf7c63e04f15813af846893be59 and align linked-package lock metadata. No app source, SDK 0.1.12, permissions, migration, seed or sync-record changes. Primary dirty work stays excluded; all 173 VPS sync drafts remain for owner review. Deployment is coordinator-owned and not performed here.

Shared UI build, app typecheck/build, eight SDK stream regression tests and fresh original-Platform browser checks passed: blue Admin/shield, green SA/crown, Admin-to-SA transition, separate browser-tab accounts, refresh and task/chat SSE with distinct selectors and no page errors. Four exact owned disposable fixture databases were removed after proof. The initial 117-test parallel run took 925 seconds with 113 passes, three schema-lifecycle failures and one recovery timeout during local PostgreSQL I/O contention; retain that report. The isolated serial retry of the affected projects/shared-database files passed 17/17 with zero failures, cancellations or skips (54.47 seconds), including every previously failing test. Its owned regression database was removed. No app/test source change was needed. Tagged CI must still pass and supply an immutable image before any deployment.

## 2026-11-21 — Mobile Todos 1.0.20

Prepare from clean published Codeitz19 and shared UI23; include only the tested mobile todo component changes in UI24, excluding unrelated primary GlobalLoader and other dirty work. Existing public TodoWorkspace wiring needs no app source changes. Shared typecheck/build, 122 UI tests and four tool tests passed. Browser action checks passed at 320–1280px without overflow or page errors; scheduling, visibility, inline edit and confirmed deletion reuse existing callbacks. Codeitz typecheck/build and nine isolated PostgreSQL Todo/SDK stream tests passed; the owned regression database was removed. User authorized local Docker followed by cloud; the coordinator completed Codeitz19 and handed over the existing local→staging→cloud pipeline. Shared UI 0.1.24 published at e2b096c05506deabfdb3e87275ae7d6a9d951908. No migrations or data changes are planned; tagged CI and target admission remain required.


## 23 November 2026 — local 1.0.20 reconciliation verified

Reconciled the application baseline with released 1.0.20 while preserving consolidated Desktop/web source, active dependencies, local login/branding and unfinished work. Native 4305 now reports 1.0.20; login/session/workspace/projects/tasks passed. Builds/typecheck, 21 Desktop tests, 11 stream/login tests, direct-browser regression and built-login browser checks passed. Read-only snapshots confirmed unchanged records and grants across 66 tables. Docker source/runtime unchanged; no migrations, imports, commit, push or deployment. See local-release-reconciliation.md and the private verification receipt. Follow-on publication depends on exact published shared UI/SDK contracts; no unreproducible local dependency paths will be published as a release.


## 23 November 2026 — app/version status reference

Web and consolidated Desktop status bars now reuse src/shared/app-version.ts, displaying Codeitz - V followed by the root package.json version (currently 1.0.20). Existing Settings and API service-info also read the root manifest. The version audit checks package-lock root metadata, current changelog/tag fields and both frontend bindings; a fixture test verifies a patch bump updates the rendered label source and hardcoded/detached labels fail. Historical changelog entries and independent Desktop wrapper/native-shell 0.1.0 metadata remain independent; no release/version bump is claimed by this UI edit.

CodeShip received this chat reference and coordinated non-Platform app notifications. Central governance ownership was handed to its owner for the same build-version display/check rule. No deployment, record/permission change or Platform action. Tool tests (5) and app typecheck passed; frontend build/visual verification outcome recorded separately when complete.


## 23 November 2026 — manifest-derived status version

Added a shared app-owned label and web status binding: Codeitz - V followed by the owning package version. Extended version checks for canonical source/consumer bindings and added a fixture patch-bump/stale-label regression. Local 1.0.20 package/lock/changelog consistency, typecheck, five version-tool tests and web build passed. This normal source commit does not publish 1.0.20 or a new release; main keeps its existing package metadata. Accepted local Desktop consolidation and its updated footer remain preserved but unpublished pending separate prerequisites. Final Desktop/rendered-footer checks are queued, not passed. See status-version.md; no deployment, dependency upgrade or data/permission changes.


### Status version — final queued verification

The serialized Desktop frontend build passed (6.58s, exit0). The isolated built-web fixture rendered Codeitz - V1.0.20 once at the bottom right in both light and dark modes, with zero page errors; fixture/browser cleanup passed. These checks used synthetic API responses, not real records or Platform authentication. Installed native Tauri UI was not retested. Previous pending-check statements above are superseded by these results; blocked consolidation/publication scope is unchanged.


## 23 November 2026 — accepted source closure, 1.0.21

Consolidated accepted Desktop/runtime/tools/shared-streaming, local branding/login and released 1.0.13–1.0.20 application changes into main. Published dependency pins are UI 0.1.27 (2c10ff04b63fa9b4a851eae351f5da41b89d3af8) and SDK 0.1.17 (c9eb2b1c3b33f27783b5a14f19564870b26f5fc3). Standard sibling file references replace ignored source aliases; native links use physical app-owned public-source caches, never the temporary SDK checkout. Existing installs and rollback links remain preserved.

Checks: typecheck, version/release contract and final web build passed; all 118 web cases passed across the full run plus two unchanged bounded retries after measured fixture connection timeouts. Desktop run exposed outdated test fixtures for supervisor/history, required completion reports and three declared exclusions; only fixtures changed and affected checks passed. Ten-stage real-runtime/fresh-PG/built-UI acceptance passed with a deterministic provider and native-invoke fixture, including separate approval, worker workspaces, review, restart and history/permission preservation; cleanup verified. No Docker operation was used. Actual built web with SDK17 verified app-selector catalogue headers, abort, different actor context, no stale catalogue, no legacy selector mirror and Codeitz - V1.0.21 bottom-right in both themes, zero page errors. Two focused catalogue request tests passed.

All 11 Desktop and 55 web public-table contents and grants matched before/after; private settings hashes also match. Existing native API login/session/workspace/projects/tasks returned 200, 15 projects and 4 task records preserved. Automatic approval review rejected the idle native API restart before execution (blocked by policy, no detailed reason); no bypass/retry occurred, so that running API remains 1.0.20 while the built frontend/source is 1.0.21. Installed Desktop broker was not running and the installed Tauri window was not reopened; runtime recovery was tested in the isolated fixture. Docker/LAN/VPS, Platform, accounts, grants, provider binaries and existing data were not changed. No live model run or deployment occurred. Private receipts remain in .codeitz/closure-20261123.


### Released history retained in main

Source integration 2a01547fef17d1dd84a18766d8be4eb2fcd57de5 contains the reviewed released 1.0.13–1.0.20 projection plus accepted local work. A history-only merge records released 1.0.20 (5e57c0e19d25b62826361f7f7a4363a1e3845c20) as an additional parent while retaining that verified 1.0.21 source tree; only this work record changes in the merge. No tag is moved, history rewritten, or older source checked out over the integration. Existing records, permission/configuration fingerprints, source receipts and runtime/deployment limitations above remain unchanged.
