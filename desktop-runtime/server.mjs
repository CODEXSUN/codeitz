import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import pg from "pg";
import { Runtime } from "./runtime.mjs";
import { MemoryError } from "./memory.mjs";
import { CodexClient } from "./codex-client.mjs";
import { CodeitzSource } from "./codeitz-source.mjs";
import { createAttachmentStore } from "./attachments.mjs";
import { ChatAttachments } from "./chat-attachments.mjs";
import { appWorkspaceRoot, retainedAppWorkspaceRoots } from "./workspace-policy.mjs";
import { createVerificationRunner } from "./verification-runner.mjs";

const config = JSON.parse(
  fs
    .readFileSync(process.env.CODEITZ_DESKTOP_CONFIG, "utf8")
    .replace(/^\uFEFF/, ""),
);
if (
  !config.token ||
  config.token.length < 32 ||
  !path.isAbsolute(config.codexPath) ||
  !path.isAbsolute(config.workspaceRoot)
)
  throw new Error("Private desktop configuration incomplete");
if (config.host && config.host !== "127.0.0.1")
  throw new Error("Desktop broker must remain loopback only");
const pool = new pg.Pool(
  config.database ?? { connectionString: config.databaseUrl },
);
const appRoot = appWorkspaceRoot(config);
const retainedRoots = retainedAppWorkspaceRoots(config);
const provider = new CodexClient(config.codexPath, appRoot);
const source = config.source?.credentialsPath
  ? new CodeitzSource({
      credentialsPath: config.source.credentialsPath,
      origin: config.source.origin ?? "http://127.0.0.1:14305",
    })
  : null;
const attachmentStore = config.attachmentsRoot
  ? await createAttachmentStore({
      root: config.attachmentsRoot,
      forbiddenRoots: config.allowedRepositoryRoots ?? ["D:/workspace/codebiz"],
    })
  : null;
const attachments = attachmentStore
  ? new ChatAttachments(pool, attachmentStore)
  : null;
const runtime = new Runtime(pool, provider, config.workspaceRoot, {
  source,
  attachments,
  appWorkspaceRoot: appRoot,
  retainedAppWorkspaceRoots: retainedRoots,
  maxConcurrentTurns: config.maxConcurrentTurns ?? 3,
  verificationRunner: createVerificationRunner({
    allowedWorkspaceRoot: appRoot,
    retainedWorkspaceRoots: retainedRoots,
    stateRoot: path.join(
      process.env.LOCALAPPDATA,
      "CodeitzDesktop",
      "verification",
    ),
  }),
  allowedRepositoryRoots: config.allowedRepositoryRoots ?? [
    "D:/workspace/codebiz",
  ],
});
await runtime.initialize();
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
};
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    if (host !== `127.0.0.1:${config.port ?? 43405}`)
      return json(res, 403, { message: "Unapproved host" });
    const origin = req.headers.origin;
    if (origin && !(config.allowedOrigins ?? []).includes(origin))
      return json(res, 403, { message: "Unapproved origin" });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST",
      });
      return res.end();
    }
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/health" && req.method === "GET") {
      await pool.query("SELECT 1");
      return json(res, provider.ready ? 200 : 503, { ready: provider.ready });
    }
    const authorization = req.headers.authorization ?? "";
    if (!/^Bearer [^\s]+$/.test(authorization))
      return json(res, 401, { message: "Desktop bearer session required" });
    const token = Buffer.from(authorization.slice(7));
    const expected = Buffer.from(config.token);
    if (token.length !== expected.length || !timingSafeEqual(token, expected))
      return json(res, 401, { message: "Desktop session required" });
    if (url.pathname === "/api/runtime/state" && req.method === "GET")
      return json(res, 200, await runtime.state());
    const activity = url.pathname.match(
      /^\/api\/runtime\/operations\/([0-9a-f-]{36})\/activity$/i,
    );
    if (activity && req.method === "GET")
      return json(
        res,
        200,
        await runtime.activityPage(
          activity[1],
          url.searchParams.get("after") ?? "0",
          Number(url.searchParams.get("limit") ?? 100),
        ),
      );
    const preview = url.pathname.match(
      /^\/api\/runtime\/conversations\/([0-9a-f-]{36})\/attachments\/([0-9a-f-]{36})$/i,
    );
    if (preview && req.method === "GET") {
      if (!attachments) throw new Error("Attachments are not configured");
      return json(res, 200, await attachments.preview(preview[1], preview[2]));
    }
    if (req.method !== "POST") return json(res, 404, { message: "Not found" });
    if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""))
      return json(res, 415, { message: "JSON required" });
    const chunks = [];
    let receivedBytes = 0;
    const upload =
      /^\/api\/runtime\/conversations\/[0-9a-f-]{36}\/attachments$/i.test(
        url.pathname,
      );
    const bodyLimit = upload ? 7 * 1024 * 1024 : 32000;
    for await (const chunk of req) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > bodyLimit)
        return json(res, 413, { message: "Request too large" });
      chunks.push(chunk);
    }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    const body = JSON.parse(raw);
    if (url.pathname === "/api/runtime/memory/list" || url.pathname === "/api/runtime/memory/save") {
      try {
        const result = url.pathname.endsWith("/list") ? await runtime.memory.list(body) : await runtime.memory.save(body);
        return json(res, 200, result);
      } catch (error) {
        return json(res, error instanceof MemoryError ? error.status : 500, { message: error instanceof MemoryError ? error.message : "Memory unavailable" });
      }
    }
    let attachmentMatch = url.pathname.match(
      /^\/api\/runtime\/conversations\/([0-9a-f-]{36})\/attachments$/i,
    );
    if (attachmentMatch) {
      if (!attachments) throw new Error("Attachments are not configured");
      return json(res, 201, await attachments.stage(attachmentMatch[1], body));
    }
    attachmentMatch = url.pathname.match(
      /^\/api\/runtime\/conversations\/([0-9a-f-]{36})\/attachments\/([0-9a-f-]{36})\/remove$/i,
    );
    if (attachmentMatch) {
      if (!attachments) throw new Error("Attachments are not configured");
      return json(
        res,
        200,
        await attachments.remove(attachmentMatch[1], attachmentMatch[2]),
      );
    }
    if (url.pathname === "/api/runtime/apps")
      return json(res, 201, await runtime.registerApp(body));
    if (url.pathname === "/api/runtime/conversations")
      return json(
        res,
        201,
        await runtime.conversation(body.title, body.appId ?? null),
      );
    let match = url.pathname.match(
      /^\/api\/runtime\/apps\/([0-9a-f-]{36})\/inspect$/i,
    );
    if (match) return json(res, 200, await runtime.inspectApp(match[1]));
    match = url.pathname.match(
      /^\/api\/runtime\/conversations\/([0-9a-f-]{36})\/coworkers$/i,
    );
    if (match)
      return json(res, 201, await runtime.coworker(match[1], body.name));
    match = url.pathname.match(
      /^\/api\/runtime\/conversations\/([0-9a-f-]{36})\/messages$/i,
    );
    if (match)
      return json(
        res,
        202,
        await runtime.chat(
          match[1],
          body.text,
          body.requestKey,
          body.attachmentIds ?? [],
        ),
      );
    if (url.pathname === "/api/runtime/workers")
      return json(res, 201, await runtime.prepare(body));
    match = url.pathname.match(
      /^\/api\/runtime\/workers\/([0-9a-f-]{36})\/verification\/(prepare|approve)$/i,
    );
    if (match)
      return json(
        res,
        match[2] === "approve" ? 202 : 201,
        await runtime.verification[match[2]](match[1], body.digest),
      );
    match = url.pathname.match(
      /^\/api\/runtime\/workers\/([0-9a-f-]{36})\/(changes|apply)$/i,
    );
    if (match)
      return json(res, 200, await runtime[match[2]](match[1], body.digest));
    match = url.pathname.match(
      /^\/api\/runtime\/workers\/([0-9a-f-]{36})\/(approve|reject)$/i,
    );
    if (match)
      return json(
        res,
        match[2] === "approve" ? 202 : 200,
        await runtime[match[2]](match[1], body.digest),
      );
    match = url.pathname.match(
      /^\/api\/runtime\/operations\/([0-9a-f-]{36})\/resolve$/i,
    );
    if (match) return json(res, 200, await runtime.resolve(match[1], body));
    match = url.pathname.match(
      /^\/api\/runtime\/operations\/([0-9a-f-]{36})\/interrupt$/i,
    );
    if (match) return json(res, 200, await runtime.interrupt(match[1]));
    return json(res, 404, { message: "Not found" });
  } catch (error) {
    json(res, 400, { message: error.message });
  }
});
server.listen(config.port ?? 43405, "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      ready: true,
      host: "127.0.0.1",
      port: config.port ?? 43405,
    }),
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close();
    runtime.close().finally(() => process.exit(0));
  });
