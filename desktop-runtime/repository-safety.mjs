import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execute = promisify(execFile);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 48 * 1024 * 1024;
const MAX_CHANGE_BYTES = 1024 * 1024;
const forbiddenComponents = new Set([
  ".git",
  ".ssh",
  ".codex",
  ".mcp.json",
  ".gitmodules",
  ".npmrc",
  ".pypirc",
  "credentials.json",
  "auth.json",
  "id_rsa",
  "id_ed25519",
  ".codeitz",
  ".codeship",
  ".local",
  ".desktop-private",
  "desktop-proof",
  ".proof",
  ".codeitz-worker-result.json",
  "private",
  "secrets",
  ".secrets",
  "node_modules",
  "dist",
  "build",
  "target",
  ".idea",
  ".vscode",
]);
const inside = (root, candidate) =>
  candidate === root ||
  (!path.relative(root, candidate).startsWith(".." + path.sep) &&
    path.relative(root, candidate) !== ".." &&
    !path.isAbsolute(path.relative(root, candidate)));

export function safeRelative(relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.includes("\\") ||
    relative.includes(":") ||
    relative.startsWith("/") ||
    relative.includes("\0")
  )
    throw new Error("Unsafe repository path");
  const components = relative.split("/");
  if (
    components.some(
      (x) =>
        !x ||
        x === "." ||
        x === ".." ||
        forbiddenComponents.has(x.toLowerCase()) ||
        x.toLowerCase().startsWith(".env") ||
        /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(x) ||
        /[. ]$/.test(x) ||
        /\.(pem|key|pfx|p12)$/i.test(x),
    )
  )
    throw new Error("Private, generated, or unsafe path is excluded");
  return relative;
}

async function checkedFile(root, relative, { missing = false } = {}) {
  safeRelative(relative);
  const full = path.join(root, ...relative.split("/"));
  if (!inside(root, full)) throw new Error("Repository path escapes its root");
  let current = root;
  const components = relative.split("/");
  for (let i = 0; i < components.length; i++) {
    current = path.join(current, components[i]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error.code === "ENOENT" && missing) return { full, exists: false };
      throw error;
    }
    if (stat.isSymbolicLink() || (await fs.realpath(current)) !== current)
      throw new Error("Repository links and reparse paths are not allowed");
    if (i < components.length - 1 && !stat.isDirectory())
      throw new Error("Repository parent is not a directory");
    if (i === components.length - 1) {
      if (!stat.isFile() || stat.nlink !== 1)
        throw new Error("Only ordinary single-link files are allowed");
      return { full, exists: true, stat };
    }
  }
}

async function git(repository, args) {
  const hooks = path.join(os.tmpdir(), "codeitz-agent-empty-hooks");
  await fs.mkdir(hooks, { recursive: true });
  if (
    (await fs.lstat(hooks)).isSymbolicLink() ||
    (await fs.realpath(hooks)) !== hooks
  )
    throw new Error("Untrusted empty hooks path");
  const result = await execute(
    "git",
    [
      "--no-pager",
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "-c",
      `core.hooksPath=${hooks}`,
      "-C",
      repository,
      ...args,
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30000,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        GIT_NO_LAZY_FETCH: "1",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: path.join(hooks, "no-global-config"),
      },
    },
  );
  return result.stdout;
}

export async function inspectRepository(repositoryPath, allowedRoots) {
  if (typeof repositoryPath !== "string" || !path.isAbsolute(repositoryPath))
    throw new Error("An absolute repository folder is required");
  const selected = path.resolve(repositoryPath);
  const selectedStat = await fs.lstat(selected);
  if (
    !selectedStat.isDirectory() ||
    selectedStat.isSymbolicLink() ||
    (await fs.realpath(selected)) !== selected
  )
    throw new Error("Select the canonical repository folder, not a link");
  const approved = [];
  for (const root of allowedRoots ?? [])
    approved.push(await fs.realpath(path.resolve(root)));
  if (!approved.some((root) => inside(root, selected) && root !== selected))
    throw new Error("Repository is outside the approved local workspace");
  const top = await fs.realpath(
    (await git(selected, ["rev-parse", "--show-toplevel"])).trim(),
  );
  if (top !== selected) throw new Error("Select the repository root folder");
  const head = (await git(selected, ["rev-parse", "--verify", "HEAD"])).trim();
  if (!/^[a-f0-9]{40,64}$/.test(head))
    throw new Error("Repository needs an existing verified HEAD");
  const status = await git(selected, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const names = [
    ...new Set(
      (
        await git(selected, [
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
        ])
      )
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  if (names.length > 12000)
    throw new Error("Repository snapshot exceeds the current file limit");
  const files = [];
  const excludedFiles = [];
  let total = 0;
  for (const relative of names) {
    try {
      safeRelative(relative);
      const found = await checkedFile(selected, relative, { missing: true });
      if (!found.exists) continue;
      if (found.stat.size > MAX_FILE_BYTES)
        throw new Error("File exceeds snapshot size limit");
      const content = await fs.readFile(found.full);
      if (content.includes(0))
        throw new Error("Binary files are excluded from the text snapshot");
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(decoded))
        throw new Error("Private key material is excluded");
      total += content.length;
      if (total > MAX_SNAPSHOT_BYTES)
        throw new Error("Repository snapshot exceeds total size limit");
      files.push({ path: relative, hash: sha(content), size: content.length });
    } catch (error) {
      if (/total size limit/.test(error.message)) throw error;
      excludedFiles.push({
        path: relative,
        reason:
          error.code === "ENOENT"
            ? "missing"
            : String(error.message).slice(0, 160),
      });
    }
  }
  return {
    repository: selected,
    head,
    dirty: status.length > 0,
    status: status.replaceAll("\0", "\n"),
    dirtyFingerprint: sha(
      JSON.stringify({ head, status, files, excludedFiles }),
    ),
    files,
    excludedFiles,
    totalBytes: total,
  };
}

export async function makeSnapshot(baseline, workspace, allowedRoots) {
  const current = await inspectRepository(baseline.repository, allowedRoots);
  if (
    current.head !== baseline.head ||
    current.dirtyFingerprint !== baseline.dirtyFingerprint
  )
    throw new Error(
      "Repository changed after preparation; prepare a new approval",
    );
  await fs.mkdir(workspace, { recursive: true });
  if ((await fs.readdir(workspace)).length)
    throw new Error("Worker snapshot must start in an empty owned folder");
  for (const file of baseline.files) {
    const source = await checkedFile(baseline.repository, file.path);
    const content = await fs.readFile(source.full);
    if (sha(content) !== file.hash)
      throw new Error("Repository changed while copying the snapshot");
    const target = path.join(workspace, ...file.path.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, { flag: "wx" });
  }
  const after = await inspectRepository(baseline.repository, allowedRoots);
  if (after.dirtyFingerprint !== baseline.dirtyFingerprint)
    throw new Error("Repository changed while copying the snapshot");
}

async function listSnapshot(root, relative = "", budget = { entries: 0 }) {
  const files = [];
  const blocked = [];
  for await (const entry of await fs.opendir(path.join(root, relative))) {
    if (++budget.entries > 12000)
      throw new Error("Worker output exceeds the bounded entry limit");
    const name = relative ? relative + "/" + entry.name : entry.name;
    // This one reserved record belongs to the worker protocol, never source Apply.
    if (!relative && name === '.codeitz-worker-result.json') {
      const stat = await fs.lstat(path.join(root, name));
      if (entry.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= 16384) continue;
      blocked.push({path:name,reason:'Completion metadata must be a bounded single-link file'});
      continue;
    }
    try {
      safeRelative(name);
    } catch (error) {
      blocked.push({ path: name, reason: error.message });
      continue;
    }
    if (entry.isSymbolicLink()) {
      blocked.push({ path: name, reason: "Links cannot be applied" });
      continue;
    }
    if (entry.isDirectory()) {
      const nested = await listSnapshot(root, name, budget);
      files.push(...nested.files);
      blocked.push(...nested.blocked);
    } else if (entry.isFile()) files.push(name);
    else blocked.push({ path: name, reason: "Not an ordinary file" });
  }
  return { files, blocked };
}

export async function reviewChanges(baseline, workspace) {
  const current = await listSnapshot(workspace);
  const names = [
    ...new Set([...baseline.files.map((x) => x.path), ...current.files]),
  ].sort();
  const originals = new Map(baseline.files.map((x) => [x.path, x]));
  const files = [];
  const blocked = [...current.blocked];
  let total = 0;
  for (const relative of names) {
    try {
      const original = originals.get(relative);
      const found = await checkedFile(workspace, relative, { missing: true });
      if (found.exists && found.stat.size > MAX_FILE_BYTES)
        throw new Error("Only bounded UTF-8 text changes can be applied");
      const after = found.exists ? await fs.readFile(found.full) : null;
      if (after && (after.length > MAX_FILE_BYTES || after.includes(0)))
        throw new Error("Only bounded UTF-8 text changes can be applied");
      const afterText = after
        ? new TextDecoder("utf-8", { fatal: true }).decode(after)
        : null;
      if (afterText && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(afterText))
        throw new Error("Private key output cannot be applied");
      const afterHash = after ? sha(after) : null;
      if ((original?.hash ?? null) === afterHash) continue;
      total += after?.length ?? 0;
      if (total > MAX_CHANGE_BYTES)
        throw new Error("Change review exceeds one MiB limit");
      let beforeText = null;
      if (original) {
        const before = await fs.readFile(
          (await checkedFile(baseline.repository, relative)).full,
        );
        if (sha(before) !== original.hash)
          throw new Error(
            "Original checkout changed; a fresh task is required",
          );
        beforeText = new TextDecoder("utf-8", { fatal: true }).decode(before);
      }
      files.push({
        path: relative,
        kind: original ? (after ? "modified" : "deleted") : "added",
        beforeHash: original?.hash ?? null,
        afterHash,
        beforeText,
        afterText,
      });
    } catch (error) {
      blocked.push({
        path: relative,
        reason: String(error.message).slice(0, 200),
      });
    }
  }
  if (files.length > 50)
    blocked.push({
      path: "",
      reason: "More than fifty changed files require a smaller task",
    });
  const digest = sha(
    JSON.stringify({
      repository: baseline.repository,
      baselineFingerprint: baseline.dirtyFingerprint,
      files: files.map(({ path, kind, beforeHash, afterHash }) => ({
        path,
        kind,
        beforeHash,
        afterHash,
      })),
      blocked,
    }),
  );
  return {
    repository: baseline.repository,
    baselineFingerprint: baseline.dirtyFingerprint,
    digest,
    files,
    blocked,
  };
}

async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function hashCurrent(root, relative) {
  const file = await checkedFile(root, relative, { missing: true });
  return file.exists ? sha(await fs.readFile(file.full)) : null;
}

/** Publish only into absent names. A concurrent writer's replacement is never overwritten. */
export async function applyReviewedFiles(repository, files, backupDirectory) {
  if (
    files.length > 50 ||
    files.reduce(
      (sum, file) => sum + Buffer.byteLength(file.afterText ?? "", "utf8"),
      0,
    ) > MAX_CHANGE_BYTES
  )
    throw new Error("Reviewed apply exceeds its bounded text limits");
  await fs.mkdir(backupDirectory, { recursive: true });
  const changed = [];
  const receipt = {
    applied: false,
    files: [],
    rollbackConflicts: [],
    backupDirectory,
  };
  try {
    for (const file of files) {
      safeRelative(file.path);
      if (
        file.afterText !== null &&
        sha(Buffer.from(file.afterText, "utf8")) !== file.afterHash
      )
        throw new Error("Reviewed change content does not match its digest");
      if (
        file.beforeText !== null &&
        sha(Buffer.from(file.beforeText, "utf8")) !== file.beforeHash
      )
        throw new Error("Reviewed original content does not match its digest");
      const destination = path.join(repository, ...file.path.split("/"));
      if ((await hashCurrent(repository, file.path)) !== file.beforeHash)
        throw new Error("Checkout changed before applying " + file.path);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const parentActual = await fs.realpath(path.dirname(destination));
      if (
        parentActual !== path.dirname(destination) ||
        !inside(repository, parentActual)
      )
        throw new Error("Apply parent changed or escaped the repository");
      const record = { file, destination, backup: null, published: false };
      changed.push(record);
      if (file.beforeHash !== null) {
        record.backup = path.join(
          path.dirname(destination),
          ".codeitz-original-" + randomUUID(),
        );
        await fs.rename(destination, record.backup);
        if (sha(await fs.readFile(record.backup)) !== file.beforeHash)
          throw new Error("Concurrent original edit detected");
      }
      if (file.afterText !== null) {
        const stage = path.join(
          path.dirname(destination),
          ".codeitz-stage-" + randomUUID(),
        );
        try {
          await fs.writeFile(stage, file.afterText, {
            encoding: "utf8",
            flag: "wx",
          });
          await fs.link(stage, destination);
          record.published = true;
        } finally {
          await fs.unlink(stage).catch(() => {});
        }
      }
      if (file.afterText === null && (await exists(destination)))
        throw new Error(
          "Concurrent replacement prevents the reviewed deletion",
        );
      if (
        record.backup &&
        sha(await fs.readFile(record.backup)) !== file.beforeHash
      )
        throw new Error("Concurrent edit of the retained original detected");
      receipt.files.push({
        path: file.path,
        kind: file.kind,
        beforeHash: file.beforeHash,
        afterHash: file.afterHash,
      });
    }
    for (const record of changed) {
      if (record.backup) {
        const retained = path.join(
          backupDirectory,
          sha(record.file.path) + ".original",
        );
        await fs.copyFile(record.backup, retained);
        await fs.unlink(record.backup);
        record.retained = retained;
      }
    }
    receipt.applied = true;
    return receipt;
  } catch (error) {
    for (const record of changed.reverse()) {
      try {
        if (
          record.published &&
          (await hashCurrent(repository, record.file.path)) ===
            record.file.afterHash
        )
          await fs.unlink(record.destination);
        const original =
          record.backup && (await exists(record.backup))
            ? record.backup
            : record.retained;
        if (original && (await exists(original))) {
          if (!(await exists(record.destination))) {
            await fs.link(original, record.destination);
            await fs.unlink(original);
          } else
            receipt.rollbackConflicts.push({
              path: record.file.path,
              originalBackup: original,
              reason:
                "Concurrent destination retained; original backup preserved",
            });
        }
      } catch (rollbackError) {
        receipt.rollbackConflicts.push({
          path: record.file.path,
          reason: rollbackError.message,
          originalBackup: record.backup ?? record.retained,
        });
      }
    }
    receipt.error = String(error.message).slice(0, 400);
    return receipt;
  }
}

export async function applyChanges(
  baseline,
  manifest,
  workspace,
  backupDirectory,
  allowedRoots,
) {
  const fresh = await inspectRepository(baseline.repository, allowedRoots);
  if (
    fresh.dirtyFingerprint !== baseline.dirtyFingerprint ||
    fresh.head !== baseline.head
  )
    throw new Error(
      "Repository changed after approval; refusing to overwrite it",
    );
  const checked = await reviewChanges(baseline, workspace);
  if (checked.digest !== manifest.digest || checked.blocked.length)
    throw new Error("Reviewed changes changed or contain blocked paths");
  return applyReviewedFiles(
    baseline.repository,
    checked.files,
    backupDirectory,
  );
}

export async function verifyAppliedFiles(repository, files) {
  for (const file of files) {
    if ((await hashCurrent(repository, file.path)) !== file.afterHash)
      return false;
  }
  return true;
}

export function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  return value;
}
export const repositoryDigest = (value) =>
  sha(JSON.stringify(canonicalValue(value)));
