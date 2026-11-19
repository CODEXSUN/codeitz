# Codeitz 1.0.9

The failed 1.0.8 workflow exposed a fixture isolation issue: the health test queried the unprovisioned default schema rather than its migrated fixture schema. Version 1.0.9 corrects that injection and adds an absent-default-schema regression. The old tag remains unchanged and is not deployable.

PostgreSQL recovery no longer relies on immediate startup failure/restart. Read-only preflight uses Framework's finite startup wait with an explicit transient classifier and a five-second probe query timeout. Credential/schema failures remain fatal. Idle pool errors are contained; request failures still reject, and dependency readiness reflects PostgreSQL independently of liveness.

Worker activity failures remain visible without poisoning later work. Chat snapshot reads are serialized/coalesced, task observers are isolated and the initial stream buffer is bounded. Tailwind scans the app frontend and imported shared UI sources. Docker defaults and the public contract agree on internal 4305 / loopback 14305.

Exact shared pins: Framework 51daaa2a7bee32d0a8eca806a2b0e8a765a3e1ac (0.2.0), UI e88945f101313051ded3557e14b0363a0a6ca906 (0.1.12). No migration files changed; native/Docker histories were read as fully applied. No real database seed/reset, workspace replacement, credentials/grants, scheduling policy or Docker deployment changes are part of this source release. Existing unrelated frontend extraction edits are excluded.

See supervisor-audit-20261119.md for actual tests, local installation limitations and hosted release evidence. CodeShip alone deploys after successful tagged CI and manifest verification. A source push is not a deployment.

## 1.0.10 — Whiteboard cards

Projects White Board uses static scene preview cards with shared hover/focus. Open cards to draw on their own record pages. Draft/status/revision saving is preserved; first-save state and hydration guard protect the scene. No database migration.

## 2026-11-19 — Responsive Codeitz rails, 1.0.11

App-owned mobile policy uses shared useIsMobile and AgentWorkspace visibility props. Below768px, both rails collapse and their actions appear in the existing MainLayout drawer, including tools otherwise absent from the desktop sidebar; Settings remains in its shared footer. Shared desktop breakpoint768px and above retains both56px rails. CSS hides mobile rails on first paint. No shared UI changes.

Actual browser E2E:360px document/canvas360px, both rails0px. All13 tool routes opened correctly and drawer closed after every selection. Settled768px document768/canvas346 with desktop sidebar and56px rails retained;1920px document1920/canvas1498. No JS errors or document overflow. Captured360/drawer/768/1920 screenshots in ignored .codeitz/mobile-fixed-*.jpg. Sidecar/package and unrelated extraction edits excluded from the release. No database changes.
