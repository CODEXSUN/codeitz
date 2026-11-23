export const MAX_ACTIVE_TURNS = 3;

/** Local bounded admission, not an execution queue or a deployment lock. */
export class ExecutionCapacity {
  constructor(limit = MAX_ACTIVE_TURNS) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ACTIVE_TURNS) {
      throw new Error(
        "Concurrent model capacity must be between one and three",
      );
    }
    this.limit = limit;
    this.active = new Map();
    this.maintenance = false;
    this.reviews = new Set();
  }

  reserve(input) {
    if (this.maintenance)
      throw new Error("A reviewed maintenance action is in progress");
    if (this.active.has(input.id))
      throw new Error("This operation is already active");
    if ([...this.active.values()].some((item) => item.key === input.key)) {
      throw new Error(
        "This coworker or supervisor conversation already has an active turn",
      );
    }
    if (this.active.size >= this.limit)
      throw new Error(
        "All concurrent model slots are occupied; approve again when a slot is available",
      );
    const occupied = new Set(
      [...this.active.values()].map((item) => item.slot),
    );
    let slot = 0;
    while (occupied.has(slot)) slot++;
    const reservation = Object.freeze({ ...input, slot });
    this.active.set(input.id, reservation);
    return reservation;
  }

  release(id) {
    this.active.delete(id);
  }
  get(id) {
    return this.active.get(id);
  }
  markUnknown(id) {
    const item = this.active.get(id);
    if (item) this.active.set(id, Object.freeze({ ...item, uncertain: true }));
  }
  hasKey(key) {
    return [...this.active.values()].some((item) => item.key === key);
  }

  beginMaintenance() {
    if (this.maintenance || this.active.size || this.reviews.size) {
      throw new Error(
        "Wait for active model turns before this reviewed maintenance action",
      );
    }
    this.maintenance = true;
  }

  endMaintenance() {
    this.maintenance = false;
  }
  beginReview(id) {
    if (this.maintenance || this.reviews.has(id))
      throw new Error(
        "A reviewed maintenance action or review is already active",
      );
    this.reviews.add(id);
  }
  endReview(id) {
    this.reviews.delete(id);
  }

  snapshot() {
    const values = [...this.active.values()];
    return {
      limit: this.limit,
      active: values.length,
      available: this.maintenance ? 0 : this.limit - values.length,
      activeWorkers: values.filter((item) => item.kind === "worker").length,
      activeChats: values.filter((item) => item.kind === "chat").length,
      maintenance: this.maintenance,
      reviews: this.reviews.size,
      uncertain: values.filter((item) => item.uncertain).length,
      operations: values.map(({ id, kind, key, slot, uncertain }) => ({
        id,
        kind,
        key,
        slot,
        uncertain: !!uncertain,
      })),
    };
  }
}
