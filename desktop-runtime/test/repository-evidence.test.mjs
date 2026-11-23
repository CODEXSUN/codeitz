import test from "node:test";
import assert from "node:assert/strict";
import { safeRelative, repositoryDigest } from "../repository-safety.mjs";

test("generated desktop evidence is excluded without rewriting historical baseline metadata", () => {
  const historical = {
    repository: "C:/owned/repo",
    files: [
      { path: "desktop-proof/old-receipt.json", hash: "saved-historical-hash" },
    ],
    baselineHash: "existing-saved-value",
  };
  const before = structuredClone(historical);
  const digest = repositoryDigest(historical);
  for (const relative of [
    "desktop-proof/state.json",
    "Desktop-Proof/chat.json",
    "desktop/.proof/session.json",
    "nested/.PROOF/progress.json",
  ])
    assert.throws(() => safeRelative(relative), /excluded/);
  for (const relative of [
    "desktop-runtime/runtime.mjs",
    "docs/desktop-proofing.md",
    "AGENTS.md",
  ])
    assert.equal(safeRelative(relative), relative);
  assert.deepEqual(historical, before);
  assert.equal(repositoryDigest(historical), digest);
});
