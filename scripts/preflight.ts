import { requirePreflight } from '@workspace/framework';
import { loadCodeitzConfig } from '../src/api/config.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function preflight() {
  const config = loadCodeitzConfig();
  await requirePreflight({
    name: 'Codeitz', root: config.appRoot, host: config.host, port: config.port,
    requiredPaths: [
      { path: 'dist/web/index.html', kind: 'file', label: 'Frontend build' },
      { path: 'src/api/server.ts', kind: 'file', label: 'Server entry' },
      { path: 'node_modules/@workspace/ui/dist/src/index.js', kind: 'file', label: 'Shared UI build' },
      { path: path.join(config.auditRoot, 'mcp-governance/docs/governance.md'), kind: 'file', label: 'Workspace governance' },
    ],
  });
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await preflight(); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Preflight failed.'); process.exitCode = 1; }
}
