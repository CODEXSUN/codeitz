import { startHttpServer } from '@workspace/framework';
import { createServer } from '../src/api/server.ts';
import { preflight } from './preflight.ts';

try {
  const config = await preflight();
  await startHttpServer(createServer({ auditRoot: config.auditRoot }), config);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Codeitz startup failed.');
  process.exitCode = 1;
}
