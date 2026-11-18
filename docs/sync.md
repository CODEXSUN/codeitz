# Local and cloud sync

Default workflow: **get cloud project data for local development**. Production stays unchanged. Open `/sync`, choose a small connection card, then select a project on `/sync/connections/{id}`.

- **Project information** gets/sends its name, purpose, order and active status.
- **Module definitions** gets/sends module details, APIs, actions, events, tables and fields. Select one module or all modules for the chosen project. It does not copy business/customer records, tasks, credentials or module approval.
- **Get from cloud production** requests selected data directly from cloud, even if cloud cannot reach the local computer. It creates local drafts, which you review and confirm before local records change. Remote project/module records are unchanged; the cloud keeps an export activity entry.
- **Send to cloud production** is off by default. Enable manual sending in connection settings, preview the exact selected records, then confirm Send. Only this selection is queued. Cloud receives drafts and must separately confirm them. Local edits never send automatically, even when manual sending is enabled.

Cloud is production; local is for testing. This workflow is enforced in the service and queue, not just hidden buttons. New captures are held locally. Retry and Check transfers cannot release held data. Delivery requires an explicit release/selected send and an enabled sending permission. Receipt checks continue for already-sent records. A reviewed snapshot cannot be sent after local data changes without another preview. Conflicts still require an explicit destination choice.

## Connection setup

Create a connection on each Codeitz with allowed project owners. The new form pre-fills Cloud production, `https://codeitz.codexsun.com`, `apps/platform`, and `CODEITZ_SYNC_REMOTE_SECRET`; these are editable defaults, not a real connection or network request. Existing project choices are checkboxes, and each detail page lists permitted projects and available local module IDs. Label the reciprocal cloud-side connection Development workspace.

The receiving instance issues an app token and secret once. Put that token in the sender's connection settings and its secret in the sender server's private `.env` (for example `CODEITZ_SYNC_REMOTE_SECRET`). The secret setting name references that environment value. Repeat the reciprocal setup so local pulls can authenticate with cloud. Keep secrets out of URLs, prompts, activity and browser storage. Receiver secrets are hashed. Disable a connection to revoke access. Independent instances need distinct persisted sync identities; a cloned database also clones its identity and same-identity peers are rejected.

Both instances must run the updated API before using Get from cloud. Codeitz 1.0.2's original exchange does not include the pull endpoint. Codeship owns deployment. Default secret bindings are in the app container contract; additional named secrets need equivalent container environment bindings.

## Save modes and review

Incoming data always uses Draft → Confirmed, separate from business status and module approval. Incoming drafts live in `sync_inbox`, not the live project/module tables. Review shows current and incoming values. Confirm applies the aggregate atomically; Reject keeps local values. Changed current fingerprints prevent stale reviews. Existing different values produce a conflict; explicitly choose incoming to replace current values, or Reject / keep local. Deletion drafts show the effect on child records. Project confirmation does not create folders, install dependencies or execute code. Confirm the parent project before module drafts when necessary.

`sync_policies` lists `projects`, `project_modules`, `module_details`, `module_api_routes`, `module_actions`, `module_events`, `module_dependencies`, `module_tables`, and `module_table_fields` as Draft → Confirmed. Project owner paths identify projects across instances; module/child IDs are preserved and local integer project keys remain local. Children travel in a module change set. The supported local write paths update the parent revision with child edits; direct child-only database writes are not a sync API. Sync does not transfer module owner approvals or authorize coding. Changed module revisions need reapproval.

## Durable records and migration

Migration `20261118002000_project_module_sync` adds instance identity, connected apps, policies, baselines, activity, delivery queue and inbox. Existing data is baselined without export. Deferred PostgreSQL triggers capture supported saves transactionally after child changes; rollback creates no activity/delivery. Events retain origin/event IDs, record identity, action, previous fingerprint, snapshot and time. Duplicate IDs cannot change payloads; incoming application updates the baseline without echoing it back.

Migration `20261118003000_sync_direction_controls` adds production/development labels, sending permission off by default, and per-delivery send approval. It holds previously queued/failed unsent deliveries without deleting them or changing project/module data, credentials or history. Already-sent records can still poll receipts. Automatic new captures use held state. Explicit old initial-export API now also requires manual confirmation and sending permission.

Outgoing states include held (local only), queued, awaiting_confirmation, confirmed, rejected, failed and conflict. Incoming states include draft, confirmed, rejected and conflict. The worker checks every 15 seconds; failed delivery retries after 30 seconds and interrupted leases resume after one minute. UI lists 100 records, prioritizes pending drafts and shows database-wide counts. All records remain in PostgreSQL across refresh/restart. Confirmations retain actor/time in the inbox; source and confirmed incoming changes appear in Activity.

## API and verification

See `/api/docs`. New local actions beneath `/api/v1/sync`: POST `/connections/{id}/preview`, `/connections/{id}/pull`, `/connections/{id}/send` and `/queue/{id}/send`. Selection is project owner, project/module/all kind and optional module UUID. Send requires explicit confirmation and the expected preview fingerprints. Authenticated POST `/exchange/pull` returns only scoped project/module snapshots; POST `/exchange` stages drafts and GET `/exchange/{eventId}` returns receipts. Authorization is `token APP_TOKEN:APP_SECRET`. This is not a general remote SQL or remote execution API.

Tests use isolated PostgreSQL schemas and real loopback HTTP servers. They verify pull-only defaults, cloud records unchanged by pull, held local edits, explicit selection, stale previews, two-way draft confirmation, scope/credentials, conflicts, rejection, rollback, retries, stable IDs, deletion and reopen reads. Run the PostgreSQL-enabled sync suite plus typecheck/build and routing checks. Real cloud requests occur only when you choose them in the frontend after connection/deployment setup.


Docker Desktop peers may use `http://host.docker.internal:4305` to reach the native local server. The HTTP exception is limited to loopback and this explicit Docker bridge hostname; VPS peers continue to use HTTPS.
