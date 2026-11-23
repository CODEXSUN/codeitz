import { useCallback, useSyncExternalStore } from "react";
import { runtimeRequest, type ActivityItem, type ActivityPage } from "./bridge";

import {
  emptyActivity,
  mergeActivityPage,
  type ActivitySnapshot,
} from "./activity-replay";
export { mergeActivityPage } from "./activity-replay";
type Entry = {
  snapshot: ActivitySnapshot;
  listeners: Set<() => void>;
  activeReaders: number;
  pending: boolean;
  timer?: ReturnType<typeof setTimeout>;
  touched: number;
};
const entries = new Map<string, Entry>();

function entryFor(id: string): Entry {
  let entry = entries.get(id);
  if (!entry) {
    entry = {
      snapshot: emptyActivity(),
      listeners: new Set(),
      activeReaders: 0,
      pending: false,
      touched: Date.now(),
    };
    entries.set(id, entry);
    if (entries.size > 24) {
      const old = [...entries]
        .filter(([key, value]) => key !== id && !value.listeners.size)
        .sort((a, b) => a[1].touched - b[1].touched)[0];
      if (old) {
        clearTimeout(old[1].timer);
        entries.delete(old[0]);
      }
    }
  }
  return entry;
}

async function poll(id: string, entry: Entry) {
  if (entry.pending || !entry.listeners.size) return;
  entry.pending = true;
  clearTimeout(entry.timer);
  let more = false;
  try {
    const page = await runtimeRequest<ActivityPage>(
      `/api/runtime/operations/${id}/activity?after=${entry.snapshot.cursor}&limit=100`,
    );
    const next = mergeActivityPage(id, entry.snapshot, page);
    more = page.hasMore;
    if (
      next.cursor !== entry.snapshot.cursor ||
      next.revision !== entry.snapshot.revision ||
      entry.snapshot.status !== "live"
    ) {
      entry.snapshot = next;
      entry.listeners.forEach((listener) => listener());
    }
  } catch {
    if (entry.snapshot.status !== "reconnecting") {
      entry.snapshot = {
        ...entry.snapshot,
        status: "reconnecting",
        error:
          "Activity is reconnecting. Saved events and model work are not replayed.",
      };
      entry.listeners.forEach((listener) => listener());
    }
  } finally {
    entry.pending = false;
    if (
      entry.listeners.size &&
      (entry.activeReaders > 0 ||
        more ||
        entry.snapshot.status === "reconnecting")
    )
      entry.timer = setTimeout(
        () => void poll(id, entry),
        entry.snapshot.status === "reconnecting" ? 2000 : more ? 75 : 1000,
      );
  }
}

export function useOperationActivity(
  operationId: string | null,
  active: boolean,
) {
  const entry = entryFor(operationId ?? "none");
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!operationId) return () => {};
      entry.listeners.add(listener);
      entry.activeReaders += active ? 1 : 0;
      entry.touched = Date.now();
      void poll(operationId, entry);
      return () => {
        entry.listeners.delete(listener);
        entry.activeReaders -= active ? 1 : 0;
        if (!entry.listeners.size) clearTimeout(entry.timer);
      };
    },
    [operationId, entry, active],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => entry.snapshot,
    () => entry.snapshot,
  );
  return {
    ...snapshot,
    reconnect: () => {
      if (operationId) void poll(operationId, entry);
    },
  };
}

export function publicAgentExcerpt(items: readonly ActivityItem[]): string {
  return items
    .filter((item) => item.type === "activity:agent-text")
    .map((item) =>
      typeof item.data.message === "string" ? item.data.message : "",
    )
    .join("")
    .slice(-24000);
}

export function publicActivityMessage(item: ActivityItem): string {
  return [
    "activity:agent-text",
    "activity:tool-status",
    "activity:verification-output",
    "activity:verification-status",
  ].includes(item.type) && typeof item.data.message === "string"
    ? item.data.message
    : "Recorded task activity";
}
