import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceReceipt, STAGES } from '../full-app-receipt.mjs';

const identity = { operationId: 'operation', manifestDigest: 'a'.repeat(64), profileId: 'profile', profileHash: 'b'.repeat(64) };

test('coverage requires every full-app stage and retains skipped stages', () => {
  const runtime = acceptanceReceipt({ ...identity, stages: { runtime: 'passed', database: 'passed' } });
  assert.equal(runtime.coverage, 'runtime-only');
  assert.equal(runtime.verified, false);
  assert.equal(runtime.stages.recovery, 'skipped');
  assert.equal(acceptanceReceipt({ ...identity, stages: { 'desktop-ui': 'passed', browser: 'passed' } }).coverage, 'ui-only');
  const stages = Object.fromEntries(STAGES.map(id => [id, 'passed']));
  assert.equal(acceptanceReceipt({ ...identity, stages }).verified, true);
  stages.preservation = 'failed';
  assert.equal(acceptanceReceipt({ ...identity, stages }).verified, false);
  assert.throws(() => acceptanceReceipt({ ...identity, manifestDigest: 'stale', stages }), /identities/);
  assert.throws(() => acceptanceReceipt({ ...identity, stages: { typo: 'passed' } }), /stage/);
});
