import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PRODUCT_ROOT, BOOTSTRAP, CHECKS, buildVerificationProfile, sha256 } from './verification-profile.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^[a-f0-9]{64}$/;
const canonical = value => syncFs.realpathSync(path.resolve(value));
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const childOf = (root, value) => {
  const relative = path.relative(root, value);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

export function createVerificationRunner(options = {}) {
  const repositoryRoot = canonical(options.allowedRepositoryRoot ?? PRODUCT_ROOT);
  const workspaceRoot = path.resolve(options.allowedWorkspaceRoot ?? path.join(process.env.LOCALAPPDATA ?? '', 'CodeitzDesktop', 'workspaces'));
  const workspaceRoots = [workspaceRoot, ...(options.retainedWorkspaceRoots ?? []).map(root => path.resolve(root))];
  const stateRoot = path.resolve(options.stateRoot ?? path.join(process.env.LOCALAPPDATA ?? '', 'CodeitzDesktop', 'verification'));
  const docker = options.dockerPath ?? (process.platform === 'win32' ? 'docker.exe' : 'docker');
  const context = process.platform === 'win32' ? 'desktop-linux' : 'default';
  const trusted = buildVerificationProfile(repositoryRoot);
  const active = new Set();

  function canVerify({ repository, workspace } = {}) {
    try {
      if (!same(canonical(repository), repositoryRoot)) return false;
      const target = workspace ? canonical(workspace) : repositoryRoot;
      if (workspace && (!workspaceRoots.some(root => same(path.dirname(target), canonical(root))) || !uuid.test(path.basename(target)))) return false;
      const runtime = path.join(target, 'desktop-runtime');
      const runtimeStat = syncFs.lstatSync(runtime);
      if (!runtimeStat.isDirectory() || runtimeStat.isSymbolicLink() || !same(canonical(runtime), runtime)) return false;
      const identities = {};
      for (const name of ['package.json', 'package-lock.json']) {
        const file = path.join(runtime, name), stat = syncFs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1024 * 1024 || !same(canonical(file), file)) return false;
        const handle = syncFs.openSync(file, 'r');
        try {
          const opened = syncFs.fstatSync(handle);
          if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.nlink !== 1 || opened.size > 1024 * 1024) return false;
          const bytes = Buffer.alloc(opened.size + 1);
          let length = 0;
          while (length < bytes.length) { const count = syncFs.readSync(handle, bytes, length, bytes.length - length, length); if (!count) break; length += count; }
          const after = syncFs.fstatSync(handle), current = syncFs.lstatSync(file);
          if (length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs || current.dev !== opened.dev || current.ino !== opened.ino || current.isSymbolicLink() || current.nlink !== 1 || !same(canonical(file), file)) return false;
          identities[name] = sha256(bytes.subarray(0, length));
        } finally { syncFs.closeSync(handle); }
      }
      return identities['package.json'] === trusted.packageHash && identities['package-lock.json'] === trusted.lockHash;
    } catch { return false; }
  }

  async function cli(args, { timeout = 30000, onLine } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(docker, ['--context', context, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', buffered = '', bytes = 0, timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
      child.stdout.on('data', data => {
        bytes += data.length;
        if (bytes > 2 * 1024 * 1024) { child.kill(); return; }
        stdout += data.toString('utf8'); buffered += data.toString('utf8');
        let at;
        while ((at = buffered.indexOf('\n')) !== -1) { const line = buffered.slice(0, at); buffered = buffered.slice(at + 1); onLine?.(line); }
      });
      child.stderr.on('data', data => { if (stderr.length < 32000) stderr += data.toString('utf8'); });
      child.once('error', () => { clearTimeout(timer); reject(new Error('Local Docker could not be started')); });
      child.once('exit', code => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, timedOut, outputLimited: bytes > 2 * 1024 * 1024 });
      });
    });
  }
  async function required(args, settings) {
    const result = await cli(args, settings);
    if (result.code !== 0 || result.timedOut || result.outputLimited) throw new Error('Local verification environment command failed; no existing service was modified');
    return result.stdout;
  }
  async function inspectOwned(kind, name, runId, operationId) {
    const result = await cli([kind === 'network' ? 'network' : 'container', 'inspect', name]);
    if (result.code !== 0) {
      const absent = await cli(kind === 'network' ? ['network', 'ls', '-q', '--filter', `name=^${name}$`] : ['container', 'ls', '-aq', '--filter', `name=^/${name}$`]);
      if (absent.code === 0 && !absent.stdout.trim()) return null;
      throw new Error('Verification resource absence could not be verified');
    }
    const entry = JSON.parse(result.stdout)[0];
    const labels = kind === 'network' ? entry.Labels : entry.Config?.Labels;
    if (labels?.['io.codeitz.verification.run'] !== runId || labels?.['io.codeitz.verification.operation'] !== operationId || !/^[a-f0-9]{64}$/.test(entry.Id)) throw new Error('Verification resource ownership changed; retained for review');
    return entry.Id;
  }
  async function copySnapshot(source, destination) {
    const entries = [], totals = { bytes: 0, files: 0 };
    async function visit(directory, relative = '') {
      const initialDirectory = await fs.lstat(directory);
      if (!initialDirectory.isDirectory() || initialDirectory.isSymbolicLink() || !same(await fs.realpath(directory), directory)) throw new Error('Verification input directory changed');
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || ['node_modules', 'native-ocr', 'target'].includes(entry.name)) continue;
        const file = path.join(directory, entry.name), rel = path.join(relative, entry.name);
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink()) throw new Error('Verification input contains a link');
        if (stat.isDirectory()) { await visit(file, rel); continue; }
        if (!stat.isFile() || stat.nlink !== 1) throw new Error('Verification input is not an ordinary single-link file');
        if (!['.mjs', '.json'].includes(path.extname(file)) || /(?:credential|secret|password|private)/i.test(entry.name)) continue;
        if (stat.size > 1024 * 1024) throw new Error('Verification input file exceeds its bounded profile');
        if (!same(await fs.realpath(file), file)) throw new Error('Verification input escaped its canonical path');
        const handle = await fs.open(file, 'r');
        let bytes;
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size > 1024 * 1024) throw new Error('Verification input identity or size changed before read');
          const buffer = Buffer.alloc(opened.size + 1);
          let length = 0;
          while (length < buffer.length) {
            const result = await handle.read(buffer, length, buffer.length - length, length);
            if (!result.bytesRead) break;
            length += result.bytesRead;
          }
          if (length !== opened.size) throw new Error('Verification input length changed while reading');
          bytes = buffer.subarray(0, length);
          const afterRead = await handle.stat();
          const current = await fs.lstat(file);
          if (current.isSymbolicLink() || current.nlink !== 1 || current.dev !== opened.dev || current.ino !== opened.ino || afterRead.size !== opened.size || afterRead.mtimeMs !== opened.mtimeMs || afterRead.ctimeMs !== opened.ctimeMs || !same(await fs.realpath(file), file)) throw new Error('Verification input changed while reading');
        } finally { await handle.close(); }
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        totals.bytes += bytes.length; totals.files++;
        if (bytes.length > 1024 * 1024 || totals.bytes > 8 * 1024 * 1024 || totals.files > 500) throw new Error('Verification input exceeds its bounded profile');
        entries.push([rel.replaceAll(path.sep, '/'), sha256(bytes)]);
        if (destination) { const output = path.join(destination, rel); await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, bytes, { flag: 'wx' }); }
      }
      const finalDirectory = await fs.lstat(directory);
      if (finalDirectory.isSymbolicLink() || finalDirectory.dev !== initialDirectory.dev || finalDirectory.ino !== initialDirectory.ino || !same(await fs.realpath(directory), directory)) throw new Error('Verification directory changed during preparation');
    }
    const stat = await fs.lstat(source);
    if (!stat.isDirectory() || stat.isSymbolicLink() || !same(await fs.realpath(source), source)) throw new Error('Verification runtime input is not canonical');
    await visit(source);
    entries.sort(([a], [b]) => a.localeCompare(b));
    return sha256(JSON.stringify(entries));
  }

  async function run({ operationId, workspace, manifestDigest, profileHash, onActivity = () => {} }) {
    if (!uuid.test(operationId) || !digest.test(manifestDigest) || profileHash !== trusted.hash) throw new Error('Verification approval binding is invalid');
    const resolved = canonical(workspace);
    if (!workspaceRoots.some(root => same(path.dirname(resolved), canonical(root))) || path.basename(resolved) !== operationId) throw new Error('Verification workspace is outside its operation scope');
    if (!canVerify({ repository: repositoryRoot, workspace: resolved })) throw new Error('This snapshot needs a separately reviewed dependency profile');
    if (active.has(operationId)) throw new Error('Verification already active');
    if (active.size >= trusted.maxConcurrentRuns) throw new Error('All verification slots are occupied; a fresh explicit retry is required when one is free');
    active.add(operationId);
    const runId = randomUUID();
    const prefix = `codeitz-v-${runId}`;
    const names = { network: prefix, postgres: prefix + '-pg', tests: prefix + '-checks' };
    const directory = path.join(stateRoot, runId), input = path.join(directory, 'input', 'desktop-runtime');
    const checks = [], cleanupErrors = [];
    const journal = { runId, operationId, manifestDigest, profileHash, names, state: 'preparing', createdAt: new Date().toISOString() };
    let before, complete = false, failure, localVerified = false, mutationsAttempted = false;
    let activityQueue = Promise.resolve();
    const notify = (phase, message) => { activityQueue = activityQueue.then(() => onActivity({ phase, message })).catch(() => {}); };
    const writeJournal = () => fs.writeFile(path.join(directory, 'journal.json'), JSON.stringify(journal, null, 2), { mode: 0o600 });
    try {
      const rootStat = await fs.lstat(stateRoot);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !same(await fs.realpath(stateRoot), stateRoot) || workspaceRoots.some(root => childOf(root, stateRoot) || same(root, stateRoot)) || childOf(repositoryRoot, stateRoot) || same(repositoryRoot, stateRoot)) throw new Error('Verification private state root is unsafe');
      await fs.mkdir(input, { recursive: true });
      await writeJournal(); // Durable intent precedes every Docker mutation.
      const endpoint = JSON.parse(await required(['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}']));
      if (typeof endpoint !== 'string' || !/^(npipe|unix):\/\//.test(endpoint)) throw new Error('Verification requires local Docker; remote contexts are not allowed');
      localVerified = true;
      const prior = await required(['ps', '-aq', '--filter', `label=io.codeitz.verification.operation=${operationId}`]);
      if (prior.trim()) throw new Error('Prior verification resources require review before a fresh approved retry');
      for (const image of Object.values(trusted.images)) await required(['image', 'inspect', image]);
      before = await copySnapshot(path.join(resolved, 'desktop-runtime'), input);
      if (sha256(await fs.readFile(BOOTSTRAP)) !== trusted.bootstrapHash) throw new Error('Trusted verification bootstrap changed; obtain fresh approval');
      const bootstrap = path.join(directory, 'runner.mjs');
      await fs.copyFile(BOOTSTRAP, bootstrap, syncFs.constants.COPYFILE_EXCL);
      const password = randomBytes(24).toString('hex');
      const envFile = path.join(directory, 'postgres.env'), databaseFile = path.join(directory, 'database.json');
      await fs.writeFile(envFile, `POSTGRES_USER=postgres\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=postgres\n`, { flag: 'wx', mode: 0o600 });
      await fs.writeFile(databaseFile, JSON.stringify({ host: 'database', port: 5432, user: 'postgres', password, database: 'postgres', max: 5 }), { flag: 'wx', mode: 0o600 });
      const labels = ['--label', `io.codeitz.verification.run=${runId}`, '--label', `io.codeitz.verification.operation=${operationId}`];
      notify('environment', 'Preparing isolated local verification resources');
      mutationsAttempted = true;
      await required(['network', 'create', '--internal', ...labels, names.network]);
      await required(['run', '-d', '--pull', 'never', '--name', names.postgres, ...labels, '--network', names.network, '--network-alias', 'database', '--user', 'postgres', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '384m', '--cpus', '1', '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=268435456,uid=70,gid=70,mode=0700', '--tmpfs', '/var/run/postgresql:rw,noexec,nosuid,size=16777216,uid=70,gid=70', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16777216', '--env-file', envFile, trusted.images.postgres]);
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const check = await cli(['exec', names.postgres, 'pg_isready', '-U', 'postgres', '-d', 'postgres'], { timeout: 3000 });
        if (check.code === 0) { ready = true; break; }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!ready) throw new Error('Fresh verification PostgreSQL did not become ready');
      journal.state = 'running'; await writeJournal();
      notify('checking', 'Running the approved checks in a disposable environment');
      const result = await cli(['run', '--pull', 'never', '--name', names.tests, ...labels, '--network', names.network, '--user', 'node', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '768m', '--cpus', '1', '--pids-limit', '128', '--tmpfs', '/work:rw,nosuid,size=536870912,uid=1000,gid=1000', '--tmpfs', '/tmp:rw,noexec,nosuid,size=67108864,uid=1000,gid=1000', '--mount', `type=bind,source=${path.join(directory, 'input')},target=/input,readonly`, '--mount', `type=bind,source=${bootstrap},target=/run/verification/runner.mjs,readonly`, '--mount', `type=bind,source=${databaseFile},target=/run/verification/database.json,readonly`, '--entrypoint', 'node', trusted.images.node, '/run/verification/runner.mjs'], {
        timeout: trusted.timeoutSeconds * 1000,
        onLine(line) {
          let value; try { value = JSON.parse(line); } catch { return; }
          const check = CHECKS.find(item => item.id === value.id);
          if (value.type === 'started' && check) notify('checking', `Running: ${check.name}`);
          if (value.type === 'check' && check && !checks.some(item => item.id === value.id)) {
            const entry = { id: check.id, name: check.name, status: value.passed === true && value.exitCode === 0 ? 'passed' : 'failed', exitCode: Number.isInteger(value.exitCode) ? value.exitCode : -1, durationMs: Math.min(Math.max(Number(value.durationMs) || 0, 0), 180000), passedTests: Math.max(Number(value.passedTests) || 0, 0), failedTests: Math.max(Number(value.failedTests) || 0, 0), skippedTests: Math.max(Number(value.skippedTests) || 0, 0) };
            checks.push(entry); notify('checking', `${check.name}: ${entry.status}`);
          }
          if (value.type === 'complete' && value.passed === true) complete = true;
        },
      });
      if (result.code !== 0 || result.timedOut || result.outputLimited) failure = result.timedOut ? 'Verification time limit reached' : 'One or more approved checks failed';
      const after = await copySnapshot(path.join(resolved, 'desktop-runtime'));
      if (before !== after) failure = 'Snapshot changed while checks were running; fresh review is required';
    } catch (error) { failure = error.message; }
    finally {
      notify('cleanup', 'Cleaning only this verification run’s disposable resources');
      for (const [kind, name] of localVerified && mutationsAttempted ? [['container', names.tests], ['container', names.postgres], ['network', names.network]] : []) {
        try { const id = await inspectOwned(kind, name, runId, operationId); if (id) await required(kind === 'network' ? ['network', 'rm', id] : ['container', 'rm', '-f', id]); }
        catch { cleanupErrors.push(name); }
      }
      active.delete(operationId);
    }
    const passed = !failure && complete && checks.length === CHECKS.length && checks.every(check => check.status === 'passed') && cleanupErrors.length === 0;
    const receipt = { runId, operationId, workspace: resolved, passed, profileId: trusted.id, profileHash, manifestDigest, sourceFingerprint: before ?? null, images: trusted.images, checks, exclusions: trusted.exclusions, cleanup: cleanupErrors.length ? 'review-required' : 'verified', recoveryReference: runId, message: cleanupErrors.length ? 'Verification cleanup requires review' : (failure ?? (passed ? 'Approved checks passed' : 'Verification did not return a complete passing receipt')) };
    journal.state = passed ? 'passed' : 'failed'; journal.receipt = receipt;
    await writeJournal().catch(() => {});
    notify(passed ? 'passed' : 'failed', passed ? 'Approved checks passed; changes still require review and Apply approval' : 'Verification needs attention; changes were not applied');
    await activityQueue;
    return receipt;
  }
  return { profile: () => structuredClone(trusted), canVerify, run };
}
