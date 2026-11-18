# Local / Docker sync verification — 2026-11-18

Connected native development Codeitz at http://127.0.0.1:4305 and Docker production Codeitz at http://127.0.0.1:4451. Existing VPS connection was left unchanged. Allowed scope is devkit/codeitz. Both new connections are active with manual sending OFF.

## Connection pages

- Local: /sync/connections/fce39a8b-2026-45e6-a730-f18cc84c4a72 — Docker production · 4451.
- Docker: /sync/connections/0bb66b17-77c1-4239-b2de-e3a9ffeb0136 — Local development · 4305.
- Docker reaches native Codeitz through http://host.docker.internal:4305. This explicit Docker Desktop hostname is allowed for development HTTP; arbitrary remote HTTP remains rejected.

Receiver app secrets are hashed in each Codeitz database. The Docker peer secret for local outgoing requests is in native Codeitz's ignored .env. The reciprocal local peer secret is in Codeship's encrypted deployment environment and injected into Docker on replacement. No credentials are included in this document or source control.

## Issues found and corrected

1. The copied Docker PostgreSQL database shared the native instance's sync identity. Rotated only Docker's instance identity; business records and historical events were not rewritten. Independently deployed/cloned instances need distinct identities.
2. Docker bridge HTTP was rejected by the URL validator. Added only host.docker.internal to the development exception and verified it with a regression test; HTTPS remains required for arbitrary remote peers.
3. This deployment's authoritative settings come from native Codeship at port 4325. Saving the secret only in Docker Codeship's independent registry at port 4450 did not inject it into the application. Saved the specific secret in the authoritative registry and reapplied through Codeship.

Codeship's targeted Codeitz update succeeded, kept PostgreSQL and workspace data, skipped repeat copying/seeding and verified the healthy replacement. Other applications were not replaced. Existing connection IDs and the separated Docker identity survived replacement.

## Live checks passed

- Both readiness endpoints and direct Sync/detail frontend URLs returned successfully.
- Creating a local temporary module and processing the queue did not automatically send it.
- Explicitly sent only that reviewed module; Docker received a draft and had no live module until confirmation.
- Confirmation preserved the module and child IDs/specification; no module final approval or coding approval was created.
- Replaying the same event reused the receipt; a wrong app secret was denied.
- Editing the temporary Docker module and requesting it locally created a local draft. Local data stayed unchanged until explicit conflict review/confirmation. The pull did not modify Docker's record.
- Docker initiated a pull from native Codeitz, proving reciprocal credentials and host bridge routing; its draft was explicitly confirmed.
- Project information was pulled as a local draft and rejected to preserve the existing project settings.
- Delivery/confirmation history remained in PostgreSQL.
- Temporary verification modules were removed from both instances through reviewed deletion drafts. Verification activity remains as audit evidence.

At completion both connections have sending OFF. No real project settings, existing modules, owner approvals or coding tasks were changed. No VPS connection or deployment was executed. This verifies the sync paths described above, not unrelated app features or a VPS deployment. The copied Docker profile intentionally pauses automatic background scheduling; manual transfer processing was used during verification.
