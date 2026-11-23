import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const origin = "http://127.0.0.1:43405";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const definitions = {
  status: {}, apps: {},
  chats: { app: 1 },
  activity: { app: 1, chat: 1, operation: 1, after: 0, limit: 0 },
  plan: { app: 1, chat: 1, file: 1, "request-key": 1 },
  "prepare-worker": { app: 1, chat: 1, coworker: 1, file: 1, "request-key": 1 },
  "memory-list": { app: 1, chat: 0, query: 0, "include-archived": 0 },
  "memory-save": { app: 1, chat: 0, file: 1 },
};

function parse(args) {
  const [command, ...rest] = args;
  if (!Object.hasOwn(definitions, command)) throw new Error("Unknown command");
  const schema = definitions[command];
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (!flag.startsWith("--")) throw new Error("Invalid flag");
    const name = flag.slice(2);
    if (!Object.hasOwn(schema, name) || Object.hasOwn(flags, name)) throw new Error("Invalid flag");
    if (name === "include-archived") flags[name] = true;
    else {
      const value = rest[++i];
      if (!value || value.startsWith("--")) throw new Error("Flag value required");
      flags[name] = value;
    }
  }
  for (const [name, required] of Object.entries(schema)) {
    if (required && !flags[name]) throw new Error("Required flag missing");
  }
  for (const name of ["app", "chat", "operation", "coworker"]) {
    if (flags[name] && !uuid.test(flags[name])) throw new Error("Invalid identifier");
  }
  if (flags["request-key"] && (flags["request-key"].length < 8 || flags["request-key"].length > 128)) throw new Error("Invalid request key");
  if (flags.after && !/^(0|[1-9][0-9]{0,18})$/.test(flags.after)) throw new Error("Invalid cursor");
  if (flags.limit && (!/^[1-9][0-9]*$/.test(flags.limit) || Number(flags.limit) > 100)) throw new Error("Invalid limit");
  if (flags.query && flags.query.length > 200) throw new Error("Invalid query");
  return { command, flags };
}

async function readInput(file) {
  const handle = await fs.open(file, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 32768) throw new Error("Input file too large or invalid");
    const buffer = Buffer.alloc(32769);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 32768) throw new Error("Input file too large or invalid");
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
  } finally { await handle.close(); }
}

function operation(value) {
  return { id: uuid.test(value?.id ?? "") ? value.id : null,
    kind: ["chat", "worker"].includes(value?.kind) ? value.kind : null,
    state: ["awaiting-approval", "starting", "running", "completed", "failed", "interrupted", "rejected"].includes(value?.state) ? value.state : null };
}

export function createDesktopLink({ config, fetch: transport, timeoutMs = 10000 }) {
  if (!config || typeof config.token !== "string" || config.token.length < 32 || /\s/.test(config.token) || (config.host && config.host !== "127.0.0.1") || (config.port != null && config.port !== 43405)) throw new Error("Invalid local configuration");
  if (typeof transport !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error("Invalid transport configuration");
  async function request(route, body) {
    const controller = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Local broker request timed out")); }, timeoutMs); });
      const response = await Promise.race([transport(origin + route, {
        method: body === undefined ? "GET" : "POST", redirect: "manual", signal: controller.signal,
        headers: { Authorization: `Bearer ${config.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }), timeout]);
      if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error("Local broker redirect rejected");
      if (!response.ok) throw new Error(`Local broker request failed (${Number.isInteger(response.status) ? response.status : "unknown"})`);
      return await Promise.race([response.json(), timeout]);
    } catch (error) {
      if (/^Local broker (request timed out|redirect rejected|request failed \([0-9]+\))$/.test(error?.message ?? "")) throw error;
      throw new Error("Local broker request failed");
    } finally { clearTimeout(timer); }
  }
  async function execute(args) {
    const { command, flags } = parse(args);
    let input;
    if (flags.file) {
      const text = await readInput(flags.file);
      if (command === "memory-save") {
        try { input = JSON.parse(text); } catch { throw new Error("Invalid memory file"); }
        const keys = ["id", "expectedRevision", "requestKey", "kind", "title", "content", "status"];
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !keys.includes(key)) || (input.id !== undefined && !uuid.test(input.id)) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || typeof input.requestKey !== "string" || input.requestKey.length < 8 || input.requestKey.length > 128 || !["fact", "decision", "constraint", "next-action"].includes(input.kind) || typeof input.title !== "string" || !input.title.trim() || input.title.length > 120 || typeof input.content !== "string" || !input.content.trim() || input.content.length > 2000 || !["active", "archived"].includes(input.status)) throw new Error("Invalid memory file");
      } else {
        if (!text.trim() || text.length > 16000) throw new Error("Invalid goal file");
        input = text;
      }
    }
    const state = await request("/api/runtime/state");
    if (command === "status") return { transport: "local", provider: "codex", available: state.provider?.available === true };
    if (command === "apps") return (state.apps ?? []).filter((x) => uuid.test(x.id ?? "")).map((x) => ({ id: x.id }));
    const equal = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
    if (!(state.apps ?? []).some((x) => equal(x.id, flags.app))) throw new Error("App scope not found");
    if (flags.chat && !(state.conversations ?? []).some((x) => equal(x.id, flags.chat) && equal(x.app_id, flags.app))) throw new Error("Chat scope not found");
    if (flags.coworker && !(state.coworkers ?? []).some((x) => equal(x.id, flags.coworker) && equal(x.conversation_id, flags.chat))) throw new Error("Coworker scope not found");
    if (command === "chats") return (state.conversations ?? []).filter((x) => uuid.test(x.id ?? "") && equal(x.app_id, flags.app)).map((x) => ({ id: x.id, appId: flags.app }));
    if (command === "activity") {
      if (!(state.operations ?? []).some((x) => equal(x.id, flags.operation) && equal(x.conversation_id, flags.chat))) throw new Error("Operation scope not found");
      const query = new URLSearchParams({ after: flags.after ?? "0", limit: flags.limit ?? "100" });
      const page = await request(`/api/runtime/operations/${flags.operation}/activity?${query}`);
      return { items: (page.items ?? []).map((x) => ({ id: /^(0|[1-9][0-9]{0,18})$/.test(String(x.id)) ? String(x.id) : null })), cursor: /^(0|[1-9][0-9]{0,18})$/.test(String(page.cursor)) ? String(page.cursor) : null, hasMore: page.hasMore === true };
    }
    let route, body;
    if (command === "plan") { route = `/api/runtime/conversations/${flags.chat}/messages`; body = { text: input, requestKey: flags["request-key"] }; }
    if (command === "prepare-worker") { route = "/api/runtime/workers"; body = { conversationId: flags.chat, coworkerId: flags.coworker, goal: input, requestKey: flags["request-key"] }; }
    if (command === "memory-list") { route = "/api/runtime/memory/list"; body = { appId: flags.app, conversationId: flags.chat ?? null, ...(flags.query ? { query: flags.query } : {}), ...(flags["include-archived"] ? { includeArchived: true } : {}) }; }
    if (command === "memory-save") { route = "/api/runtime/memory/save"; body = { ...input, appId: flags.app, conversationId: flags.chat ?? null }; }
    if (Buffer.byteLength(JSON.stringify(body)) > 32000) throw new Error("Request body too large");
    const result = await request(route, body);
    if (command === "memory-list") return { entries: (result.entries ?? []).map(memory), limit: result.limit, hasMore: result.hasMore === true };
    if (command === "memory-save") return memory(result);
    return operation(result);
  }
  return { execute };
}

function memory(record) {
  const keys = ["id", "appId", "conversationId", "kind", "title", "content", "status", "revision", "createdAt", "updatedAt"];
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(record ?? {}, key)).map((key) => [key, record[key]]));
}

async function main() {
  try {
    parse(process.argv.slice(2));
    const file = process.env.CODEITZ_DESKTOP_CONFIG ?? path.join(process.env.LOCALAPPDATA ?? "", "CodeitzDesktop", "runtime.json");
    const config = JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
    const result = await createDesktopLink({ config, fetch: globalThis.fetch }).execute(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const safe = /^(Unknown command|Invalid flag|Flag value required|Required flag missing|Invalid identifier|Invalid request key|Invalid cursor|Invalid limit|Invalid query|Invalid memory file|Invalid goal file|Input file too large or invalid|Invalid local configuration|Invalid transport configuration|App scope not found|Chat scope not found|Coworker scope not found|Operation scope not found|Request body too large|Local broker redirect rejected|Local broker request timed out|Local broker request failed(?: \([0-9]+\))?)$/;
    process.stderr.write(`${safe.test(error?.message ?? "") ? error.message : "Unable to run local supervisor command"}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
