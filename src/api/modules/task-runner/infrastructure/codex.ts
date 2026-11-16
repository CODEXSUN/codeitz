import { execute } from './process.ts';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { safeActivity } from './store.ts';
import { access } from 'node:fs/promises';

// Discover the installed app for servers launched with an older IDE PATH.
// Read installation metadata only; auth remains owned by the local CLI.
export async function resolveCodex(directory: string, command = execute) {
  const signal = new AbortController().signal;
  try {
    const result = await command('codex', ['--version'], directory, undefined, signal, 10000);
    if (result.code !== 0) throw new Error(`codex --version exited ${result.code}: ${result.output}`);
    return 'codex';
  } catch (original) {
    if (process.platform !== 'win32') throw original;
    const powershell = path.join(process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const installed = await command(powershell, ['-NoProfile', '-NonInteractive', '-Command', '(Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop | Select-Object -First 1).InstallLocation'], directory, undefined, signal, 15000);
    const location = installed.output.trim();
    if (installed.code !== 0 || !location || !path.isAbsolute(location) || location.includes('\n')) {
      throw new Error(`${original instanceof Error ? original.message : 'Codex not found'}; installed Codex discovery: ${installed.output.trim() || 'no app registered for this Windows user'}`);
    }
    const executable = path.join(location, 'app/resources/codex.exe');
    await access(executable);
    return executable;
  }
}

export async function runCodex({ directory, prompt, mode, signal, onActivity }: {
  directory: string; prompt: string; mode: 'plan' | 'code'; signal: AbortSignal; onActivity?: (kind: 'codex' | 'tool', message: string) => void;
}) {
  let pending = '';
  const live = (chunk: string) => {
    pending += chunk;
    const lines = pending.split('\n'); pending = lines.pop()!.slice(-200000);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'turn.started') onActivity?.('codex', 'Codex started working in the selected app.');
        const item = event.item;
        if (!item) continue;
        if (item.type === 'agent_message' && event.type === 'item.completed' && typeof item.text === 'string') {
          let text = item.text;
          try { text = JSON.parse(text).summary ?? ''; } catch { /* Commentary is already plain text. */ }
          if (text) onActivity?.('codex', safeActivity(text));
        }
        if (['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(item.type) && ['item.started', 'item.completed'].includes(event.type)) {
          const label = { command_execution: 'Workspace command', file_change: 'File changes', mcp_tool_call: 'Tool call', web_search: 'Web search' }[item.type as string];
          onActivity?.('tool', `${label}: ${event.type === 'item.started' ? 'running' : item.status ?? 'finished'}`);
        }
      } catch { /* Do not stream raw diagnostics or hidden reasoning. */ }
    }
  };
  const executable = await resolveCodex(directory);
  const result = await execute(executable, ['exec', '--ignore-user-config', '--ephemeral', '--json',
    '-c', `default_permissions="${mode === 'plan' ? ':read-only' : ':workspace'}"`,
    ...(process.platform === 'win32' ? ['-c', 'windows.sandbox="elevated"'] : []),
    '-c', 'approval_policy="never"', '--output-schema', fileURLToPath(new URL('./response.schema.json', import.meta.url)),
    '--skip-git-repo-check', '-C', directory, '-'], directory,
    `${prompt}\n\nReturn status blocked if permissions, tools, or missing information prevent this step. Return completed only if this step actually finished. Explain the result in summary.`, signal, 600000, live);
  if (result.code !== 0) throw new Error('Codex could not complete this step. Check CLI sign-in, model availability, and local permissions. No broader permissions were granted.');
  const messages: string[] = [];
  for (const line of result.output.split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') messages.push(event.item.text);
    } catch { /* Ignore non-event diagnostics; never expose raw command logs. */ }
  }
  const message = messages.at(-1);
  if (!message) throw new Error('Codex returned no final response. The step was not marked complete.');
  let response: { status: string; summary: string };
  try { response = JSON.parse(message); }
  catch { throw new Error('Codex returned an invalid step result. Review the task before retrying.'); }
  if (typeof response.summary !== 'string' || !['completed', 'blocked'].includes(response.status)) throw new Error('Codex returned an invalid step result.');
  if (response.status === 'blocked') throw new Error(`Codex blocked: ${response.summary.slice(0, 3000)}`);
  return response.summary.slice(0, 30000);
}

export async function codexStatus(directory: string, command = execute) {
  const signal = new AbortController().signal;
  try {
    const executable = await resolveCodex(directory, command);
    const version = await command(executable, ['--version'], directory, undefined, signal, 10000);
    const login = await command(executable, ['login', 'status'], directory, undefined, signal, 10000);
    const diagnostic = (label: string, result: { code: number; output: string }) => `${label} exited ${result.code}: ${result.output.trim() || 'No diagnostic output.'}`;
    return { available: version.code === 0, signedIn: version.code === 0 && login.code === 0, version: version.code === 0 ? version.output.trim().slice(0, 100) : '', message: version.code !== 0 ? diagnostic('codex --version', version) : login.code === 0 ? 'Connected to local Codex.' : diagnostic('codex login status', login) };
  } catch (error) { return { available: false, signedIn: false, version: '', message: error instanceof Error ? error.message : 'Codex check failed.' }; }
}
