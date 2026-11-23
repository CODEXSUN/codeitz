import test from "node:test";
import assert from "node:assert/strict";
import { classifyRuntimeIssues } from "../runtime-issues.mjs";

const app = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const operation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base = { apps: [{ id: app }], operations: [{ id: operation, app_id: app, state: "completed" }], provider: { available: true, capacity: { active: 3, available: 0, uncertain: 0 } } };

test("full capacity is normal and unconfigured source is quiet", () => {
  assert.deepEqual(classifyRuntimeIssues({ ...base, sourceCatalog: { connection: { connected: false } } }), []);
});
test("explicit provider, uncertain capacity and configured source are reported", () => {
  const issues = classifyRuntimeIssues({ ...base, provider: { available: false, capacity: { uncertain: 1 } }, sourceConfigured: true, sourceCatalog: { connection: { connected: false } } });
  assert.deepEqual(issues.map((item) => item.kind), ["provider-unavailable", "capacity-uncertain", "source-disconnected"]);
});
test("reviewed interruptions disappear and duplicate operations are deduplicated", () => {
  assert.equal(classifyRuntimeIssues({ ...base, operations: [{ id: operation, state: "reviewed" }] }).length, 0);
  assert.equal(classifyRuntimeIssues({ ...base, operations: [{ id: operation, state: "interrupted" }, { id: operation, state: "interrupted" }] }).length, 1);
});
test("latest verification wins, including pending and reviewed operations", () => {
  const failed = { operation_id: operation, state: "failed" };
  assert.equal(classifyRuntimeIssues({ ...base, verifications: [{ operation_id: operation, state: "passed" }, failed] }).length, 0);
  assert.equal(classifyRuntimeIssues({ ...base, verifications: [{ operation_id: operation, state: "running" }, failed] }).length, 0);
  assert.equal(classifyRuntimeIssues({ ...base, verifications: [failed] })[0].kind, "verification-failed");
  assert.equal(classifyRuntimeIssues({ ...base, operations: [{ id: operation, state: "reviewed" }], verifications: [failed] }).length, 0);
});
test("malformed data and sensitive text never enter issue metadata", () => {
  const secret = "secret goal /private/path token";
  const issues = classifyRuntimeIssues({ ...base, operations: [null, { id: secret, state: "failed" }, { id: operation, app_id: secret, state: "failed", goal: secret, result: secret }], verifications: [null, { operation_id: secret, state: "failed" }] });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].operationId, operation);
  assert.equal(issues[0].appId, undefined);
  assert.equal(JSON.stringify(issues).includes(secret), false);
  assert.deepEqual(classifyRuntimeIssues(null), []);
});
