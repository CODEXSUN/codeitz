# Whiteboard card audit — 2026-11-19

- Shared CardLink and lazy WhiteboardPreview; responsive 1/2/3/4 column gallery with reduced-motion-aware hover and focus ring.
- Clicking a preview opens the project-owned record URL; editor replaces gallery.
- Browser test created Excalidraw text scenes in an isolated migrated PostgreSQL schema: draft save, close/card preview, reopen, active save, refresh, Back/Forward. Saved content retained the original text and IDs. No browser errors.
- First-save scene state is updated before remounting with a persisted ID. Shared serialization rejects while initial data is loading. A focused UI regression verifies the guard, dirty tracking and intentional clearing.
- PostgreSQL regression verifies save/retrieve, revision 3, active status, stale edit rejection and cross-project isolation.
- Shared UI build and 91 existing tests plus the new hydration test passed; local app checks and tagged CI recorded below.
- Existing runtime data remains untouched during browser testing. No migrations or seeders added. Deployment uses the approved immutable release and selected CodeShip adapter.

Final local candidate: typecheck passed; production build 3.53s; all 95 PostgreSQL-enabled tests passed, zero skips/failures (152367.19ms). Exact-candidate browser test drew “Idea → Draft → Saved / Codeitz 1.0.10”, saved draft then active without refresh, retained one nondeleted text element at revision2, and retrieved its preview after refresh. Mobile360px document width360px, preview loaded; desktop and card navigation passed. Earlier test invocation from an incorrectly nested checkout failed 13 path-dependent fixtures; corrected workspace layout passed all95. No production data changed.
