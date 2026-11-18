import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Project } from '../../../../../contracts/projects.ts';
async function json(file: string): Promise<Record<string, any> | null> { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
export async function discoverProjects(workspaceRoot:string,link:(query:Record<string,string>)=>string): Promise<Project[]> {
    const root = await realpath(workspaceRoot);
    const projects: (Project & { installation: string; runtimeVerification: string })[] = [];
    for (const area of ['apps', 'devkit'] as const) {
      const directory = path.join(root, area);
      if (await realpath(directory) !== directory) throw new Error('Project area must be a real workspace folder.');
      for (const item of await readdir(directory, { withFileTypes: true })) {
        if (!item.isDirectory() || item.isSymbolicLink() || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item.name)) continue;
        const target = path.join(directory, item.name);
        const record = await json(path.join(target, 'docs/creation.json'));
        const manifest = await json(path.join(target, 'package.json'));
        const owner = `${area}/${item.name}`;
        projects.push({ orderNo:0,active:true,progressPercent:null,owner, name: item.name, area, purpose: record?.purpose ?? (manifest ? 'Existing workspace application.' : 'Governed folder structure. Application setup is pending.'), port: record?.port, createdAt: record?.createdAt, state: record ? 'scaffolded' : manifest ? 'configured' : 'structure-only', auditPassed: record?.audit?.passed ?? null, installation: record?.installation ?? 'pending', runtimeVerification: record?.runtimeVerification ?? 'pending', taskCount: 0, activeTasks: 0, completedTasks: 0, tasksUrl: link({ view: 'records', owner }) });
      }
    }
    return projects.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.owner.localeCompare(b.owner)).map((project,index)=>({...project,orderNo:index+1}));
  }
