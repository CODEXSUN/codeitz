import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { inScopeExists } from './owner.ts';
// Source conformance only. History and live API behavior are verified separately by tests.
export async function routingFindings(workspace: string, ownerRoot: string) {
  const files = ['src/api/modules/agent-chat/routes.ts', 'src/api/modules/agent-chat/openapi.ts', 'src/api/modules/todos/routes.ts', 'src/api/modules/todos/openapi.ts', 'src/api/server.ts', 'src/api/openapi.ts', 'src/api/modules/task-runner/routes.ts', 'src/api/modules/task-runner/openapi.ts', 'src/api/modules/governance-audit/openapi.ts', 'contracts/navigation.ts', 'src/web/navigation.ts', 'src/web/app.tsx', 'tests/routing.test.mjs'];
  const findings: string[] = [];
  const source: Record<string, string> = {};
  for (const file of files) {
    const target = path.join(ownerRoot, file);
    if (!await inScopeExists(workspace, target, false)) findings.push(`Missing or out-of-scope ${file}`);
    else source[file] = await readFile(target, 'utf8');
  }
  if (findings.length) return findings;
  const server = source['src/api/server.ts']; const docs = source['src/api/openapi.ts'];
  if (!server.includes('registerApiDocumentation(app)') || !docs.includes("'/api/docs'") || !docs.includes("'/api/openapi.json'")) findings.push('API documentation registration is missing.');
  for (const file of ['src/api/server.ts', 'src/api/modules/task-runner/routes.ts', 'src/api/modules/todos/routes.ts', 'src/api/modules/agent-chat/routes.ts']) {
    for (const match of source[file].matchAll(/app\.(get|post|patch|delete)\(['"]([^'"]+)/g)) {
      if (!match[2].startsWith('/api/v1/')) findings.push(`Unversioned module route: ${match[2]}`);
      const canonical = match[2].replace(/:([a-zA-Z]+)/g, '{$1}');
      const definitions = file.includes('/agent-chat/') ? source['src/api/modules/agent-chat/openapi.ts'] : file.includes('/todos/') ? source['src/api/modules/todos/openapi.ts'] : file.includes('task-runner') ? source['src/api/modules/task-runner/openapi.ts'] : source['src/api/modules/governance-audit/openapi.ts'];
      if (!definitions.includes(`${match[1].toUpperCase()} ${canonical}`)) findings.push(`Missing OpenAPI operation: ${canonical}`);
    }
  }
  const navigation = source['src/web/navigation.ts'];
  if (!navigation.includes("'popstate'") || !navigation.includes("'pushState'") || !navigation.includes("'replaceState'")) findings.push('Browser history wiring is missing.');
  const routes = source['contracts/navigation.ts'];
  for (const value of ['/tasks/', '/task-records', '/settings/', '/governance-audit', '/todos', '/agent-chat']) if (!routes.includes(value)) findings.push(`Missing clean browser path: ${value}`);
  async function inspect(directory: string) {
    if (!await inScopeExists(workspace, directory, true)) { findings.push('Frontend source is outside the workspace.'); return; }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await inspect(target);
      else if (/\.tsx?$/.test(entry.name) && await inScopeExists(workspace, target, false)) {
        const content = await readFile(target, 'utf8');
        if (/['"`]\/api\/(tasks|audit|todos|chats)/.test(content)) findings.push(`Unversioned frontend API call: ${path.relative(ownerRoot, target)}`);
        if (/href=["']\/api\/v1/.test(content)) findings.push('Internal API prefix exposed as normal navigation.');
      }
    }
  }
  await inspect(path.join(ownerRoot, 'src/web'));
  return findings;
}
