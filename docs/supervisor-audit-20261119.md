# Codeitz supervised audit — 2026-11-19

Status: release-ready —1.0.12 shared pool/deadlines and exactUI18 artifact/browser verified; immutable CI/publication and selected runtime verification pending.

## Root causes and fixes

- Docker v1.0.7 has eight recorded restarts. Preflight previously treated PostgreSQL recovery like fatal configuration and exited. Uses Framework waitForReadiness now: 60-second total budget, explicit transient PG/transport classifier, five-second probe query timeout. Schema/credential failures remain fatal; no migration/seed at startup.
- An unhandled pg idle-pool error can terminate Node. The app handles idle eviction; active query errors still reject. A disposable proxy/schema/child-process fixture reproduced exit 1 without the handler; the fixed worker survived and read its committed record after reconnection (31 ms in focused run). This proves a failure mechanism, not the cause of every historical restart.
- Readiness formerly had no database callback. It now checks PostgreSQL with one in-flight probe; outage returns503, liveness remains200, and recovery returns200. Twelve simultaneous probes shared one check in the fixture.
- Rejected activity chains poisoned later work. Failures now remain visible while later jobs recover; observers are isolated and owned pools close in finally. At256 pending activity writes, workers abort with a saved review/retry failure rather than accumulate an unbounded backlog. Chat terminal saves retry idempotently on a later read/send after DB recovery, without repeating Codex or completion history.
- Chat SSE snapshots are coalesced/serialized with disconnect guards; initial task-stream events are capped at256. Existing single-worker admission and separate plan/code approvals remain.
- Tailwind discovery is bounded to src/web with imported shared UI sources. Internal image default4305 and public loopback14305:4305 agree.

## Exact files

.container/{Dockerfile,compose.yml,release.json}; scripts/preflight.ts; src/api/{database.ts,server.ts}; src/api/modules/agent-chat/{routes.ts,service.ts}; src/api/modules/task-runner/{routes.ts,application/service.ts}; src/styles/index.css; tests/{preflight,database-recovery,agent-chat,task-runner,server}.test.mjs and tests/server-fixture.mjs; package.json/package-lock.json; README.md; docs/{CHAGELOG.md,release-notes.md,work-record.md,supervisor-audit-20261119.md}.

Pre-existing six frontend extraction files remain outside this release. No shared sibling source files were edited for the fixes. The earlier approved CodeShip Compose port contract is included.

## Tests and measured evidence

- Final 1.0.9 frozen candidate:95/95 tests passed, PostgreSQL enabled, zero skips;242491.10 ms. Includes real isolated migrations/transactions, imports/history, worker approval/Stop/retry, chat handoff, sync/conflicts and new recovery/backpressure tests.
- Candidate typecheck passed. Final 1.0.9 frontend build passed in1m5s; the initial recovery build took2m6s/9749 modules under shared-host contention. Version/release-contract checks and whitespace review pass.
- Focused startup tests:2 passed in497.3 ms using shortened test backoffs; production defaults remain250–2000 ms. Readiness outage/single-flight fixture passed. The expected old idle-error fixture failed with process exit1; fixed run passed in2419.8 ms. One burst test initially had an incorrect test loop; corrected fixture and final full95-test run passed.
- Initial disturbed full run was stopped only after verifying its own runner identity; the two project cases failed during that run then passed2/2 in87449.2 ms. It is not reported as a green run. The final candidate suite above is separate.
- Read-only Docker baseline and repeat: all53 public-table hashes/4751 rows unchanged. Fifteen projects/158 modules retained; no real record mutations. Native4305 was unavailable and was not restarted.
- Live v1.0.7 probes: live2.6–11.5 ms; ready2.3–2.9 ms (old readiness did not certify PG). Initial Sync read exceeded10s during contention; repeat200/3317381 bytes/171 ms; Projects200/5389 bytes/23 ms; Todos200/3395 bytes/24 ms.

## Shared installation incident and preservation

An owned incomplete-install move traversed a dependency junction; it was stopped, as was only its exact owned installer. The complete cause of all concurrent installation loss is not asserted. Framework owner restored its own locked installation. No further recursive moves/deletes of linked trees or retained recovery copies are permitted.

Read-only gate after restoration: Codeitz links only framework/UI; neither has transitive file/shared links, and no SDK is linked. The retained moved @workspace directory contains only framework. Framework root, UI Button/MainLayout/theme imports pass. Framework source is Git-clean; UI retains16 owner/concurrent entries and governance30, with zero tracked deletions. No full pre-incident UI/governance hash baseline exists, so unchanged concurrent edits are not over-certified. Original Codeitz .env matches its pre-incident private copy byte-for-byte; values/hashes omitted. Docker data hashes remain identical. No credentials/grants, native processes, live source workspaces or scheduling settings were changed.

Managed worktree creation did not return; no worktree was created according to Git inventory. Final release uses a separate clean Git checkout. Its isolated npm extraction stalled and is retained privately. Local final checks used the existing installation after owner restoration; they are NOT claimed as a successful fresh install. Hosted exact-source dependency assembly is a mandatory release gate.

## Version, dependencies and deployment handoff

Candidate1.0.9 / next fresh annotated tag v-1.0.9. Version1.0.8 source commit f22805f47a53969b583d95e7234f16034dcb4591 was pushed, but workflow44437670326 failed one readiness fixture test (92 passed, one failed, one expected Linux skip for the Windows-only CLI case) after clean dependency installation, typecheck and frontend build. It has no approved image/manifest and must not deploy. The1.0.8 tag remains unchanged. The fixture leaked its Projects readiness probe into the default application database, which happened to be provisioned locally but was empty in CI. Tests now default projectDatabase to their isolated migrated database, preserving explicit overrides; a regression uses an absent default schema. Six server tests passed, including that regression. The overload test now synchronizes with the job rather than polling on a short deadline; an intermediate local run had one timeout, the corrected focused test passed and the final full95-test run is green. Runtime queue limits were not relaxed. Final1.0.9 local suite is95/95 with no skips; the fresh immutable publication and hosted gate are pending. No deployment is claimed here.

- Framework0.2.0:51daaa2a7bee32d0a8eca806a2b0e8a765a3e1ac; hosted Linux/Windows checks passed.
- UI0.1.12:e88945f101313051ded3557e14b0363a0a6ca906; owner-tested recovery and360/768/1440/1920/2560 viewport matrix. Local linked-package lock metadata updated to these exact versions and published UI runtime dependencies.
- Governance pin retained:ee8e234132e69df6170b24bce4ab937434856f20. No dirty branch pins.

Migration plan: no files changed/new; native and Docker histories show all15 applied, none pending. CodeShip must recheck actual target history, retain PG/workspace/runtime/Codex volumes and paused scheduling, skip copy/reset/seed and deploy only the approved digest on14305:4305 under its shared lock. Verify readiness, origin guard, image labels, fresh metrics, data fingerprints and actual browser behavior. No independent Docker write or boot rehearsal was performed by this audit.

Limitations: Codeitz-specific browser viewport captures were not performed; shared UI owner evidence is separate. Sync overview still sends large payloads and record lists are not a distributed job queue. An uncommitted terminal answer can still be interrupted if the process itself dies before PostgreSQL returns; persisted running state is recovered on restart. No live/VPS deployment or fresh Codex login.

## Published 1.0.9 verification in progress

Source commit263790a2ec86d9513218bf0768029d73ae5fcbf9 and immutable tag v-1.0.9 were published through the audited helper. [Hosted workflow44440374169](https://github.com/CODEXSUN/codeitz/actions/runs/44440374169) is in progress; no image/manifest is approved yet. Final Windows candidate95/95 tests passed without skips in242491.10 ms; typecheck/build (1m5s) and contract/version checks passed. The source publication does not claim a deployment.

## Final supervised status — 2026-11-19

Published source6e095f59b6dce7c1c489af7b042e78e14545ecbb /v-1.0.10, successful tagged workflow44445340436. Latest whiteboard work and PostgreSQL/worker recovery fixes are included. Local Windows tests95/95, hosted94 passed/0failed/one expected Windows-only skip. Running1.0.10 image64658bbb7c29c2c7e6f86621c8fd75204963f1029467df331ff10cb706d5296a, healthy14305:4305. Data53 tables/4751 rows unchanged, native processes and sibling containers preserved, sendingOFF. Selected app-owned CodeShip operation2026-11-19T02-39-42-327Z succeeded with no migrations, copies or reset. No concrete blocker remains; no redundant rollout needed. Whiteboard E2E and full release/deploy receipt: docs/whiteboard-audit-20261119.md. Earlier executor-only and pending-publication statements describe prior stages and are superseded by this completion.

## 2026-11-19 — Responsive Codeitz rails, 1.0.11

App-owned mobile policy uses shared useIsMobile and AgentWorkspace visibility props. Below768px, both rails collapse and their actions appear in the existing MainLayout drawer, including tools otherwise absent from the desktop sidebar; Settings remains in its shared footer. Shared desktop breakpoint768px and above retains both56px rails. CSS hides mobile rails on first paint. No shared UI changes.

Actual browser E2E:360px document/canvas360px, both rails0px. All13 tool routes opened correctly and drawer closed after every selection. Settled768px document768/canvas346 with desktop sidebar and56px rails retained;1920px document1920/canvas1498. No JS errors or document overflow. Captured360/drawer/768/1920 screenshots in ignored .codeitz/mobile-fixed-*.jpg. Sidecar/package and unrelated extraction edits excluded from the release. No database changes.

1.0.11 final verification: typecheck passed, build6.81s, all95 PostgreSQL-enabled tests passed with zero skips/failures in258275.82ms. Tagged CI/immutable manifest and selected Docker rollout remain mandatory next stages.

## Mobile navigation release — completed

Codeitz1.0.11 is published at e4ee1e46e6ac85861e8bb377bbf5f34358843b9f /v-1.0.11. Workflow44448622314 succeeded:95 hosted tests,94 passed,0 failures and1 expected Linux skip for Windows CLI discovery; local Windows95/95,0 skips. Clean hosted frontend3.00s; image build2.85s. Image sha256:20406dbaac2995f77deab0fb95aa41b43a2904d6bfa5d6b247662104d72461c5; archive SHA2566c1a088a106e82bdc4561fc0333a8d1a824d0bddad395efc9670e48fae3a9bf0.

First deployment admission encountered the already-acquired Platform lock and made no changes. After Platform released it, selected CodeShip1.0.19 operation2026-11-19T03-11-37-959Z succeeded. The stalled owned GHCR transfer was stopped for the supported authenticated/checksummed archive fallback. Data copy/workspace initialization/native and PostgreSQL migrations skipped; registry/replacement/readiness/image identity/origin guard/fresh metrics passed. Running1.0.11 at127.0.0.1:14305:4305, healthy. All53 table hashes/4751 rows unchanged before/after deployment and deployed browser audit; sibling IDs unchanged during this operation, sync sendingOFF, pending0/failed0.

Actual deployed screenshot/DOM checks:360px document and Workspace canvas360px, rails0/0;768px document768/canvas346, rails56/56;1920px document1920/canvas1498, rails56/56. The existing768px shared desktop breakpoint is deliberately retained. Mobile drawer exposes all rail tools; fixture tests exercised13 destinations and automatic dismissal, live Projects selection/dismissal passed. No browser errors or page overflow. Screenshots: ignored .codeitz/mobile-live-360.jpg, mobile-live-drawer.jpg, mobile-live-768.jpg and mobile-live-1920.jpg. Native sidecar/package/extraction work preserved and excluded. No remaining owned blocker; no additional redeployment needed.

## 2026-11-19 — Shared PostgreSQL startup pool, 1.0.12 candidate

Normal startup previously created5 compatible pools atmax5 each (25potential). createServer now owns one unchanged max5 pool and injects borrowed module stores. Explicit database handles and project/runtime targets remain distinct and caller-owned. Injected service/repository implementations retain their supplied close contracts. Task/Todo repositories retain their standalone default ownership but accept borrowing when app-composed. The owner shutdown hook is registered before module hooks, so reverse-order close drains module work before one final pool destroy. Preflight uses a separate short-lived pool that closes before app startup. No schema/role/security-target change or reduced worker/backpressure bound. Supplied host census reduces103potential to83 (44business+34Platform+5Codeitz) against97 ordinary slots; this is a connection envelope, not measured exhaustion.

Focused tests3/3 passed: parallel requests through six module/readiness APIs plus25 concurrent SQL operations stay within5 same-role/database sessions; owner closes once after hooks and rejects later queries; separate app/project/runtime schemas retain marker identity and caller pools remain usable after close. A child app using its normal default factory survived real idle proxy loss, returned failed module reads/503readiness during outage, recovered all module reads and its saved marker, then shut down cleanly. The actual PostgreSQL service was never stopped.

Release gate: own candidate npm audit --omit=dev reports0, but this does not certify its shared drawing browser bundle. UI owner evidence identifies drawing/transitive advisory assessment in packages/ui/docs/security-drawing-20261119. No exploit is asserted. Current pin remains verified UI0.1.16; no blind0.1.17 upgrade. Publication/deployment waits for exact16 assessment or a tested compatible fixed dependency commit. Pool implementation and isolated tests continue independently.

Additional shutdown review: Todo and business-task timer callbacks now retain one in-flight scan promise, stop admission during close, and await that scan before module close. A delayed-scan regression verifies both scans complete while the database remains usable, then one pool end occurs and no timer restarts. Focused pool/recovery/shutdown tests4/4 pass. Initial98-test full suite passed; final99-test suite includes this last shutdown fix.

Final pool candidate: all99 PostgreSQL-enabled tests passed, zero failures/skips,115714.12ms; typecheck passed. Pre-scheduler-fix98-test pass and earlier fixture-only failures are superseded by this full final run. Frontend build passed20.18s; no frontend feature change. Source is ready for review, but no v-1.0.12 tag/image/deployment is claimed: verified drawing-producer remediation/final artifact check remains a release gate. No PostgreSQL restart, migration, reset, seed of real records or worker-limit reduction was performed.

## 2026-11-19 — Final1.0.12 source verification

UI0.1.18 pinned at6bd08d1c5dd555f01cabae70b19af492f6abe29a. Fresh independent source clones/installations (no shared node_modules junction) built Framework0.2.0 and the exact producer. Producer and app full npm audits report0known advisories. App root policy preserves prior Nanoid range rules, adds editor3.3.20/converter5.1.16 ancestry rules and reviewed lodash-es4.18.1; its prior KaTeX0.19.1 is aligned to the producer-tested0.18.10. Both producer and consumer resolution are covered. The actual Codeitz production build emits242 inspected drawing modules at Nanoid3.3.20/5.1.16, lodash-es4.18.1 and KaTeX0.18.10. A build plugin now fails for unreviewed emitted versions or missing graph evidence; regression tests reject old0.16.47 and an empty graph. This is version/advisory evidence, not a general exploit or vulnerability-free claim.

User-authorized isolated headless Edge/Playwright tested the compiled Codeitz app against a disposable PostgreSQL schema. Actual pointer rectangle saved as draft, PNG preview loaded, ellipse edit/statusactive persisted, and refresh retained both original shapes. Actual Mermaid dialog insertion with requested math syntax and Verified label persisted5new elements, without page errors. An initial test input clicked the covered raw radio rather than its visible label; corrected selector passed. An initial Mermaid insertion occurred before its debounced preview updated; the requested-label assertion caught it, and waiting for the new preview passed. No user Chrome/profile or real records were changed. Fixture schema removed after app close. Local evidence: .codeitz/final12-host-browser.json, final12-mermaid-browser.json, final12-host-preview.png and final12-mermaid-saved.png.

Runtime faults: native SHOW originally reported0for statement/lock/idle-transaction/transaction deadlines. Only the default app-owned runtime factory now installs per-session server limits: statement15s, lock5s, idle transaction15s and total transaction30s, with existing max5 and acquisition5s unchanged. Ordinary openDatabase()/migration CLI and explicit caller-owned handles keep their original settings. No global/role configuration changes. Persistent checked-out client error handling contains fatal server transaction evictions while query failures still reject. Actual PostgreSQL17 tests verify server57014 statement cancellation and idle backend state,55P03 blocked-row rollback/retry, idle and total transaction backend termination/new-PID recovery with uncommitted rows rolled back, and unchanged CLI settings. No blanket no-hang/throughput claim is made.

Final fresh-install local verification: typecheck and production build2.10s passed; all106 PostgreSQL-enabled tests passed0skips/failures in129619.28ms. This supersedes the earlier99-test pool-only gate. Immutable tagged CI/manifest remain required after publication. Docker rollout must reconcile actual image/data/operation lock after the supervisor stability handoff; no engine start/restart or bulk rollout is authorized.
