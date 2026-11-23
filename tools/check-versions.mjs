#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHANGELOG_PATH, readLatestVersionedChangelogEntry, formatChangelogCommitSubject } from './changelog.mjs';
import { bumpPatch } from './version-bump.mjs';
const ROOT = resolve(import.meta.dirname, '..');
export function checkVersions(rootDir) {
  const failures = []; let rootVersion = ''; let subject = '';
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
    rootVersion = String(pkg.version); bumpPatch(rootVersion);
    if (existsSync(join(rootDir, 'package-lock.json'))) {
      const lock = JSON.parse(readFileSync(join(rootDir, 'package-lock.json'), 'utf8'));
      if (lock.version !== rootVersion || lock.packages?.['']?.version !== rootVersion) failures.push('Package-lock root versions do not match package.json.');
    } else failures.push('package-lock.json is missing.');
    const changelog = readFileSync(join(rootDir, CHANGELOG_PATH), 'utf8');
    const lines = changelog.split(/\r?\n/);
    for (const expected of [`Current version: ${rootVersion}`, `Release tag: v-${rootVersion}`, `Changelog label: v ${rootVersion}`, `## v-${rootVersion}`]) if (!lines.includes(expected)) failures.push(`Changelog is missing: ${expected}`);
    const entry = readLatestVersionedChangelogEntry(rootDir);
    if (entry.version !== rootVersion) failures.push('Latest changelog entry does not match package.json.');
    subject = formatChangelogCommitSubject(entry);
    if (existsSync(join(rootDir, 'src/web/app.tsx'))) {
      const versionSource = readFileSync(join(rootDir, 'src/shared/app-version.ts'), 'utf8');
      if (!/import packageInfo from ['"]\.\.\/\.\.\/package\.json['"] with \{ type: ['"]json['"] \}/.test(versionSource)
        || !versionSource.includes('export const appVersionLabel = `Codeitz - V${packageInfo.version}`;')) {
        failures.push('Status version must derive from the owning package.json as Codeitz - V<version>.');
      }
      const web = readFileSync(join(rootDir, 'src/web/app.tsx'), 'utf8');
      if (!web.includes("import { appVersionLabel } from '../shared/app-version'") || !web.includes('versionLabel={appVersionLabel}')) {
        failures.push('Web status bar must use the shared appVersionLabel.');
      }
      if (existsSync(join(rootDir, 'desktop/src/workspace.tsx'))) {
        const desktop = readFileSync(join(rootDir, 'desktop/src/workspace.tsx'), 'utf8');
        if (!desktop.includes("import { appVersionLabel } from '../../src/shared/app-version'") || !desktop.includes('<span>{appVersionLabel}</span>')) {
          failures.push('Desktop status bar must use the shared appVersionLabel.');
        }
      }
    }
  } catch (error) { failures.push(error.message); }
  return { rootVersion, failures, subject };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkVersions(ROOT);
  if (result.failures.length) { console.error(JSON.stringify(result, null, 2)); process.exitCode = 1; }
  else console.log(`Version check passed for ${result.rootVersion}. Commit preview: ${result.subject}`);
}
