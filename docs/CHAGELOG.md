# Codeitz Changelog

## Version State

Current version: 1.0.2

Release tag: v-1.0.2

Changelog label: v 1.0.2

First published application version: 1.0.1. Earlier entries record local development. Keep database and app codebase changes separate. The release-tag field records the version naming convention; Git tags are separate. This filename is intentionally CHAGELOG.md.

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
