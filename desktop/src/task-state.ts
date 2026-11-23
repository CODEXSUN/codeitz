import type { Verification, Worker } from "./bridge";

export function latestVerification(
  worker: Worker,
  rows: readonly Verification[],
): Verification | undefined {
  return rows
    .filter((item) => item.operationId === worker.id)
    .sort(
      (left, right) =>
        (Date.parse(
          right.createdAt ?? right.startedAt ?? right.finishedAt ?? "",
        ) || 0) -
        (Date.parse(
          left.createdAt ?? left.startedAt ?? left.finishedAt ?? "",
        ) || 0),
    )[0];
}

export function verificationPassed(
  worker: Worker,
  verification?: Verification,
  manifestDigest = worker.changeManifest?.digest,
): boolean {
  const profile = worker.verificationProfile ?? verification?.profile;
  if (!profile || !verification || !manifestDigest) return false;
  return (
    verification.state === "passed" &&
    verification.manifestDigest === manifestDigest &&
    verification.receipt?.passed === true &&
    verification.receipt.runnerReceiptValid === true &&
    verification.receipt.outputUnchanged === true &&
    verification.receipt.manifestDigest === manifestDigest &&
    verification.receipt.profileHash === profile.hash &&
    verification.profile.hash === profile.hash
  );
}

export function verificationBlock(
  worker: Worker,
  verification?: Verification,
  manifestDigest = worker.changeManifest?.digest,
): string | null {
  const assessment = worker.completionAssessment;
  if (assessment && assessment.status !== "legacy-unassessed") {
    if (assessment.status === "needs-work")
      return "This output needs work before it can be applied.";
    if (!manifestDigest || assessment.manifestDigest !== manifestDigest)
      return "The completion assessment does not match these changes.";
  }
  if (!worker.verificationProfile) return null;
  if (verificationPassed(worker, verification, manifestDigest)) return null;
  if (!verification)
    return "The approved checks have not produced a receipt yet.";
  if (verification.state === "running")
    return "Checks are running against this task output.";
  if (verification.state === "awaiting-approval")
    return "This verification attempt needs explicit approval.";
  if (verification.state === "failed")
    return "Checks failed. Review the result before another approved attempt.";
  if (verification.state === "interrupted")
    return "Verification was interrupted and was not replayed.";
  return "The verification receipt does not match this output and profile.";
}

export function inboxState(
  worker: Worker,
  rows: readonly Verification[],
):
  | "Working"
  | "Needs approval"
  | "Checks failed"
  | "Needs work"
  | "Ready for review"
  | "Needs input"
  | "History" {
  const check = latestVerification(worker, rows);
  if (
    worker.applyReceipt?.state === "review-required" ||
    worker.state === "interrupted"
  )
    return "Needs input";
  if (worker.state === "running" || check?.state === "running")
    return "Working";
  if (
    worker.state === "awaiting-approval" ||
    check?.state === "awaiting-approval"
  )
    return "Needs approval";
  if (check?.state === "failed" || check?.state === "interrupted")
    return "Checks failed";
  if (
    worker.appliedAt ||
    worker.applyReceipt?.state === "applied" ||
    ["rejected", "reviewed"].includes(worker.state)
  )
    return "History";
  if (worker.state === "completed" && worker.completionAssessment?.status === "needs-work")
    return "Needs work";
  if (worker.state === "completed" && worker.completionAssessment?.status === "reported-ready" &&
      verificationBlock(worker, check)) return "Needs input";
  if (
    worker.state === "completed" &&
    (!worker.verificationProfile || verificationPassed(worker, check))
  )
    return "Ready for review";
  return "Needs input";
}
