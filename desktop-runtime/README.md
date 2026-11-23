# Codeitz Desktop agent runtime — local milestone

This is the local Windows runtime in the main Codeitz repository, alongside the web app and native shell. Web and Desktop reuse public shared UI and the product modules under `src/shared`. Existing web and Desktop records remain in their existing databases; consolidation does not import, seed, merge, or migrate them. Installed configuration and legacy workspaces are retained.

## Ownership and storage

The native desktop shell calls a private loopback broker using a per-install token read from a current-user/SYSTEM protected configuration file. The web view does not receive database credentials or the broker token. This milestone represents one local OS operator; it is not a remote or multi-tenant agent service.

The new PostgreSQL instance and database are separate from existing applications. Permanent conversations, messages, provider thread/session/turn identities, approval events and worker outcomes remain in PostgreSQL. A restricted runtime role has no schema, migration, role-management or deletion rights. Explicit Kysely migrations are run using a separate private migration configuration; startup never migrates or seeds.

Run the explicit migration with `CODEITZ_DESKTOP_DATABASE` pointing to the private admin JSON, using `node desktop-runtime/migrate.mjs`. Start with `CODEITZ_DESKTOP_CONFIG` pointing to the private runtime JSON and `node desktop-runtime/server.mjs`. No password or token belongs in command arguments, source control or logs.

Runtime configuration fields: `database` (pg connection object), `token` (at least 32 characters), absolute `codexPath`, absolute canonical `workspaceRoot`, `port` (43405 by default), `allowedOrigins`, and `nodePath` for the native launcher. The broker binds only 127.0.0.1 and validates the exact Host, browser Origin and bearer token.

## Public desktop contract

All routes below except `/health` require the private native bearer token. Mutations require JSON.

| Method and path | Input | Result |
| --- | --- | --- |
| GET `/health` | — | Transport/database readiness; this is not worker sandbox readiness |
| GET `/api/runtime/state` | — | Conversations, messages, operations, worker subset, bounded event history and provider status |
| POST `/api/runtime/conversations` | `{title}` | Conversation record |
| POST `/api/runtime/conversations/:id/messages` | `{text,requestKey}` | Read-only chat operation accepted |
| POST `/api/runtime/workers` | `{conversationId,goal,requestKey}` | Awaiting-approval task with immutable digest and fixed workspace |
| POST `/api/runtime/workers/:id/approve` | `{digest}` | Explicit approval and one worker dispatch |
| POST `/api/runtime/workers/:id/reject` | `{digest}` | Rejected task, no provider dispatch |
| POST `/api/runtime/operations/:id/resolve` | `{digest,acknowledgement:"reviewed-no-replay"}` | Explicitly reviewed interruption, no repeated execution |

Records use snake_case database field names, including `provider_thread_id`, `provider_session_id`, `provider_turn_id`, `conversation_id` and `approved_at`. State polling is sufficient for this milestone; token-by-token streaming and paginated long-term history are future work. State returns at most 1000 records per collection.

## Agent permissions and recovery

The broker starts its own installed Codex App Server child. It enumerates effective configured MCP servers privately and explicitly disables each transport, verifies none remain enabled, disables apps/plugins/hooks/multi-agent features and web search, and rejects every server-initiated tool permission request. No other Codex process or existing desktop conversation is attached or terminated.

Chat uses the Codex read-only sandbox. Worker execution uses workspace-write with its exact fresh workspace, network disabled and temporary writable roots excluded. Standard Codex sandbox modes limit writes; they are **not** a claim that every other local file is unreadable. Instructions prohibit credentials and out-of-workspace work. The broker does not pass database configuration or passwords into agent input. Windows sandbox readiness must report `ready` before any chat or worker turn; there is no full-access fallback.

The approval digest binds the exact goal, canonical workspace and execution/network profile. Atomic conditional approval/rejection and a PostgreSQL unique running-operation constraint limit this prototype to one turn at a time. A session-scoped database ownership claim prevents a second broker from reconciling the first broker's active work; it is not a deployment scheduling lock.

Operation intent is durable before provider dispatch. Returned thread/session IDs are saved before starting a turn; the returned turn ID is saved immediately. On restart, exact completed provider history can reconcile a recorded turn without executing it again. An unknown outcome becomes `interrupted` with a durable recovery event and blocks new dispatch. The prototype deliberately has no “retry everything” or automatic replay of a mutating task.

An interrupted operation can be explicitly marked `reviewed` through the native confirmation UI and the resolve API. The broker must be idle, the digest must match, and a currently active provider thread blocks resolution. An explicit no-replay acknowledgement writes an audit event while preserving provider IDs, the workspace and the prior result. This permits a separately requested new operation; it never repeats the interrupted one. Repeating the same resolution request adds no duplicate review event. An unavailable provider history produces an error unless the provider explicitly reports that the local thread/rollout does not exist.

An empty provider thread may not have a durable rollout until its first actual turn; a locally saved empty conversation is not evidence of provider restart recovery. Acceptance must use a completed real conversation and the same provider thread after a process restart.

## Verification so far

- Explicit isolated Kysely migrations applied successfully.
- Seven focused tests passed: PostgreSQL-backed immutable approvals and rejection; concurrent task claims; chat provider-thread continuity and request-key deduplication; unknown-outcome no replay; completed-history reconciliation for both running and interrupted records; symlink escape rejection; explicit reviewed recovery with active-thread rejection, stable IDs, one audit event and no automatic execution; plus a separate environment-secret exclusion test. The latest batch creates/drops one uniquely owned test database and disposable schemas/workspaces; it does not compete with the live broker's ownership claim.
- Actual installed Codex stdio initialize/initialized/shutdown smoke passed with configured MCP tools disabled. No model turn was used for that smoke.
- The MSIX-bundled alpha reported `updateRequired`; the parent isolated the official standalone Codex 0.171.0 instead. Its readiness reports `ready`, and the independent audit verified native denial of outside-workspace writes, read-only writes and junction escapes while an inside-workspace write succeeds. See `../desktop-proof/windows-boundary-receipt.json`.
- Actual running broker negative probes passed: unauthenticated state 401, native bearer 200, foreign Origin 403, foreign Host 403, unsupported mutation content type 415, health 200. Record counts were unchanged. See `../desktop-proof/broker-security-receipt.json`.
- The parent verified a real read-only chat, native UI/broker process restart, and successful memory recall on the same provider thread. The parent also explicitly approved one real worker in the native UI and verified its exact single-file proof artifact. The parent owns the final deliberate interrupted-turn recovery/confirmation and final packaged-source audit; do not substitute fake-provider tests for those live checks.

No commit, push, release, cloud change or deployment is authorized by this candidate.

## Projects and named coworkers — next local milestone

The additive `20261121_agent_workspace_projects` migration introduces desktop-owned apps and coworkers. Existing conversations keep `app_id = NULL`; historical messages, tasks and provider identities are not reassigned. Grant the existing restricted runtime role SELECT/INSERT/UPDATE on `agent_apps` and `agent_coworkers` after the explicit migration. No application database import or source-record update occurs.

The optional `source` configuration contains only a reference to an existing protected credentials file and the exact local Codeitz origin. The read-only connector uses normal authenticated APIs to list projects, runner tasks, business work tasks and Todos. Their identifiers remain distinct: `codeitz-runner-task`, `codeitz-work-task`, and `codeitz-todo`. A task without a source project owner stays unassigned in the source. Linking it to a desktop operation is an explicit local planning reference, not a new source permission or an update to the original task.

The hierarchy is app → multiple supervisor conversations → named coworkers and task operations. Each coworker has its own persistent provider thread; capacity remains one active model turn at a time. A supervisor turn is read-only and receives bounded task/status context. No supervisor text or tool output starts a worker or grants approval automatically.

An app is registered from an explicit native folder selection. The backend rechecks the canonical Git repository root beneath configured `allowedRepositoryRoots`; it does not guess a repository from a source project label. Inspection uses local, non-writing Git commands with fsmonitor, hooks, pager and lazy fetching disabled. No commit, checkout, network fetch or worktree creation is part of a real task.

An approved repository worker writes into a fresh source snapshot, not the selected checkout. Its version-2 digest binds app, supervisor, coworker, optional namespaced task identity, repository, HEAD, dirty-content fingerprint, immutable baseline and goal. Recursive canonical serialization makes this digest stable through PostgreSQL JSONB key ordering; legacy version-1 digests remain unchanged. A stale repository or task reference requires a fresh preparation.

Snapshots include bounded tracked and untracked UTF-8 source. Git data, operator private folders, known credential/config filenames, private-key material, generated dependencies, binary files, links and oversized content are excluded and reported. These exclusions are not a comprehensive secret scanner or a claim that all other local files are unreadable. Copied AGENTS files stay byte-identical; the agent receives the canonical shared governance location as a read-only reference when their relative links do not resolve inside the snapshot. Source-only snapshots do not automatically install dependencies or reproduce every monorepo build environment.

Additional native routes:

| Method and path | Input | Result |
| --- | --- | --- |
| POST `/api/runtime/apps` | `{name,repositoryPath,sourceProjectOwner?}` | Explicit app/checkout binding |
| POST `/api/runtime/apps/:id/inspect` | `{}` | Current HEAD, dirty fingerprint, eligible count and exclusions |
| POST `/api/runtime/conversations` | `{title,appId?}` | App supervisor or retained unassigned legacy conversation |
| POST `/api/runtime/conversations/:id/coworkers` | `{name}` | A distinct named coworker |
| POST `/api/runtime/workers` | Existing fields plus `{coworkerId,taskReference?}` | Immutable snapshot approval |
| POST `/api/runtime/workers/:id/changes` | `{}` | Bounded text-file review manifest |
| POST `/api/runtime/workers/:id/apply` | `{digest:changeManifest.digest}` | Separately approved checkout publication and receipt |

Apply is a separate explicit user decision. It verifies the original Git/dirty baseline and exact reviewed file hashes, stages text, retains originals and uses create-only publication so another writer's new destination is not overwritten. On a conflict, rollback removes only unchanged bytes published by this attempt; concurrent edits and recovery originals are retained. Exact ACL/metadata preservation and immunity to a malicious same-OS-user filesystem race are not claimed.

Before any checkout effect, Apply commits its identity and manifest digest to PostgreSQL and writes a private intent file. An uncertain post-effect persistence failure remains visibly `applying` or `review-required` and cannot be blindly repeated. Startup may adopt a matching private receipt only after read-only verification of the exact target after-hashes. Otherwise explicit human inspection and the existing no-replay review acknowledgement are required. That acknowledgement permits a separately prepared task; it does not repeat the old Apply or claim all side effects were rolled back.

Local evidence includes real-Git/real-PostgreSQL JSONB approval, cross-chat/project guards, distinct coworker thread identities, preservation of pre-existing dirty text, separately reviewed Apply, and an injected failure after file publication followed by no-repeat/read-only reconciliation. Real model work against the chosen existing checkout and final Windows installation remain the parent supervisor's acceptance responsibilities.

The parent subsequently verified a real Documentation coworker against the explicitly chosen existing Codeitz checkout: only the reviewed new `docs/desktop-projects-guide.md` was published. The original 24 modified-file hashes, existing source tables and running services were preserved. This is a documentation task proof, not a claim that every source-only snapshot reproduces a full application build.

## Chat attachments and local Windows OCR

The additive `20261121_agent_workspace_z_attachments` migration adds desktop-owned attachment metadata, operation/attachment SHA links and a nullable operation reference array. Grant the restricted role SELECT/INSERT/UPDATE on `agent_attachments` and `agent_message_attachments`. No DELETE permission or source Codeitz table write is needed. The parent configures `attachmentsRoot` as a current-user/SYSTEM protected directory outside repositories; include that private directory alongside the agent database in recovery arrangements.

Only explicit user-selected bytes are accepted: PNG, JPEG, WebP and valid UTF-8 text, five unique files per Send and five MiB per file. Windows-native OCR runs locally. Upload/OCR does not itself start a model turn; explicit Send can supply the verified original image to Codex and the full bounded OCR/text as untrusted context. Unsupported PDF/Word and arbitrary file paths are not accepted.

| Method and path | Input/result |
| --- | --- |
| POST `/api/runtime/conversations/:id/attachments` | `{requestKey,name,mime,base64}` → ready draft metadata |
| GET `/api/runtime/conversations/:id/attachments/:attachmentId` | Scoped verified metadata and original bytes as base64 |
| POST `/api/runtime/conversations/:id/attachments/:attachmentId/remove` | Explicit unused-draft removal |
| POST `/api/runtime/conversations/:id/messages` | `{text,requestKey,attachmentIds?}`; at most five unique IDs |

Upload alone has a seven-MiB JSON request budget; ordinary APIs retain their 32,000-byte budget. Input bytes are counted before decoding and UTF-8 is decoded once, preserving split Tamil/Unicode sequences. Metadata text is explicitly a bounded preview; Send checks the full question/context/OCR/text budget and rejects over 128 KiB without discarding originals or silently truncating model input.

A stable upload request key reserves its UUID and expected content hash in PostgreSQL before filesystem staging. Same-key retries return the same matching upload; changed bytes/name/type conflict. Before any model dispatch, the user message, conversation relationship, attachment IDs and SHA links are durable. A lagging filesystem sent flag can be reconciled without deleting history or repeating the model turn. Sent attachments cannot be removed through a draft endpoint. Worker attachments are deliberately rejected; a coding task still needs its own explicit, immutable reviewed text goal.

Explicit removal of a failed draft can discard only its DB-owned, unsent, hash-matching incomplete stage. Foreign, linked, completed, sent or mismatched remnants are retained rather than deleted speculatively. Root paths, metadata and attachment files are checked against links/reparse escapes; this is not a guarantee against a malicious same-OS-user process.

Final standalone verification passed 23 tests, including legacy chat/recovery and worker approvals, Git/PG reviewed Apply with post-effect persistence failure, source API isolation, native OCR on a synthetic image, immutable message links, scoped preview, stable upload identities, pre-dispatch intent recovery and guarded incomplete-draft removal. Independent PG/HTTP tests additionally verified byte limits, Unicode, native-image dispatch to a fake read-only provider and authorization negatives. These local fixtures are not a substitute for the parent's final installed-native real-image Send acceptance.

## Bounded parallel coworkers — M4

The additive `20261122_agent_parallel_coworkers` migration replaces the original one-running-operation index with bounded slot and provider-lane constraints. It adds nullable execution/progress metadata and keeps all existing IDs, task states, approvals, version-1/version-2 digests and history. No new tables or runtime grants are required. Apply the migration explicitly before installing this runtime; startup still never migrates or seeds.

Capacity defaults to **three total model turns**, shared by workers and read-only supervisor chats. A trusted `maxConcurrentTurns` configuration may reduce this to one or two; values above three are rejected. Two coworkers and a supervisor can work concurrently. There is one turn at a time per named coworker and per supervisor conversation, even before a new provider thread ID exists. Legacy unnamed workers remain serial within their own conversation.

Each admission reserves a separate numeric slot before asynchronous preparation. A full pool rejects additional execution requests; it does not create an automatically executing queue. Each worker still requires explicit approval and receives its own immutable snapshot. Repeating an identical approval for an already running/completed operation returns its existing record and never dispatches another turn.

`provider.capacity` reports `limit`, `active`, `available`, `activeWorkers`, `activeChats`, `uncertain`, `maintenance`, `reviews` and the scoped reserved operation IDs. Reservations include snapshot preparation and uncertain provider-active work; this is not a billing or token counter. `provider.busy` remains informational and no longer means every other coworker/chat must be disabled.

Operation `progress` is durable `{phase,message,updatedAt,sequence}` metadata derived from actual preparation, provider start, scoped item activity, stop requests and terminal outcomes. No percentage is invented. Thread and turn IDs are both checked before progress is attributed; a delayed notification from an earlier turn cannot update a newer turn on the same persistent coworker thread. Completion/review/rejection progress is absorbing. Terminal finalization locks the operation row and saves one assistant message and one completion event, including when read-only reconciliation races a delayed original response/error.

An uncertain worker blocks its own coworker lane, not independent coworkers or its read-only supervisor. An uncertain supervisor turn blocks that supervisor conversation. An uncertain Apply blocks further coding for its canonical repository across legacy/app aliases. None of these states grants a retry permission.

If a request times out while its provider thread might still be active, the reserved slot remains occupied. Read-only history inspection can release it only after a verified terminal/inactive thread or a confirmed dead owned provider. The inspection is single-flight, throttled and bounded; state polling launches it in the background rather than waiting on provider RPCs. It never resubmits a turn. A fresh broker marks unfinished work for review and does not automatically replay it.

`POST /api/runtime/operations/:id/interrupt` requests a stop for that operation's stored provider thread/turn only. The request does not accept caller-supplied provider IDs and never kills the shared child to stop one coworker. A normal response is `{requested:true,operationId,providerThreadId,providerTurnId}`. Progress becomes `interrupt-requested`; capacity stays occupied until terminal/inactive evidence arrives. Already terminal operations return a no-op response. A stop does not claim that partial edits were rolled back.

Reviewed Apply and recovery acknowledgement remain exclusive maintenance actions and require model admissions to be idle. Completed snapshot diffs can be reviewed while independent workers run, but an in-progress diff review cannot race Apply. Apply rechecks canonical repository uncertainty and the complete original baseline. After one sibling snapshot is applied, another stale sibling cannot overwrite it; a new preparation/review is required instead of automatic merging.

Local package tests cover admission limits, same-lane rejection, stale-slot release, protocol multiplexing and scoped interrupts. PostgreSQL regressions preserve legacy conversations, snapshots, uploads and reviewed Apply. Independent disposable tests additionally cover two coworkers plus a supervisor, unknown-active capacity retention, canonical aliases, strict progress routing and late terminal-response races. Real simultaneous model-worker acceptance is parent-owned; these tests do not claim it has run until that evidence is recorded.

## Live task activity and approved verification — M5

`GET /api/runtime/operations/:id/activity?after=0&limit=100` returns `{items,cursor,hasMore}` through the authenticated native broker. Cursor IDs remain strings. Replay reads only this operation's public `activity:*` events; it never resumes or repeats a model request. Only actual agent-message deltas and generic tool statuses are published, not reasoning, command arguments or raw tool output. Common credential patterns are redacted, each activity is bounded to 2,000 characters, and a task retains at most 512 public activity entries. This is bounded presentation, not a guarantee that arbitrary prose cannot contain a secret. The final saved assistant message remains separate from the incremental feed.

Apply the additive `20261122_agent_verification_activity` migration explicitly before startup. It adds nullable `agent_operations.verification_profile`, the forward-only `agent_verifications` table and an operation/cursor index. Grant the restricted runtime role SELECT, INSERT and UPDATE on the new table; no DELETE or schema permission is needed. Existing task IDs, approvals and version-1/version-2 digests remain unchanged when the optional profile is absent.

New worker preparation may select `verificationProfile: 'desktop-runtime'` only when the trusted runner accepts the explicitly selected repository. The full fixed profile, commands, pinned images, exclusions and automatic-after-code permission are included in the initial task approval digest. Successful coding prepares and runs those approved checks once. There is no automatic Apply, commit, push or deployment. Tasks without a selected profile remain not checked; unsupported apps are not presented as verified.

`state.verificationProfiles` contains trusted profile metadata; each app's `verificationProfiles` lists eligible IDs. `state.verifications` contains durable attempts and their exact output/profile association. `POST /api/runtime/workers/:id/verification/prepare` prepares a manual approval, and `/verification/approve` accepts only `{digest}`. Manual checks are also available for supported completed legacy tasks without retroactively changing their execution approvals or Apply policy. A failed or interrupted attempt needs a fresh explicit approval; startup marks unfinished checks interrupted and never replays Docker work.

Before invoking the parent-owned runner, the runtime records approved profile/output/workspace intent. A passing receipt must contain every declared check exactly once with passing status and exit code zero, matching operation/workspace/manifest/profile/image identities and verified cleanup. Output is recomputed after checks and again before Apply. New profile-backed tasks cannot Apply a changed or unverified output. Real local Docker and installed-native acceptance are parent-owned; the backend's fake-provider/PostgreSQL tests alone do not establish that acceptance.
