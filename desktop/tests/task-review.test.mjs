import test from "node:test";
import assert from "node:assert/strict";
import { emptyActivity, mergeActivityPage } from "../src/activity-replay.ts";
import {
  verificationPassed,
  verificationBlock,
  inboxState,
} from "../src/task-state.ts";

test("activity replay retains bigint identity, deduplicates and rejects another operation", () => {
  const row = {
    id: "9007199254740993",
    operation_id: "one",
    type: "activity:agent-text",
    data: { message: "Actual output" },
  };
  const first = mergeActivityPage("one", emptyActivity(), {
    cursor: row.id,
    items: [row],
    hasMore: false,
  });
  const replay = mergeActivityPage("one", first, {
    cursor: row.id,
    items: [row],
    hasMore: false,
  });
  assert.equal(replay.revision, 1);
  assert.equal(replay.items.length, 1);
  assert.equal(replay.cursor, row.id);
  assert.throws(
    () => mergeActivityPage("other", first, { cursor: row.id, items: [row] }),
    /scope/,
  );
  assert.throws(
    () => mergeActivityPage("one", first, { cursor: "-1", items: [] }),
    /cursor/,
  );
  assert.throws(
    () =>
      mergeActivityPage("one", first, {
        cursor: "9223372036854775808",
        items: [],
      }),
    /cursor/,
  );
  assert.throws(
    () =>
      mergeActivityPage("one", emptyActivity(), { cursor: "0", items: [row] }),
    /skipped/,
  );
});

test("completion assessments block partial and stale output independently of provider completion", () => {
  const assessment = { version: 1, status: "needs-work", manifestDigest: "output", summary: "Partial", missing: ["UI"], blockers: [], evidence: [] };
  const worker = { id: "one", state: "completed", changeManifest: { digest: "output" }, completionAssessment: assessment };
  assert.equal(inboxState(worker, []), "Needs work");
  assert.match(verificationBlock(worker), /needs work/);
  const ready = { ...worker, completionAssessment: { ...assessment, status: "reported-ready" } };
  assert.equal(verificationBlock(ready), null);
  assert.match(verificationBlock(ready, undefined, "changed"), /does not match/);
  assert.equal(inboxState({ ...ready, changeManifest: { digest: "changed" } }, []), "Needs input");
  assert.equal(verificationBlock({ ...worker, completionAssessment: null }), null);
  assert.equal(verificationBlock({ ...worker, completionAssessment: { ...assessment, status: "legacy-unassessed" } }), null);
  assert.equal(inboxState({ ...worker, completionAssessment: null }, []), "Ready for review");
});

test("profile-backed Apply gates require a valid matching receipt while legacy policy stays unchanged", () => {
  const worker = {
    id: "one",
    state: "completed",
    verificationProfile: { id: "desktop-runtime", hash: "profile" },
    changeManifest: { digest: "output" },
  };
  const check = {
    operationId: "one",
    state: "passed",
    manifestDigest: "output",
    profile: worker.verificationProfile,
    receipt: {
      passed: true,
      runnerReceiptValid: true,
      outputUnchanged: true,
      manifestDigest: "output",
      profileHash: "profile",
    },
  };
  assert.equal(verificationPassed(worker, check), true);
  assert.equal(verificationBlock(worker, check), null);
  for (const patch of [
    { state: "running" },
    { state: "failed" },
    { manifestDigest: "old" },
    { profile: { id: "desktop-runtime", hash: "other" } },
    { receipt: { ...check.receipt, outputUnchanged: false } },
    { receipt: { ...check.receipt, runnerReceiptValid: false } },
  ])
    assert.notEqual(verificationBlock(worker, { ...check, ...patch }), null);
  assert.equal(inboxState(worker, [check]), "Ready for review");
  assert.equal(
    inboxState(worker, [{ ...check, state: "failed" }]),
    "Checks failed",
  );
  assert.equal(
    verificationBlock(
      { ...worker, verificationProfile: null },
      { ...check, state: "failed" },
    ),
    null,
  );
});
