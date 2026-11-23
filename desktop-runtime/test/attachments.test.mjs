import test from "node:test";
import assert from "node:assert/strict";
import { validateTextAttachment, MAX_ATTACHMENT_BYTES } from "../attachments.mjs";

test("validates bounded UTF-8 text without accepting binary content", () => {
  assert.equal(validateTextAttachment(Buffer.from("Hello 世界")), "Hello 世界");
  for (const input of [Buffer.alloc(0), Buffer.alloc(MAX_ATTACHMENT_BYTES + 1), Buffer.from([0xff]), Buffer.from([0x61, 0])]) {
    assert.throws(() => validateTextAttachment(input));
  }
});
import { mkdtemp, mkdir, rm, readFile, writeFile, rename, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createAttachmentStore } from "../attachments.mjs";

test("private staging scopes IDs, validates bytes and enforces count", async () => {
 const root = await mkdtemp(join(tmpdir(), "codeitz-attachment-test-"));
 try {
  const store = await createAttachmentStore({root}); const conversationId = randomUUID(); const foreign = randomUUID();
  const item = await store.stage({conversationId, name:"note.txt", mime:"text/plain", bytes:Buffer.from("hello")});
  assert.equal((await store.get(conversationId, item.id)).text, "hello");
  await assert.rejects(store.get(foreign, item.id));
  await assert.rejects(store.get("../foreign", item.id));
  await assert.rejects(store.stage({conversationId, name:"../x", mime:"text/plain", bytes:Buffer.from("x")}));
  await assert.rejects(store.stage({conversationId, name:"bad.txt", mime:"text/plain", bytes:Buffer.from([255])}));
  await assert.rejects(store.stage({conversationId, name:"bad.png", mime:"image/png", bytes:Buffer.from("not image")}));
  await assert.rejects(store.stage({conversationId, name:"large.txt", mime:"text/plain", bytes:Buffer.alloc(MAX_ATTACHMENT_BYTES+1)}));
  for(let n=0;n<4;n++) await store.stage({conversationId, name:`${n}.txt`, mime:"text/plain", bytes:Buffer.from("x")});
  await assert.rejects(store.stage({conversationId, name:"six.txt", mime:"text/plain", bytes:Buffer.from("x")}));
  await store.markSent(conversationId, item.id);
  await assert.rejects(store.remove(conversationId, item.id));
  const next = await store.stage({conversationId, name:"next.txt", mime:"text/plain", bytes:Buffer.from("next")});
  assert.equal((await store.get(conversationId, item.id)).sent, true);
  await store.remove(conversationId, next.id); await assert.rejects(store.get(conversationId, next.id));
 } finally { await rm(root,{recursive:true,force:true}); }
});

test("native OCR recognizes the synthetic image and rejects corrupt or mismatched data", async () => {
 const root = await mkdtemp(join(tmpdir(), "codeitz-image-test-"));
 try {
  const store = await createAttachmentStore({root}); const conversationId = randomUUID();
  const bytes = await readFile(new URL("./ocr-fixture.png", import.meta.url));
  const image = await store.stage({conversationId,name:"fixture.png",mime:"image/png",bytes});
  assert.match(image.text, /CODEITZ TEST 4829/i);
  assert.equal(image.width, 800); assert.equal(image.height, 160);
  assert.deepEqual((await store.get(conversationId,image.id)).bytes, bytes);
  const imagePath = await store.resolveImagePath(conversationId, image.id);
  assert.match(imagePath, /\.png$/);
  const resolved = await readFile(imagePath);
  assert.deepEqual(resolved, bytes);
  assert.equal(createHash("sha256").update(resolved).digest("hex"), image.sha256);
  await assert.rejects(store.resolveImagePath(randomUUID(), image.id));
  const legacy = join(root, conversationId, `${image.id}.bin`);
  await rename(imagePath, legacy);
  assert.deepEqual((await store.get(conversationId, image.id)).bytes, bytes);
  assert.equal(await store.resolveImagePath(conversationId, image.id), imagePath);
  assert.deepEqual(await readFile(legacy), bytes);
  assert.deepEqual(await readFile(imagePath), bytes);
  await assert.rejects(store.get(randomUUID(),image.id));
  await assert.rejects(store.stage({conversationId,name:"bad.png",mime:"image/png",bytes:bytes.subarray(0,32)}));
  await assert.rejects(store.stage({conversationId,name:"bad.jpg",mime:"image/jpeg",bytes}));
  const oversized = await readFile(new URL("./oversized-image.png", import.meta.url));
  await assert.rejects(store.stage({conversationId,name:"oversized.png",mime:"image/png",bytes:oversized}), /dimensions/);
 } finally { await rm(root,{recursive:true,force:true}); }
});

test("rejects linked root, directories, metadata and attachment files", async (t) => {
 const base = await mkdtemp(join(tmpdir(), "codeitz-links-test-"));
 try {
  const root = join(base, "store"); const outside = join(base, "outside"); await mkdir(root); await mkdir(outside);
  const linkedRoot = join(base, "linked-root"); await symlink(root, linkedRoot, "junction");
  await assert.rejects(createAttachmentStore({root:linkedRoot}), /Invalid attachment directory/);
  const nested = join(base, "linked-parent"); await symlink(root, nested, "junction");
  await assert.rejects(createAttachmentStore({root:join(nested,"child")}), /Invalid attachment directory/);
  const store = await createAttachmentStore({root}); const conversationId = randomUUID();
  const item = await store.stage({conversationId,name:"data.txt",mime:"text/plain",bytes:Buffer.from("safe")});
  const dir = join(root,conversationId); const metadata = join(dir,`${item.id}.json`); const data = join(dir,`${item.id}.bin`);
  const metadataSaved = join(outside,"metadata.json"); await rename(metadata,metadataSaved);
  try {
   await symlink(metadataSaved, metadata, "file");
   await assert.rejects(store.get(conversationId,item.id), /Invalid attachment file/);
   await assert.rejects(store.markSent(conversationId,item.id), /Invalid attachment file/);
   await assert.rejects(store.remove(conversationId,item.id), /Invalid attachment file/);
   await assert.rejects(store.stage({conversationId,name:"new.txt",mime:"text/plain",bytes:Buffer.from("new")}), /Invalid attachment file/);
   await rm(metadata);
  } catch(error) {
   if (error.code !== "EPERM") throw error;
   t.diagnostic("File symlinks unavailable without Windows privileges; metadata hardlink check still runs.");
  }
  await link(metadataSaved, metadata);
  await assert.rejects(store.get(conversationId,item.id), /Invalid attachment file/);
  await rm(metadata); await rename(metadataSaved,metadata);
  const saved = join(outside,"data.bin"); await rename(data,saved); await link(saved,data);
  await assert.rejects(store.get(conversationId,item.id), /Invalid attachment file/);
  await assert.rejects(store.markSent(conversationId,item.id), /Invalid attachment file/);
  await assert.rejects(store.remove(conversationId,item.id), /Invalid attachment file/);
  assert.equal((await readFile(saved)).toString(), "safe");
 } finally { await rm(base,{recursive:true,force:true}); }
});

test("reserved IDs are idempotent and incomplete remnants are preserved", async () => {
 const root = await mkdtemp(join(tmpdir(), "codeitz-retry-test-"));
 try {
  const store = await createAttachmentStore({root}); const conversationId = randomUUID(); const reserved = randomUUID();
  const input = { conversationId, id:reserved, name:"retry.txt", mime:"text/plain", bytes:Buffer.from("safe") };
  const [first, second] = await Promise.all([store.stage(input),store.stage(input)]);
  assert.deepEqual(second,first); assert.equal(first.id,reserved);
  for (let i=0;i<4;i++) await store.stage({conversationId,name:`${i}.txt`,mime:"text/plain",bytes:Buffer.from("x")});
  assert.deepEqual(await store.stage(input),first);
  await assert.rejects(store.stage({...input,bytes:Buffer.from("changed")}),/conflicts/);
  await assert.rejects(store.stage({...input,name:"changed.txt"}),/conflicts/);
  await assert.rejects(store.stage({...input,mime:"image/png"}),/conflicts/);
  await store.markSent(conversationId,reserved);
  const sent = await store.stage(input); assert.equal(sent.sent,true);
  await assert.rejects(store.stage({...input,bytes:Buffer.from("changed")}),/conflicts/);
  const other = randomUUID(); const incomplete = randomUUID(); const dir = join(root,other); await mkdir(dir);
  const remnant = join(dir,`${incomplete}.tmp.bin`); await writeFile(remnant,"partial");
  await assert.rejects(store.stage({...input,conversationId:other,id:incomplete}),/reconciliation/);
  assert.equal(await readFile(remnant,"utf8"),"partial");
  await assert.rejects(store.stage({...input,id:"../bad"}),/Invalid/);
 } finally { await rm(root,{recursive:true,force:true}); }
});

test("discardPending removes only hash-matched owned incomplete stages", async () => {
 const root = await mkdtemp(join(tmpdir(), "codeitz-discard-test-"));
 try {
  const store = await createAttachmentStore({root}); const conversationId = randomUUID(); const key = randomUUID(); const dir = join(root,conversationId); await mkdir(dir);
  const bytes = Buffer.from("safe incomplete"); const sha256 = createHash("sha256").update(bytes).digest("hex");
  const input = {conversationId,id:key,mime:"text/plain",sha256}; const temp = join(dir,`${key}.tmp.bin`); const data = join(dir,`${key}.bin`);
  await writeFile(temp,bytes);
  await assert.rejects(store.discardPending({...input,sha256:"0".repeat(64)}),/digest/); assert.deepEqual(await readFile(temp),bytes);
  await assert.rejects(store.discardPending({...input,conversationId:randomUUID()}),/not found/);
  await assert.rejects(store.discardPending({...input,mime:"image/png"}),/unrecognized/);
  await link(temp,data); assert.deepEqual(await store.discardPending(input),{discarded:2});
  await assert.rejects(readFile(temp)); await assert.rejects(readFile(data));
  const complete = await store.stage({conversationId,id:key,name:"a.txt",mime:"text/plain",bytes});
  await assert.rejects(store.discardPending(input),/complete/); assert.deepEqual((await store.get(conversationId,key)).bytes,bytes);
  await store.markSent(conversationId,complete.id); await assert.rejects(store.discardPending(input),/complete/);
  const external = join(root,"external"); await writeFile(external,bytes); const bad = randomUUID(); const badPath = join(dir,`${bad}.tmp.bin`); await link(external,badPath);
  await assert.rejects(store.discardPending({...input,id:bad}),/links/); assert.deepEqual(await readFile(external),bytes);
  const partial = randomUUID(); const partialPath = join(dir,`${partial}.tmp.bin`); await writeFile(partialPath,"partial");
  await assert.rejects(store.discardPending({...input,id:partial}),/digest/); assert.equal(await readFile(partialPath,"utf8"),"partial");
 } finally { await rm(root,{recursive:true,force:true}); }
});
