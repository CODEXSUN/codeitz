const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (value) => typeof value === "string" && UUID.test(value);
const records = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];

// Input verifications follow the runtime list's newest-first order.
export function classifyRuntimeIssues(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") snapshot = {};
  const issues = [];
  const add = (kind, severity, message, operationId, appId) => {
    const issue = { kind, severity, message };
    if (validId(operationId)) issue.operationId = operationId;
    if (validId(appId)) issue.appId = appId;
    issues.push(issue);
  };
  if (snapshot.provider?.available === false) add("provider-unavailable", "error", "Model provider is unavailable.");
  if (Number.isFinite(snapshot.provider?.capacity?.uncertain) && snapshot.provider.capacity.uncertain > 0) {
    add("capacity-uncertain", "warning", "Model capacity has uncertain reservations.");
  }
  if (snapshot.sourceConfigured === true && snapshot.sourceCatalog?.connection?.connected === false) {
    add("source-disconnected", "warning", "Local source connection is unavailable.");
  }
  const apps = new Set(records(snapshot.apps).map((item) => item.id).filter(validId));
  const operations = new Map();
  for (const operation of records(snapshot.operations)) {
    if (validId(operation.id) && !operations.has(operation.id)) operations.set(operation.id, operation);
  }
  for (const [id, operation] of operations) {
    const appId = operation.app_id ?? operation.appId;
    if (operation.state === "interrupted" || operation.state === "failed") {
      add(`operation-${operation.state}`, "error", operation.state === "failed" ? "An operation failed." : "An operation was interrupted.", id, apps.has(appId) ? appId : undefined);
    }
  }
  const seen = new Set();
  for (const verification of records(snapshot.verifications)) {
    const id = verification.operation_id ?? verification.operationId;
    if (!validId(id) || !operations.has(id) || seen.has(id)) continue;
    seen.add(id);
    const operation = operations.get(id);
    if (["reviewed", "resolved"].includes(operation.state)) continue;
    if (verification.state === "failed" || verification.state === "interrupted") {
      const appId = operation.app_id ?? operation.appId;
      add(`verification-${verification.state}`, "error", verification.state === "failed" ? "A verification failed." : "A verification was interrupted.", id, apps.has(appId) ? appId : undefined);
    }
  }
  return issues;
}
