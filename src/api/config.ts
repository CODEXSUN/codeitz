import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerEnvironment } from '@workspace/framework';

export const appRoot = fileURLToPath(new URL('../../', import.meta.url));
export function loadCodeitzConfig() {
  const server = loadServerEnvironment({ root: appRoot, prefix: 'CODEITZ', defaultPort: 4310 });
  return {
    ...server, appRoot,
    webRoot: path.join(appRoot, 'dist/web'),
    auditRoot: path.resolve(appRoot, server.values.CODEITZ_WORKSPACE_ROOT ?? '../..'),
  };
}
