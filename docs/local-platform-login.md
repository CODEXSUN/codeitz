# Local Platform login — 22 November 2026

Native Codeitz at `http://127.0.0.1:4305` uses the same Platform browser adapter, access gate and tab-scoped client pattern as the cloud release. Sign in at `/sa/login` for the existing tenant owner, `/admin/login` for an authorized administrator or `/login` for an authorized user. Roles and access remain Platform-authoritative; displaying a login form does not grant access.

## Wiring

- `src/api/server.ts` registers the shared SDK browser adapter and protects app APIs with verified Platform scope and workspace permissions. Authentication availability and workspace scope are documented in OpenAPI.
- `src/web/platform.tsx` composes the shared login/password-change gate using `appBrand`. `platform-client.ts` supplies the tab selector and CSRF headers; app API callers and task/chat fetch streams use it.
- `src/web/main.tsx` mounts application and live streams only inside the access gate. `app.tsx` passes the actual session user and logout callback to the shared user menu. The earlier menu had no logout callback.
- Login, loader, header and favicon keep the black `>_` icon in light and dark modes.

Private configuration is in ignored Codeitz and native Platform `.env` files. Platform's service allowlist adds only `http://127.0.0.1:4305`; its existing tenant and all other targets are preserved. The service was registered and admitted with Platform's existing native operator commands, without migrations. Only the existing owner received Codeitz workspace read/manage permissions through Platform's authenticated API. No account or password was created or changed.

For this local-only integration, Codeitz uses reviewed app-local dependency snapshots under `.codeitz/platform-dependencies`: SDK 0.1.12 at `ccff028cc970174ed9283beca07834e5290b2bfd` and the previously verified UI 0.1.24 loader companion. Package and lockfile references identify these local snapshots. Shared workspace SDK/UI checkouts were not edited. Preserve those ignored dependency folders while using this local setup; publishing requires a separate reviewed dependency/release step.

## Verification

- Typecheck and frontend build passed. The emitted drawing dependency guard remains active.
- Mocked Platform checks passed for light/dark login, refresh, logout, refresh after logout, tab headers and the new icon.
- Fresh browser sessions against the real native services passed existing-owner login, verified workspace access, refresh, successful logout and subsequent `401` workspace rejection in both themes. Tests logged out their own sessions and made no business-data changes.
- Before/after hashes matched for every Codeitz table: **55 tables, 4,917 records, zero changed tables**. Database configuration, IDs, links and histories are unchanged.
- Native Platform was restarted in API-only runtime mode, without development seeding or resets. Native Codeitz is running with Platform authentication enabled. Docker listeners/services were not changed. No commit, push or deployment.

Private local evidence is under `.codeitz/`: `auth-registration-receipt.json`, `auth-admission-receipt.json`, `auth-owner-receipt.json`, `auth-browser-receipt.json`, `auth-real-receipt.json`, `auth-records-before.json`, `auth-records-after.json`, and `auth-build.log`. No credential values or session cookies are stored in these receipts. Configuration recovery copies remain in ignored `.codeitz/auth-before/`.

## Published dependency closure

The earlier local-only snapshots described above are historical. Version 1.0.21 uses standard sibling dependency references with immutable published SDK 0.1.17 (`c9eb2b1c3b33f27783b5a14f19564870b26f5fc3`) and UI 0.1.27 (`2c10ff04b63fa9b4a851eae351f5da41b89d3af8`). No canonical shared SDK/Platform source was edited for this closure. The direct browser client uses the published unified session/CSRF implementation. Existing identity/grant/host checks remain; this is not a new shared-session continuity or OIDC migration certification.
