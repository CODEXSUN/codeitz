# Codeitz web and Desktop in one repository

The main source is `D:/workspace/codebiz/devkit/codeitz`.

| Area | Source | Local check |
| --- | --- | --- |
| Web and existing application API | `src/web`, `src/api`, `contracts` | `npm run typecheck`, `npm run build` |
| Native Desktop frontend and Tauri shell | `desktop/src`, `desktop/src-tauri` | `npm run desktop:build`, `npm run desktop:native:build` |
| Persistent local agent runtime | `desktop-runtime` | `npm run desktop:test`, `npm run desktop:verify` |
| Local supervisor connector | `desktop-tools/desktop-link.mjs` | `npm run desktop:link -- status` |
| Shared product streaming UI | `src/shared/streaming` | Consumed by both web and Desktop |
| Shared UI resolution | `scripts/shared-ui-vite.ts` | Both Vite entry points import the same configuration |

`npm run desktop:dev` starts the Desktop frontend on its existing loopback development port. The native build command produces a local installer; it does not install or deploy it. Runtime commands require the existing private `CODEITZ_DESKTOP_CONFIG`. Startup never copies a database or seeds records.

Web and Desktop consume public exports from published `@workspace/ui` 0.1.26, including the streaming CompactMessage contract. The web uses published SDK 0.1.17 through its public direct-browser export. Standard sibling package paths and immutable release pins make the source reproducible; local package links use app-owned published-source caches with a compatible existing UI dependency install. Earlier private source aliases are removed. Old package links and their targets remain available for recovery.

## Records and running applications

Source consolidation does not merge the web database with the Desktop database, change account permissions or rewrite conversation history. The Desktop bridge continues to use the original read-only Codeitz project/task API. Existing provider IDs, workspaces, configuration and installed executables stay where they are.

The installed Desktop and private service configuration were not replaced or restarted during consolidation. `desktop-tools/start-desktop.ps1` can launch the installed shell with the main repository's runtime path using its existing private configuration; it does not provision a new database. The previous source, dependency folders, worker snapshots and rollback assets remain intact because they contain active dependencies and unfinished work.

## Local verification

- Both production frontend builds and both TypeScript checks pass. The 30 baseline web type errors disappeared when the incomplete shared-UI dependency link was repaired; unfinished web modules were not replaced.
- Desktop's 21 focused checks pass.
- The full Desktop fixture uses the built frontend, real Runtime and a disposable PostgreSQL database, with a deterministic provider and native-invoke bridge. All ten stages pass, including explicit approval, separate workspaces with the same coworker, review, partial-output rejection, restart and preservation. This is not a live-model or installed-Tauri run.
- The built web's user/Admin/SA sign-in pages render with a synthetic signed-out API and no browser errors. No real credentials or business writes are used by that browser check.
- Existing Desktop and web PostgreSQL tables are compared read-only before and after verification. Receipts and build logs are in ignored `.codeitz/consolidation-20261123`.

The browser fixture no longer depends on a deleted Windows temporary directory. It accepts `CODEITZ_PLAYWRIGHT_MODULE`, or uses the pinned local tool at `.codeitz/browser-tools/node_modules/playwright-core/index.mjs`. This task installed `playwright-core@1.65.1` from the existing npm cache without scripts or downloading browsers; it uses a fresh context in the existing Edge installation.

No commit, push, release, deployment, database migration or permission expansion was performed.

Final preservation receipt: all 11 Desktop and 55 web table hashes/grants match; 264 pre-existing source files checked. Native `cargo check --locked --offline` passed. Private installed configuration and original root lockfile remain unchanged.

## Source publication closure — 23 November 2026

Version 1.0.21 brings the accepted source together and forward-pins published UI27/SDK17. It does not merge existing databases, install a new shell, replace the provider executable, migrate production data or deploy a container. The native shell/package version remains independent at 0.1.0; its footer reads the main app version. Source publication and local verification are separate from updating any installed release.
