# codeitz
Start Your Way. Build Your World.

## Codeitz 1.0.1

Local coding workspace powered by an existing signed-in Codex CLI session. Review a plan before coding, run app checks separately, and inspect recorded results and follow-ups.

This repository is developed inside a governed workspace. It expects `../../packages/ui`, `../../foundation/framework`, and central `../../mcp-governance` alongside it. These shared repositories and runtime credentials/data are not bundled here.

Build shared framework and UI first. In this repository run `npm ci`, `npm run verify`, then `npm start` (default http://127.0.0.1:4310). Copy `.env.example` to `.env` only if missing. Check `docs/task-runner.md` and `docs/repository-tools.md` for the workflow and tool commands. Version history is in `docs/CHAGELOG.md`.
