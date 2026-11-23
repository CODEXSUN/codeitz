import { randomUUID } from "node:crypto";
import { repositoryDigest } from "./repository-safety.mjs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validVerificationReceipt(result, check) {
  if (
    !result ||
    result.passed !== true ||
    !Array.isArray(result.checks) ||
    !result.checks.length ||
    result.checks.length > 30
  )
    return false;
  if (
    result.checks.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        item.status !== "passed" ||
        (item.exitCode !== undefined && item.exitCode !== 0),
    )
  )
    return false;
  const expected = check.profile.checks;
  if (
    !Array.isArray(expected) ||
    !expected.length ||
    !check.profile.images ||
    !result.images
  )
    return false;
  const ids = result.checks.map((item) => item.id);
  return (
    ids.length === expected.length &&
    new Set(ids).size === ids.length &&
    expected.every((item) => ids.includes(item.id)) &&
    result.checks.every((item) => item.exitCode === 0) &&
    uuid.test(result.runId ?? "") &&
    result.recoveryReference === result.runId &&
    result.operationId === check.operation_id &&
    result.workspace === check.workspace &&
    result.profileId === check.profile.id &&
    result.profileHash === check.profile.hash &&
    result.manifestDigest === check.manifest_digest &&
    result.cleanup === "verified" &&
    repositoryDigest(result.images) === repositoryDigest(check.profile.images)
  );
}

export class VerificationService {
  constructor(runtime, runner) {
    this.runtime = runtime;
    this.pool = runtime.pool;
    this.runner = runner;
    this.active = new Set();
  }
  profile() {
    const profile = this.runner?.profile();
    if (
      !profile ||
      profile.id !== "desktop-runtime" ||
      !/^[a-f0-9]{64}$/.test(profile.hash)
    )
      throw new Error("Trusted verification profile is unavailable");
    if (Buffer.byteLength(JSON.stringify(profile)) > 24000)
      throw new Error("Trusted profile metadata is too large");
    return JSON.parse(JSON.stringify(profile));
  }
  async recover() {
    await this.pool.query(
      "UPDATE agent_verifications SET state='interrupted',finished_at=now(),receipt=jsonb_build_object('message','Broker restarted; checks were not replayed') WHERE state='running'",
    );
  }
  async list() {
    return (
      await this.pool.query(
        "SELECT * FROM agent_verifications ORDER BY created_at DESC LIMIT 1000",
      )
    ).rows;
  }
  async prepare(operationId) {
    const operation = (
      await this.pool.query("SELECT * FROM agent_operations WHERE id=$1", [
        operationId,
      ])
    ).rows[0];
    if (!operation || operation.state !== "completed" || operation.applied_at)
      throw new Error("Choose a completed, unapplied task");
    const profile = this.profile();
    if (
      !(await this.runner.canVerify({
        repository: operation.repository_snapshot?.repository,
        workspace: operation.workspace,
      }))
    )
      throw new Error(
        "This task is not supported by the trusted verification profile",
      );
    if (
      operation.verification_profile &&
      repositoryDigest(profile) !==
        repositoryDigest(operation.verification_profile)
    )
      throw new Error(
        "Trusted profile changed; prepare a new task with the reviewed profile",
      );
    const manifest = await this.runtime.changes(operationId);
    const existing = (
      await this.pool.query(
        "SELECT * FROM agent_verifications WHERE operation_id=$1 AND manifest_digest=$2 AND state IN ('awaiting-approval','running','passed') ORDER BY created_at DESC LIMIT 1",
        [operation.id, manifest.digest],
      )
    ).rows[0];
    if (
      existing &&
      repositoryDigest(existing.profile) === repositoryDigest(profile)
    )
      return existing;
    const attemptId = randomUUID();
    const binding = {
      attemptId,
      operationId: operation.id,
      workspace: operation.workspace,
      manifestDigest: manifest.digest,
      profile,
    };
    const digest = repositoryDigest(binding);
    return (
      await this.pool.query(
        "INSERT INTO agent_verifications(id,operation_id,digest,profile,manifest_digest,workspace,state) VALUES($1,$2,$3,$4,$5,$6,'awaiting-approval') RETURNING *",
        [
          attemptId,
          operation.id,
          digest,
          JSON.stringify(profile),
          manifest.digest,
          operation.workspace,
        ],
      )
    ).rows[0];
  }
  async approve(operationId, digest) {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))
      throw new Error("Verification approval required");
    const saved = (
      await this.pool.query(
        "SELECT * FROM agent_verifications WHERE operation_id=$1 AND digest=$2",
        [operationId, digest],
      )
    ).rows[0];
    if (!saved) throw new Error("Verification approval changed");
    if (saved.state !== "awaiting-approval") return saved;
    const key = "verification:" + operationId;
    this.runtime.capacity.beginReview(key);
    try {
      const manifest = await this.runtime.changes(operationId);
      if (
        manifest.digest !== saved.manifest_digest ||
        repositoryDigest(this.profile()) !== repositoryDigest(saved.profile)
      )
        throw new Error("Output or trusted verification profile changed");
      const result = (
        await this.pool.query(
          "UPDATE agent_verifications SET state='running',approved_at=now(),approved_by=$3,started_at=now() WHERE id=$1 AND digest=$2 AND state='awaiting-approval' RETURNING *",
          [saved.id, digest, process.env.USERNAME ?? "local-desktop-user"],
        )
      ).rows[0];
      if (!result) {
        this.runtime.capacity.endReview(key);
        return (
          await this.pool.query(
            "SELECT * FROM agent_verifications WHERE id=$1",
            [saved.id],
          )
        ).rows[0];
      }
      this.active.add(saved.id);
      const promise = this.run(result, key).finally(() =>
        this.runtime.pending.delete(promise),
      );
      this.runtime.pending.add(promise);
      promise.catch(() => {});
      return result;
    } catch (error) {
      this.runtime.capacity.endReview(key);
      throw error;
    }
  }
  async run(check, key) {
    try {
      await this.runtime.activity(check.operation_id, "verification-status", {
        message: "Approved checks started",
      });
      let activityChain = Promise.resolve();
      const result = await this.runner.run({
        operationId: check.operation_id,
        workspace: check.workspace,
        manifestDigest: check.manifest_digest,
        profileHash: check.profile.hash,
        onActivity: (data) => {
          activityChain = activityChain.then(() =>
            this.runtime.activity(
              check.operation_id,
              "verification-output",
              data,
            ),
          );
          activityChain.catch(() => {});
        },
      });
      await activityChain;
      const manifest = await this.runtime.changes(check.operation_id);
      const unchanged =
        manifest.digest === check.manifest_digest &&
        repositoryDigest(this.profile()) === repositoryDigest(check.profile);
      const validReceipt = validVerificationReceipt(result, check);
      const passed = unchanged && validReceipt;
      const receipt = {
        passed,
        manifestDigest: check.manifest_digest,
        profileHash: check.profile.hash,
        outputUnchanged: unchanged,
        runnerReceiptValid: validReceipt,
        runId: uuid.test(result?.runId ?? "") ? result.runId : null,
        operationId: check.operation_id,
        workspace: check.workspace,
        profileId: check.profile.id,
        images: check.profile.images ?? null,
        sourceFingerprint: /^[a-f0-9]{64}$/.test(
          result?.sourceFingerprint ?? "",
        )
          ? result.sourceFingerprint
          : null,
        cleanup:
          result?.cleanup === "verified" ? "verified" : "review-required",
        recoveryReference: uuid.test(result?.recoveryReference ?? "")
          ? result.recoveryReference
          : null,
        exclusions: check.profile.exclusions ?? [],
        checks: Array.isArray(result?.checks)
          ? result.checks
              .filter((item) => item && typeof item === "object")
              .slice(0, 30)
              .map((item) => ({
                id: String(item.id ?? "").slice(0, 100),
                name: String(item.name ?? "Check").slice(0, 100),
                ...Object.fromEntries(
                  [
                    "exitCode",
                    "durationMs",
                    "passedTests",
                    "failedTests",
                    "skippedTests",
                  ]
                    .filter(
                      (field) =>
                        Number.isSafeInteger(item[field]) &&
                        Math.abs(item[field]) < 100000000,
                    )
                    .map((field) => [field, item[field]]),
                ),
                status: ["passed", "failed", "skipped"].includes(item.status)
                  ? item.status
                  : "failed",
                message: String(item.message ?? "").slice(0, 500),
              }))
          : [],
        message: unchanged
          ? passed
            ? "Checks passed"
            : "Checks failed"
          : "Output changed during checks; approval is stale",
      };
      const changed = await this.pool.query(
        "UPDATE agent_verifications SET state=$2,receipt=$3,finished_at=now() WHERE id=$1 AND state='running'",
        [check.id, passed ? "passed" : "failed", JSON.stringify(receipt)],
      );
      if (changed.rowCount)
        await this.runtime.activity(check.operation_id, "verification-status", {
          message: receipt.message,
        });
    } catch {
      await this.pool.query(
        "UPDATE agent_verifications SET state='interrupted',finished_at=now(),receipt=jsonb_build_object('message','Verification outcome needs review; no automatic retry') WHERE id=$1 AND state='running'",
        [check.id],
      );
    } finally {
      this.active.delete(check.id);
      this.runtime.capacity.endReview(key);
    }
  }
  async requirePassed(operation, manifest) {
    if (!operation.verification_profile) return;
    const check = (
      await this.pool.query(
        "SELECT * FROM agent_verifications WHERE operation_id=$1 AND state='passed' AND manifest_digest=$2 ORDER BY finished_at DESC LIMIT 1",
        [operation.id, manifest.digest],
      )
    ).rows[0];
    if (
      !check ||
      check.workspace !== operation.workspace ||
      repositoryDigest(check.profile) !==
        repositoryDigest(operation.verification_profile) ||
      repositoryDigest(this.profile()) !== repositoryDigest(check.profile)
    )
      throw new Error(
        "Approve and pass checks for this exact output before Apply",
      );
  }
}
