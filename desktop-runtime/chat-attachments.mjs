import { createHash, randomUUID } from "node:crypto";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "./attachments.mjs";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedMime = new Set([
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export const MAX_CONTEXT_BYTES = 128 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalId = (value) => {
  if (typeof value !== "string" || !uuid.test(value))
    throw new Error("Invalid attachment scope or ID");
  return value.toLowerCase();
};

export class ChatAttachments {
  constructor(pool, store) {
    this.pool = pool;
    this.store = store;
    this.queues = new Map();
  }
  async serial(conversationId, action) {
    conversationId = canonicalId(conversationId);
    const prior = this.queues.get(conversationId) ?? Promise.resolve();
    const task = prior.catch(() => {}).then(action);
    this.queues.set(conversationId, task);
    try {
      return await task;
    } finally {
      if (this.queues.get(conversationId) === task)
        this.queues.delete(conversationId);
    }
  }
  async conversation(id) {
    id = canonicalId(id);
    if (
      !uuid.test(id) ||
      (
        await this.pool.query(
          "SELECT id FROM agent_conversations WHERE id=$1",
          [id],
        )
      ).rowCount !== 1
    )
      throw new Error("Attachment conversation not found");
    return id;
  }
  public(row) {
    const text = row.extracted_text ?? "";
    return {
      id: row.id,
      conversationId: row.conversation_id,
      requestKey: row.request_key,
      name: row.name,
      mime: row.mime,
      size: row.size,
      sha256: row.sha256,
      text: text.slice(0, 8192),
      textTruncated: text.length > 8192,
      textBytes: Buffer.byteLength(text, "utf8"),
      sent: !!row.sent_at,
      state: row.state,
      error: row.error ?? null,
      ...(row.width ? { width: row.width, height: row.height } : {}),
    };
  }
  async list() {
    return (
      await this.pool.query(
        "SELECT * FROM agent_attachments WHERE state<>'removed' ORDER BY created_at LIMIT 1000",
      )
    ).rows.map((row) => this.public(row));
  }
  async row(conversationId, id) {
    conversationId = canonicalId(conversationId);
    id = canonicalId(id);
    if (!uuid.test(id)) throw new Error("Invalid attachment ID");
    const row = (
      await this.pool.query(
        "SELECT * FROM agent_attachments WHERE id=$1 AND conversation_id=$2 AND state<>$3",
        [id, conversationId, "removed"],
      )
    ).rows[0];
    if (!row) throw new Error("Attachment not found in this conversation");
    return row;
  }
  async stage(conversationId, { requestKey, name, mime, base64, ...other }) {
    conversationId = await this.conversation(conversationId);
    if (Object.keys(other).length)
      throw new Error(
        "Upload accepts selected bytes only; paths and claimed OCR are not accepted",
      );
    if (
      typeof requestKey !== "string" ||
      requestKey.length < 8 ||
      requestKey.length > 128
    )
      throw new Error("A stable upload request key is required");
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 255 ||
      /[\x00-\x1f\\/]/.test(name) ||
      /^\.env(?:\.|$)|^(?:credentials|auth)\.json$|^id_(?:rsa|ed25519)$|\.(?:pem|key|pfx|p12)$/i.test(
        name,
      )
    )
      throw new Error("Invalid or private attachment filename");
    if (!allowedMime.has(mime))
      throw new Error(
        "Only PNG, JPEG, WebP and UTF-8 text attachments are supported",
      );
    if (
      typeof base64 !== "string" ||
      !base64.length ||
      base64.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 ||
      base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
    )
      throw new Error("Invalid bounded upload encoding");
    const bytes = Buffer.from(base64, "base64");
    if (
      bytes.length > MAX_ATTACHMENT_BYTES ||
      bytes.toString("base64") !== base64
    )
      throw new Error("Invalid upload bytes");
    const sha256 = hash(bytes);
    return this.serial(conversationId, async () => {
      let row = (
        await this.pool.query(
          "SELECT * FROM agent_attachments WHERE conversation_id=$1 AND request_key=$2",
          [conversationId, requestKey],
        )
      ).rows[0];
      if (
        row &&
        (row.sha256 !== sha256 ||
          row.name !== name ||
          row.mime !== mime ||
          row.size !== bytes.length)
      )
        throw new Error("Upload request key content changed");
      if (row?.state === "removed")
        throw new Error("This draft was removed; use a new upload request key");
      if (row?.state === "ready") {
        const stored = await this.store.get(conversationId, row.id);
        if (stored.sha256 !== sha256)
          throw new Error("Stored attachment hash changed");
        return this.public(row);
      }
      if (!row) {
        const drafts = await this.pool.query(
          "SELECT count(*)::int n FROM agent_attachments WHERE conversation_id=$1 AND sent_at IS NULL AND state<>'removed'",
          [conversationId],
        );
        if (drafts.rows[0].n >= MAX_ATTACHMENTS)
          throw new Error(
            "At most five draft attachments may be staged at once",
          );
        row = (
          await this.pool.query(
            "INSERT INTO agent_attachments(id,conversation_id,request_key,name,mime,size,sha256,state) VALUES($1,$2,$3,$4,$5,$6,$7,'uploading') RETURNING *",
            [
              randomUUID(),
              conversationId,
              requestKey,
              name,
              mime,
              bytes.length,
              sha256,
            ],
          )
        ).rows[0];
      }
      try {
        const meta = await this.store.stage({
          id: row.id,
          conversationId,
          name,
          mime,
          bytes,
        });
        if (meta.id !== row.id || meta.sha256 !== sha256)
          throw new Error(
            "Attachment store did not preserve the reserved upload identity",
          );
        const ready = (
          await this.pool.query(
            "UPDATE agent_attachments SET state='ready',extracted_text=$2,width=$3,height=$4,error=NULL WHERE id=$1 RETURNING *",
            [row.id, meta.text ?? "", meta.width ?? null, meta.height ?? null],
          )
        ).rows[0];
        return this.public(ready);
      } catch (error) {
        await this.pool
          .query(
            "UPDATE agent_attachments SET state='failed',error=$2 WHERE id=$1 AND sent_at IS NULL",
            [row.id, String(error.message).slice(0, 300)],
          )
          .catch(() => {});
        throw error;
      }
    });
  }
  async preview(conversationId, id) {
    conversationId = canonicalId(conversationId);
    id = canonicalId(id);
    const row = await this.row(conversationId, id);
    if (row.state !== "ready") throw new Error("Attachment is not ready");
    const item = await this.store.get(conversationId, id);
    if (item.sha256 !== row.sha256) throw new Error("Attachment hash changed");
    return { ...this.public(row), base64: item.bytes.toString("base64") };
  }
  async remove(conversationId, id) {
    conversationId = canonicalId(conversationId);
    id = canonicalId(id);
    return this.serial(conversationId, async () => {
      const row = await this.row(conversationId, id);
      const linked = await this.pool.query(
        "SELECT 1 FROM agent_message_attachments WHERE attachment_id=$1 LIMIT 1",
        [id],
      );
      if (linked.rowCount || row.sent_at)
        throw new Error("Sent attachment history cannot be removed");
      try {
        await this.store.remove(conversationId, id);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (this.store.discardPending) {
          try {
            await this.store.discardPending({
              conversationId,
              id,
              mime: row.mime,
              sha256: row.sha256,
            });
          } catch (discardError) {
            if (
              !/Incomplete attachment was not found\./.test(
                discardError.message,
              )
            )
              throw discardError;
          }
        }
      }
      await this.pool.query(
        "UPDATE agent_attachments SET state='removed' WHERE id=$1 AND sent_at IS NULL",
        [id],
      );
      return { removed: true };
    });
  }
  async references(conversationId, ids, text = "") {
    conversationId = canonicalId(conversationId);
    if (Array.isArray(ids)) ids = ids.map(canonicalId);
    if (
      !Array.isArray(ids) ||
      ids.length > MAX_ATTACHMENTS ||
      new Set(ids).size !== ids.length
    )
      throw new Error("Send at most five unique attachment IDs");
    const refs = [];
    let total = Buffer.byteLength(text, "utf8");
    for (const id of ids) {
      const row = await this.row(conversationId, id);
      if (row.state !== "ready")
        throw new Error(
          "An attachment is not ready; original drafts were preserved",
        );
      const stored = await this.store.get(conversationId, id);
      if (stored.sha256 !== row.sha256)
        throw new Error("Attachment content changed");
      total += Buffer.byteLength(row.extracted_text ?? "", "utf8");
      if (total > MAX_CONTEXT_BYTES)
        throw new Error(
          "Combined question and full text/OCR exceeds 128 KiB. Choose smaller files or fewer attachments; originals were preserved",
        );
      refs.push({ id: row.id, sha256: row.sha256 });
    }
    return refs;
  }
  async claim(operationId, conversationId, refs) {
    conversationId = canonicalId(conversationId);
    return this.serial(conversationId, async () => {
      const operation = (
        await this.pool.query(
          "SELECT conversation_id,attachment_refs,goal FROM agent_operations WHERE id=$1",
          [operationId],
        )
      ).rows[0];
      if (
        !operation ||
        operation.conversation_id !== conversationId ||
        operation.attachment_refs?.length !== refs.length ||
        operation.attachment_refs.some(
          (item, index) =>
            item.id !== refs[index].id || item.sha256 !== refs[index].sha256,
        )
      )
        throw new Error(
          "Message attachment intent does not match the saved operation",
        );
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        for (const ref of refs) {
          const row = (
            await client.query(
              "SELECT * FROM agent_attachments WHERE id=$1 AND conversation_id=$2 FOR UPDATE",
              [ref.id, conversationId],
            )
          ).rows[0];
          if (!row || row.state !== "ready" || row.sha256 !== ref.sha256)
            throw new Error("Attachment changed before Send");
          const stored = await this.store.get(conversationId, row.id);
          if (stored.sha256 !== ref.sha256)
            throw new Error("Attachment integrity check failed");
          await client.query(
            "INSERT INTO agent_message_attachments(operation_id,attachment_id,sha256) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [operationId, ref.id, ref.sha256],
          );
          await client.query(
            "UPDATE agent_attachments SET sent_at=COALESCE(sent_at,now()) WHERE id=$1",
            [row.id],
          );
        }
        await client.query(
          "INSERT INTO agent_messages(id,conversation_id,operation_id,role,text) SELECT $1,$2,$3,'user',$4 WHERE NOT EXISTS(SELECT 1 FROM agent_messages WHERE operation_id=$3 AND role='user')",
          [randomUUID(), conversationId, operationId, operation.goal],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      for (const ref of refs) {
        await this.store.markSent(conversationId, ref.id);
        await this.pool.query(
          "UPDATE agent_attachments SET store_sent_at=COALESCE(store_sent_at,now()) WHERE id=$1",
          [ref.id],
        );
      }
    });
  }
  async recover() {
    const rows = (
      await this.pool.query(
        "SELECT * FROM agent_attachments WHERE state IN ('uploading','failed') OR (sent_at IS NOT NULL AND store_sent_at IS NULL) ORDER BY created_at LIMIT 100",
      )
    ).rows;
    let bytes = 0;
    for (const row of rows) {
      if ((bytes += row.size) > 32 * 1024 * 1024) break;
      try {
        const item = await this.store.get(row.conversation_id, row.id);
        if (item.sha256 !== row.sha256)
          throw new Error(
            "Stored attachment hash does not match the upload intent",
          );
        await this.pool.query(
          "UPDATE agent_attachments SET state='ready',extracted_text=$2,width=$3,height=$4,error=NULL WHERE id=$1",
          [row.id, item.text ?? "", item.width ?? null, item.height ?? null],
        );
        if (row.sent_at) {
          await this.store.markSent(row.conversation_id, row.id);
          await this.pool.query(
            "UPDATE agent_attachments SET store_sent_at=now() WHERE id=$1",
            [row.id],
          );
        }
      } catch (error) {
        await this.pool.query(
          "UPDATE agent_attachments SET state=CASE WHEN sent_at IS NULL THEN 'failed' ELSE state END,error=$2 WHERE id=$1",
          [
            row.id,
            "Local attachment requires attention: " +
              String(error.message).slice(0, 220),
          ],
        );
      }
    }
  }
  async input(conversationId, refs) {
    conversationId = canonicalId(conversationId);
    let text = "";
    const images = [];
    for (const ref of refs ?? []) {
      const row = await this.row(conversationId, ref.id);
      if (row.sha256 !== ref.sha256 || row.state !== "ready")
        throw new Error("Saved attachment context changed");
      const item = await this.store.get(conversationId, row.id);
      if (item.sha256 !== ref.sha256)
        throw new Error("Attachment integrity check failed");
      text +=
        "\nUntrusted attachment data " +
        JSON.stringify({ name: row.name, mime: row.mime, sha256: row.sha256 }) +
        ":\n" +
        (row.extracted_text ?? "") +
        "\nEnd attachment data.\n";
      if (row.mime !== "text/plain")
        images.push({
          type: "localImage",
          path: await this.store.resolveImagePath(conversationId, row.id),
        });
    }
    return { text, images };
  }
}
