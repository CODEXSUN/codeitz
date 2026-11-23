import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validVerificationReceipt } from "../verification-service.mjs";

test("trusted verification receipt requires exact checks and immutable identities", () => {
  const profile = {
    id: "desktop-runtime",
    hash: "a".repeat(64),
    checks: [{ id: "syntax" }, { id: "portable" }, { id: "postgres" }],
    images: { node: "pinned-node", postgres: "pinned-pg" },
  };
  const check = {
    operation_id: randomUUID(),
    workspace: "C:/owned/worker",
    manifest_digest: "b".repeat(64),
    profile,
  };
  const runId = randomUUID();
  const receipt = {
    runId,
    recoveryReference: runId,
    operationId: check.operation_id,
    workspace: check.workspace,
    manifestDigest: check.manifest_digest,
    profileId: profile.id,
    profileHash: profile.hash,
    images: profile.images,
    passed: true,
    cleanup: "verified",
    checks: profile.checks.map((item) => ({
      ...item,
      status: "passed",
      exitCode: 0,
    })),
  };
  assert.equal(validVerificationReceipt(receipt, check), true);
  for (const field of [
    "operationId",
    "workspace",
    "manifestDigest",
    "profileId",
    "profileHash",
    "recoveryReference",
    "cleanup",
  ])
    assert.equal(
      validVerificationReceipt({ ...receipt, [field]: "changed" }, check),
      false,
      field,
    );
  assert.equal(
    validVerificationReceipt(
      { ...receipt, images: { node: "other", postgres: "pinned-pg" } },
      check,
    ),
    false,
  );
  for (const checks of [
    [],
    receipt.checks.slice(0, 2),
    [...receipt.checks, receipt.checks[0]],
    receipt.checks.map((item, index) =>
      index ? item : { ...item, status: "failed" },
    ),
    receipt.checks.map((item, index) =>
      index ? item : { ...item, exitCode: 1 },
    ),
  ])
    assert.equal(
      validVerificationReceipt({ ...receipt, checks }, check),
      false,
    );
});
