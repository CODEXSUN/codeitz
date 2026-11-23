import type { ActivityItem, ActivityPage } from "./bridge";
export type ActivitySnapshot = {
  cursor: string;
  items: ActivityItem[];
  revision: number;
  status: "loading" | "live" | "reconnecting";
  error?: string;
};
export const emptyActivity = (): ActivitySnapshot => ({
  cursor: "0",
  items: [],
  revision: 0,
  status: "loading",
});
const cursorValid = (value: string) =>
  /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n;

export function mergeActivityPage(
  operationId: string,
  previous: ActivitySnapshot,
  page: ActivityPage,
): ActivitySnapshot {
  if (
    !cursorValid(String(page.cursor)) ||
    !Array.isArray(page.items) ||
    page.items.length > 100
  )
    throw new Error("Invalid activity cursor");
  const byId = new Map(previous.items.map((item) => [item.id, item]));
  let added = 0;
  for (const raw of page.items) {
    const id = String(raw.id);
    if (
      raw.operation_id !== operationId ||
      !cursorValid(id) ||
      !raw.type.startsWith("activity:")
    )
      throw new Error("Activity scope mismatch");
    if (!byId.has(id)) {
      byId.set(id, { ...raw, id });
      added += 1;
    }
  }
  const ordered = [...byId.values()].sort((left, right) =>
    BigInt(left.id) < BigInt(right.id)
      ? -1
      : BigInt(left.id) > BigInt(right.id)
        ? 1
        : 0,
  );
  const cursor =
    BigInt(page.cursor) > BigInt(previous.cursor)
      ? String(page.cursor)
      : previous.cursor;
  if (ordered.length && BigInt(ordered.at(-1)!.id) > BigInt(cursor))
    throw new Error("Activity cursor skipped its own items");
  return {
    cursor,
    items: ordered.slice(-512),
    revision: previous.revision + added,
    status: "live",
  };
}
