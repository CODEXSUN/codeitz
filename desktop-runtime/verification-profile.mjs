import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PRODUCT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NODE_IMAGE = 'ghcr.io/codexsun/codeitz@sha256:98e01b00b4909545724dd37ba39e4dbd4e80dde4bd9b7ef428e3c421215dc2eb';
export const POSTGRES_IMAGE = 'postgres:17.12-alpine@sha256:a77aa70e641402a21411b92b721c58d10f23b50ae5fdd2333efd22d166e1e5f7';
export const CHECKS = Object.freeze([
  { id: 'syntax', name: 'Runtime JavaScript syntax' },
  { id: 'portable', name: 'Portable runtime and transport tests' },
  { id: 'postgres', name: 'Fresh PostgreSQL runtime integration tests' },
]);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const BOOTSTRAP = fileURLToPath(new URL('./verification/runner-bootstrap.mjs', import.meta.url));

export function buildVerificationProfile(repository = PRODUCT_ROOT) {
  const runtime = path.join(repository, 'desktop-runtime');
  const definition = {
    id: 'desktop-runtime', version: 1,
    coverage: 'runtime-only',
    name: 'Codeitz Desktop runtime — local Docker',
    description: 'Pinned Codeitz 1.0.20 image supplies Node 26, Git and locked pg/Kysely dependencies; PostgreSQL 17.12 is fresh and disposable.',
    images: { node: NODE_IMAGE, postgres: POSTGRES_IMAGE },
    packageHash: sha256(fs.readFileSync(path.join(runtime, 'package.json'))),
    lockHash: sha256(fs.readFileSync(path.join(runtime, 'package-lock.json'))),
    bootstrapHash: sha256(fs.readFileSync(BOOTSTRAP)),
    runnerHash: sha256(fs.readFileSync(new URL('./verification-runner.mjs', import.meta.url))),
    checks: CHECKS,
    exclusions: ['Desktop frontend build/browser/native-shell acceptance', 'Windows-native OCR tests', 'Legacy Windows D:/ repository-clone fixture'],
    isolation: 'Local Docker only; internal network; no published ports; fresh tmpfs database; read-only host inputs; unprivileged check process; no Docker socket, SSH keys or application credentials.',
    commands: ['node --check (copied runtime modules)', 'node --test (fixed portable test files)', 'node --test (fixed PostgreSQL test file; declared platform exclusions)'],
    timeoutSeconds: 180,
    maxConcurrentRuns: 3,
    automaticAfterApproval: true,
  };
  return Object.freeze({ ...definition, hash: sha256(JSON.stringify(definition)) });
}
