import { discoverProjects } from '../infrastructure/discovery.ts';
import type { Kysely } from 'kysely';
import type { ProjectDatabase } from '../database/types.ts';
import type { ProjectTaskRunner } from '../../task-runner/index.ts';
import { ModuleStore } from '../infrastructure/module-store.ts';
import type { ModuleInput } from '../../../../../contracts/modules.ts';
import { WorkspaceStore } from '../infrastructure/workspace-store.ts';
import type { ProjectWorkspace, CodingTask, WorkspaceKind, WorkspaceInput } from '../../../../../contracts/workspace.ts';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import type { Project, ProjectInput, ProjectsOverview, CreationEvent } from '../../../../../contracts/projects.ts';
import { scaffoldProject } from '../infrastructure/governance.ts';
import { ProjectStore } from '../infrastructure/store.ts';
import { CodeitzConnection } from '../infrastructure/codeitz.ts';
import {buildBlueprint} from './blueprint.ts';


export class Projects {
  private root: string;
  private codeitz: CodeitzConnection;
  private creating = false;
  private store: ProjectStore;
  constructor(root: string, runner: ProjectTaskRunner, database: Kysely<ProjectDatabase>) { this.root = root; this.codeitz = new CodeitzConnection(runner); this.store = new ProjectStore(database); }
  async catalog(): Promise<Project[]> {
    if (!await this.store.seeded()) await this.store.save(await this.discover(), true);
    return (await this.store.list()).map(project => ({ ...project, progressPercent:null, ...(project.owner === 'devkit/project-manager' ? { retired: true } : {}), taskCount: 0, activeTasks: 0, completedTasks: 0, tasksUrl: this.codeitz.link({ view: 'records', owner: project.owner }) }));
  }
  private discover(){ return discoverProjects(this.root,query=>this.codeitz.link(query)); }
  async overview(): Promise<ProjectsOverview> {
    const projects = await this.catalog();
    let connected = true; let message = 'Connected to Codeitz task runner.';
    try {
      const data = await this.codeitz.request('/api/tasks');
      if (!Array.isArray(data.tasks)) throw new Error('Invalid Codeitz task response.');
      for (const project of projects) {
        const tasks = data.tasks.filter((task: { owner: string; droppedAt?: string }) => task.owner === project.owner && !task.droppedAt);
        project.taskCount = tasks.length;
        project.activeTasks = tasks.filter((task: { status: string }) => ['planning', 'coding', 'checking'].includes(task.status)).length;
        project.completedTasks = tasks.filter((task: { status: string }) => task.status === 'completed').length;
        project.progressPercent=project.taskCount?Math.round(project.completedTasks/project.taskCount*100):null;
      }
    } catch (error) { connected = false; message = `Codeitz unavailable: ${error instanceof Error ? error.message : 'connection failed'}`; }
    return { projects, codeitz: { connected, message, url: this.codeitz.link() }, activeTasks: projects.reduce((sum, project) => sum + project.activeTasks, 0) };
  }
  async create(input: ProjectInput, onProgress: (event: CreationEvent) => void) {
    if (this.creating) throw new Error('Another project is being created. Wait for it to finish.');
    this.creating = true;
    try {
      onProgress({ type: 'progress', stage: 'starting', message: 'Preparing governed project creation.' });
      await this.catalog();
      await scaffoldProject(this.root, input, onProgress);
      const catalog=await this.store.list();
      await this.store.save((await this.discover()).filter(project => project.owner === `${input.area}/${input.name}`).map(project=>({...project,orderNo:input.orderNo??Math.max(0,...catalog.map(p=>p.orderNo))+1,active:input.active??true})));
      const project = (await this.catalog()).find(project => project.owner === `${input.area}/${input.name}`);
      if (!project) throw new Error('Scaffold created but its project card could not be loaded. Inspect its folder before retrying.');
      return project;
    } finally { this.creating = false; }
  }
  async module(owner:string,id:string){await this.catalog();return new ModuleStore(this.store).read(owner,id);}
  async blueprint(owner:string){const project=(await this.catalog()).find(p=>p.owner===owner);if(!project)throw new Error('Project not found.');const records=(await new WorkspaceStore(this.store).read(owner)).records.modules;const modules=await Promise.all(records.map(row=>new ModuleStore(this.store).read(owner,row.id)));return buildBlueprint(project,modules);}
  async reviewModule(owner:string,id:string){const blueprint=await this.blueprint(owner);const module=blueprint.modules.find(m=>m.id===id);if(!module)throw new Error('Module not found.');const issues=blueprint.issues.filter(issue=>!issue.moduleId||issue.moduleId===id||/conflicts with another project route|unique in this project|one owner in this project/.test(issue.message));const history=await new ModuleStore(this.store).approvalHistory(owner,id);return {module,issues,canApprove:issues.length===0,history:history.map(row=>({...row,current:module.approval?.id===row.id&&module.approval.current}))};}
  async approveModule(owner:string,id:string,revision:number){const review=await this.reviewModule(owner,id);if(review.module.revision!==revision)throw new Error('Module changed. Review the latest revision.');return new ModuleStore(this.store).approve(owner,review.module,review.issues);}
  async update(owner:string,input:{orderNo:number;active:boolean}){await this.catalog();await this.store.update(owner,input);return (await this.overview()).projects.find(project=>project.owner===owner);}
  async saveModule(owner:string,input:ModuleInput,id?:string,revision?:number){await this.catalog();return new ModuleStore(this.store).save(owner,input,id,revision);}
  async noteOptions(owner:string) { await this.catalog();return new WorkspaceStore(this.store).options(owner); }
  async createNoteOption(owner:string,kind:'category'|'status',label:string) { await this.catalog();return new WorkspaceStore(this.store).createOption(owner,kind,label); }
  async notes(owner: string) {
    await this.catalog();
    return (await new WorkspaceStore(this.store).read(owner)).records.notes;
  }
  async note(owner: string, id: string) {
    const note = (await this.notes(owner)).find(record => record.id === id);
    if (!note) throw new Error('Note not found.');
    return note;
  }
  async workspace(owner: string): Promise<ProjectWorkspace> {
    await this.catalog();
    const content = await new WorkspaceStore(this.store).read(owner);
    try {
      const data = await this.codeitz.request('/api/tasks');
      if (!Array.isArray(data.tasks)) throw new Error('Invalid Codeitz response.');
      const tasks: CodingTask[] = data.tasks.filter((task: CodingTask) => task.owner === owner && !task.droppedAt);
      const taskChanges = tasks.flatMap(task => (task.events ?? []).map(event => ({ id: `task-${task.id}-${event.id}`, kind: 'tasks', title: task.goal, action: `${event.kind}: ${event.message}`, createdAt: event.time })));
      const changelog = [...content.changelog, ...taskChanges].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,500);
      return { ...content, changelog, tasks, codeitz: { connected: true, message: 'Connected to Codeitz' } };
    } catch (error) { return { ...content, tasks: [], codeitz: { connected: false, message: error instanceof Error ? error.message : 'Codeitz unavailable' } }; }
  }
  async saveWorkspace(owner: string, kind: WorkspaceKind, input: WorkspaceInput) {
    await this.catalog();
    return new WorkspaceStore(this.store).save(owner, kind, input);
  }
  async taskAction(owner: string, id: string, action: 'audit' | 'review', input: { decision: 'accepted' | 'changes_requested'; feedback?: string } | Record<string, never>) {
    const workspace = await this.workspace(owner);
    if (!workspace.codeitz.connected) throw new Error('Codeitz unavailable.');
    if (!workspace.tasks.some(task => task.id === id)) throw new Error('Task does not belong to this project.');
    return this.codeitz.request(`/api/tasks/${id}/${action}`, input);
  }
  async plan(owner: string, goal: string) {
    const project = (await this.catalog()).find(project => project.owner === owner);
    if (!project) throw new Error('Choose an existing project.');
    if (!project.active) throw new Error('Activate this project before starting a new plan.');
    if (project.retired) throw new Error('This standalone app was merged into Codeitz. Choose devkit/codeitz for new work.');
    if (project.state === 'structure-only') throw new Error('This project has a folder structure only. Set up its app before starting Codeitz.');
    const instructions = path.join(this.root, owner, 'AGENTS.md');
    if (!(await lstat(instructions)).isFile()) throw new Error('Project instructions are missing.');
    const task = await this.codeitz.request('/api/tasks', { owner, goal });
    return { id: task.id as string, status: task.status as string, url: this.codeitz.link({ task: task.id }) };
  }
}
