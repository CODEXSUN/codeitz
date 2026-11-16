# Governance Audit

Codeitz checks `apps/`, `devkit/`, `addons/`, `foundation/`, `packages/`, and Database Manager without changing their files.

Products require `contracts/`, `src/api/modules/`, `src/web/modules/`, `tests/`, and `docs/`. Add-ons, foundations, and packages require only `contracts/`, `src/`, `tests/`, and `docs/`.

The audit flags the old `src/modules/` location only for products and verifies that each owner's AGENTS.md links only to central governance. Linked or unreadable paths are not silently accepted.

Run from the Codeitz repository root:

`npm run audit:governance`

Set `CODEITZ_WORKSPACE_ROOT` or pass a workspace path after `--` to audit a different checkout. The default is the containing workspace, not Codeitz's own directory.

The frontend's Run audit button sends `POST /api/audit/run`. The backend and command line use the same `runGovernanceAudit` runner. The request cannot choose commands or override the workspace. Every run checks files afresh.

The product checklist loads from `GET /api/audit/products`; it currently lists 10 products. Each start icon runs only that product. Run all products checks the list sequentially. `POST /api/audit/products/run` streams actual check completion events to the frontend; an optional owner must match a discovered product. There are no arbitrary paths or shell commands.

Each product has nine checks: central governance, five required folders, the outdated module location, AGENTS.md, and its central link. Rows show completed checks, pass/violation/error status, timestamps, and expandable details. A missing instruction file leaves the link check unverified. Results remain in the page only and checks run on request, not continuously in the background.

The Audit checks tab explains each check and lets users select a subset. All nine start selected. Product runs send the selected check IDs; progress counts only those checks. Empty, unknown, or duplicate selections are rejected. A subset pass is labelled Selected checks passed and does not certify excluded rules. Full workspace audit always runs all rules. Selections remain in the current page session only.

The full workspace audit and individual product audits reuse the same owner-check implementation. Run workspace audit still covers add-ons, foundations, and packages; product-only runs do not claim a full workspace result.

The JSON report contains product and total owner counts, completion time, duration, and violations with an owner, rule, and message. Command exit codes: 0 passes, 1 reports violations, 2 means the audit could not finish. The API returns 200 for completed audits, including violations, and 503 if it cannot finish.

`npm run verify` runs type checks, the frontend build, tests, and the governance audit. This developer command is not exposed as a browser command runner.

This is a callable, read-only audit module. Scheduling, saved reports, runtime MCP permissions, and checks of application behavior are not implemented. The checks mirror the current folder guide; update them when its rules change.
