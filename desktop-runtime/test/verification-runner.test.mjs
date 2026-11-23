import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createVerificationRunner } from '../verification-runner.mjs';
import { PRODUCT_ROOT, CHECKS } from '../verification-profile.mjs';

test('fixed verification profile exposes pinned identities, checks and declared platform exclusions', () => {
  const runner = createVerificationRunner();
  const profile = runner.profile();
  assert.equal(profile.id, 'desktop-runtime');
  assert.match(profile.hash, /^[a-f0-9]{64}$/);
  assert.match(profile.runnerHash, /^[a-f0-9]{64}$/);
  assert.match(profile.images.node, /@sha256:[a-f0-9]{64}$/);
  assert.match(profile.images.postgres, /@sha256:[a-f0-9]{64}$/);
  assert.deepEqual(profile.checks, CHECKS);
  assert.deepEqual(profile.exclusions, [
    'Desktop frontend build/browser/native-shell acceptance',
    'Windows-native OCR tests',
    'Legacy Windows D:/ repository-clone fixture',
  ]);
  profile.images.node = 'not-an-approved-image';
  assert.notEqual(runner.profile().images.node, profile.images.node);
  assert.equal(runner.canVerify({ repository: PRODUCT_ROOT }), true);
  assert.equal(runner.canVerify({ repository: path.dirname(PRODUCT_ROOT) }), false);
});

test('verification rejects unsupported dependency drift and approval/scope changes before Docker', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeitz-verifier-test-'));
  try {
    const operationId = randomUUID();
    const workspace = path.join(root, operationId);
    await fs.mkdir(path.join(workspace, 'desktop-runtime'), { recursive: true });
    for (const name of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(PRODUCT_ROOT, 'desktop-runtime', name), path.join(workspace, 'desktop-runtime', name));
    const runner = createVerificationRunner({ allowedWorkspaceRoot: root, stateRoot: path.join(root, 'forbidden-state'), dockerPath: 'does-not-exist-codeitz-verifier' });
    assert.equal(runner.canVerify({ repository: PRODUCT_ROOT, workspace }), true);
    const request = { operationId, workspace, manifestDigest: 'a'.repeat(64), profileHash: runner.profile().hash };
    await assert.rejects(runner.run({ ...request, profileHash: 'b'.repeat(64) }), /approval/);
    await assert.rejects(runner.run({ ...request, operationId: randomUUID() }), /scope/);
    await assert.rejects(runner.run({ ...request, manifestDigest: 'invalid' }), /approval/);
    await fs.appendFile(path.join(workspace, 'desktop-runtime/package-lock.json'), '\n ');
    assert.equal(runner.canVerify({ repository: PRODUCT_ROOT, workspace }), false);
    await assert.rejects(runner.run(request), /dependency profile/);
    await fs.writeFile(path.join(workspace, 'desktop-runtime/package-lock.json'), Buffer.alloc(1024 * 1024 + 1));
    assert.equal(runner.canVerify({ repository: PRODUCT_ROOT, workspace }), false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('verification admission is bounded to three runs without an automatic queue', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeitz-verifier-capacity-'));
  try {
    const workspaceRoot = path.join(root, 'workspaces'), stateRoot = path.join(root, 'state');
    await fs.mkdir(workspaceRoot); await fs.mkdir(stateRoot);
    const runner = createVerificationRunner({ allowedWorkspaceRoot: workspaceRoot, stateRoot, dockerPath: 'does-not-exist-codeitz-verifier' });
    const requests = [];
    for (let index = 0; index < 4; index++) {
      const operationId = randomUUID(), workspace = path.join(workspaceRoot, operationId);
      await fs.mkdir(path.join(workspace, 'desktop-runtime'), { recursive: true });
      for (const name of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(PRODUCT_ROOT, 'desktop-runtime', name), path.join(workspace, 'desktop-runtime', name));
      requests.push({ operationId, workspace, manifestDigest: 'c'.repeat(64), profileHash: runner.profile().hash });
    }
    const running = requests.slice(0, 3).map(request => runner.run(request));
    await assert.rejects(runner.run(requests[3]), /slots are occupied/);
    const results = await Promise.all(running);
    assert.equal(results.every(result => result.passed === false && result.checks.length === 0), true);
    assert.equal((await fs.readdir(stateRoot)).length, 3);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
