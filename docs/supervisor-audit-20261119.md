# Codeitz supervised audit — 2026-11-19

Status: working — source candidate verified; immutable publication/hosted gate pending. Owner: devkit/codeitz. HTTP retained. CodeShip alone deploys.

## Root causes and fixes

- Docker v1.0.7 has eight recorded restarts. Preflight previously treated PostgreSQL recovery like fatal configuration and exited. Uses Framework waitForReadiness now: 60-second total budget, explicit transient PG/transport classifier, five-second probe query timeout. Schema/credential failures remain fatal; no migration/seed at startup.
- An unhandled pg idle-pool error can terminate Node. The app handles idle eviction; active query errors still reject. A disposable proxy/schema/child-process fixture reproduced exit 1 without the handler; the fixed worker survived and read its committed record after reconnection (31 ms in focused run). This proves a failure mechanism, not the cause of every historical restart.
- Readiness formerly had no database callback. It now checks PostgreSQL with one in-flight probe; outage returns503, liveness remains200, and recovery returns200. Twelve simultaneous probes shared one check in the fixture.
- Rejected activity chains poisoned later work. Failures now remain visible while later jobs recover; observers are isolated and owned pools close in finally. At256 pending activity writes, workers abort with a saved review/retry failure rather than accumulate an unbounded backlog. Chat terminal saves retry idempotently on a later read/send after DB recovery, without repeating Codex or completion history.
- Chat SSE snapshots are coalesced/serialized with disconnect guards; initial task-stream events are capped at256. Existing single-worker admission and separate plan/code approvals remain.
- Tailwind discovery is bounded to src/web with imported shared UI sources. Internal image default4305 and public loopback14305:4305 agree.

## Exact files

.container/{Dockerfile,compose.yml,release.json}; scripts/preflight.ts; src/api/{database.ts,server.ts}; src/api/modules/agent-chat/{routes.ts,service.ts}; src/api/modules/task-runner/{routes.ts,application/service.ts}; src/styles/index.css; tests/{preflight,database-recovery,agent-chat,task-runner,server}.test.mjs; package.json/package-lock.json; README.md; docs/{CHAGELOG.md,release-notes.md,work-record.md,supervisor-audit-20261119.md}.

Pre-existing six frontend extraction files remain outside this release. No shared sibling source files were edited for the fixes. The earlier approved CodeShip Compose port contract is included.

## Tests and measured evidence

- Final frozen candidate:94/94 tests passed, PostgreSQL enabled, zero skips;231843.01 ms. Includes real isolated migrations/transactions, imports/history, worker approval/Stop/retry, chat handoff, sync/conflicts and new recovery/backpressure tests.
- Candidate typecheck passed. Frontend build passed in2m6s,9749 modules (font-copy hook28.7s under shared-host contention). Version/release-contract checks and whitespace review pass.
- Focused startup tests:2 passed in497.3 ms using shortened test backoffs; production defaults remain250–2000 ms. Readiness outage/single-flight fixture passed. The expected old idle-error fixture failed with process exit1; fixed run passed in2419.8 ms. One burst test initially had an incorrect test loop; corrected fixture and final full94-test run passed.
- Initial disturbed full run was stopped only after verifying its own runner identity; the two project cases failed during that run then passed2/2 in87449.2 ms. It is not reported as a green run. The final candidate suite above is separate.
- Read-only Docker baseline and repeat: all53 public-table hashes/4751 rows unchanged. Fifteen projects/158 modules retained; no real record mutations. Native4305 was unavailable and was not restarted.
- Live v1.0.7 probes: live2.6–11.5 ms; ready2.3–2.9 ms (old readiness did not certify PG). Initial Sync read exceeded10s during contention; repeat200/3317381 bytes/171 ms; Projects200/5389 bytes/23 ms; Todos200/3395 bytes/24 ms.

## Shared installation incident and preservation

An owned incomplete-install move traversed a dependency junction; it was stopped, as was only its exact owned installer. The complete cause of all concurrent installation loss is not asserted. Framework owner restored its own locked installation. No further recursive moves/deletes of linked trees or retained recovery copies are permitted.

Read-only gate after restoration: Codeitz links only framework/UI; neither has transitive file/shared links, and no SDK is linked. The retained moved @workspace directory contains only framework. Framework root, UI Button/MainLayout/theme imports pass. Framework source is Git-clean; UI retains16 owner/concurrent entries and governance30, with zero tracked deletions. No full pre-incident UI/governance hash baseline exists, so unchanged concurrent edits are not over-certified. Original Codeitz .env matches its pre-incident private copy byte-for-byte; values/hashes omitted. Docker data hashes remain identical. No credentials/grants, native processes, live source workspaces or scheduling settings were changed.

Managed worktree creation did not return; no worktree was created according to Git inventory. Final release uses a separate clean Git checkout. Its isolated npm extraction stalled and is retained privately. Local final checks used the existing installation after owner restoration; they are NOT claimed as a successful fresh install. Hosted exact-source dependency assembly is a mandatory release gate.

## Version, dependencies and deployment handoff

Candidate1.0.8 / fresh annotated tag v-1.0.8. Commit, successful workflow and manifest will be recorded after publication; no deployment is claimed here.

- Framework0.2.0:51daaa2a7bee32d0a8eca806a2b0e8a765a3e1ac; hosted Linux/Windows checks passed.
- UI0.1.12:e88945f101313051ded3557e14b0363a0a6ca906; owner-tested recovery and360/768/1440/1920/2560 viewport matrix. Local linked-package lock metadata updated to these exact versions and published UI runtime dependencies.
- Governance pin retained:ee8e234132e69df6170b24bce4ab937434856f20. No dirty branch pins.

Migration plan: no files changed/new; native and Docker histories show all15 applied, none pending. CodeShip must recheck actual target history, retain PG/workspace/runtime/Codex volumes and paused scheduling, skip copy/reset/seed and deploy only the approved digest on14305:4305 under its shared lock. Verify readiness, origin guard, image labels, fresh metrics, data fingerprints and actual browser behavior. No independent Docker write or boot rehearsal was performed by this audit.

Limitations: Codeitz-specific browser viewport captures were not performed; shared UI owner evidence is separate. Sync overview still sends large payloads and record lists are not a distributed job queue. An uncommitted terminal answer can still be interrupted if the process itself dies before PostgreSQL returns; persisted running state is recovered on restart. No live/VPS deployment or fresh Codex login.
