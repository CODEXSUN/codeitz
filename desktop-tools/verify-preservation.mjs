import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(await readFile(resolve(root, 'desktop-proof/preservation-before.json'), 'utf8'));
const changed = [];
for (const file of baseline.primaryDirty) {
  const bytes = await readFile(resolve('D:/workspace/codebiz/devkit/codeitz', file.path));
  const actual = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (actual !== file.sha256) changed.push(file.path);
}
const current = new Set(execFileSync('docker.exe', ['ps', '--format', '{{.Names}}|{{.ID}}|{{.Image}}'], { encoding: 'utf8' }).trim().split(/\r?\n/));
const changedContainers = baseline.containers.filter(item => !current.has(item));
const receipt = { checkedAt: new Date().toISOString(), primaryFilesChecked: baseline.primaryDirty.length,
  changedPrimaryFiles: changed, existingServicesChecked: baseline.containers.length, changedExistingServices: changedContainers,
  passed: changed.length === 0 && changedContainers.length === 0 };
await writeFile(resolve(root, 'desktop-proof/preservation-after.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
if (!receipt.passed) process.exitCode = 1;
