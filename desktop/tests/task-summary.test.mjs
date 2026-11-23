import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTaskGoal } from "../src/task-summary.ts";

test("normalizes multiline whitespace", () => {
  assert.equal(summarizeTaskGoal("  First\n\tsecond   third  "), "First second third");
});

test("bounds long summaries and adds an ellipsis", () => {
  assert.equal(summarizeTaskGoal("a".repeat(121)), `${"a".repeat(119)}…`);
  assert.equal(summarizeTaskGoal("a".repeat(120)), "a".repeat(120));
});

test("does not split Unicode surrogate pairs", () => {
  assert.equal(summarizeTaskGoal("😀".repeat(121)), `${"😀".repeat(119)}…`);
});

test("provides a fallback for empty or whitespace-only goals", () => {
  assert.equal(summarizeTaskGoal(""), "No task goal provided.");
  assert.equal(summarizeTaskGoal(" \n\t "), "No task goal provided.");
});
