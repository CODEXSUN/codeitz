import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, '.codeitz/desktop-private/database.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (config.host !== '127.0.0.1' || config.port !== 15433 || config.database !== 'codeitz_agent') throw new Error('Unexpected isolated database configuration');
let container;
try {
  container = JSON.parse(execFileSync('docker.exe', ['inspect', 'codeitz-desktop-postgres'], { encoding: 'utf8' }))[0];
} catch { throw new Error('The isolated database is absent. Run the reviewed first-time setup; this command will not recreate or adopt storage.'); }
const bindings = container.HostConfig.PortBindings?.['5432/tcp'];
if (container.Config.Image !== 'postgres:17.12-alpine' || bindings?.length !== 1 || bindings[0].HostIp !== '127.0.0.1' || bindings[0].HostPort !== '15433' ||
    !container.Mounts.some(m => m.Type === 'volume' && m.Name === 'codeitz-desktop-pgdata' && m.Destination === '/var/lib/postgresql/data')) {
  throw new Error('Container ownership or private-port check failed; left unchanged');
}
if (!container.State.Running) execFileSync('docker.exe', ['start', 'codeitz-desktop-postgres'], { stdio: 'ignore' });
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    execFileSync('docker.exe', ['exec', 'codeitz-desktop-postgres', 'pg_isready', '-U', 'codeitz_agent', '-d', 'codeitz_agent'], { stdio: 'ignore' });
    ready = true;
    break;
  } catch { await new Promise(r => setTimeout(r, 500)); }
}
if (!ready) throw new Error('Isolated database did not become ready');
console.log('Isolated desktop database ready on private localhost port15433; existing services unchanged.');
