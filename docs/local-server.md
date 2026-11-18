# Local Codeitz

Codeitz development web runs at http://127.0.0.1:4300 and forwards API requests to http://127.0.0.1:4305. Run `npm run dev:api` and `npm run dev:web` in separate terminals. `npm start` serves the built frontend and API together on 4305.

Shared components and themes come from `@workspace/ui`, linked locally to `../../packages/ui`. Install and build that repository first (`npm ci`, `npm run build`), then build Codeitz. The app uses the shared design system; appearance preferences remain local to this browser. Local component copies are not maintained.

From the Codeitz repository root, install with `npm ci`, build with `npm run build`, and start with `npm start`. Codeitz owns its `node_modules/`, `package-lock.json`, and `dist/web/`. Run `npm run typecheck` and `npm test` for checks. Rebuild after frontend changes. Shared shadcn components are configured and maintained in the UI package.

Build `foundation/framework` first (`npm ci`, `npm run build` in its repository). Codeitz links to its public package for startup, health, frontend serving, and graceful shutdown. `npm run preflight` checks readiness without starting the server. `npm start` and `npm run dev` run preflight before listening; development watches backend files. Preflight never builds files, installs packages, or stops another server.

Task runner, task records, governance audit, and settings are available. Task planning, coding, and checks are separate actions. Projects (`/projects`) and GitHub Manager (`/github-manager`) are Codeitz modules using the same server and shared shell. The old standalone app is retired.

The server listens on this computer only. Codex uses the existing local signed-in session and app-scoped permissions. All Codeitz application records, runner history and agent-chat data use PostgreSQL. Remote deployment and multi-user authentication are not configured.

Copy `.env.example` to `.env` only when `.env` is missing. The local file is ignored by Git; keep passwords there and never copy them into documentation. Explicit process variables override it.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | development, test, or production |
| `CODEITZ_HOST` | Bind address; defaults to loopback |
| `CODEITZ_PORT` | Server port; defaults to 4310 |
| `CODEITZ_LOG_LEVEL` | Logging level, including silent |
| `CODEITZ_SHUTDOWN_TIMEOUT_MS` | Deadline for graceful shutdown |
| `CODEITZ_WORKSPACE_ROOT` | Audit workspace, resolved relative to the Codeitz repository |

These settings are server-side and cannot be changed through the page. Every persistent Codeitz module uses PostgreSQL; runtime has no SQLite fallback.

In an independent checkout, keep the UI package at the declared relative location until it becomes a Git or registry dependency. Set `CODEITZ_WORKSPACE_ROOT` to the workspace to audit; build output and dependencies remain inside Codeitz. Update the AGENTS.md governance link to the team's agreed location.

The application shell imports MainLayout from @workspace/ui/layouts/main-layout. Side menu, top menu/search, app header, canvas, and status bar are shared. Codeitz supplies navigation and live stream/worker status; the version label reads package.json.

## Routes

- Task runner: `/tasks/new?owner=devkit%2Fuiux`; selected task: `/tasks/{id}`.
- Task records: `/task-records`, selected record: `/task-records/{id}`. Supported filters: `owner` and `status=archived|dropped`; current is the default.
- Settings: `/settings/application`, `/settings/appearance`, `/settings/codex`.
- Governance audit: `/governance-audit?tab=checks&checks=routing`. Default tab and all-check selection are omitted. `checks=none` clears selection.
- Internal module API: `/api/v1/tasks...` and `/api/v1/audit...`; browser menus use clean paths. Local-only docs: `/api/docs`; OpenAPI: `/api/openapi.json`.

Deliberate navigation pushes browser history. Default/invalid query cleanup replaces history. Refresh, Back and Forward restore supported state; unsaved goals/feedback and audit results are not URL state. Invalid paths and missing task records show a missing-page/record message. The single task stream remains mounted across app navigation.

Legacy root `?task=`, `?view=records` and `?owner=` links normalize to clean paths. Existing Project Manager `/api/tasks...` calls retain deprecated aliases with the same handlers and local access checks, pending a separate Project Manager migration. The shared framework `/api/health` probe remains unchanged. `/api/v1` is an internal navigation convention, not a secrecy or authorization boundary.

## Focused task runner

The runner uses one compact task summary and the next available action. New tasks ask only for project and goal. Plan, Results and Activity tabs separate review content from worker logs; the permanent worker sidebar is removed from the runner page.

Active work defaults to Activity; prepared plans default to Plan; coded, completed and failed tasks default to Results. An explicit `?tab=plan|results|activity` selection survives refresh and Back/Forward. Invalid tab values are removed. Changed files, check output, long goals and task metadata expand on demand. Completed results retain Accept result and Request changes; plan, coding and check actions remain separate. Source-chat and original-task links are preserved.

## PostgreSQL only

For isolated production-mode Docker testing, deployment, updates and recovery, follow [Docker deployment](../.container/README.md). Native development remains separate.

All persistent modules use the configured PostgreSQL database through Kysely/pg. Run explicit `db:migrate` and `db:seed` before startup. Preflight checks required schemas and technical state; it does not create migrations or import legacy files.

Local development uses loopback PostgreSQL. Remote/cloud PostgreSQL requires verified TLS and production credentials supplied through environment settings. These changes do not provision or deploy a cloud database. Existing local Codex authentication and local-request guards remain unchanged.

Legacy migration readers remain for offline recovery and disposable migration tests only. The standalone Project Manager folder and local SQLite files were moved to the Recycle Bin after confirmation and record verification. Recovery exports remain unchanged. Back up PostgreSQL for ongoing recovery. No local mirror or SQLite synchronization runs.
