import { useEffect, useState } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs";
import { ActivityFeed } from "@workspace/ui/blocks/activity-feed";
import { Button } from "@workspace/ui/components/button";
import { WorkerReview } from "./worker-review";
import { VerificationReview } from "./verification-review";
import {
  useOperationActivity,
  publicActivityMessage,
} from "./operation-activity";
import type { Coworker, Operation, Verification, Worker } from "./bridge";
import { latestVerification, verificationPassed } from "./task-state";

export function TaskInspector(props: {
  worker?: Worker;
  coworkers: Coworker[];
  operations: Operation[];
  verifications: Verification[];
  eligible: boolean;
  busy: boolean;
  connected: boolean;
  allIdle: boolean;
  activeIds: string[];
  canApprove: (worker: Worker) => boolean;
  approvalReason: (worker: Worker) => string | null;
  action: (work: () => Promise<void>) => Promise<void>;
}) {
  const { worker } = props;
  const [tab, setTab] = useState("plan");
  useEffect(() => setTab("plan"), [worker?.id]);
  const activity = useOperationActivity(
    worker?.id ?? null,
    !!worker &&
      (props.activeIds.includes(worker.id) ||
        props.verifications.some(
          (row) => row.operationId === worker.id && row.state === "running",
        )),
  );
  if (!worker)
    return (
      <p className="panel-empty">
        Select a task from the inbox to review its plan, changes, checks and
        activity.
      </p>
    );
  return (
    <Tabs value={tab} onValueChange={setTab} className="task-inspector">
      <TabsList aria-label="Task details" variant="line">
        <TabsTrigger value="plan">Plan</TabsTrigger>
        <TabsTrigger value="changes">Changes</TabsTrigger>
        <TabsTrigger value="checks">Checks</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="plan">
        {worker.completionAssessment && worker.completionAssessment.status !== "legacy-unassessed" && (
          <section aria-label="Completion assessment">
            <strong>{worker.completionAssessment.status === "needs-work" ? "Needs work" : "Review output"}</strong>
            <p>{worker.completionAssessment.summary}</p>
            {worker.completionAssessment.status === "reported-ready" && !verificationPassed(worker, latestVerification(worker, props.verifications)) && (
              <p>Checks pending or not verified for this output.</p>
            )}
            {(["missing", "blockers", "evidence"] as const).map((field) =>
              worker.completionAssessment![field].length > 0 && (
                <div key={field}>
                  <strong>{field === "missing" ? "Missing" : field === "blockers" ? "Blockers" : "Reported evidence"}</strong>
                  <ul>{worker.completionAssessment![field].map((item, index) => <li key={index}>{item}</li>)}</ul>
                </div>
              ),
            )}
          </section>
        )}
        <WorkerReview
          {...props}
          workers={[worker]}
          reviewId={worker.id}
          view="plan"
        />
      </TabsContent>
      <TabsContent value="changes">
        <WorkerReview
          {...props}
          workers={[worker]}
          reviewId={worker.id}
          view="changes"
        />
      </TabsContent>
      <TabsContent value="checks">
        <VerificationReview {...props} worker={worker} />
      </TabsContent>
      <TabsContent value="activity">
        <p className="panel-caption">
          {activity.status === "reconnecting"
            ? "Reconnecting to saved activity. Agent work is not restarted."
            : `${activity.items.length} saved updates`}
        </p>
        {activity.status === "reconnecting" && (
          <Button variant="outline" size="sm" onClick={activity.reconnect}>
            Reconnect activity
          </Button>
        )}
        <ActivityFeed
          autoScroll={false}
          label="Scoped task activity"
          items={activity.items.map((item) => ({
            id: item.id,
            kind: item.type.replace("activity:", ""),
            time: item.created_at
              ? new Date(item.created_at).toLocaleTimeString()
              : "",
            message: publicActivityMessage(item),
          }))}
        />
      </TabsContent>
    </Tabs>
  );
}
