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

  await page.addInitScript(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const state = window.__m4State;
    const chat = state.conversations[0];
    state.operations = [];
    state.apps = [
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        name: "Desktop pilot",
        repository: "D:/fixture/repo",
        source_project_owner: "devkit/codeitz",
        verificationProfiles: ["desktop-runtime"],
      },
    ];
    chat.app_id = state.apps[0].id;
    localStorage.setItem("codeitz.desktop.app", state.apps[0].id);
    localStorage.setItem("codeitz.desktop.conversation", chat.id);
    state.coworkers = [
      {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        conversation_id: chat.id,
        name: "Runtime reviewer",
      },
    ];
    const profile = {
      id: "desktop-runtime",
      hash: "profile-hash",
      name: "Desktop runtime pilot",
      description: "Fixed Node and fresh PostgreSQL checks",
      images: {
        node: "node@sha256:fixture",
        postgres: "postgres@sha256:fixture",
      },
      checks: [
        { id: "syntax", name: "JavaScript syntax" },
        { id: "portable", name: "Portable runtime" },
        { id: "postgres", name: "Fresh PostgreSQL" },
      ],
      isolation: "Local Docker; internal network; no ports, keys or socket",
      exclusions: ["Native OCR"],
      commands: ["fixed node --test"],
      timeoutSeconds: 180,
      automaticAfterApproval: true,
    };
    state.verificationProfiles = [profile];
    state.verifications = [];
    const worker = {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      conversation_id: chat.id,
      coworker_id: state.coworkers[0].id,
      goal: "Review the runtime capacity regression",
      digest: "worker-digest",
      state: "awaiting-approval",
      workspace: "D:/fixture/snapshot",
      repository_snapshot: { repository: "D:/fixture/repo", head: "commit" },
      verification_profile: profile,
    };
    state.workers = [worker];
    window.__m5 = {
      state,
      worker,
      profile,
      activity: [],
      calls: [],
      failActivity: false,
      manualApprovals: 0,
    };
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command !== "runtime_request") return invoke(command, args);
      window.__m5.calls.push({ path: args.path, body: args.body });
      if (args.path.includes("/activity?")) {
        if (window.__m5.failActivity) {
          window.__m5.failActivity = false;
          throw Error("fixture disconnect");
        }
        const after = new URL("http://fixture" + args.path).searchParams.get(
          "after",
        );
        const items = window.__m5.activity.filter(
          (item) => item.operation_id === args.path.split("/")[4] && BigInt(item.id) > BigInt(after),
        );
        return { items, cursor: items.at(-1)?.id ?? after, hasMore: false };
      }
      if (args.path.endsWith("/verification/prepare"))
        return {
          ...state.verifications.at(-1),
          id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          digest: "check-digest",
          profile,
          state: "awaiting-approval",
          operation_id: worker.id,
          manifest_digest: "reviewed-manifest",
        };
      if (args.path.endsWith("/verification/approve")) {
        window.__m5.manualApprovals++;
        return { state: "running" };
      }
      return invoke(command, args);
    };
  });
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.getByText("Saved conversation restored.").waitFor();
  await page.getByRole("button", { name: "Show coworker panel", exact: true }).click();
  await page.getByRole("button", { name: "Approve worker", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 0);
  await page.getByText("Desktop runtime pilot", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Approve worker", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 1);
  await page.getByRole("tab", { name: "Changes", exact: true }).click();
  await page.getByRole("button", { name: "Review repository changes" }).click();
  await page.getByRole("checkbox").last().check();
  assert.equal(
    await page
      .getByRole("button", { name: "Apply reviewed changes" })
      .isDisabled(),
    true,
  );
  await page.evaluate(() => {
    const f = window.__m5;
    f.worker.change_manifest = { digest: "reviewed-manifest", files: [] };
    f.state.verifications = [
      {
        id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        operation_id: f.worker.id,
        profile: f.profile,
        digest: "verify",
        manifest_digest: "reviewed-manifest",
        state: "failed",
        receipt: {
          passed: false,
          message: "Deliberate failed check",
          checks: [
            {
              id: "syntax",
              name: "JavaScript syntax",
              status: "failed",
              exitCode: 1,
            },
          ],
        },
        created_at: new Date().toISOString(),
      },
    ];
  });
  await page.getByRole("tab", { name: "Checks", exact: true }).click();
  await page.getByText("Deliberate failed check", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Changes", exact: true }).click();
  await page.getByRole("button", { name: "Review repository changes" }).click();
  await page.getByRole("checkbox").last().check();
  assert.equal(
    await page
      .getByRole("button", { name: "Apply reviewed changes" })
      .isDisabled(),
    true,
  );
  await page.evaluate(() => {
    const f = window.__m5,
      v = f.state.verifications[0];
    v.state = "passed";
    v.receipt = {
      passed: true,
      runnerReceiptValid: true,
      outputUnchanged: true,
      profileHash: f.profile.hash,
      manifestDigest: "reviewed-manifest",
      checks: [{ name: "JavaScript syntax", status: "passed", exitCode: 0 }],
    };
  });
  await page.waitForTimeout(1250);
  assert.equal(
    await page
      .getByRole("button", { name: "Apply reviewed changes" })
      .isEnabled(),
    true,
  );
  await page.evaluate(() => { window.__m5.state.provider.capacity.reviews = 1; });
  await page.waitForTimeout(1250);
  assert.equal(await page.getByRole("button", {name: "Apply reviewed changes"}).isDisabled(), true);
  await page.evaluate(() => { window.__m5.state.provider.capacity.reviews = 0; });
  await page.evaluate(
    () =>
      (window.__m5.state.verifications[0].receipt.manifestDigest =
        "stale-output"),
  );
  await page.waitForTimeout(1250);
  assert.equal(
    await page
      .getByRole("button", { name: "Apply reviewed changes" })
      .isDisabled(),
    true,
  );
  await page.getByRole("tab", { name: "Checks", exact: true }).click();
  await page
    .getByRole("button", { name: "Review another check attempt" })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.evaluate(() => window.__m5.manualApprovals), 0);
  await page
    .getByRole("button", { name: "Approve verification", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.__m5.manualApprovals), 1);
  await page.evaluate(() => {
    const f = window.__m5;
    f.worker.state = "running";
    f.state.operations = [
      {
        ...f.worker,
        kind: "worker",
        provider_thread_id: "thread",
        provider_turn_id: "turn",
      },
    ];
    f.state.provider.capacity = {
      limit: 3,
      active: 1,
      available: 2,
      activeWorkers: 1,
      activeChats: 0,
      maintenance: false,
      operations: [
        {
          id: f.worker.id,
          key: "coworker:" + f.worker.coworker_id,
          slot: 0,
          uncertain: false,
        },
      ],
    };
    f.activity = [
      {
        id: "9007199254740993",
        operation_id: f.worker.id,
        type: "activity:agent-text",
        data: { message: "Reviewing the actual public runtime output." },
        created_at: new Date().toISOString(),
      },
    ];
  });
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await page
    .getByRole("tabpanel", { name: "Activity" })
    .getByText("Reviewing the actual public runtime output.")
    .waitFor();
  await page.evaluate(() => (window.__m5.failActivity = true));
  await page
    .getByText("Reconnecting to saved activity. Agent work is not restarted.")
    .waitFor();
  await page.waitForTimeout(2200);
  const calls = await page.evaluate(() =>
    window.__m5.calls
      .filter((x) => x.path.includes("/activity?"))
      .map((x) => x.path),
  );
  assert(calls.some((x) => x.includes("after=9007199254740993")));
  assert.equal(await page.evaluate(() => window.__fixtureApprovals), 1);

  await page.evaluate(() => {
    const f = window.__m5;
    window.__m4RunApprovals = true;
    f.state.coworkers.push({
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      conversation_id: f.worker.conversation_id,
      name: "Independent reviewer",
    });
    f.state.workers.push({
      ...f.worker,
      id: "abababab-abab-abab-abab-abababababab",
      coworker_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      goal: "Independent workspace review",
      state: "awaiting-approval",
      verification_profile: null,
      change_manifest: null,
    });
  });
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  const expandSidebar = page.getByRole("button", { name: "Expand sidebar", exact: true });
  if (await expandSidebar.isVisible()) await expandSidebar.click();
  await page.getByRole("button", { name: /^Open task for Independent reviewer: Independent workspace review\./ }).click();
  await page
    .getByRole("button", { name: "Approve worker", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Approve worker", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Approve worker", exact: true })
    .click();
  await page
    .getByLabel("Model capacity: 2 of 3 active", { exact: true })
    .waitFor();
  await page
    .getByRole("button", {
      name: /^Open task for Runtime reviewer: Review the runtime capacity regression\./,
    })
    .click();
  await page
    .getByRole("button", { name: "Request stop for Runtime reviewer" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Request stop for Runtime reviewer" })
      .isEnabled(),
    true,
  );
  await mkdir(resolve(import.meta.dirname, "../.proof"), { recursive: true });
  for (const [width, theme] of [
    [1360, "light"],
    [900, "dark"],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(
        import.meta.dirname,
        "../.proof/m5-" + theme + "-" + width + ".png",
      ),
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: [
          "initial explicit approval",
          "profile disclosure",
          "pending checks block Apply",
          "failed checks block Apply",
          "same-manifest pass enables review",
          "stale output blocks Apply",
          "manual verification requires approval",
          "scoped activity bigint cursor",
          "reconnect no model replay",
          "1360 light and 900 dark reduced motion",
          "two independent coworker approvals and scoped stop",
          "zero page errors",
        ],
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
