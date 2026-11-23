import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const MAX_REPORT_BYTES = 16384;
const safePath = (value) => typeof value === "string" && value.length > 0 && value.length <= 500 &&
  !value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value) &&
  !/^[A-Za-z]:/.test(value) && value.split("/").every((part) => part && part !== "." && part !== "..");
const strings = (value) => Array.isArray(value) && value.length <= 50 &&
  value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 500);

export function legacyCompletionAssessment() {
  return { version: 1, status: "legacy-unassessed", manifestDigest: null, summary: "No completion assessment was recorded.", missing: [], blockers: [], evidence: [] };
}

export function assessCompletion(report, manifest) {
  const digest = typeof manifest?.digest === "string" && /^[a-f0-9]{64}$/.test(manifest.digest) ? manifest.digest : null;
  const invalid = (summary) => ({ version: 1, status: "needs-work", manifestDigest: digest, summary, missing: ["A valid worker completion report is required."], blockers: [], evidence: [] });
  if (!report || typeof report !== "object" || Array.isArray(report) || report.version !== 1 ||
      !["ready", "partial", "blocked"].includes(report.status) ||
      typeof report.summary !== "string" || !report.summary.trim() || report.summary.length > 2000 ||
      ![report.completed, report.missing, report.blockers, report.evidence].every(strings) ||
      !report.evidence.every(safePath)) return invalid("Worker completion report is missing or invalid.");
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  const changed = new Set(files.map((item) => item.path));
  const evidence = [...report.evidence];
  const unreviewed = evidence.filter((item) => !changed.has(item));
  const missing = [...report.missing];
  const blockers = [...report.blockers];
  if (!digest || !files.length) missing.push("No changed source files were available for review.");
  if (!report.completed.length) missing.push("No completed work was reported.");
  if (!evidence.some((item) => changed.has(item))) missing.push("No evidence references a changed file.");
  if (unreviewed.length) missing.push("Some evidence paths are not in the change manifest: " + unreviewed.join(", "));
  if (manifest?.blocked === true || manifest?.blocked?.length) blockers.push("The change manifest contains blocked paths.");
  const ready = report.status === "ready" && !missing.length && !blockers.length;
  return { version: 1, status: ready ? "reported-ready" : "needs-work", manifestDigest: digest, summary: report.summary, missing, blockers, evidence };
}

export async function readCompletionAssessment(workspace, manifest) {
  try {
    const root = await fs.realpath(workspace);
    const rootStat = await fs.lstat(workspace);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || root !== path.resolve(workspace)) throw new Error("Invalid workspace");
    const directory = root;
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || await fs.realpath(directory) !== directory) throw new Error("Invalid report directory");
    const file = path.join(directory, ".codeitz-worker-result.json");
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_REPORT_BYTES) throw new Error("Invalid report file");
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat();
      const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;
      const sameFile = (a, b) => sameIdentity(a, b) && a.nlink === 1 && b.nlink === 1 &&
        a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
      if (!opened.isFile() || !sameFile(stat, opened)) throw new Error("Report changed");
      const buffer = Buffer.alloc(MAX_REPORT_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const finalFile = await handle.stat();
      const finalPath = await fs.lstat(file);
      const finalDirectory = await fs.lstat(directory);
      const finalRoot = await fs.lstat(workspace);
      if (length > MAX_REPORT_BYTES || length !== opened.size || !sameFile(opened, finalFile) ||
          !sameFile(opened, finalPath) || !sameIdentity(directoryStat, finalDirectory) ||
          !finalDirectory.isDirectory() || finalDirectory.isSymbolicLink() ||
          !sameIdentity(rootStat, finalRoot) || finalRoot.isSymbolicLink() ||
          await fs.realpath(directory) !== directory || await fs.realpath(workspace) !== root)
        throw new Error("Report or parent changed");
      return assessCompletion(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length))), manifest);
    } finally { await handle.close(); }
  } catch {
    return assessCompletion(null, manifest);
  }
}

export function requireApplicableAssessment(assessment, manifest) {
  if (assessment == null) return;
  if (assessment.version !== 1 || assessment.status !== "reported-ready" || !/^[a-f0-9]{64}$/.test(assessment.manifestDigest ?? "") || assessment.manifestDigest !== manifest?.digest)
    throw new Error("Completion assessment needs work or does not match the current output");
}
