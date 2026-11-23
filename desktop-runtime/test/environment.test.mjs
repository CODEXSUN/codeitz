import test from "node:test";
import assert from "node:assert/strict";
import { agentEnvironment } from "../codex-client.mjs";

test("agent child receives OS runtime environment without broker or database secrets", () => {
  const safe = agentEnvironment({
    Path: "C:/Windows",
    SystemRoot: "C:/Windows",
    USERPROFILE: "C:/Users/owner",
    CODEX_HOME: "C:/Users/owner/.codex",
    CODEITZ_DESKTOP_CONFIG: "private-runtime.json",
    PGPASSWORD: "not-forwarded",
    OPENAI_API_KEY: "not-forwarded",
    CUSTOM_TOKEN: "not-forwarded",
  });
  assert.deepEqual(safe, {
    Path: "C:/Windows",
    SystemRoot: "C:/Windows",
    USERPROFILE: "C:/Users/owner",
    CODEX_HOME: "C:/Users/owner/.codex",
  });
});
