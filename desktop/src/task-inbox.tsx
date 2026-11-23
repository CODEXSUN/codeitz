import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { inboxState, latestVerification } from "./task-state";
import { summarizeTaskGoal } from "./task-summary";
import { taskStatus } from "./worker-review";
import type { Coworker, Verification, Worker } from "./bridge";

const groups = [
  "Working",
  "Needs approval",
  "Checks failed",
  "Needs work",
  "Ready for review",
  "Needs input",
  "History",
] as const;

export function TaskInbox({
  workers,
  coworkers,
  verifications,
  selectedId,
  onSelect,
}: {
  workers: Worker[];
  coworkers: Coworker[];
  verifications: readonly Verification[];
  selectedId: string | null;
  onSelect: (worker: Worker) => void;
}) {
  return (
    <nav className="task-inbox" aria-label="Task inbox">
      <h3>
        Task inbox <span>{workers.length}</span>
      </h3>
      {!workers.length && (
        <p className="panel-caption">No tasks for this app yet.</p>
      )}
      {groups.map((group) => {
        const rows = workers.filter(
          (worker) => inboxState(worker, verifications) === group,
        );
        if (!rows.length) return null;
        const body = [...rows].reverse().map((worker) => {
          const check = latestVerification(worker, verifications);
          const status =
            worker.state === "completed" && worker.completionAssessment?.status === "needs-work"
              ? "Needs work"
              : worker.state === "completed" && worker.completionAssessment?.status === "reported-ready"
                ? "Review output"
                : check?.state === "running"
              ? "Verifying"
              : check?.state === "failed"
                ? "Checks failed"
                : taskStatus(worker);
          const coworkerName =
            coworkers.find((item) => item.id === worker.coworkerId)?.name ??
            "Sandbox coworker";
          const summary = summarizeTaskGoal(worker.goal);
          return (
            <Button
              key={worker.id}
              variant={selectedId === worker.id ? "secondary" : "ghost"}
              className="inbox-row"
              aria-label={`Open task for ${coworkerName}: ${summary}. ${status}`}
              aria-description={worker.goal || "No task goal provided."}
              onClick={() => onSelect(worker)}
            >
              <span>
                <strong>
                  {coworkerName}
                </strong>
                <span className="inbox-goal">{summary}</span>
                <small>{status}</small>
              </span>
            </Button>
          );
        });
        return group === "History" ? (
          <details key={group}>
            <summary>
              {group} <Badge variant="outline">{rows.length}</Badge>
            </summary>
            {body}
          </details>
        ) : (
          <section key={group} aria-label={`${group} tasks`}>
            <h4>
              {group}
              <span>{rows.length}</span>
            </h4>
            {body}
          </section>
        );
      })}
    </nav>
  );
}
