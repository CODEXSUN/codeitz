# Codeitz Changelog

## Version State

Current version: 1.0.12

Release tag: v-1.0.12

Changelog label: v 1.0.12

First published application version: 1.0.1. Earlier entries record local development. Keep database and app codebase changes separate. The release-tag field records the version naming convention; Git tags are separate. This filename is intentionally CHAGELOG.md.

## Unreleased

- No pending application changes.

## v-1.0.12

### [v 1.0.12] 2026-11-19 - Share bounded PostgreSQL pool across compatible modules

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.12.
- Use one app-owned PostgreSQL pool (max5 unchanged) for compatible default Projects/Sync, Todos, business Tasks, coding runner and Agent Chat services.
- Preserve explicit app/project/runtime database overrides and caller ownership. Close module jobs/timers before ending the owned pool exactly once.
- Add parallel cross-module, pool-cap/identity, borrowed database shutdown and real proxy outage/recovery tests. No migration, role change, worker-limit reduction or PostgreSQL restart.

## v-1.0.11

### [v 1.0.11] 2026-11-19 - Collapse mobile rails into shared navigation drawer

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.11.
- Collapse both Codeitz agent rails below the shared 768px mobile breakpoint; recover the full mobile workspace width.
- Reuse the existing MainLayout drawer for every rail tool and close it after selection; desktop rails/navigation unchanged.
- Verify actual 360/768/1920 screenshots, all 13 drawer routes and no page overflow. Preserve unrelated sidecar work; no shared UI, schema or runtime data changes.

## v-1.0.10

### [v 1.0.10] 2026-11-19 - Project whiteboard preview cards and reliable saves

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.10.
- Replace the project White Board table with responsive preview cards using shared CardLink hover/focus behavior and public WhiteboardPreview.
- Open each card on its own Excalidraw record page; hide the gallery while editing.
- Keep the returned scene after first save and reject saves before editor hydration.
- Verify draft/active status, drawing content, refresh, Back/Forward and stale revision protection; no schema/data migration.

## v-1.0.9

### [v 1.0.9] 2026-11-19 - Isolate PostgreSQL readiness fixtures

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.9.
- Default all HTTP test Projects/readiness access to the isolated migrated fixture database, including an explicit undefined override.
- Add a regression using an absent default schema, so local pre-existing tables cannot hide a clean-install readiness failure.
- Carry the PostgreSQL/worker recovery implementation and immutable dependency pins from 1.0.8; no production schema or data changes.
- Synchronize the activity-burst fixture with the worker job instead of a short database-polling deadline under disk contention; runtime limits are unchanged.
- Preserve failed tag v-1.0.8: its clean-source workflow exposed this fixture leak and produced no approved image. Publish a fresh version after verification.

## v-1.0.8

### [v 1.0.8] 2026-11-19 - Recover PostgreSQL startup and worker activity

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.8.
- Use Framework's bounded PostgreSQL startup wait for known transient recovery/transport failures; schema and credential errors remain fatal.
- Prevent idle PostgreSQL pool errors from terminating the IDE, with fixture-tested reconnect and committed-record preservation.
- Report database-backed readiness with one in-flight probe; keep process liveness independent.
- Recover worker activity recording after failures, cap pending activity at 256, save overload failures, isolate observers and coalesce chat snapshots; bound the initial task-stream buffer.
- Retry pending chat terminal saves idempotently after database recovery without rerunning Codex or duplicating completion history.
- Bound Tailwind source discovery to the app frontend and retain shared component sources.
- Align the image's internal default port to 4305 and its public loopback contract to 14305:4305.
- Pin published Framework 0.2.0 and UI 0.1.12; final typecheck/build and all 94 PostgreSQL-enabled tests passed without skips. No schema migration, seed/reset or production record changes.

## v-1.0.7

### [v 1.0.7] 2026-11-18 - Docker-first data refresh and sync audit

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.7.
- Record the Docker-first refresh across 14 current apps/devkits: 157 source-backed modules, 455 API routes, 181 tables and 1,885 fields.
- Confirm 165 selected Docker updates followed by 165 pulls into native PostgreSQL; both now match at 15 stored projects and 158 modules, including historical records.
- Latest read-only audit confirms original IDs and review history preserved, no pending drafts/failures, and sending OFF on both peers.
- Documentation/version release only: no runtime change, schema migration, deployment or database records are published. Blueprint completeness remains a separate review task.

## v-1.0.6

### [v 1.0.6] 2026-11-18 - Finalize audited workspace and tagged container handoff

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.6.
- Include the completed native/Docker workspace-source inventory audit records and pin published UI 0.1.8 plus governance 1.0.16. Retain the editable Docker workspace and persisted projects. All 83 PostgreSQL-enabled tests passed without skips; source typecheck/build and workspace governance audit passed. Add complete external-file dependency validation. No database migration.

## v-1.0.5

### [v 1.0.5] 2026-11-18 - Local and Docker sync verification log

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.5.
- Record verified local :4305 and Docker :4451 connections, sending OFF on both, refresh-stable review decisions/history, zero pending drafts/failures, and 11 projects/10 modules on each instance.
- Preserve the earlier restart evidence: Docker replacement retained connections and sync identity; a new full approval-history restart test was not performed during the read-only audit.
- No new runtime behavior, migration, deployment or connection changes in this release.

## v-1.0.4

### [v 1.0.4] 2026-11-18 - Controlled tagged workflow dispatch

#### Database Changes

- Database update: No (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.4.
- Add explicit dispatch on a selected version tag for initial workflow registration/retry. CodeShip accepts only a successful run for that exact tag and commit. Initial tags remain unchanged; no unverified image has been deployed. No new database migration.

## v-1.0.3

### [v 1.0.3] 2026-11-18 - Audited sync controls and tagged deployment contract

#### Database Changes

- Database update: Yes (manual).

#### App Codebase Changes

- Bumped Codeitz version to 1.0.3.
- Projects/modules synchronization direction controls and manual confirmation; separate native/Docker settings and persistent workspace; pinned GitHub release contract with CodeShip-only lifecycle. Typecheck/build and all 83 PostgreSQL-enabled tests passed without skips. Pending target migrations are checked/backed up by CodeShip.

## v-1.0.2

### [v 1.0.2] 2026-11-18 - Projects and Modules sync with manual confirmation

#### Database Changes

- Database update: Yes. PostgreSQL owns Projects, Modules, Todos/categories, business Tasks, runner and chat records; retain existing IDs, links and history through the documented migration/import paths.
- Add revision-bound module owner approval snapshots and audit history.
- Add sync instance identity, connected apps, per-table Draft → Confirmed policies, baseline fingerprints, transactional activity/outgoing queues and incoming drafts. Migration baselines existing records without exporting or approving them.
- Legacy SQLite import tools remain explicit offline utilities; application runtime storage is PostgreSQL.

#### App Codebase Changes

- Add /sync for scoped connected-app token/secret exchange, bidirectional draft review, confirmation/rejection, conflicts, retry/receipts, initial snapshots and deletion drafts. Preserve module and child IDs and prevent duplicate delivery/echo.
- Add module/field definitions, PostgreSQL type and length/precision controls, Blueprint completeness checks/export and separate owner final approval. Coding approval remains separate.
- Include merged Projects/GitHub Manager, dashboard, business Tasks, Todos/category management, Agent chat and approved-plan links to the task runner, plus compact shared layouts, URL state and result review.
- Prepare the Codeship deployment contract: pending migrations before startup, protected persistent data, version-derived initial image names and container bindings for approval/default sync secrets. Clear the credential example.
- Verified 80 tests with PostgreSQL checks enabled and no skips, typecheck/build, version tools, governance audit (11 products, 25 owners; no violations), and Compose configuration. A prior focused sync suite verified two isolated HTTP/PostgreSQL instances. Live/cloud deployment remains owned by Codeship.
- No .env files, runtime records, recovery exports, node_modules or dist are included in the release.

## v-1.0.1

### [v 1.0.1] 2026-11-16 - Codeitz 1.0.1 initial release

#### Database Changes

- Includes existing local SQLite task storage, activity history, review decisions, and linked follow-up records.
- Release preparation does not migrate or publish local runtime data; .codeitz/ remains ignored.

#### App Codebase Changes

- Publish the initial Codeitz MVP: local Codex connection, separate plan/code/check approvals, live worker activity and stage progress, governance auditing, completion review, and recoverable task history actions.
- Include project-scoped task links and the Project Manager connection.
- Verify GitHub audit, bump preview, package/lock/changelog consistency, and the changelog-derived commit subject.
- Keep shared UI/framework dependencies and central governance as adjacent workspace references.
- Verify typecheck, frontend build, 23 tests, and central governance audit before publication.

## v-0.1.0

### [v 0.1.0] 2026-11-16 - Wire local version and Git review tools

#### Database Changes

- Database update: No (manual, this tooling setup).
- Existing SQLite task storage and history remain unchanged.

#### App Codebase Changes

- Wire copied GitHub/version tools to this standalone app and its local changelog.
- Add safe version checks, bump previews, and Git commit-subject previews.
- Existing MVP includes local Codex connection, separate plan/code/check steps, live activity, completion review, linked follow-ups, and Project Manager links.
- Preserve app version 0.1.0. No repository version bump, pull, commit, push, or SSH-key operation was performed.
