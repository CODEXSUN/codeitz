import { spawn, execFile } from 'node:child_process';

export function execute(command: string, args: string[], cwd: string, input: string | undefined, signal: AbortSignal, timeoutMs = 600000, onOutput?: (chunk: string) => void) {
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    // Keep runtime configuration and unrelated credentials out of child environments.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|TEMP|TMP|CODEX_HOME|COMSPEC|HTTPS_PROXY|HTTP_PROXY|NO_PROXY)$/i.test(key)));
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let failure: Error | undefined;
    const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-200000); onOutput?.(chunk.toString()); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const stop = () => {
      failure = new Error(signal.aborted ? 'Task stopped.' : 'Task exceeded its time limit.');
      if (!child.pid) return;
      if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
    };
    const timer = setTimeout(stop, timeoutMs);
    signal.addEventListener('abort', stop, { once: true });
    child.once('error', (error: NodeJS.ErrnoException) => { clearTimeout(timer); signal.removeEventListener('abort', stop); reject(new Error(`${command}: ${error.code ?? 'spawn error'} — ${error.message}`)); });
    child.once('close', code => {
      clearTimeout(timer); signal.removeEventListener('abort', stop);
      if (failure) reject(failure); else resolve({ code: code ?? 1, output });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    if (signal.aborted) stop();
  });
}
