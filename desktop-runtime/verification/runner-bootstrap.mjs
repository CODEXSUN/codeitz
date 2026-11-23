// Trusted verifier: test output is never forwarded as activity or interpreted as commands.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const work = '/work/desktop-runtime';
await fs.cp('/input/desktop-runtime', work, { recursive: true, errorOnExist: true, force: false });
await fs.symlink('/opt/codebiz/devkit/codeitz/node_modules', path.join(work, 'node_modules'));
await fs.mkdir('/work/home', { recursive: true });
const environment = { PATH: process.env.PATH, HOME: '/work/home', TMPDIR: '/tmp', CODEITZ_DESKTOP_DATABASE: '/run/verification/database.json' };
const checks = [];
function emit(value) { process.stdout.write(JSON.stringify(value) + '\n'); }
async function command(args) {
  return new Promise(resolve => {
    const child = spawn('node', args, { cwd: work, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    let bytes = 0, text = '', exceeded = false;
    const capture = data => {
      bytes += data.length;
      if (bytes > 2 * 1024 * 1024) { exceeded = true; child.kill('SIGKILL'); return; }
      text += data.toString('utf8');
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', () => resolve({ passed: false, exitCode: -1 }));
    child.once('exit', code => {
      const count = key => Number(text.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0);
      resolve({ passed: code === 0 && !exceeded, exitCode: code ?? -1, passedTests: count('pass'), failedTests: count('fail'), skippedTests: count('skipped'), outputLimited: exceeded });
    });
  });
}
async function check(id, action) {
  emit({ type: 'started', id });
  const start = Date.now();
  let result;
  try { result = await action(); } catch { result = { passed: false, exitCode: -1 }; }
  const value = { type: 'check', id, ...result, durationMs: Date.now() - start };
  checks.push(value); emit(value);
}
await check('syntax', async () => {
  const files = (await fs.readdir(work)).filter(name => name.endsWith('.mjs') && !name.startsWith('.')).sort();
  for (const file of files) { const result = await command(['--check', file]); if (!result.passed) return result; }
  return { passed: true, exitCode: 0, modules: files.length };
});
await check('portable', () => command(['--test', '--test-concurrency=1', '--test-reporter=tap', 'test/environment.test.mjs', 'test/execution-capacity.test.mjs', 'test/codeitz-source.test.mjs']));
await check('postgres', () => command(['--test', '--test-concurrency=1', '--test-reporter=tap', '--test-skip-pattern=real Git baseline plus PostgreSQL|real native OCR', 'test/runtime.test.mjs']));
emit({ type: 'complete', passed: checks.length === 3 && checks.every(item => item.passed) });
process.exitCode = checks.every(item => item.passed) ? 0 : 1;
