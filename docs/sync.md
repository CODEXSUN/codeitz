# Projects and Modules sync

Open `/sync` from the tools rail. Scope is project records and module definitions, including API routes, actions, events, dependencies, tables and fields. Incoming data always uses **Draft → Confirmed**. Sync state is separate from business status and module final approval. Confirming a project record does not create folders, install an app or execute code.

## Connect local and cloud

1. On each instance, create the other instance under Connected apps. Set its HTTPS server origin (loopback HTTP is supported locally) and allowed project owners, such as `apps/platform`.
2. Copy the incoming app token and secret shown once by each instance. The receiving instance stores a hash of its secret, not the plaintext.
3. On the sending instance, configure the other instance’s token. Put the other instance’s secret in the sender’s private `.env`, for example `CODEITZ_SYNC_REMOTE_SECRET`, and enter that variable name in the connection. Repeat in the reverse direction. Separate connections can use separate variable names.
4. Save both connections. Existing records are not automatically exported: select Queue initial snapshots explicitly. Confirm the project draft before its module drafts on the destination.
5. New edits queue automatically for active connections within the project scope. The worker checks every 15 seconds; Process queue runs due work immediately. Retry / check receipt makes a selected delivery due immediately.

Token/secret authentication applies only to `/api/v1/sync/exchange` and its receipts. Connection management and confirmation remain under existing local/same-origin protection. Cloud confirmation requires the existing trusted local access/proxy arrangement; this feature does not add a public browser login. Disable a connection to stop delivery and reject its credentials. Create a replacement connection to issue new credentials. Each instance needs its own persisted sync identity; cloning a database also clones that identity, so independently initialize sync identities before connecting cloned instances. Same-identity peers are rejected rather than silently discarding changes. Credentials are not placed in event payloads, activity logs, browser storage or URLs.

## Table save modes

`sync_policies` seeds Draft → Confirmed for `projects`, `project_modules`, `module_details`, `module_api_routes`, `module_actions`, `module_events`, `module_dependencies`, `module_tables`, and `module_table_fields`. A project is identified across instances by its owner path; module and child IDs are preserved. Local integer project keys remain local. Module children travel in one atomic module change set. Existing module write paths update the owning module revision in the same transaction; child-table writes outside those paths are not a supported sync API.

Incoming drafts live in `sync_inbox`, not in the live project/module tables. Review shows current and incoming values. Confirm applies the whole change set, records your decision and time, and acknowledges it. Reject keeps local values. A changed current fingerprint prevents stale reviews. When both sides differ, Confirm marks a conflict; explicitly choose incoming values to overwrite, or Reject / keep local. Deletion drafts require review and show that child records will be deleted. Initial snapshots of different existing records also require conflict resolution.

Sync confirmation does not transfer a module's owner approval, create coding approval or execute recorded actions. Existing module approval becomes stale if synced content changes its revision.

## Reliability and records

Migration `20261118002000_project_module_sync` adds connected apps, table policies, durable instance identity, row fingerprints, activity/outgoing delivery records and incoming drafts. Existing records are baselined without sending them. No app credentials or approvals are seeded. Deferred PostgreSQL triggers capture a supported project/module save after its child changes, within the same transaction. Rollbacks create neither an activity nor a delivery. Ordinary project/module create/update/delete is captured; changes to unrelated Codeitz modules are outside this first version.

Each event retains its UUID, originating instance, record ID, project, action, previous fingerprint, full snapshot and time. The receiver deduplicates `(origin,event ID)` and rejects a changed payload using an existing event ID. Applying an incoming event updates the baseline without echoing it back. Outgoing records distinguish queued, awaiting_confirmation, confirmed, rejected, failed and conflict; incoming records distinguish draft, confirmed, rejected and conflict. Failed sends retry after 30 seconds, receipt checks after 15 seconds, and a database lease lets interrupted deliveries resume after one minute. Activity and queue records persist in PostgreSQL across refresh/restart. The UI shows 100 entries per list, prioritizes pending incoming drafts so they remain reviewable, and shows database-wide pending/failure counts; credentials and all historical records remain in PostgreSQL.

OpenAPI is under `/api/docs`. Local management API: GET `/api/v1/sync`; POST/PATCH `/connections`; POST `/connections/{id}/initial`, `/dispatch`, `/queue/{id}/retry` and `/inbox/{id}/review`, all beneath `/api/v1/sync`. Connected-app API: POST `/api/v1/sync/exchange` with an event, and GET `/api/v1/sync/exchange/{eventId}` for a receipt. Authorization is `token APP_TOKEN:APP_SECRET`. The current event contract supports project/module snapshots and tombstones only. There is no general remote SQL or arbitrary action execution.

## Checks

Run `CODEITZ_TEST_POSTGRES=1 node --test tests/sync-postgres.test.mjs` with the shell-appropriate environment syntax. Tests create isolated PostgreSQL schemas and two loopback HTTP servers, not cloud records. Verify migrations, typecheck/build, two-way draft confirmation, conflict/reject, duplicate delivery, rollback, offline retry, deletion, scope and credential denial, and reopened services. Connect real local/cloud instances through the setup above after deployment.
