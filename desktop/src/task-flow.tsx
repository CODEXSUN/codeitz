import { StageProgress } from "@workspace/ui/blocks/work-progress";
import { Badge } from "@workspace/ui/components/badge";
import { latestVerification, verificationPassed } from "./task-state";
import type { Verification, Worker } from "./bridge";

export function TaskFlow({
  worker,
  verifications,
}: {
  worker: Worker;
  verifications: readonly Verification[];
}) {
  const check = latestVerification(worker, verifications);
  const hasChecks = !!worker.verificationProfile || !!check;
  const stages = hasChecks
    ? ["Plan", "Approve", "Work", "Verify", "Review", "Apply"]
    : ["Plan", "Approve", "Work", "Review", "Apply"];
  let completed = 1;
  let activeIndex = 1;
  let running = false;
  let status = "Approval needed";
  if (
    worker.approvedAt ||
    ["running", "completed", "interrupted", "reviewed"].includes(worker.state)
  )
    completed = 2;
  if (worker.state === "running") {
    activeIndex = 2;
    running = true;
    status = worker.progress?.message ?? "Working in an isolated snapshot";
  }
  if (worker.state === "completed") {
    completed = 3;
    activeIndex = 3;
    status = hasChecks
      ? "Waiting for verification"
      : "Ready for review · not checked";
    if (hasChecks && check?.state === "running") {
      running = true;
      status = "Running the approved isolated checks";
    } else if (hasChecks && check?.state === "failed")
      status = worker.verificationProfile
        ? "Checks failed · Apply is blocked"
        : "Manual checks failed · review the result";
    else if (hasChecks && check?.state === "interrupted")
      status = "Checks interrupted · no automatic replay";
    else if (hasChecks && verificationPassed(worker, check)) {
      completed = 4;
      activeIndex = 4;
      status = "Checks passed for this output · review next";
    } else if (hasChecks && check?.state === "awaiting-approval")
      status = "Verification approval needed";
  }
  if (worker.state === "interrupted")
    status = "Work interrupted · review required";
  if (worker.state === "rejected") status = "Proposal not approved";
  if (worker.applyReceipt?.state === "review-required")
    status = "Apply outcome needs review";
  if (worker.appliedAt || worker.applyReceipt?.state === "applied") {
    completed = stages.length;
    activeIndex = stages.length - 1;
    running = false;
    status = hasChecks
      ? "Reviewed changes applied"
      : "Reviewed changes applied · no verification profile";
  }
  return (
    <section className="task-flow" aria-label="Approved task flow">
      <div className="task-flow-heading">
        <span>{worker.goal}</span>
        <Badge variant="outline">{status}</Badge>
      </div>
      <StageProgress
        stages={stages}
        completed={completed}
        activeIndex={activeIndex}
        running={running}
        label="Recorded task stages"
      />
    </section>
  );
}
