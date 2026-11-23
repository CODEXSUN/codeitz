// Acceptance evidence is informational and is not a trusted Apply receipt.
export const STAGES = Object.freeze([
  'runtime', 'database', 'desktop-ui', 'browser', 'approval',
  'workspace', 'progress', 'review', 'recovery', 'preservation',
]);

export function acceptanceReceipt({ operationId, manifestDigest, profileId, profileHash, stages }) {
  if (!operationId || !profileId || !/^[a-f0-9]{64}$/.test(manifestDigest ?? '') ||
      !/^[a-f0-9]{64}$/.test(profileHash ?? '')) {
    throw new Error('Operation, manifest and profile identities are required');
  }
  if (!stages || Object.keys(stages).some(id => !STAGES.includes(id))) {
    throw new Error('Unexpected acceptance stage');
  }
  const results = Object.fromEntries(STAGES.map(id => {
    const status = stages[id] ?? 'skipped';
    if (!['passed', 'failed', 'skipped'].includes(status)) throw new Error('Invalid stage status');
    return [id, status];
  }));
  const all = ids => ids.every(id => results[id] === 'passed');
  const coverage = all(STAGES) ? 'full-app' :
    all(['runtime', 'database']) ? 'runtime-only' :
    all(['desktop-ui', 'browser']) ? 'ui-only' : 'none';
  return { version: 1, operationId, manifestDigest, profileId, profileHash,
    coverage, verified: coverage === 'full-app', stages: results };
}
