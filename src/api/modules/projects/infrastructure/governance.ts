import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProjectInput, CreationEvent } from '../../../../../contracts/projects.ts';
export async function scaffoldProject(workspaceRoot: string, input: ProjectInput, onProgress: (event: CreationEvent) => void) {
  const generator = await import(pathToFileURL(path.join(workspaceRoot, 'mcp-governance/scripts/create-app.mjs')).href);
  return generator.createApp({ ...input, workspaceRoot, git: true, onProgress: (progress: { stage: string; message: string; completed?: number; total?: number }) => onProgress({ type: 'progress', ...progress }) });
}
