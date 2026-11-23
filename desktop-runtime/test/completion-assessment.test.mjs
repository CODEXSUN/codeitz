import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import path from "node:path";
import {reviewChanges,safeRelative} from '../repository-safety.mjs';
import { assessCompletion, readCompletionAssessment, requireApplicableAssessment, legacyCompletionAssessment } from "../completion-assessment.mjs";

const manifest = { digest: "a".repeat(64), files: [{ path: "src/app.js" }], blocked: [] };
const ready = { version: 1, status: "ready", summary: "Done", completed: ["Changed app"], missing: [], blockers: [], evidence: ["src/app.js"] };

test("ready is a report, never trusted verification", () => {
  assert.equal(assessCompletion(ready, manifest).status, "reported-ready");
  for (const report of [{ ...ready, status: "partial" }, { ...ready, status: "blocked" }, { ...ready, missing: ["Tests"] }, { ...ready, blockers: ["Blocked"] }, { ...ready, evidence: [] }, { ...ready, evidence: ["other.js"] }, { ...ready, completed: [] }]) {
    assert.equal(assessCompletion(report, manifest).status, "needs-work");
  }
  assert.equal(assessCompletion(ready, { ...manifest, files: [] }).status, "needs-work");
  assert.equal(assessCompletion(ready, { ...manifest, digest: "bad" }).status, "needs-work");
  assert.equal(assessCompletion(ready, { ...manifest, blocked: true }).status, "needs-work");
  const unreviewed = assessCompletion({ ...ready, evidence: ["src/app.js", "other.js"] }, manifest);
  assert.equal(unreviewed.status, "needs-work");
  assert.deepEqual(unreviewed.evidence, ["src/app.js", "other.js"]);
  assert.equal(assessCompletion(ready, { ...manifest, blocked: [{ path: "x" }] }).status, "needs-work");
});

test("malformed reports and escaping evidence are rejected", () => {
  for (const report of [null, {}, { ...ready, evidence: ["../secret"] }, { ...ready, evidence: ["C:/secret"] }, { ...ready, evidence: ["src\\app.js"] }]) {
    assert.equal(assessCompletion(report, manifest).status, "needs-work");
  }
});

test("report reader bounds and validates ordinary files", async () => {
  const root = await fs.mkdtemp(path.join(process.cwd(), "completion-test-"));
  try {
    assert.equal((await readCompletionAssessment(root, manifest)).status, "needs-work");
    const file = path.join(root, ".codeitz-worker-result.json");
    await fs.writeFile(file, JSON.stringify(ready));
    assert.equal((await readCompletionAssessment(root, manifest)).status, "reported-ready");
    const link = path.join(root, "hardlink");
    await fs.link(file, link);
    assert.equal((await readCompletionAssessment(root, manifest)).status, "needs-work");
    await fs.unlink(link);
    await fs.writeFile(file, "{");
    assert.equal((await readCompletionAssessment(root, manifest)).status, "needs-work");
    await fs.writeFile(file, "x".repeat(16385));
    assert.equal((await readCompletionAssessment(root, manifest)).status, "needs-work");
    await fs.unlink(file);
    try {
      await fs.symlink(path.join(root, "outside"), file);
      assert.equal((await readCompletionAssessment(root, manifest)).status, "needs-work");
    } catch (error) { if (error.code !== "EPERM") throw error; }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("apply rejects needs-work and stale assessment while preserving historical null", () => {
  assert.doesNotThrow(() => requireApplicableAssessment(null, manifest));
  assert.equal(legacyCompletionAssessment().status, "legacy-unassessed");
  const assessed = assessCompletion(ready, manifest);
  assert.doesNotThrow(() => requireApplicableAssessment(assessed, manifest));
  assert.throws(() => requireApplicableAssessment(assessed, { ...manifest, digest: "changed" }));
  assert.throws(() => requireApplicableAssessment(assessCompletion(null, manifest), manifest));
});

test('reserved metadata never becomes source Apply while private paths remain blocked',async()=>{
  const root=await fs.mkdtemp(path.join(process.cwd(),'completion-metadata-test-'));
  try {
    const baseline={repository:root,dirtyFingerprint:'fixture',files:[]};
    await fs.writeFile(path.join(root,'source.mjs'),'export const result = true;\n');
    await fs.writeFile(path.join(root,'.codeitz-worker-result.json'),JSON.stringify({...ready,evidence:['source.mjs']}));
    const result=await reviewChanges(baseline,root);
    assert.deepEqual(result.files.map(file=>file.path),['source.mjs']);
    assert.equal(result.blocked.length,0);
    assert.throws(()=>safeRelative('.codeitz-worker-result.json'));
    await fs.mkdir(path.join(root,'.local'));
    await fs.writeFile(path.join(root,'.local','private.json'),'{}');
    const denied=await reviewChanges(baseline,root);
    assert.ok(denied.blocked.some(file=>file.path==='.local'));
  }finally{
    assert.equal(path.dirname(root),await fs.realpath(process.cwd()));
    assert.match(path.basename(root),/^completion-metadata-test-/);
    await fs.rm(root,{recursive:true,force:true});
  }
});
