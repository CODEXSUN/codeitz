import { useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { CircleCheck, Clock3, LoaderCircle, Square } from "lucide-react";
import {
  runtimeRequest,
  type ChangeManifest,
  type Coworker,
  type Operation,
  type Worker,
  type Verification,
} from "./bridge";

import { VerificationScope } from "./verification-review";
import { latestVerification, verificationBlock } from "./task-state";

type Props = {
  view?: "plan" | "changes";
  verifications?: Verification[];
  workers: Worker[];
  coworkers: Coworker[];
  operations: Operation[];
  busy: boolean;
  connected: boolean;
  allIdle: boolean;
  reviewId: string | null;
  activeIds: string[];
  canApprove: (worker: Worker) => boolean;
  approvalReason: (worker: Worker) => string | null;
  action: (work: () => Promise<void>) => Promise<void>;
};

export function taskStatus(worker: Worker): string {
  if (worker.appliedAt || worker.applyReceipt?.state === "applied")
    return "Applied";
  if (worker.applyReceipt?.state === "review-required")
    return "Apply review needed";
  if (worker.state === "awaiting-approval") return "Needs approval";
  if (worker.state === "running") {
    if (worker.progress?.phase === "snapshotting") return "Preparing";
    if (worker.progress?.phase === "starting") return "Starting";
    if (worker.progress?.phase === "interrupt-requested")
      return "Stop requested";
    return "Running";
  }
  if (worker.state === "completed" && worker.completionAssessment?.status === 'needs-work') return 'Needs work';
  if (worker.state === "completed" && worker.completionAssessment?.status === 'reported-ready') return 'Review output';
  if (worker.state === "completed")
    return worker.repositorySnapshot ? "Ready for review" : "Completed";
  if (worker.state === "rejected") return "Not approved";
  if (worker.state === "interrupted") return "Interruption review";
  return worker.state.charAt(0).toUpperCase() + worker.state.slice(1);
}

export function WorkerReview({
  workers,
  view,
  verifications = [],
  coworkers,
  operations,
  busy,
  connected,
  allIdle,
  reviewId,
  activeIds,
  canApprove,
  approvalReason,
  action,
}: Props) {
  const [manifests, setManifests] = useState<Record<string, ChangeManifest>>(
    {},
  );
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [stopping, setStopping] = useState<Record<string, boolean>>({});
  const pending = workers.filter(
    (item) => item.state === "awaiting-approval",
  ).length;
  const running = workers.filter((item) => item.state === "running").length;
  const complete = workers.filter((item) => item.state === "completed").length;

  return (
    <div className="worker-review">
      {!view && (
        <div className="task-totals" aria-label="Task overview">
          <span>
            <Clock3 size={14} />
            {pending} awaiting approval
          </span>
          <span>
            <LoaderCircle size={14} />
            {running} active
          </span>
          <span>
            <CircleCheck size={14} />
            {complete} awaiting review
          </span>
        </div>
      )}
      {!workers.length && (
        <div className="panel-empty">
          <p>No tasks in this chat yet.</p>
          <span>
            Choose Task in the composer to prepare a proposal for a coworker.
          </span>
        </div>
      )}
      {[...workers].reverse().map((worker) => {
        const operation = operations.find((item) => item.id === worker.id);
        const name =
          coworkers.find((item) => item.id === worker.coworkerId)?.name ??
          "Sandbox coworker";
        const manifest = manifests[worker.id] ?? worker.changeManifest;
        const checksBlock = verificationBlock(
          worker,
          latestVerification(worker, verifications),
          manifest?.digest,
        );
        const blocked = Array.isArray(manifest?.blocked)
          ? manifest.blocked.length > 0
          : !!manifest?.blocked;
        const stopRequested =
          stopping[worker.id] ||
          worker.progress?.phase === "interrupt-requested";
        return (
          <article
            key={worker.id}
            data-worker-id={worker.id}
            data-worker-state={worker.state}
            className="worker-card"
          >
            <div className="task-card-heading">
              <h3>{name}</h3>
              <div>
                <Badge variant="outline">{taskStatus(worker)}</Badge>
                {activeIds.includes(worker.id) &&
                  operation?.providerThreadId &&
                  operation.providerTurnId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Request stop for ${name}`}
                          disabled={busy || !connected || stopRequested}
                          onClick={() =>
                            void action(async () => {
                              const result = await runtimeRequest<{
                                requested: boolean;
                              }>(
                                `/api/runtime/operations/${worker.id}/interrupt`,
                                {},
                              );
                              if (result.requested)
                                setStopping((current) => ({
                                  ...current,
                                  [worker.id]: true,
                                }));
                            })
                          }
                        >
                          <Square size={13} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Request a stop for this task only
                      </TooltipContent>
                    </Tooltip>
                  )}
              </div>
            </div>
            <p className="task-goal-preview" title={worker.goal}>
              {worker.goal}
            </p>
            {worker.progress?.message && (
              <p className="task-latest" aria-label="Latest task activity">
                {worker.progress.message}
              </p>
            )}
            {stopRequested && activeIds.includes(worker.id) && (
              <p className="task-latest">
                Stop requested; waiting for the verified outcome. Changes are
                not undone.
              </p>
            )}
            {worker.executionError && (
              <p className="task-error">{worker.executionError}</p>
            )}
            <details
              className="task-review-details"
              open={worker.id === reviewId ? true : undefined}
            >
              <summary>
                {worker.state === "awaiting-approval"
                  ? "Review task & approve"
                  : "Task details"}
              </summary>
              {view !== "changes" && (
                <>
                  <p>{worker.goal}</p>
                  {worker.repositorySnapshot && (
                    <>
                      <span className="panel-caption">
                        Destination repository
                      </span>
                      <code>{worker.repositorySnapshot.repository}</code>
                      <span className="panel-caption">Captured commit</span>
                      <code>{worker.repositorySnapshot.head}</code>
                    </>
                  )}
                  {worker.repositorySnapshot?.memoryContext && (
                    <section className="memory-captured" aria-label="Captured memory context">
                      <strong>Captured memory · UNTRUSTED advisory data</strong>
                      <p>This context is frozen for this proposal. If memory has changed, prepare a fresh task and review it before approval.</p>
                      {worker.repositorySnapshot.memoryContext.entries.length === 0 ? <p>No memory was captured.</p> : worker.repositorySnapshot.memoryContext.entries.map((entry) => (
                        <article key={entry.id}>
                          <strong>{entry.title}</strong>
                          <p>{entry.content}</p>
                          <small>{entry.kind} · {entry.conversationId ? "Chat" : "App"} scope · revision {entry.revision} · updated {entry.updatedAt}</small>
                        </article>
                      ))}
                    </section>
                  )}
                  <span className="panel-caption">Isolated workspace</span>
                  <code>{worker.workspace}</code>
                  <span className="panel-caption">Approval digest</span>
                  <code>{worker.digest}</code>
                  {worker.taskReference && (
                    <p className="panel-caption">
                      Linked task: {worker.taskReference.authority} ·{" "}
                      {worker.taskReference.id}
                    </p>
                  )}
                  {worker.result && (
                    <details>
                      <summary>Result</summary>
                      <pre>{worker.result}</pre>
                    </details>
                  )}
                  {worker.applyReceipt && (
                    <p role="status" className="panel-caption">
                      Repository apply: {worker.applyReceipt.state}
                      {worker.applyReceipt.error
                        ? ` · ${worker.applyReceipt.error}`
                        : ""}
                      . This attempt is never replayed.
                    </p>
                  )}
                  {worker.verificationProfile && (
                    <VerificationScope profile={worker.verificationProfile} />
                  )}
                  {worker.state === "awaiting-approval" && (
                    <>
                      <p className="approval-description">
                        Approval permits this goal{" "}
                        {worker.verificationProfile
                          ? "and one automatic run of the fixed checks shown above"
                          : ""}{" "}
                        and captured repository state in an isolated workspace.
                        Applying changes to the original repository requires
                        another review.
                      </p>
                      <div className="approval-actions">
                        <Button
                          disabled={!canApprove(worker)}
                          onClick={() =>
                            void action(async () => {
                              await runtimeRequest(
                                `/api/runtime/workers/${worker.id}/approve`,
                                { digest: worker.digest },
                              );
                            })
                          }
                        >
                          Approve worker
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || !connected}
                          onClick={() =>
                            void action(async () => {
                              await runtimeRequest(
                                `/api/runtime/workers/${worker.id}/reject`,
                                { digest: worker.digest },
                              );
                            })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                      {!canApprove(worker) && connected && !busy && (
                        <p className="panel-caption">
                          {approvalReason(worker)} Approval does not start
                          automatically.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              {view !== "plan" && (
                <>
                  {worker.state === "completed" &&
                    worker.repositorySnapshot && (
                      <Button
                        variant="outline"
                        disabled={
                          busy ||
                          !connected ||
                          worker.applyReceipt?.state === "applying" ||
                          worker.applyReceipt?.state === "review-required"
                        }
                        onClick={() =>
                          void action(async () => {
                            const result = await runtimeRequest<ChangeManifest>(
                              `/api/runtime/workers/${worker.id}/changes`,
                              {},
                            );
                            setManifests((current) => ({
                              ...current,
                              [worker.id]: result,
                            }));
                            setAcknowledged((current) => ({
                              ...current,
                              [worker.id]: false,
                            }));
                          })
                        }
                      >
                        Review repository changes
                      </Button>
                    )}
                  {manifest && (
                    <div className="change-review">
                      <p>
                        {manifest.files.length} file changes
                        {blocked ? " · blocked from apply" : ""}
                      </p>
                      {manifest.files.map((file) => (
                        <details key={file.path}>
                          <summary>
                            {file.kind} · {file.path}
                          </summary>
                          <span className="panel-caption">Before</span>
                          <pre>
                            {file.beforeText ?? "(not present or not text)"}
                          </pre>
                          <span className="panel-caption">After</span>
                          <pre>
                            {file.afterText ?? "(not present or not text)"}
                          </pre>
                        </details>
                      ))}
                      <label className="interruption-acknowledgement">
                        <Checkbox
                          checked={acknowledged[worker.id] === true}
                          onCheckedChange={(value: boolean | "indeterminate") =>
                            setAcknowledged((current) => ({
                              ...current,
                              [worker.id]: value === true,
                            }))
                          }
                        />
                        <span>
                          I reviewed these exact changes for the destination
                          repository. Apply them without committing, pushing or
                          deploying.
                        </span>
                      </label>
                      <Button
                        disabled={
                          busy ||
                          !connected ||
                          !allIdle ||
                          blocked ||
                          !!checksBlock ||
                          !acknowledged[worker.id] ||
                          !manifest.files.length ||
                          !!worker.applyReceipt ||
                          !!worker.appliedAt ||
                          !!applied[worker.id]
                        }
                        onClick={() =>
                          void action(async () => {
                            const result = await runtimeRequest<{
                              applied: boolean;
                            }>(`/api/runtime/workers/${worker.id}/apply`, {
                              digest: manifest.digest,
                            });
                            if (result.applied)
                              setApplied((current) => ({
                                ...current,
                                [worker.id]: true,
                              }));
                          })
                        }
                      >
                        Apply reviewed changes
                      </Button>
                      {checksBlock && (
                        <p className="panel-caption" role="status">
                          {checksBlock}
                        </p>
                      )}
                      {!allIdle && (
                        <p className="panel-caption">
                          All model turns and verification/review operations
                          must finish before repository changes can be applied.
                        </p>
                      )}
                      {applied[worker.id] && (
                        <p role="status">Reviewed changes applied.</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </details>
          </article>
        );
      })}
    </div>
  );
}
