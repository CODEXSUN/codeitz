# Codeitz 1.0.9

The failed 1.0.8 workflow exposed a fixture isolation issue: the health test queried the unprovisioned default schema rather than its migrated fixture schema. Version 1.0.9 corrects that injection and adds an absent-default-schema regression. The old tag remains unchanged and is not deployable.

PostgreSQL recovery no longer relies on immediate startup failure/restart. Read-only preflight uses Framework's finite startup wait with an explicit transient classifier and a five-second probe query timeout. Credential/schema failures remain fatal. Idle pool errors are contained; request failures still reject, and dependency readiness reflects PostgreSQL independently of liveness.

Worker activity failures remain visible without poisoning later work. Chat snapshot reads are serialized/coalesced, task observers are isolated and the initial stream buffer is bounded. Tailwind scans the app frontend and imported shared UI sources. Docker defaults and the public contract agree on internal 4305 / loopback 14305.

Exact shared pins: Framework 51daaa2a7bee32d0a8eca806a2b0e8a765a3e1ac (0.2.0), UI e88945f101313051ded3557e14b0363a0a6ca906 (0.1.12). No migration files changed; native/Docker histories were read as fully applied. No real database seed/reset, workspace replacement, credentials/grants, scheduling policy or Docker deployment changes are part of this source release. Existing unrelated frontend extraction edits are excluded.

See supervisor-audit-20261119.md for actual tests, local installation limitations and hosted release evidence. CodeShip alone deploys after successful tagged CI and manifest verification. A source push is not a deployment.
