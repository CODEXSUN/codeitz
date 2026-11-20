# codeitz 1.0.16

Apply the verified CodeShip explicit login-route wiring using the existing shared SDK/UI. Tenant-to-SA switching offers a fresh original login form; requested realm is sent to Platform and successful login returns to /. Failed credentials preserve the previous session. No grants, schema or dependency changes. Three regression tests/typecheck/build and tagged CI gate deployment. VPS only; local Docker/Cloudflare unchanged.

Local checks passed: 109 disposable PostgreSQL tests plus typecheck/build and three route checks. Deploy with the released selected update.sh --target hostinger; all further functional tests stay local. No migrations in this app release.
