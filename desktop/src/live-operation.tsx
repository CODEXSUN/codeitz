import { useEffect } from "react";
import { useSmoothStreams } from "../../src/shared/streaming/use-smooth-streams";
import { CompactText } from "./chat-ui/compact-text";
import { StreamingStatus } from "../../src/shared/streaming/streaming-status";
import {
  useOperationActivity,
  publicAgentExcerpt,
  publicActivityMessage,
} from "./operation-activity";
import type { Operation } from "./bridge";

export function LiveOperation({
  operation,
  name,
  onRevision,
}: {
  operation: Operation;
  name: string;
  onRevision: (id: string, revision: number) => void;
}) {
  const activity = useOperationActivity(operation.id, true);
  useEffect(
    () => onRevision(operation.id, activity.revision),
    [operation.id, activity.revision, onRevision],
  );
  const text = publicAgentExcerpt(activity.items);
  const shown = useSmoothStreams([{ id: operation.id, content: text, streaming: activity.status === "live" }], operation.id);
  const latest = activity.items
    .filter((item) => item.type !== "activity:agent-text")
    .at(-1);
  return (
    <article
      className="live-operation"
      aria-label={`Live activity for ${name}`}
    >
      <strong>{name}</strong>
      {text && <div className="agent-public-text"><CompactText text={shown[operation.id] ?? text} markdown streaming /></div>}
      <div className="panel-caption">
        <StreamingStatus
          iconClassName="motion-safe:animate-spin"
          active={activity.status !== "reconnecting"}
          label={activity.status === "reconnecting"
            ? "Reconnecting to saved activity; agent work continues without replay."
            : latest
              ? publicActivityMessage(latest)
              : (operation.progress?.message ?? "Waiting for recorded activity")}
        />
      </div>
    </article>
  );
}
