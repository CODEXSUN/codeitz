# Codeitz Desktop local preview

This isolated preview uses Tauri 2, React/TypeScript, and the existing public shared UI. It is an unsigned **debug development preview**, not a published product release. The existing Codeitz web/Docker application and records are not changed.

## Start and data

The native window connects only to the local Codeitz broker on `127.0.0.1:43405`. It reads its private configuration from `CODEITZ_DESKTOP_CONFIG`, or `%LOCALAPPDATA%/CodeitzDesktop/runtime.json`. Configuration is never bundled or returned to the web interface. The broker entry is selected from `CODEITZ_DESKTOP_SERVER` or the configuration's `serverPath`; `nodePath` identifies the installed Node runtime.

This preview requires the prepared local PostgreSQL Docker container and the source-side broker directory to remain available. The desktop installer currently packages the native window and interface only. Parent-owned `desktop-tools` scripts prepare/start/install the complete local preview without embedding database credentials or Codex authentication.

## Safety boundary

- The web interface has no direct broker token, shell execution, arbitrary native filesystem API or remote page loading.
- Rust proxies only the explicitly allowlisted conversation/worker routes and methods to the fixed loopback broker, with redirects and system proxies disabled.
- Chat is read-only. Preparing a worker does not execute it; the user must approve the displayed goal and isolated workspace. Backend approval digest and concurrency enforcement remain authoritative.
- Closing/reopening the window reconnects to saved broker/database state. The UI preserves the selected conversation as a device preference. Uncertain interrupted work is displayed; it is never silently replayed by the interface.
- Interrupted chat and worker operations show their goal, workspace, result and saved provider identifiers. After inspecting that evidence, the user can explicitly acknowledge the interruption and mark it reviewed. This action only records review; it cannot retry or approve another operation.
- A Windows Codex sandbox that is not ready blocks execution. Genuine runtime/configuration failures remain visible.

## App and coworker workflow

The Apps rail connects an explicitly selected local Git repository to a desktop app record. Its folder-only native picker exposes no arbitrary filesystem or shell interface. The broker validates canonical Git identity before registration. An existing local Codeitz project can be linked by its canonical owner; names never infer ownership.

Each app can have multiple named supervisor chats and each chat can have named coworkers. The existing Codeitz project, runner task, business task and To-do catalog is read-only. An unassigned task stays unassigned; its namespaced link does not change the source record or start its runner.

Worker approval binds the goal, coworker, optional task link and captured repository state. A repository worker operates on an isolated snapshot first. Completed changes must then be reviewed and acknowledged separately before applying the exact manifest to the actual repository. Neither approval commits, pushes or deploys. Interrupted-operation review remains independent and cannot replay work.

The icon rail offers Apps, supervisor Chats, Tasks and Settings; the adjacent sidebar can be collapsed. These views compose the existing public shared UI controls rather than introducing another design system.

## M4 workspace and bounded coworkers

The slim app header shows the current conversation and broker-reported capacity. A single bottom composer switches between **Chat** (read-only supervisor) and **Task** (prepare a coworker proposal). Task mode selects a coworker and optional read-only source task link through the composer controls. It never executes on preparation: the review drawer shows the exact goal, repository snapshot and digest before **Approve worker**. There is no second goal editor beside the conversation.

The M4 broker contract shares three active model slots between workers and supervisor chats, with one active turn per coworker and one per supervisor chat. The frontend uses the returned capacity and operation identities rather than treating all activity as a global busy flag. Full capacity leaves proposals awaiting explicit approval; there is no automatic queue. Interrupted workers block their own lane; interrupted chats block their own supervisor. An unresolved repository apply blocks task approval for that repository, while unrelated read-only discussion can continue. The backend remains authoritative for every decision.

Cards show actual phases, latest activity and verified outcomes; no percentage is invented. Scoped Stop requests reference only a stored operation. A requested stop is not described as a completed stop or an undo; its slot remains reserved until the backend verifies the outcome. Apply and recovery are conservatively disabled while any model turn or uncertain reservation is active. Manifest inspection also retains the preview's conservative all-idle gate.

The left and right drawers preserve their mounted content, support keyboard focus/Escape and respect reduced motion. The right drawer starts closed at narrower desktop widths. Shared scrollbar styles are reused without local scrollbar skins. The conversation follows live content only while pinned to the bottom; manual reading is preserved, and a bottom-arrow badge counts actual message/progress revisions without counting unchanged polls. Coworker replies are labelled through their persisted operation link.

M4 frontend evidence is mocked, local and separate from native/model acceptance: independent approval controls for two running coworkers, full/uncertain capacity, lane-scoped interruption handling, filtered task ownership, actor labels, stable unread counts, drawers, light/dark 900/1360 layouts and all attachment/retry regressions pass. Native real-model overlap and installation remain parent-owned checks.

## Chat attachments

The integrated shared composer uses Enter to send, Shift+Enter for a newline, and an IME composition guard. User messages align right and agent messages left. Files are selected through the shared FileUpload control; staging and local OCR do not send anything to a model. Only explicit Send includes conversation-scoped opaque attachment IDs.

PNG, JPEG, WebP and UTF-8 text are supported by the candidate contract, with five files of at most 5 MiB each. The backend and fixed local Windows OCR helper validate actual content. The desktop sends selected File bytes, never a browser-provided operating-system path. Image previews use bounded authenticated native proxy responses and local blob URLs. Previously staged drafts require explicit selection or removal; sent history is not deleted by queue cleanup.

Upload retries keep the FileUpload item's request key. A send whose transport outcome is unknown keeps the exact request key, text and selected IDs for explicit retry, preventing an accidental second turn or altered replay. Conversation switching is held while selected files need sending/removal. No attachment grants worker or tool permission.

The native proxy gives only attachment staging a 7 MiB JSON request cap and 60-second OCR timeout. Other requests keep 64 KiB and 15 seconds; scoped preview responses are bounded to 7 MiB. The source-preview backend and its compiled local OCR helper must remain available. Clipboard image paste, PDF/DOCX and external OCR are not implemented.

The integrated browser proof mocks the native/backend boundary; it verifies controls, staging retry, uncertain-send retry, image history preview, alignment, theme and recovery. It does not certify native image validation, actual OCR or a real model response; those remain separate parent-owned acceptance checks.

## Local verification

- `npm run build`: TypeScript and Vite production assets.
- `npm test`: built-asset Edge fixture with a mocked native boundary; tests restore, explicit approval, preference recovery and overflow. It never invokes a real provider/worker.
- `cargo test --manifest-path src-tauri/Cargo.toml`: native proxy allowlist negative/positive cases.
- `npm run desktop:build`: local debug NSIS installer using embedded assets; requires Rust/MSVC/WebView2.

The browser test uses an existing local Playwright installation, overridable through `CODEITZ_DESKTOP_PLAYWRIGHT`. Full real-provider/restart acceptance is recorded separately by the parent supervisor. Build/test evidence does not by itself certify that acceptance.

The shared UI dependency is a local reference to the clean approved UI24 checkout. No shared source is copied, changed, published or implicitly upgraded by this preview. A future release needs a reviewed portable dependency pin and signed distribution plan.


## M5 focused task and verification preview

The left inbox groups actual task states. The center keeps one conversation/composer and the focused task's recorded stage flow. The right drawer has Plan, Changes, Checks and Activity tabs. Public activity is read with an operation-scoped replay cursor; reconnecting never dispatches or resumes model work. Only safe public output/status labels are rendered, never provider reasoning or raw tool payloads.

The optional trusted desktop-runtime pilot is offered only for repositories listed by the backend. Its immutable metadata, pinned images, checks, exclusions, isolation and hash appear in the initial task approval. Approval includes one automatic fixed check run after that task; choosing a profile or polling starts nothing. Manual checks/retries need their own scope approval. Legacy unconfigured tasks remain honestly Not checked and retain their original policy.

Profile-backed Apply is held until a valid receipt matches the task's exact output and profile. All Apply actions remain explicit and wait for model turns, unknown reserved slots and verification/review leases. Failed, pending, interrupted or stale receipts cannot silently pass. Verification never commits, pushes, deploys or automatically applies changes.

M5 local evidence is mocked built-asset Edge testing, plus pure replay/receipt tests and three native proxy tests. The preserved attachment/OCR-queue, IME, retry identity, restore/recovery, manual-scroll/unread and keyboard drawer checks also pass. The desktop agent did not run a real model, Docker check, installed app or Apply; native/provider/Docker pilot acceptance belongs to the supervisor and is recorded separately.
