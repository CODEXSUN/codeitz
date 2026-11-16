# Local Codeitz

Codeitz serves its frontend, local task runner, and audit API together at http://127.0.0.1:4310.

Shared components and themes come from `@workspace/ui`, linked locally to `../../packages/ui`. Install and build that repository first (`npm ci`, `npm run build`), then build Codeitz. The app uses the shared design system; appearance preferences remain local to this browser. Local component copies are not maintained.

From the Codeitz repository root, install with `npm ci`, build with `npm run build`, and start with `npm start`. Codeitz owns its `node_modules/`, `package-lock.json`, and `dist/web/`. Run `npm run typecheck` and `npm test` for checks. Rebuild after frontend changes. Shared shadcn components are configured and maintained in the UI package.

Build `foundation/framework` first (`npm ci`, `npm run build` in its repository). Codeitz links to its public package for startup, health, frontend serving, and graceful shutdown. `npm run preflight` checks readiness without starting the server. `npm start` and `npm run dev` run preflight before listening; development watches backend files. Preflight never builds files, installs packages, or stops another server.

Task runner, task records, governance audit, and settings are available. Task planning, coding, and checks are separate actions. Project Manager links open on its configured default port 4312.

The server listens on this computer only. Codex uses the existing local signed-in session and app-scoped permissions. SQLite records are stored under ignored .codeitz/tasks/. Remote deployment and multi-user authentication are not configured.

Copy `.env.example` to `.env` only when `.env` is missing. The supplied local file contains no secrets and is ignored by Git. Explicit process variables override it.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | development, test, or production |
| `CODEITZ_HOST` | Bind address; defaults to loopback |
| `CODEITZ_PORT` | Server port; defaults to 4310 |
| `CODEITZ_LOG_LEVEL` | Logging level, including silent |
| `CODEITZ_SHUTDOWN_TIMEOUT_MS` | Deadline for graceful shutdown |
| `CODEITZ_WORKSPACE_ROOT` | Audit workspace, resolved relative to the Codeitz repository |

These settings are server-side and cannot be changed through the page. No database, AI, or other unused credentials are required.

In an independent checkout, keep the UI package at the declared relative location until it becomes a Git or registry dependency. Set `CODEITZ_WORKSPACE_ROOT` to the workspace to audit; build output and dependencies remain inside Codeitz. Update the AGENTS.md governance link to the team's agreed location.
