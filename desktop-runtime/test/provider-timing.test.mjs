import test from "node:test";
import assert from "node:assert/strict";
import {
  CodexClient,
  providerRequestTimeout,
  PROVIDER_COLD_START_TIMEOUT_MS,
} from "../codex-client.mjs";

test("cold lifecycle deadlines are bounded while read reconciliation keeps its explicit short deadline", () => {
  assert.equal(PROVIDER_COLD_START_TIMEOUT_MS, 120000);
  for (const method of [
    "initialize",
    "thread/start",
    "thread/resume",
    "turn/start",
  ]) {
    assert.equal(providerRequestTimeout(method), 120000);
    assert.equal(providerRequestTimeout(method, 999999), 120000);
  }
  assert.equal(providerRequestTimeout("thread/read"), 30000);
  assert.equal(providerRequestTimeout("thread/read", 2000), 2000);
  assert.equal(providerRequestTimeout("thread/read", 999999), 30000);
});

test("cold request survives thirty seconds then times out once without replay", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const client = new CodexClient("unused", "unused");
  const writes = [];
  client.child = { stdin: { write: (line) => writes.push(JSON.parse(line)) } };
  const pending = client.request("thread/start", { cwd: "C:/owned/snapshot" });
  const rejected = assert.rejects(pending, /thread\/start timeout/);
  t.mock.timers.tick(30001);
  assert.equal(client.pending.size, 1);
  assert.equal(writes.length, 1);
  t.mock.timers.tick(89998);
  assert.equal(client.pending.size, 1);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(client.pending.size, 0);
  assert.equal(writes.length, 1);
});

test("turn-start timeout retains uncertain lane and never repeats a possibly accepted turn", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const client = new CodexClient("unused", "unused");
  client.child = { killed: false, stdin: { write: () => {} } };
  client.ready = true;
  const pending = client.turn(
    "owned-thread",
    "Approved goal",
    async () => {},
    () => {},
    { workspace: "C:/owned/snapshot", worker: true },
  );
  const rejected = assert.rejects(pending, /turn\/start timeout/);
  t.mock.timers.tick(120000);
  await rejected;
  assert.equal(client.activeThreadTurns.get("owned-thread").uncertain, true);
  await assert.rejects(
    client.turn(
      "owned-thread",
      "Do not replay",
      async () => {},
      () => {},
      {},
    ),
    /already has an active or uncertain turn/,
  );
});
