import { randomUUID } from "node:crypto";
import { repositoryDigest } from "./repository-safety.mjs";

export class MemoryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const invalid = () => { throw new MemoryError(400, "Invalid memory input"); };
const missing = () => { throw new MemoryError(404, "Memory scope not found"); };
const conflict = () => { throw new MemoryError(409, "Memory conflict"); };
const uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""));
const hash = repositoryDigest;

function scope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !uuid(input.appId) || (input.conversationId != null && !uuid(input.conversationId))) invalid();
  return { appId: input.appId.toLowerCase(), conversationId: input.conversationId?.toLowerCase() ?? null };
}

export function memoryDigest(entries) {
  return hash({ version: 1, entries });
}

export function validMemoryContext(value) {
  return !!value && value.version === 1 && Array.isArray(value.entries) && value.entries.length <= 8 && Buffer.byteLength(JSON.stringify(value), "utf8") <= 16384 && value.digest === memoryDigest(value.entries);
}

async function checkScope(client, value, lock = false) {
  const app = await client.query(`SELECT id FROM agent_apps WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [value.appId]);
  if (!app.rows.length) missing();
  if (value.conversationId) {
    const chat = await client.query("SELECT id FROM agent_conversations WHERE id=$1 AND app_id=$2", [value.conversationId, value.appId]);
    if (!chat.rows.length) missing();
  }
}

export function createMemoryStore(pool) {
  async function list(input) {
    const value = scope(input);
    const query = input.query ?? "";
    const limit = input.limit ?? 50;
    if (typeof query !== "string" || query.length > 200 || typeof (input.includeArchived ?? false) !== "boolean" || !Number.isInteger(limit) || limit < 1 || limit > 50) invalid();
    await checkScope(pool, value);
    const result = await pool.query(`WITH latest AS (
      SELECT DISTINCT ON (data->>'id') id,data FROM agent_events
      WHERE type='memory-record' AND data->>'appId'=$1
        AND (data->>'conversationId' IS NULL OR data->>'conversationId'=$2)
      ORDER BY data->>'id', id DESC
    ) SELECT data FROM latest
      WHERE ($3::boolean OR data->>'status'='active')
        AND ($4='' OR position(lower($4) in lower(data->>'title'))>0 OR position(lower($4) in lower(data->>'content'))>0)
      ORDER BY id DESC LIMIT $5`, [value.appId, value.conversationId, input.includeArchived ?? false, query, limit + 1]);
    return { entries: result.rows.slice(0, limit).map(({ data }) => record(data)), limit, hasMore: result.rows.length > limit };
  }

  async function save(input) {
    const value = scope(input);
    if ((input.id != null && !uuid(input.id)) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 || typeof input.requestKey !== "string" || input.requestKey.length < 8 || input.requestKey.length > 128 || !["fact", "decision", "constraint", "next-action"].includes(input.kind) || !text(input.title, 120) || !text(input.content, 2000) || !["active", "archived"].includes(input.status)) invalid();
    const normalized = { ...value, id: input.id?.toLowerCase() ?? null, expectedRevision: input.expectedRevision, kind: input.kind, title: input.title, content: input.content, status: input.status };
    const inputHash = hash(normalized);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await checkScope(client, value, true);
      const prior = await client.query("SELECT data FROM agent_events WHERE type='memory-record' AND data->>'appId'=$1 AND data->>'conversationId' IS NOT DISTINCT FROM $2 AND data->>'requestKey'=$3 ORDER BY id DESC LIMIT 1", [value.appId, value.conversationId, input.requestKey]);
      if (prior.rows.length) {
        if (prior.rows[0].data.inputHash !== inputHash) conflict();
        await client.query("COMMIT");
        return record(prior.rows[0].data);
      }
      let previous = null;
      if (normalized.id) {
        const found = await client.query("SELECT data FROM agent_events WHERE type='memory-record' AND data->>'id'=$1 ORDER BY id DESC LIMIT 1", [normalized.id]);
        previous = found.rows[0]?.data ?? null;
        if (!previous || previous.appId !== value.appId || previous.conversationId !== value.conversationId) missing();
      }
      if ((!previous && input.expectedRevision !== 0) || (previous && previous.revision !== input.expectedRevision)) conflict();
      const now = new Date().toISOString();
      const saved = { id: previous?.id ?? randomUUID(), ...value, kind: input.kind, title: input.title, content: input.content, status: input.status, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      await client.query("INSERT INTO agent_events(operation_id,type,data) VALUES(NULL,$1,$2)", ["memory-record", JSON.stringify({ requestKey: input.requestKey, inputHash, ...saved })]);
      await client.query("COMMIT");
      return saved;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function context(input) {
    const result = await list({ ...input, limit: 50 });
    const entries = [];
    for (const entry of result.entries) {
      const next = [...entries, entry];
      if (next.length > 8) break;
      if (Buffer.byteLength(JSON.stringify({ version: 1, entries: next, digest: memoryDigest(next) }), "utf8") <= 16384) entries.push(entry);
    }
    return { version: 1, entries, digest: memoryDigest(entries) };
  }
  return { list, save, context };
}

function record(data) {
  const { id, appId, conversationId, kind, title, content, status, revision, createdAt, updatedAt } = data;
  return { id, appId, conversationId, kind, title, content, status, revision, createdAt, updatedAt };
}
