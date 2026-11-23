import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm, readdir, realpath, lstat, link } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, parse, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const execute = promisify(execFile);
const helper = fileURLToPath(new URL("./native-ocr/target/debug/codeitz-native-ocr.exe", import.meta.url));
const imageExtensions = Object.freeze({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" });
const imageTypes = new Set(Object.keys(imageExtensions));
function extension(mime) { if (Object.hasOwn(imageExtensions, mime)) return imageExtensions[mime]; if (mime === "text/plain") return ".bin"; throw new Error("Invalid attachment type."); }
const id = (value) => { if (typeof value !== "string" || !uuid.test(value)) throw new Error("Invalid attachment scope or ID."); return value.toLowerCase(); };
export function validateTextAttachment(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("Text attachment size is invalid.");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("Text attachment must be valid UTF-8."); }
  if (text.includes("\u0000")) throw new Error("Text attachment contains a NUL character.");
  return text;
}
function matches(bytes, mime) {
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}
async function inspectImage(path) {
  if (process.platform !== "win32") throw new Error("Windows OCR is unavailable on this platform.");
  let output;
  try { ({ stdout: output } = await execute(helper, [path], { windowsHide: true, timeout: 30000, maxBuffer: 512 * 1024, encoding: "utf8" })); }
  catch (error) {
    try { const result = JSON.parse(error.stdout); if (typeof result.error === "string") throw new Error(result.error); }
    catch (parsed) { if (!(parsed instanceof SyntaxError)) throw parsed; }
    throw new Error("Local image decoding or OCR is unavailable.");
  }
  const result = JSON.parse(output.replace(/^\uFEFF/, ""));
  if (!result.ok) throw new Error(result.error || "Image decoding or OCR failed.");
  return result;
}
// Path checks fail closed on links and unexpected filesystem aliases. They do not
// eliminate concurrent replacement between checking and opening a path.
function samePath(a, b) { return process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b); }
async function checkDirectories(path, create = false) {
  const absolute = resolve(path); const base = parse(absolute).root;
  let current = base;
  for (const component of absolute.slice(base.length).split(sep).filter(Boolean)) {
    current = join(current, component);
    if (create) { try { await mkdir(current); } catch (error) { if (error.code !== "EEXIST") throw error; } }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory() || !samePath(await realpath(current), current)) throw new Error("Invalid attachment directory: link or noncanonical path.");
  }
}
async function checkFile(path) {
  await checkDirectories(resolve(path, ".."));
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || !samePath(await realpath(path), path)) throw new Error("Invalid attachment file: link or noncanonical path.");
}
async function checkedRead(path, options) { await checkFile(path); return readFile(path, options); }
async function checkedRemove(path, optional = false) {
  try { await checkFile(path); } catch (error) { if (optional && error.code === "ENOENT") return; throw error; }
  await rm(path);
}
// root must be an application-owned private directory, never a repository snapshot.
export async function createAttachmentStore({ root, forbiddenRoots = [] }) {
  if (!isAbsolute(root)) throw new Error("Attachment root must be absolute.");
  root = resolve(root);
  await checkDirectories(root, true);
  for (const blocked of forbiddenRoots) { const base = await realpath(blocked); const rel = relative(base, root); if (!(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))) throw new Error("Attachment root is inside a repository."); }
  const locks = new Map();
  async function serial(scope, action) { const prior = locks.get(scope) ?? Promise.resolve(); const next = prior.catch(() => {}).then(action); locks.set(scope, next); try { return await next; } finally { if (locks.get(scope) === next) locks.delete(scope); } }
  async function directory(scope) { const path = join(root, id(scope)); await checkDirectories(path, true); return path; }
  async function get(scope, attachmentId) {
    const dir = await directory(scope); const key = id(attachmentId);
    const meta = JSON.parse(await checkedRead(join(dir, `${key}.json`), "utf8"));
    if (meta.id !== key || meta.conversationId !== id(scope)) throw new Error("Attachment scope mismatch.");
    let bytes;
    try { bytes = await checkedRead(join(dir, `${key}${extension(meta.mime)}`)); }
    catch (error) { if (error.code !== "ENOENT" || meta.mime === "text/plain") throw error; bytes = await checkedRead(join(dir, `${key}.bin`)); }
    if (bytes.length !== meta.size || createHash("sha256").update(bytes).digest("hex") !== meta.sha256) throw new Error("Attachment integrity check failed.");
    return { ...meta, bytes };
  }
  return {
    async stage({ conversationId, id: reservedId, name, mime, bytes }) { const scope = id(conversationId); return serial(scope, async () => {
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("Attachment size is invalid.");
      if (typeof name !== "string" || !name.trim() || name.length > 255 || /[\x00-\x1f\/\\]/.test(name)) throw new Error("Attachment name is invalid.");
      bytes = Buffer.from(bytes); const dir = await directory(scope); const files = await readdir(dir);
      const key = reservedId === undefined ? randomUUID() : id(reservedId);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const existing = files.filter(file => file.startsWith(`${key}.`));
      if (existing.includes(`${key}.json`)) {
        const item = await get(scope, key);
        if (item.name !== name || item.mime !== mime || item.size !== bytes.length || item.sha256 !== digest || !item.bytes.equals(bytes)) throw new Error("Attachment ID conflicts with existing content.");
        const { bytes: savedBytes, ...metadata } = item;
        return metadata;
      }
      if (existing.length) throw new Error("Incomplete attachment requires reconciliation.");
      const records = await Promise.all(files.filter(x => uuid.test(x.replace(/\.json$/, "")) && x.endsWith(".json")).map(x => checkedRead(join(dir, x), "utf8").then(JSON.parse)));
      if (records.filter(record => !record.sent).length >= MAX_ATTACHMENTS) throw new Error("Draft attachment count limit reached.");
      const temp = join(dir, `${key}.tmp${extension(mime)}`); const data = join(dir, `${key}${extension(mime)}`); const metadata = join(dir, `${key}.json`);
      let text, width, height;
      try {
        if (mime === "text/plain") text = validateTextAttachment(bytes);
        else if (imageTypes.has(mime) && matches(bytes, mime)) {
          await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
          await checkFile(temp);
          const result = await inspectImage(temp);
          if (result.mime !== mime) throw new Error("Image format does not match MIME type.");
          ({ text, width, height } = result);
        } else throw new Error("Unsupported attachment type or invalid image signature.");
        if (mime === "text/plain") await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
        const meta = { id: key, conversationId: scope, sent: false, name, mime, size: bytes.length, sha256: digest, text, ...(width ? { width, height } : {}) };
        await checkFile(temp); await link(temp, data); await rm(temp); await checkFile(data); await writeFile(metadata, JSON.stringify(meta), { flag: "wx", mode: 0o600 }); await checkFile(metadata); return meta;
      } catch (error) { throw error; }
    }); },
    get,
    // The caller must authenticate and confirm the DB reservation belongs to this
    // conversation and is not linked to a message before invoking this method.
    async discardPending({ conversationId, id: attachmentId, mime, sha256 }) {
      const scope = id(conversationId); const key = id(attachmentId);
      const suffix = extension(mime);
      if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error("Invalid attachment digest.");
      return serial(scope, async () => {
        const dir = await directory(scope);
        const names = (await readdir(dir)).filter(name => name.toLowerCase().startsWith(`${key}.`));
        const allowed = new Set([`${key}.tmp${suffix}`, `${key}${suffix}`]);
        if (!names.length) throw new Error("Incomplete attachment was not found.");
        if (names.some(name => !allowed.has(name))) throw new Error("Attachment is complete or has unrecognized remnants.");
        const entries = [];
        for (const name of names) {
          const path = join(dir, name);
          await checkDirectories(dir);
          const info = await lstat(path, { bigint: true });
          if (info.isSymbolicLink() || !info.isFile() || !samePath(await realpath(path), path) || info.size === 0n || info.size > BigInt(MAX_ATTACHMENT_BYTES)) throw new Error("Invalid attachment remnant.");
          entries.push({ path, info });
        }
        const validSingle = entries.length === 1 && entries[0].info.nlink === 1n;
        const validPair = entries.length === 2 && entries.every(entry => entry.info.nlink === 2n) && entries[0].info.dev === entries[1].info.dev && entries[0].info.ino === entries[1].info.ino;
        if (!validSingle && !validPair) throw new Error("Invalid attachment remnant links.");
        for (const entry of entries) {
          const contents = await readFile(entry.path);
          if (createHash("sha256").update(contents).digest("hex") !== sha256) throw new Error("Attachment remnant digest mismatch.");
        }
        for (const entry of entries) await rm(entry.path);
        return { discarded: entries.length };
      });
    },
    async resolveImagePath(conversationId, attachmentId) {
      const item = await get(conversationId, attachmentId); if (!imageTypes.has(item.mime)) throw new Error("Attachment is not an image.");
      const path = join(await directory(conversationId), `${item.id}${extension(item.mime)}`);
      // Preserve any legacy .bin file; create a format-named copy only after digest validation.
      try { await writeFile(path, item.bytes, { flag: "wx", mode: 0o600 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      const bytes = await checkedRead(path);
      if (bytes.length !== item.size || createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error("Attachment integrity check failed.");
      return path;
    },
    async markSent(conversationId, attachmentId) { const scope = id(conversationId); return serial(scope, async () => {
      const item = await get(scope, attachmentId); if (item.sent) return;
      const { bytes, ...meta } = item; meta.sent = true;
      const dir = await directory(scope); const temp = join(dir, `${item.id}.meta-tmp`);
      try { await writeFile(temp, JSON.stringify(meta), { flag: "wx", mode: 0o600 }); await checkFile(temp); await checkFile(join(dir, `${item.id}.json`)); await rename(temp, join(dir, `${item.id}.json`)); }
      finally { await checkedRemove(temp, true); }
    }); },
    async remove(conversationId, attachmentId) { const scope = id(conversationId); return serial(scope, async () => { const item = await get(scope, attachmentId); if (item.sent) throw new Error("Sent attachments cannot be removed."); const dir = await directory(scope); await checkFile(join(dir, `${item.id}.json`)); await checkFile(join(dir, `${item.id}${extension(item.mime)}`)).catch(async error => { if (error.code !== "ENOENT" || item.mime === "text/plain") throw error; await checkFile(join(dir, `${item.id}.bin`)); }); await checkedRemove(join(dir, `${item.id}.json`)); await checkedRemove(join(dir, `${item.id}${extension(item.mime)}`), true); if (item.mime !== "text/plain") await checkedRemove(join(dir, `${item.id}.bin`), true); }); },
  };
}
