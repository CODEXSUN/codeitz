# Whiteboard card audit — 2026-11-19

- Shared CardLink and lazy WhiteboardPreview; responsive 1/2/3/4 column gallery with reduced-motion-aware hover and focus ring.
- Clicking a preview opens the project-owned record URL; editor replaces gallery.
- Browser test created Excalidraw text scenes in an isolated migrated PostgreSQL schema: draft save, close/card preview, reopen, active save, refresh, Back/Forward. Saved content retained the original text and IDs. No browser errors.
- First-save scene state is updated before remounting with a persisted ID. Shared serialization rejects while initial data is loading. A focused UI regression verifies the guard, dirty tracking and intentional clearing.
- PostgreSQL regression verifies save/retrieve, revision 3, active status, stale edit rejection and cross-project isolation.
- Shared UI build and 91 existing tests plus the new hydration test passed; local app checks and tagged CI recorded below.
- Existing runtime data remains untouched during browser testing. No migrations or seeders added. Deployment uses the approved immutable release and selected CodeShip adapter.

Final local candidate: typecheck passed; production build 3.53s; all 95 PostgreSQL-enabled tests passed, zero skips/failures (152367.19ms). Exact-candidate browser test drew “Idea → Draft → Saved / Codeitz 1.0.10”, saved draft then active without refresh, retained one nondeleted text element at revision2, and retrieved its preview after refresh. Mobile360px document width360px, preview loaded; desktop and card navigation passed. Earlier test invocation from an incorrectly nested checkout failed 13 path-dependent fixtures; corrected workspace layout passed all95. No production data changed.

## Published release

Codeitz v-1.0.10: 6e095f59b6dce7c1c489af7b042e78e14545ecbb. Tagged workflow 44445340436 succeeded: 95 tests, 94 passed, zero failures, one expected Linux skip for Windows CLI discovery (local Windows all95 passed). Clean frontend build2.11s; image build1.74s. Shared UI0.1.16 is pinned.

Image ghcr.io/codexsun/codeitz@sha256:64658bbb7c29c2c7e6f86621c8fd75204963f1029467df331ff10cb706d5296a. Archive SHA256 56cf86a4c44a39d2b1fffd5b17854a58dca0aa674926027afd9149b543955ef3. CodeShip operator1.0.19 matches its tagged adapter source; selected codeitz-only operation2026-11-19T02-39-42-327Z uses its exclusive lock. Stalled exact GHCR transfer was stopped to allow the supported authenticated/checksummed archive fallback. No app/source rebuild at deployment.

## Local Docker verification — complete

Codeitz1.0.10 is healthy at http://127.0.0.1:14305, mapping127.0.0.1:14305:4305, revision6e095f59b6dce7c1c489af7b042e78e14545ecbb and running image sha256:64658bbb7c29c2c7e6f86621c8fd75204963f1029467df331ff10cb706d5296a. CodeShip operation2026-11-19T02-39-42-327Z succeeded: registry/replacement/verification passed; native migration, data copy, workspace initialization and both database migrations skipped. All53 PostgreSQL table hashes /4751 rows unchanged, including identities, connections and history. Other container IDs unchanged. SendingOFF, pending0/failed0. Live/ready/dashboard/project-whiteboard/API docs200; foreign-Origin403; fresh metrics verified by shared tooling.

Deployed browser smoke test displayed the existing integration-whiteboard preview card and opened its Excalidraw editor with no browser errors. No production writes were made. Separate synthetic browser drawing schemas were removed after the E2E audit. Evidence remains ignored locally in .codeitz/whiteboard-docker-gallery.jpg and whiteboard-release-gallery.jpg. No remaining release/deployment blocker. VPS is outside this local verification.
