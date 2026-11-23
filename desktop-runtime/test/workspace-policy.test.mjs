import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { appWorkspaceRoot, retainedAppWorkspaceRoots } from "../workspace-policy.mjs";
import { Runtime, approvalDigest } from "../runtime.mjs";
import { createVerificationRunner } from "../verification-runner.mjs";
import { PRODUCT_ROOT } from "../verification-profile.mjs";

test("new snapshots default to development storage, never the private AppData directory", () => {
  const development = path.resolve("development");
  assert.equal(appWorkspaceRoot({ allowedRepositoryRoots: [development] }), path.join(development, ".local", "codeitz-desktop", "workspaces"));
  assert.throws(() => appWorkspaceRoot({}), /absolute/);
  assert.throws(() => appWorkspaceRoot({ appWorkspaceRoot: "relative" }), /absolute/);
  assert.equal(appWorkspaceRoot({ appWorkspaceRoot: development }), development);
  assert.deepEqual(retainedAppWorkspaceRoots({ retainedAppWorkspaceRoots: [development, development] }), [development]);
  for (const value of ["not-an-array", ["relative"], Array(9).fill(development)])
    assert.throws(() => retainedAppWorkspaceRoots({ retainedAppWorkspaceRoots: value }), /roots/);
});

test("retained snapshots keep their exact digest for review; foreign roots and changed scopes fail", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "codeitz-root-policy-"));
  try {
    const active = path.join(fixture, "active"), retained = path.join(fixture, "retained"), foreign = path.join(fixture, "foreign");
    const runtime = new Runtime(null, {}, path.join(fixture, "legacy"), { appWorkspaceRoot: active, retainedAppWorkspaceRoots: [retained] });
    for (const root of [active, retained, foreign]) {
      const workspace = path.join(root, randomUUID());
      await fs.mkdir(workspace, { recursive: true });
      const operation = { app_id: "app", goal: "Review saved work", workspace, repository_snapshot: null };
      operation.digest = approvalDigest(operation.goal, workspace, runtime.binding(operation));
      if (root === foreign) await assert.rejects(runtime.validateWorkspace(operation), /scope changed/);
      else {
        await runtime.validateWorkspace(operation);
        await assert.rejects(runtime.validateWorkspace({ ...operation, goal: "Changed scope" }), /scope changed/);
      }
    }
  } finally { await fs.rm(fixture, { recursive: true, force: true }); }
});

test("automatic checks recognize only configured active or retained operation snapshots", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "codeitz-check-root-"));
  try {
    const roots = ["active", "retained", "foreign"].map(name => path.join(fixture, name));
    const runner = createVerificationRunner({ allowedWorkspaceRoot: roots[0], retainedWorkspaceRoots: [roots[1]], dockerPath: "not-invoked" });
    for (const root of roots) {
      const workspace = path.join(root, randomUUID());
      await fs.mkdir(path.join(workspace, "desktop-runtime"), { recursive: true });
      for (const name of ["package.json", "package-lock.json"])
        await fs.copyFile(path.join(PRODUCT_ROOT, "desktop-runtime", name), path.join(workspace, "desktop-runtime", name));
      assert.equal(runner.canVerify({ repository: PRODUCT_ROOT, workspace }), root !== roots[2]);
    }
  } finally { await fs.rm(fixture, { recursive: true, force: true }); }
});
