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
