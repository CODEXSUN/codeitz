# Agent chat

Open `/agent-chat` from the shared Codeitz menu. Choose an actual workspace project and Explore, Plan or Review; write a message or use a starter prompt. The bottom composer, messages, history drawer, activity and copy controls come from `@workspace/ui/blocks/agent-chat` and use the current theme.

## Codex connection

Uses the existing local signed-in Codex CLI session through the task-runner module's public read-only integration. No new login, credentials store or API key is added. All chat modes use read-only execution; coding remains in the separately approved task runner. These are Codeitz conversations, not imported or synchronized Codex desktop threads.

Each turn reads central governance, coding standards, project AGENTS.md and the latest work-record tail, plus up to 20 completed conversation messages. It uses a new read-only Codex execution with that saved context. Public commentary/tool activity streams as events; the completed Markdown reply is saved at the end. This is activity streaming, not token-by-token generation or hidden reasoning.

## Records and recovery

PostgreSQL stores conversations, messages, request IDs, statuses and public activity, separately from tasks and todos. Writes are transactional; repeat sends with the same request ID reuse the existing turn. One chat reply runs at a time. Stop cancels the local child process and retains the turn. Refresh or navigation does not cancel a reply; reconnect reads the saved snapshot. Restart marks unfinished replies interrupted without automatically rerunning them.

Chats shows the latest 100 conversations. A selected conversation displays its latest 200 messages and 100 activity events; older records remain in PostgreSQL. No archive/delete screen is included. Database credentials stay server-side; local logs stay under ignored `.codeitz/`.

## Routes and boundaries

Browser paths are `/agent-chat` and `/agent-chat/{id}`, with supported new-chat `owner` and `mode=plan|review` query state. Refresh and Back/Forward restore selection. Unsaved drafts are not URL or database records.

Versioned APIs: GET/POST `/api/v1/chats`, GET `/api/v1/chats/setup`, GET `/api/v1/chats/{id}`, POST `/api/v1/chats/{id}/messages`, POST `/api/v1/chats/{id}/stop`, and GET `/api/v1/chats/{id}/stream`. `/api/docs` describes actual request/response contracts. Existing local/same-origin guards, strict request validation, discovered-project checks and real-directory checks apply. No writable mode is accepted by chat. These local controls are not a multi-user/tenant identity system.

## Development entry points

- Public data/request contracts: `contracts/chat.ts`.
- Owning module: `src/api/modules/agent-chat/{routes,service,store,openapi}.ts`.
- Public Codex integration: `src/api/modules/task-runner/index.ts`; do not import the runner's private implementation from chat.
- Frontend adapter: `src/web/modules/agent-chat/page.tsx`; shared presentation: packages/ui AgentChatWorkspace.
- Routing: `contracts/navigation.ts` and lazy route composition in `src/web/app.tsx`.
- Gallery: UIUX → Blocks → Shared Patterns → Agent Chat, with labelled preview fixtures and typed usage.
- Tests: `tests/agent-chat.test.mjs`; general HTTP tests use `tests/server-fixture.mjs` for temporary runtime databases.

Verified Codeitz typecheck/build, 38 tests, versions and governance audit; shared UI build/33 tests and UIUX typecheck/build. A real local Codex reply, activity, refresh, saved-chat opening and Back navigation were verified in an isolated browser database. Production chat records were not seeded. No commit or push.

## Approved plan → task runner

A completed assistant reply from Plan mode shows **Approve plan & create task**. This explicitly approves that saved plan and creates a `planned` task for the conversation's existing project. It copies the original user goal and saved assistant plan; it does not call Codex, replan, code or run checks. Explore/review, user, failed and unfinished messages are not eligible.

The chat then shows **Open task**. The task runner displays the approved plan, its source-chat link and the existing **Approve & start coding** action. Only that separate action starts coding. Both links survive refresh/restart.

`POST /api/v1/chats/{id}/tasks` accepts only `{messageId, approvePlan:true}`. The server reads project/goal/plan from saved records. The task runner exposes `createFromChatPlan` through the public `ChatPlanTaskCreator` contract; modules do not write each other's tables. The shared runner instance is composed in the server.

Chat PostgreSQL tables keep a unique message→task reservation, approval timestamp and pending/ready state; runner PostgreSQL tables store source conversation/message/approval metadata with the task. These are separate module-owned transactions in the same PostgreSQL database; handoff retains a durable reservation and idempotent task creation rather than claiming a single cross-database transaction. If interrupted, retry the same plan; its reserved task ID is reused, including when the task was already inserted. Retries never reset an existing task's progress or approve coding.

Handoff checks cover explicit approval, exact project/plan reuse, linked PostgreSQL records, duplicate retries, failure before/after task insertion, restart recovery, invalid/cross-conversation messages and separate coding approval. The PostgreSQL regression suite verifies the supported workflows. Browser verification used isolated records and did not start coding.
