import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const playwrightPath =
  process.env.CODEITZ_DESKTOP_PLAYWRIGHT ??
  resolve("../.codeitz/browser-tools/node_modules/playwright-core/index.mjs");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const root = resolve(import.meta.dirname, "../dist");
const pngFixture = await readFile(
  resolve(import.meta.dirname, "../../desktop-runtime/test/ocr-fixture.png"),
);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(`${root}\\`) && file !== resolve(root, "index.html")) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const bytes = await readFile(file);
    response.setHeader(
      "Content-Type",
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".svg": "image/svg+xml",
      }[extname(file)] ?? "application/octet-stream",
    );
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const conversationId = "11111111-1111-1111-1111-111111111111";
    const state = {
      apps: [],
      coworkers: [],
      sourceCatalog: {
        connection: {
          connected: true,
          origin: "http://127.0.0.1:14305",
          mode: "read-only",
        },
        projects: [
          { owner: "devkit/codeitz", name: "Codeitz", area: "devkit" },
        ],
        runnerTasks: [],
        businessTasks: [],
        todoTasks: [
          {
            id: "todo1234",
            sourceKind: "todo",
            owner: null,
            title: "Unassigned existing task",
            status: "pending",
          },
        ],
      },
      conversations: [
        {
          id: conversationId,
          title: "Desktop recovery proof",
          provider_thread_id: "provider-proof-thread",
        },
      ],
      messages: [
        {
          id: "m1",
          conversation_id: conversationId,
          role: "assistant",
          text: "Saved conversation restored.",
        },
      ],
      workers: [],
      attachments: [],
      operations: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          conversation_id: conversationId,
          kind: "chat",
          goal: "Interrupted chat fixture",
          digest: "chat-digest",
          state: "interrupted",
          workspace: "D:\\codeitz-fixture\\chat",
          provider_thread_id: "saved-chat-thread",
          provider_turn_id: "saved-chat-turn",
          result: "No automatic replay.",
        },
        {
          id: "44444444-4444-4444-4444-444444444444",
          conversation_id: conversationId,
          kind: "worker",
          goal: "Interrupted worker fixture",
          digest: "worker-digest",
          state: "interrupted",
          workspace: "D:\\codeitz-fixture\\worker",
          provider_thread_id: "saved-worker-thread",
          provider_turn_id: "saved-worker-turn",
          result: "Inspect the saved file before continuing.",
        },
        {
          id: "99999999-9999-9999-9999-999999999999",
          conversation_id: conversationId,
          kind: "worker",
          goal: "Uncertain apply fixture",
          digest: "uncertain-apply-digest",
          state: "completed",
          workspace: "D:\\codeitz-fixture\\apply-copy",
          repository_snapshot: {
            repository: "D:\\codeitz-fixture\\repository",
          },
          apply_receipt: {
            state: "review-required",
            applied: false,
            error: "Inspect uncertain published effects.",
          },
          result: "Worker completed before interrupted apply.",
        },
      ],
      events: [],
      provider: {
        available: true,
        capacity: {
          limit: 3,
          active: 0,
          available: 3,
          activeWorkers: 0,
          activeChats: 0,
          maintenance: false,
          uncertain: 0,
          operations: [],
        },
      },
    };
    const savedState = sessionStorage.getItem("codeitz.mock-runtime");
    if (savedState) Object.assign(state, JSON.parse(savedState));
    window.__m4State = state;
    window.__m4Patch = (patch) => Object.assign(state, structuredClone(patch));
    window.addEventListener("beforeunload", () =>
      sessionStorage.setItem("codeitz.mock-runtime", JSON.stringify(state)),
    );
    const attachmentBytes = new Map(
      Object.entries(
        JSON.parse(
          sessionStorage.getItem("codeitz.mock-attachment-bytes") ?? "{}",
        ),
      ),
    );
    window.addEventListener("beforeunload", () =>
      sessionStorage.setItem(
        "codeitz.mock-attachment-bytes",
        JSON.stringify(Object.fromEntries(attachmentBytes)),
      ),
    );
    const uploadIds = new Map();
    const submissions = new Map();
    let failFirstStage = true;
    let failFirstSend = true;
    window.__fixtureUploadKeys = [];
    window.__fixtureSendBodies = [];
    window.__fixtureApprovals = 0;
    window.__fixtureResolutions = 0;
    window.__fixtureApplications = 0;
    window.__fixtureAppliedChanges = 0;
    window.__fixtureInterrupts = [];
    let sequence = 5;
    const nextId = () =>
      `${String(sequence++).padStart(8, "0")}-5555-5555-5555-555555555555`;
    let stateRequests = 0;
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === "ensure_runtime") return;
        if (command === "pick_repository")
          return "D:\\codeitz-fixture\\repository";
        if (command !== "runtime_request")
          throw Error("Unexpected native command");
        if (args.path === "/api/runtime/state") {
          stateRequests += 1;
          if (stateRequests === 1)
            throw Error("Fixture startup connection unavailable");
          return structuredClone(state);
        }
        if (args.path.includes("/activity?"))
          return { items: [], cursor: "0", hasMore: false };
        const attachmentRoute = args.path.match(
          /^\/api\/runtime\/conversations\/([^/]+)\/attachments(?:\/([^/]+)(\/remove)?)?$/,
        );
        if (attachmentRoute) {
          const owner = attachmentRoute[1];
          if (!attachmentRoute[2]) {
            window.__fixtureUploadKeys.push(args.body.requestKey);
            let attachment = state.attachments.find(
              (item) => item.id === uploadIds.get(args.body.requestKey),
            );
            if (!attachment) {
              const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(sequence++).padStart(12, "0")}`;
              attachment = {
                id,
                conversationId: owner,
                name: args.body.name,
                mime: args.body.mime,
                size: atob(args.body.base64).length,
                sha256: "fixture-bytes-sha",
                text: "CODEITZ TEST 4829",
                textTruncated: false,
                textBytes: 17,
                sent: false,
              };
              state.attachments.push(attachment);
              uploadIds.set(args.body.requestKey, id);
              attachmentBytes.set(id, args.body.base64);
            }
            if (failFirstStage) {
              failFirstStage = false;
              throw Error("The local runtime is unavailable.");
            }
            return structuredClone(attachment);
          }
          const attachment = state.attachments.find(
            (item) =>
              item.id === attachmentRoute[2] && item.conversationId === owner,
          );
          if (!attachment) throw Error("Attachment not found");
          if (attachmentRoute[3]) {
            if (attachment.sent) throw Error("Sent history cannot be removed");
            state.attachments = state.attachments.filter(
              (item) => item.id !== attachment.id,
            );
            return { removed: true };
          }
          return { ...attachment, base64: attachmentBytes.get(attachment.id) };
        }
        if (
          /^\/api\/runtime\/conversations\/[^/]+\/messages$/.test(args.path)
        ) {
          window.__fixtureSendBodies.push(structuredClone(args.body));
          if (!submissions.has(args.body.requestKey)) {
            const owner = args.path.split("/")[4];
            const attachments = args.body.attachmentIds.map((id) =>
              state.attachments.find(
                (item) => item.id === id && item.conversationId === owner,
              ),
            );
            if (attachments.some((item) => !item))
              throw Error("Foreign attachment");
            attachments.forEach((item) => {
              item.sent = true;
            });
            state.messages.push({
              id: nextId(),
              conversation_id: owner,
              role: "user",
              text: args.body.text,
              attachments,
            });
            state.messages.push({
              id: nextId(),
              conversation_id: owner,
              role: "assistant",
              text: "Image received in fixture.",
            });
            submissions.set(args.body.requestKey, {
              id: nextId(),
              state: "completed",
            });
          }
          if (failFirstSend) {
            failFirstSend = false;
            throw Error("The local runtime is unavailable.");
          }
          return submissions.get(args.body.requestKey);
        }
        if (args.path === "/api/runtime/workers") {
          if (args.body.goal === "Reject action fixture")
            throw Error("Fixture rejected action");
          const appChat = state.conversations.find(
            (item) => item.id === args.body.conversationId,
          );
          const worker = {
            id: nextId(),
            conversation_id: args.body.conversationId,
            coworker_id: args.body.coworkerId,
            task_reference: args.body.taskReference,
            goal: args.body.goal,
            workspace: "D:\\codeitz-fixture\\isolated-worker",
            digest: "fixture-digest",
            state: "awaiting-approval",
            ...(appChat?.app_id
              ? {
                  repository_snapshot: {
                    repository: "D:\\codeitz-fixture\\repository",
                    head: "fixture-base-commit",
                    dirtyFingerprint: "fixture-state",
                  },
                }
              : {}),
          };
          window.__fixtureLastWorker = structuredClone(args.body);
          state.workers.push(worker);
          return worker;
        }
        if (args.path === "/api/runtime/apps") {
          if (args.body.repositoryPath !== "D:\\codeitz-fixture\\repository")
            throw Error("Native folder choice required");
          const app = {
            id: nextId(),
            name: args.body.name,
            repository: args.body.repositoryPath,
            source_project_owner: args.body.sourceProjectOwner,
          };
          state.apps.push(app);
          window.__fixtureApplications += 1;
          return app;
        }
        if (args.path === "/api/runtime/conversations") {
          const chat = {
            id: nextId(),
            title: args.body.title,
            app_id: args.body.appId ?? null,
          };
          state.conversations.push(chat);
          return chat;
        }
        if (args.path.endsWith("/coworkers")) {
          const coworker = {
            id: nextId(),
            conversation_id: args.path.split("/")[4],
            name: args.body.name,
          };
          state.coworkers.push(coworker);
          return coworker;
        }
        if (args.path.endsWith("/interrupt")) {
          const id = args.path.split("/")[4];
          window.__fixtureInterrupts.push({
            id,
            body: structuredClone(args.body),
          });
          for (const row of [...state.workers, ...state.operations])
            if (row.id === id)
              row.progress = {
                phase: "interrupt-requested",
                message: "Stop requested; waiting for the provider to finish",
                sequence: 2,
              };
          return { requested: true, operationId: id };
        }
        if (args.path.endsWith("/resolve")) {
          const id = args.path.split("/")[4];
          const operation = state.operations.find((item) => item.id === id);
          if (
            !operation ||
            args.body.digest !== operation.digest ||
            args.body.acknowledgement !== "reviewed-no-replay"
          )
            throw Error("Invalid recovery confirmation");
          if (operation.apply_receipt?.state === "review-required") {
            operation.apply_receipt.state = "reviewed";
            window.__fixtureApplyRecoveryState = operation.state;
          } else operation.state = "reviewed";
          window.__fixtureResolutions += 1;
          return operation;
        }
        if (args.path.endsWith("/approve")) {
          window.__fixtureApprovals += 1;
          const worker = state.workers.find(
            (item) => item.id === args.path.split("/")[4],
          );
          if (window.__m4RunApprovals) {
            worker.state = "running";
            worker.progress = {
              phase: "running",
              message: `Inspecting ${worker.goal}`,
              sequence: 1,
            };
            worker.provider_thread_id = `thread-${worker.id}`;
            worker.provider_turn_id = `turn-${worker.id}`;
            state.operations.push({ ...worker, kind: "worker" });
            state.provider.busy = true;
            state.provider.capacity.active += 1;
            state.provider.capacity.available -= 1;
            state.provider.capacity.activeWorkers += 1;
            state.provider.capacity.operations.push({
              id: worker.id,
              kind: "worker",
              key: `coworker:${worker.coworker_id}`,
              slot: state.provider.capacity.active - 1,
              uncertain: false,
            });
          } else worker.state = "completed";
          return worker;
        }
        if (args.path.endsWith("/changes"))
          return {
            digest: "reviewed-manifest",
            blocked: [],
            files: [
              {
                path: ".desktop-fixture.txt",
                kind: "added",
                beforeHash: null,
                afterHash: "fixture-hash",
                beforeText: null,
                afterText: "A harmless fixture change.",
              },
            ],
          };
        if (args.path.endsWith("/apply")) {
          if (args.body.digest !== "reviewed-manifest")
            throw Error("Changes were not reviewed");
          window.__fixtureAppliedChanges += 1;
          const worker = state.workers.find(
            (item) => item.id === args.path.split("/")[4],
          );
          if (worker) {
            worker.apply_receipt = { state: "applied", applied: true };
            worker.applied_at = "2026-11-22T00:00:00Z";
          }
          return { applied: true };
        }
        throw Error("Unexpected runtime route");
      },
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page
    .getByRole("alert")
    .filter({ hasText: "Fixture startup connection unavailable" })
    .waitFor();
  await page.getByText("Saved conversation restored.").waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 0);
  for (const kind of ["chat", "worker"]) {
    const interruption = page.getByRole("article", {
      name: `Interrupted ${kind}: Interrupted ${kind} fixture`,
    });
    assert.equal(
      await interruption
        .getByRole("button", { name: "Mark reviewed — do not rerun" })
        .isDisabled(),
      true,
    );
    await interruption.getByRole("checkbox").check();
    await interruption
      .getByRole("button", { name: "Mark reviewed — do not rerun" })
      .click();
    await interruption.waitFor({ state: "detached" });
  }
  const uncertainApply = page.getByRole("article", {
    name: "Uncertain apply: Uncertain apply fixture",
  });
  await uncertainApply
    .getByText("Inspect uncertain published effects.")
    .waitFor();
  assert.equal(
    await uncertainApply
      .getByRole("button", { name: "Mark reviewed — do not rerun" })
      .isDisabled(),
    true,
  );
  await uncertainApply.getByRole("checkbox").check();
  await uncertainApply
    .getByRole("button", { name: "Mark reviewed — do not rerun" })
    .click();
  await uncertainApply.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.__fixtureApplyRecoveryState),
    "completed",
  );
  assert.equal(await page.evaluate(() => window.__fixtureResolutions), 3);
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 0);
  const chooseMode = async (mode) => {
    await page
      .getByRole("button", { name: "Composer mode", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", {
        name:
          mode === "task"
            ? "Coworker task · approval first"
            : "Chat · read-only",
        exact: true,
      })
      .click();
  };
  await chooseMode("task");
  await page
    .getByRole("textbox", { name: "Message Codeitz" })
    .fill("Reject action fixture");
  await page.getByRole("button", { name: "Prepare task", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Fixture rejected action" })
    .waitFor();
  await page.waitForTimeout(1500);
  assert.equal(
    await page
      .getByRole("alert")
      .filter({ hasText: "Fixture rejected action" })
      .count(),
    1,
  );
  await page
    .getByRole("textbox", { name: "Message Codeitz" })
    .fill("Write a single harmless fixture file.");
  await page.getByRole("button", { name: "Prepare task", exact: true }).click();
  await page.getByRole("button", { name: "Approve worker" }).waitFor();
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 0);
  await page.getByRole("button", { name: "Approve worker" }).click();
  await page.getByText("Completed", { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 1);
  await page.getByRole("button", { name: "Apps", exact: true }).click();
  await page.getByLabel("Existing Codeitz project").click();
  await page.getByRole("option", { name: "Codeitz", exact: true }).click();
  await page
    .getByLabel("App name", { exact: true })
    .fill("Fixture application");
  assert.equal(
    await page
      .getByRole("button", { name: "Connect app", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Choose folder" }).click();
  assert.equal(
    await page.getByLabel("Selected repository").inputValue(),
    "D:\\codeitz-fixture\\repository",
  );
  await page.getByRole("button", { name: "Connect app", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "New supervisor conversation",
    })
    .waitFor();
  assert.equal(await page.evaluate(() => window.__fixtureApplications), 1);
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 1);
  for (const name of ["Supervisor one", "Supervisor two"]) {
    await page.getByLabel("Supervisor chat title").fill(name);
    await page.getByRole("button", { name: "New supervisor chat" }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
  }
  assert.equal(
    await page
      .getByRole("navigation", { name: "Conversations" })
      .getByRole("button")
      .count(),
    2,
  );
  await page.getByRole("button", { name: "Add coworker", exact: true }).click();
  for (const name of ["Parser coworker", "Review coworker"]) {
    await page.getByLabel("Coworker name").fill(name);
    await page.getByRole("button", { name: "Create coworker" }).click();
  }
  await page
    .getByRole("button", { name: "Selected coworker", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: "Parser coworker", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Composer options", exact: true })
    .click();
  await page.getByLabel("Linked Codeitz task").selectOption("todo:todo1234");
  await page.keyboard.press("Escape");
  await page
    .getByRole("textbox", { name: "Message Codeitz" })
    .fill("Prepare an explicitly reviewed repository change.");
  await page.getByRole("button", { name: "Prepare task", exact: true }).click();
  await page.getByRole("button", { name: "Approve worker" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => window.__fixtureLastWorker.taskReference.authority,
    ),
    "codeitz-todo",
  );
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 1);
  await page.getByRole("button", { name: "Approve worker" }).click();
  await page.getByRole("tab", { name: "Changes", exact: true }).click();
  await page.getByRole("button", { name: "Review repository changes" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Apply reviewed changes" })
      .isDisabled(),
    true,
  );
  assert.equal(await page.evaluate(() => window.__fixtureAppliedChanges), 0);
  await page
    .getByRole("checkbox", {
      name: "I reviewed these exact changes for the destination repository. Apply them without committing, pushing or deploying.",
    })
    .check();
  await page.getByRole("button", { name: "Apply reviewed changes" }).click();
  await page.getByText("Reviewed changes applied.").waitFor();
  assert.equal(await page.evaluate(() => window.__fixtureAppliedChanges), 1);
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page
    .getByRole("button", { name: /Unassigned existing task/ })
    .waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Connected · read-only", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  assert.equal(
    await page.locator(".conversation-panel").getAttribute("aria-hidden"),
    "true",
  );
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page
    .getByRole("button", { name: "Supervisor chats", exact: true })
    .click();
  await chooseMode("chat");
  const ids = { otherChat: "abababab-abab-abab-abab-abababababab" };
  const savedConversation = await page.evaluate(() =>
    localStorage.getItem("codeitz.desktop.conversation"),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Supervisor two", exact: true })
    .waitFor();
  // The fixture preserves its fake backend independently from the real broker database.
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("codeitz.desktop.conversation"),
    ),
    savedConversation,
  );
  const baseM4State = await page.evaluate(() =>
    structuredClone(window.__m4State),
  );

  const showCoworkerPanel = page.getByRole("button", { name: "Show coworker panel", exact: true });
  if (await showCoworkerPanel.isVisible()) await showCoworkerPanel.click();
  await page
    .getByRole("button", { name: "Hide coworker panel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show coworker panel", exact: true })
    .click();
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Coworkers",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Show coworker panel", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page
    .getByRole("button", { name: "Show coworker panel", exact: true })
    .click();
  await page.evaluate((original) => window.__m4Patch(original), baseM4State);
  await chooseMode("chat");
  await page.evaluate(
    ({ selected }) => {
      const state = window.__m4State;
      for (let index = 0; index < 45; index += 1)
        state.messages.push({
          id: `scroll-${index}`,
          conversation_id: selected,
          role: index % 2 ? "assistant" : "user",
          text: `Scroll fixture message ${index}. ${"A persistent, bounded conversation record. ".repeat(5)}`,
        });
    },
    { selected: savedConversation },
  );
  const history = page.locator(".message-list");
  await page.waitForFunction(
    () => document.querySelectorAll(".codeitz-message").length >= 45,
  );
  await page.waitForFunction(() => {
    const node = document.querySelector(".message-list");
    return node.scrollHeight - node.clientHeight - node.scrollTop < 5;
  });
  await history.evaluate((node) => {
    node.scrollTop = 0;
    node.dispatchEvent(new Event("scroll"));
  });
  await page.evaluate(
    ({ selected }) =>
      window.__m4State.messages.push({
        id: "new-arrival",
        conversation_id: selected,
        role: "assistant",
        text: "A genuinely new update.",
      }),
    { selected: savedConversation },
  );
  await page
    .getByRole("button", {
      name: "Jump to latest updates (1 new)",
      exact: true,
    })
    .waitFor();
  assert.equal(await history.evaluate((node) => node.scrollTop < 2), true);
  await page.waitForTimeout(2600);
  assert.equal(
    await page
      .getByRole("button", {
        name: "Jump to latest updates (1 new)",
        exact: true,
      })
      .count(),
    1,
  );
  await page.evaluate(
    ({ ids, selected }) => {
      window.__m4State.operations.push({
        id: ids.otherChat,
        conversation_id: selected,
        kind: "chat",
        state: "running",
        progress: {
          phase: "running",
          sequence: 1,
          message: "Reading the selected project",
        },
      });
      window.__m4State.provider.busy = true;
      window.__m4State.provider.capacity = {
        limit: 3,
        active: 1,
        available: 2,
        activeWorkers: 0,
        activeChats: 1,
        maintenance: false,
        uncertain: 0,
        operations: [
          {
            id: ids.otherChat,
            kind: "chat",
            key: `supervisor:${selected}`,
            slot: 0,
            uncertain: false,
          },
        ],
      };
    },
    { ids, selected: savedConversation },
  );
  await page
    .getByRole("button", {
      name: "Jump to latest updates (2 new)",
      exact: true,
    })
    .waitFor();
  await page.evaluate(
    ({ ids }) => {
      window.__m4State.operations.find(
        (item) => item.id === ids.otherChat,
      ).progress = {
        phase: "running",
        sequence: 2,
        message: "Reviewing the selected files",
      };
    },
    { ids },
  );
  await page
    .getByRole("button", {
      name: "Jump to latest updates (3 new)",
      exact: true,
    })
    .waitFor();
  await page.waitForTimeout(2600);
  assert.equal(await history.evaluate((node) => node.scrollTop < 2), true);
  await page
    .getByRole("button", {
      name: "Jump to latest updates (3 new)",
      exact: true,
    })
    .click();
  await page.waitForFunction(() => {
    const node = document.querySelector(".message-list");
    return node.scrollHeight - node.clientHeight - node.scrollTop < 64;
  });
  assert.equal(
    await page.getByRole("button", { name: /Jump to latest updates/ }).count(),
    0,
  );
  await page.evaluate((original) => window.__m4Patch(original), baseM4State);
  const composer = page.getByRole("textbox", { name: "Message Codeitz" });
  await composer.fill("Inspect this image.");
  await composer.press("Shift+Enter");
  assert.equal(await composer.inputValue(), "Inspect this image.\n");
  await composer.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    keyCode: 229,
  });
  assert.equal(await page.evaluate(() => window.__fixtureSendBodies.length), 0);
  await page.getByRole("button", { name: "Attachments", exact: true }).click();
  await page.getByLabel("Choose Attachments").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: pngFixture,
  });
  await page.locator('img[src^="blob:"]').first().waitFor();
  await page.getByRole("button", { name: "Upload files", exact: true }).click();
  await page.getByRole("button", { name: "Retry fixture.png" }).waitFor();
  await page.getByRole("button", { name: "Retry fixture.png" }).click();
  await page.getByLabel("Upload complete", { exact: true }).waitFor();
  const uploadKeys = await page.evaluate(() => window.__fixtureUploadKeys);
  assert.equal(uploadKeys.length, 2);
  assert.equal(uploadKeys[0], uploadKeys[1]);
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="Send"]')?.disabled,
  );
  await composer.press("Enter");
  await page.getByRole("button", { name: "Retry previous send" }).waitFor();
  assert.equal(await composer.isDisabled(), true);
  await page.getByRole("button", { name: "Retry previous send" }).click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("textarea")).some(
      (element) => element.closest(".codeitz-composer") && element.value === "",
    ),
  );
  const sendBodies = await page.evaluate(() => window.__fixtureSendBodies);
  assert.equal(sendBodies.length, 2);
  assert.deepEqual(sendBodies[0], sendBodies[1]);
  assert.equal(sendBodies[0].attachmentIds.length, 1);
  assert.equal("base64" in sendBodies[0], false);
  assert.equal("path" in sendBodies[0], false);
  assert.equal(await page.locator(".codeitz-message-user").count(), 1);
  assert.equal(
    await page
      .locator(".codeitz-message-user")
      .evaluate(
        (node) =>
          Math.abs(
            node.getBoundingClientRect().right -
              node.querySelector("article").getBoundingClientRect().right,
          ) < 2,
      ),
    true,
  );
  assert.equal(
    await page
      .locator(".codeitz-message-other")
      .last()
      .evaluate(
        (node) =>
          Math.abs(
            node.getBoundingClientRect().left -
              node.querySelector("article").getBoundingClientRect().left,
          ) < 2,
      ),
    true,
  );
  await page.getByRole("button", { name: "View image", exact: true }).click();
  await page.getByAltText("fixture.png", { exact: true }).waitFor();
  await page
    .getByAltText("fixture.png", { exact: true })
    .evaluate((image) => image.decode());
  await page.reload();
  await page.getByRole("button", { name: "View image", exact: true }).waitFor();
  await page.getByRole("button", { name: "View image", exact: true }).click();
  await page.getByAltText("fixture.png", { exact: true }).waitFor();
  await page.setViewportSize({ width: 900, height: 700 });
  await page
    .getByRole("button", { name: "Show coworker panel", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Show coworker panel", exact: true })
    .click();
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Coworkers",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Show coworker panel", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".desktop-columns")
      .evaluate(
        (node) => parseFloat(getComputedStyle(node).transitionDuration) < 0.001,
      ),
    true,
  );
  assert.equal(
    await page
      .locator(".worker-panel")
      .evaluate(
        (node) => parseFloat(getComputedStyle(node).transitionDuration) < 0.001,
      ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Theme & components", { exact: true }).click();
  await page.getByLabel("Appearance").selectOption("dark");
  await page
    .getByRole("button", { name: "Supervisor chats", exact: true })
    .click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await mkdir(resolve(import.meta.dirname, "../.proof"), { recursive: true });
  await page.screenshot({
    path: resolve(
      import.meta.dirname,
      "../.proof/chat-integration-dark-900.png",
    ),
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      mockOnly: true,
      appRailAndSidebar: true,
      nativeFolderChoice: true,
      twoSupervisorChats: true,
      twoNamedCoworkers: true,
      unassignedTodoReference: true,
      explicitWorkerAndApplyApprovals: true,
      reviewedChatAndWorkerWithoutReplay: true,
      resolutions: 3,
      completedWorkerApplyReviewWithoutReplay: true,
      integratedChatAlignmentAndImeKeys: true,
      attachmentStageRetryPreservesKey: true,
      uncertainSendRetryPreservesPayload: true,
      sentImageReloadPreview: true,
      startupConnectionErrorCleared: true,
      actionErrorPreservedAcrossPoll: true,
      noHorizontalOverflow: true,
      scrollUnreadStableAcrossPolls: true,
      progressSequenceUnreadUpdates: true,
      drawersKeyboardAndReducedMotion: true,
      pageErrors: errors,
    }),
  );
  await context.close();
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
