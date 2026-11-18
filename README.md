# codeitz
Start Your Way. Build Your World.

## Codeitz 1.0.7

Local coding workspace powered by an existing signed-in Codex CLI session. Review a plan before coding, run app checks separately, and inspect recorded results and follow-ups.

This repository is developed inside a governed workspace. It expects `../../packages/ui`, `../../foundation/framework`, and central `../../mcp-governance` alongside it. These shared repositories and runtime credentials/data are not bundled here.

Build shared framework and UI first. In this repository run `npm ci`, `npm run verify`, then `npm run dev:api` and `npm run dev:web` (open http://127.0.0.1:4300). Copy `.env.example` to `.env` only if missing. Check `docs/task-runner.md` and `docs/repository-tools.md` for the workflow and tool commands. Version history is in `docs/CHAGELOG.md`.

## Local web and API ports

Run `npm run dev:api` and `npm run dev:web` in separate terminals. Open http://127.0.0.1:4300; API is http://127.0.0.1:4305. The web server proxies `/api` to its API and refuses an occupied port. `npm start` serves the built app together on the API port. See [port rules](../../mcp-governance/docs/local-ports.md).


Release audit: [1.0.2](docs/release-audit-1.0.2.md). Connected-app setup and manual draft confirmation: [Sync](docs/sync.md). Codeship owns deployment; see [.container/README.md](.container/README.md) for the build/migration handoff.
