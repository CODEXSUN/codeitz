# Project Manager work record

Built this existing governed owner from the central app template; preserved AGENTS.md and local Git.

- Added overview/cards, area filter, concept form, and live scaffold progress.
- Reused shared framework, preflight, local-request guard, UI, and design system.
- Creation uses the governance generator: local Git, folders, environment files, audit, and work records. No automatic new-app installs or server starts.
- Project goals create plan-only Codeitz tasks, with links to scoped records and live tasks. Coding approval remains in Codeitz.

Verified Project Manager typecheck/build and 3 integration tests, Codeitz verification and 19 tests, shared UI build and 5 tests, and 3 generator tests. Runtime preflight/health passed on port 4312. Browser verified overview, creation form, scoped records, and return navigation.

Creation tests used disposable workspaces; no demo business app was added. Next: enter a real concept in New project, prepare its dependencies/runtime explicitly, and start one Codeitz plan.
## 2026-11-16 — Projects SQLite storage

- Added product-owned SQLite storage using the runtime's built-in SQLite support, following the existing Codeitz local-storage approach. This is the explicit local database choice for Project Manager; the shared technology guide is unchanged.
- Added ordered migration 001: `projects` master and linked `project_setup` child, with unique owner identity, foreign key, constraints, and a creation-date index.
- Seeded all nine existing apps/devkit projects. One-time transactional seeding preserves stored edits and remains safe to repeat. Added `npm run db:seed` and configurable `PROJECT_MANAGER_DATABASE_PATH` (default `data/projects.sqlite`, ignored by Git).
- Catalog now reads SQLite. Newly scaffolded projects are registered in the database. Existing UI, response shape, and Codeitz live task ownership/counts remain unchanged. Static UI text remains code; project metadata and setup content are persisted.
- Verified typecheck, production build, and all four integration tests. Tests cover persistence after restart, no duplicate/overwritten seeds, child foreign keys, creation, request validation, and offline Codeitz behavior. Actual database: nine master and nine setup records, integrity check OK, no foreign-key errors; database-backed API returns matching owners. Running watch server reloaded, health ready, frontend HTTP 200. Build retains existing dependency directive warnings.
- Next: define project instructions, handoff reports, and reviewed work status as separately authorized modules/child records. External projects added after the initial seed require a future explicit import flow; do not erase the database to rescan.

## 2026-11-16 — Projects navigation and details

- Added a Projects sidebar entry opening the existing filtered card list, with active navigation styling. Overview and New project remain available.
- Cards now link to a dedicated project details view showing purpose, owner/path, area, scaffold status, configured port, recorded creation date, creation audit, and live Codeitz task counts. Existing card actions remain independently clickable; project links support keyboard navigation.
- Details support direct hash links, reload, browser history, back to projects, scoped task links, and goal planning. Unknown owners show a return link; structure-only projects retain the planning restriction. Successful creation links to its project details.
- Verified typecheck and production build. Browser checked Projects navigation, card-to-details, detail reload, planning form, shared theme controls, and details layout. No shared styles or components were copied.

## 2026-11-16 — Separate Overview and Projects

- Overview now displays workspace summary metrics only. Project cards, area filter, and list empty state render exclusively on Projects. Project details and creation flows remain unchanged.
- Verified typecheck and production build passed.

## 2026-11-16 — Project card hover

- Project cards lift slightly with a smooth 200ms transform and shadow transition on hover. Reduced-motion preferences disable movement and transitions.
- Verified typecheck and production build passed.

## 2026-11-16 — Shared main layout

- Replaced Project Manager's custom shell with MainLayout from @workspace/ui/layouts/main-layout. Shared top menu, collapsible sidebar, page-header breadcrumbs/actions, workspace canvas and status bar now frame all project pages.
- Wired Overview, Projects, New project, Codeitz runner and Settings navigation. Settings hosts the existing ThemeSelector with its existing app preference key. Status bar reflects loading, creation, planning and Codeitz availability. App launcher links Project Manager and Codeitz; local workspace identity is a display label, not authentication.
- Verified typecheck and production build. Browser verified separate Overview/Projects, Settings, card details, breadcrumbs, live status bar and full-width layout. Existing card hover behavior retained; no shared package files or styles changed.

## 2026-11-16 — Navigation flicker fix

- Sidebar leaf items now keep stable identity when active selection changes (shared UI fix); expandable groups retain existing opening behavior. Project navigation applies route and selection cleanup in the same update, with browser Back/Forward support.
- Reserved workspace scrollbar space using a Tailwind utility to avoid horizontal shifts between short and long pages. Retained card hover animation.
- Verified shared UI build, Project Manager typecheck/build, and both sidebar tests. Browser verified navigation across Overview, Projects and Settings, preserved sidebar item identity/focus, Back navigation, and identical 970px workspace width with stable scrollbar gutter across Overview and Projects.

## Shared shell and master lists — 2026-11-16

Completed UIUX shell branding (Codebiz logo/name then Project Manager), manifest-driven status-bar version and Settings-only AppearanceSettings/reset. Replaced Projects cards with shared MasterListV1 while retaining area filter, details, planning and task callbacks. Browser verified project search/details and Settings. Typecheck, build, and four backend tests pass. No production data changed.

## 2026-11-16 — Restore Projects card grid

- Replaced the Projects master table with its previous responsive card grid, including purpose, area, status, creation audit, task totals, goal planning and task links. Retained hover lift, details links, area filter, shared shell, settings and navigation fixes.
- Verified typecheck and production build passed.

## 2026-11-16 — Repository tools

- Adapted GitHub helper, version consistency, patch preview/update, changelog, optional SSH utility, and fixture tests from the governance app template (also used by Codeitz).
- Added npm commands and extended verify while preserving existing checks and versions.
- Verification: typecheck, build, existing tests, four tool tests, version checks, GitHub dry-run, version preview, and SSH help passed. No keys generated or Git publication performed.
- Workspace governance audit passed: 10 products, 24 owners, zero violations. This checks structure rather than domain behavior or tenant isolation.
- Before publishing: review changes and release details; explicitly authorize publication and configure the intended remote/upstream.

## 2026-11-16 — Local commit verification

- Re-ran verify: typecheck, build, existing tests, tool tests, and version consistency passed.
- GitHub helper audit and patch dry-run passed; current version remains 0.1.0 and preview is 0.1.1.
- User requested local-only work; GitHub repository creation and push are deferred. The helper combines commit/push, so local Git commit uses its audited subject directly.

## 2026-11-16 — Project detail workspace

- Added Overview, Notes, Modules, Tasks, Review, Architect, White Board, Schema and Changelog tabs using the provided screenshots and E:/Workspace/codexsun/devkit as reference. Preserved the shared shell, project card grid, settings and navigation fixes.
- Added migration 002 with separate project-owned notes, modules, architecture, whiteboard and schema child tables plus local change history. Enforced project scope, content validation, record revisions and atomic record/history saves; saved content persists independently of Codeitz connectivity.
- Copied/adapted the reference WorkspaceEditor into the public shared UI exports (MIT attribution preserved), and reused it for notes/module descriptions. Existing editor exports remain intact.
- Added architecture block dragging/properties/connections, locally hosted Excalidraw with full scene/file persistence, and Schema MasterListV1 with right-side typed-column form. Schema entries are designs only. Changelog includes local changes and Codeitz activity.
- Tasks read real Codeitz plans/reports/files/checks, support planning-only goal submission and live task links. Review actions and saved-task audit forward only after project-membership validation. Codeitz owns eligibility and review decisions; requesting changes creates a follow-up draft. No coding/check approval is bypassed.
- Live Codeitz project audit task 2f238bb0-7615-4943-9ed3-dd39a95168e0 reached planned. Its saved-record audit passed all four evidence findings. Planning did not execute coding/check stages or produce a completed result; no real result was accepted during this verification. Proxy review behavior was verified with an isolated test server.
- Persisted useful Codeitz integration note, task-runner module description, two-block connected architecture, a drawn/text whiteboard, and documentation of its current tasks table. Verified browser editing/saving, reload counts, schema properties and live planning/audit. Actual board saved two elements; architecture saved two blocks and one connection.
- Verification: shared UI build and 20 tests; Project Manager typecheck/build and 6 integration tests. Tests include scoped child persistence, stale edit rejection, invalid schema rejection, cross-origin/cross-project rejection and task/report/review/audit forwarding. Dependency audit: zero vulnerabilities after scoped compatible security overrides for Excalidraw transitive dependencies. Production build still emits existing dependency directive and large chunk warnings.
- Boundaries: local workspace only; save before shell navigation. Schema designs do not execute DDL. Audit checks stored evidence, not fresh checks. Codeitz's read/recovery behavior, implicit response envelopes, request idempotency and acceptance/evidence-policy alignment remain upstream follow-up findings; this task did not change Codeitz execution code.

## 2026-11-16 — Minimal project workspace header

- Moved project detail tabs flush beneath the shared app header, with a sticky tab bar and padding confined to panel content. Removed the duplicate detail page title and back-to-projects button; breadcrumb navigation remains.
- Removed all manual refresh buttons and removed New project from sidebar/details/overview. New project is available only in the Projects list header. Existing background workspace updates remain enabled.
- Verified Project Manager typecheck and production build.

## 2026-11-16 — Notes cards and full-page editor

- Notes now uses responsive cards with Tailwind hover lift/shadow and reduced-motion support. Cards open a full-page, non-editable reader; Add/Edit replaces the list and tab strip with a full-page editor and right-side properties, following the supplied reference.
- Added explicit Save/Discard/back controls, saving status, unsaved-change warnings, and return to reader after save. Properties include category, status, fixed project scope, derived #tags, assignment and timestamps. No list remains visible while reading/editing.
- Added additive migration 003 for note category/assignment. Existing notes receive General/empty defaults. Save persists content/properties atomically with existing revision checks and changelog. The shared reference WorkspaceEditor now supports readOnly without firing an edit when toggling editability.
- Verified shared UI build and all 20 tests; Project Manager typecheck/build and all 6 tests, including persisted category/assignment after reopen. Browser verified card-to-reader, no contenteditable=true in reader, Edit/Add full-page flow, list hidden, save returning to reader and card update. Live Codeitz integration note text/category/status persisted at revision 2. No unrelated project records were changed.

## 2026-11-16 — Stacked Notes rows

- Notes cards now span the available width in a single vertical stack, with compact two-line previews. Hover lift and reader navigation remain intact.
- Typecheck and production build passed.

## 2026-11-16 — Compact note row height

- Reduced Notes card padding, spacing, icon/title sizes and metadata spacing; previews now use one line. Preserved full-width stacking, hover and reader links.
- Typecheck and production build passed.

## 2026-11-16 — Single-line Notes cards

- Notes cards now use one compact flex row: icon/title left, status/date right. Removed preview/category and overrode default Card vertical padding. Kept hover and reader navigation.
- Typecheck and production build passed.

## 2026-11-16 — Notes tab action and spacing

- Moved Add note to the far right of the project tab bar and connected it to the existing full-page creation flow. Removed the duplicate list toolbar/count row and reduced Notes list padding.
- Typecheck and production build passed.

## 2026-11-16 — Notes backend and shared form controls

- Kept compact single-row Notes per the user's clarified choice, preserving title space, right-aligned status/date and no content preview. Added full-title hover text.
- Updated the right properties panel to public FormSelect and UpsertFormField/Input controls. Added shared field helpers/validation summary, clear reader properties, latest-record load before editing, and field-error clearing after correction. Save preserves drafts on errors and reports actual SQLite acknowledgement without waiting on Codeitz polling.
- Added dedicated project-scoped Notes list/read/create/update routes under /api/v1, a shared note validation schema, and frontend read/PATCH/POST wiring. Reused the existing SQLite tables and atomic version-checked repository rather than introducing duplicate storage. Category/assignment and all note fields persist; cross-project/missing records are rejected.
- Verified typecheck, production build and all 7 integration tests. New test covers full note create/read/update offline, blank title validation, missing revisions, cross-origin and cross-project rejection, concurrent updates (200/409), assignment/category persistence and reopening the database.
- Browser verified compact rows, updated shared Select menu, title-error summary, successful live PATCH, and reload/read of the persisted Codeitz integration note at revision 3. Existing note text and properties were preserved during the live save check. No sample notes or unrelated project data were added.

## 2026-11-16 — API/navigation governance migration

- Migrated all owned project/workspace/plan/task-action routes and clients to /api/v1; note-specific APIs already used that prefix. Kept Codeitz's public /api/tasks adapter unchanged and shared /api/health readiness intact. Added method/body-preserving 307 redirects for legacy project API URLs.
- Added module-owned OpenAPI 3.1 operation/parameter/body/response/error/scope documentation, served at guarded /api/docs and /api/openapi.json through a reusable framework helper. This follows development governance; no runtime MCP tool authorization was introduced.
- Replaced hash pages with clean product paths. URL now carries project/tab/record/new/edit state and project area query filter. Native app links use client navigation; hash links migrate. Breadcrumbs, selected navigation and screen content track the URL. Saved note reader/edit and other workspace records reload from scoped APIs; unsaved content stays out of URLs.
- Verified framework build and 3 runtime tests; app typecheck/build and 9 tests. Added parser restoration/invalid-route tests and API/spec agreement, guarded documentation, legacy redirect and clean-route fallback checks.
- Browser verified direct note link, reader refresh, edit-mode refresh, Back returning to reader, selected schema deep link, and project area filter restoration after refresh. No business records were edited during this check. Existing MasterListV1 internal table state is not URL-controlled by its public contract.

## 2026-11-16 — Compact Modules action placement

- Moved Add module to the right end of project tabs, removed its duplicate list toolbar and reduced Modules panel padding/gaps. Retained existing module creation and save behavior.
- Typecheck and production build passed.

## 2026-11-16 — Notes card content and properties

- Added a one-line plain-text preview capped at 180 characters, category and assignment to each compact note card. Full content remains in the reader/editor; no stored content is truncated. Paragraph boundaries retain spacing.
- Applied the saved API response to the list immediately before background refresh, so content/properties update as soon as SQLite acknowledges the save.
- Typecheck and production build passed.

## 2026-11-16 — Persistent note autocomplete properties

- Replaced Category/Status Selects with shared FormLookup autocomplete and inline Create. New options save through guarded project-scoped APIs and SQLite, with trimmed case-insensitive duplicate reuse. No shared control was copied.
- Added migration 004 for project_note_options and preserved existing notes while broadening note status storage to allow user-created statuses. Existing options/defaults are loaded into each project's lookup catalog; task/module status rules are unchanged. Updated API specification and shared note validation.
- Removed the Project control from reader/editor properties. Project scope remains server-bound through the URL and database relation. Reduced sidebar padding/gaps and helper copy.
- Verified typecheck/build and all 10 tests. Added coverage for custom option/status persistence, save/update, duplicate labels, empty/restricted requests, reopening the database and cross-project isolation. Live database integrity OK with no foreign-key violations; all 3 existing notes preserved.
- Browser verified searchable status and Create action, created the reusable Codeitz status option 'Waiting for review', and saved the existing note with its original active status/content/properties (revision 4). The option persists independently; the note's business status was preserved.

## 2026-11-16 — Module design workspace

- Added popup creation, dedicated module pages and shared animated tabs for details, routes, actions, events, tables/fields and dependencies. Inline Save/Cancel uses shared UI controls and updates list state immediately.
- Added migration 005, validated versioned module APIs, OpenAPI schemas, atomic project-scoped persistence and revision conflict checks. Existing content remains intact. Schema previews describe designs only.
- Verified app typecheck/build and 11 tests; shared UI build and 32 tests; UIUX typecheck/build. Tests cover nested persistence/reopen, invalid types, duplicate columns, stale updates, scope and origin checks.
- Browser verified popup, live Codeitz module Code save, and disposable module datatype save updating table preview. Refresh preserved the selected table and saved TEXT datatype at revision 2.
- Automatic approval review rejected populating the live Codeitz module with example definitions, reporting blocked by policy. Those example definitions were not written; full child-design verification used an isolated temporary workspace.

## 2026-11-16 — Consistent module detail sections

- Replaced module child table grids with public InlineDetails labeled rows matching the Details tab. Routes, actions, events, dependencies, table definitions and fields retain their existing inline save callbacks and SQLite APIs.
- Retained Add actions, selected-table URLs and preview summaries; schema preview now uses the same detail-row treatment. The project module index remains unchanged.
- Typecheck and production build passed. No database migration or live record edits were needed.

## 2026-11-16 — v1.0.1 release preparation

- Connected origin to https://github.com/CODEXSUN/project-manager.git and prepared package/lock/changelog version 1.0.1 with fresh database and app release notes.
- Full verify passed: typecheck, production build, 11 app tests, 4 repository tool tests and version consistency.
- Runtime SQLite data, environment overrides, build output and dependencies remain ignored. Shared UI/framework are workspace-relative dependencies.
- Preserve the remote initial commit when combining histories; publish main and tag v1.0.1, then verify remote references.

## 2026-11-16 — GitHub Manager

- Added separate backend/frontend module, contracts, guarded versioned snapshot API and module-owned OpenAPI descriptions.
- Wired sidebar/list/detail routes, shared MasterListV1 controls, repository connections/branches/change counts, changed paths and safe GitHub links. Added explicit status checking and cached-upstream explanation.
- Discovery is scoped to the configured workspace and bounded; Git is invoked read-only with argument arrays/timeouts. Remote URLs exclude credentials; no file contents or raw Git errors are exposed. No database migration or credential setup required.
- Verified typecheck/build and app tests; URL parser tests cover clean details and invalid paths. Isolated Git tests cover actual modifications/untracked paths, unchanged working-tree state, URL sanitization, renames/conflicts, API guard and documentation registration.
- Live browser showed 25 repositories, 6 GitHub connections and 22 repositories with changes at check time. Project Manager detail opened with changed paths and restored after refresh. No repository writes or network fetches were performed by the module.
- See docs/github-manager.md for discovery bounds, cached upstream semantics and list-state limits.

## 2026-11-16 — GitHub commit and push workspace

- Added scoped review/file APIs and commit/push actions, repository action links and a separate changes page with file inclusion, plain-text previews and a commit-message sidebar.
- Commit validates review fingerprints, selected paths, conflicts and existing staging; push validates reviewed HEAD and a single GitHub destination and never forces. Concurrent app actions per repository are rejected. Existing Git credentials/hooks remain user-managed.
- Verified typecheck/build and 18 tests, including disposable selected-file commit, stale review rejection, omitted staging, file preview/path scope, action validation, foreign-origin rejection and clean changes URLs. Successful GitHub push was not exercised against live repositories.
- Browser verified action page and changed-file navigation; no live commit/push was submitted.

## 2026-11-16 — Repository cards and area tabs

- Replaced repository overview grid with compact full-width shared Card compositions matching Notes hover treatment, including path, branch, GitHub link, tracking branch, ahead/behind and all change counts. Retained direct detail and Commit & push actions.
- Removed duplicate page title and moved status summary/Check status to app-header actions. Expanded content to use available width.
- Added public FormAnimatedTabs filters for All, Add-ons, Apps and Devkits with counts. area query restores selected filter on refresh; All retains visibility of foundations/packages and other workspace areas. Search applies within the selected area.
- Typecheck and production build passed. Backend and stored data unchanged.

## 2026-11-16 — Shared search strip, area filters and indicators

- Added Foundations, Packages and Infrastructure tabs with repository counts, including the infrastructure root repository. Kept area selection in clean query state.
- Extracted public MasterListToolbar and MasterListFilterMenu in shared UI and reused them in MasterListV1 and repository cards. Right-side connection/status filters carry current-area counts, Clear and removable selection. Added 16px search-to-card spacing.
- Added colored area dots and shared semantic badges: green clean/staged, amber modified, red conflicts/errors, primary untracked; zero counters stay neutral. Text labels remain visible in both themes.
- Shared UI build and 34 tests passed; UIUX typecheck passed; Project Manager typecheck/build passed. UIUX includes the standalone strip preview and usage.

## 2026-11-16 — Repository tab order

Moved Apps first and All last; intermediate tabs retain their relative order. Typecheck passed.

## 2026-11-16 — Simple commit and push table

- Replaced the commit-page sidebar and MasterList toolbar/pagination with a compact bordered page header, labeled commit-details rows and a plain changed-file table with Include/File/Status headings.
- Retained message input, independent commit/push actions, selected-file behavior, file previews and all existing backend checks. No Git action was executed during this layout change.
- Typecheck and production build passed.

## 2026-11-16 — Plain repository changed-files table

Corrected the targeted screen: repository details now uses a simple shared Table with File, Previous path, Status, Index and Working tree headers and row numbers. Removed its MasterList search, filters, column chooser and pagination. Kept repository header, commit/push link and clickable file previews. Typecheck/build passed; no Git operations executed.

## 2026-11-16 — Minimal repository counters

Repository cards now omit zero-valued staged, modified, untracked and conflict counters, plus zero ahead/behind values. Keep tracking branch and clean-state badge visible. Typecheck and production build passed.

## 2026-11-16 — Unified repository commit workspace

- Flattened repository details and commit review into one canonical /github-manager/{id} page; legacy /changes links render the same workspace.
- Separated repository identity/status badges from header actions. Included message/commit control and all changed-file columns on the same page; retained inline file previews.
- Added Group by folder with group=folder URL state, tri-state select-all table header and folder-level selection. Group switching preserves message/file selections; preview links preserve grouping.
- Typecheck/build and 18 app tests passed. No live commit or push submitted during verification.

## 2026-11-16 — Folder row highlight

Applied light blue backgrounds to repository folder group rows, with matching hover and dark-theme colors. Typecheck and build passed.
