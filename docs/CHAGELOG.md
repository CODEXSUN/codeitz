# Codeitz Changelog

## Version State

Current version: 1.0.1

Release tag: v-1.0.1

Changelog label: v 1.0.1

First published application version: 1.0.1. Earlier entries record local development. Keep database and app codebase changes separate. The release-tag field records the version naming convention; Git tags are separate. This filename is intentionally CHAGELOG.md.

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
