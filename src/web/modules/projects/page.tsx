import { GlobalLoader } from '@workspace/ui/components/global-loader';
import { GitHubManagerPage } from '../github-manager/page';
import { useEffect, useState, type ReactNode } from 'react';
import { GitBranch, ArrowUpRight, Bot, Check, FolderKanban, LoaderCircle, Plus, Pencil } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, NativeSelect, NativeSelectOption, Textarea } from '@workspace/ui';
import type { CreationEvent, Project, ProjectsOverview } from '../../../../contracts/projects';

import { go, legacyPath, projectPath, useProjectLocation } from './navigation';
import { ProjectWorkspace } from './project-workspace';
import { createProject, loadOverview, startPlan, updateProject } from './services';




import {ProgressMeter} from '@workspace/ui/blocks/work-progress';

export type ProjectHeader = { title: string; breadcrumbs: { label: string; href?: string }[]; actions?: ReactNode };
export function ProjectsPage({ onHeader }: { onHeader: (header: ProjectHeader | null) => void }) {
  const [workspaceHeader,setWorkspaceHeader]=useState<ReactNode>(null);
  const [githubHeader,setGithubHeader]=useState<ReactNode>(null);

  const [overview, setOverview] = useState<ProjectsOverview | null>(null);
  const [creating, setCreating] = useState(false);
  const [orderNo,setOrderNo]=useState('');const [active,setActive]=useState(true);
  const [editingProject,setEditingProject]=useState<Project|null>(null),[savingSettings,setSavingSettings]=useState(false),[settingsError,setSettingsError]=useState('');
  const location=useProjectLocation();
  const route=location.page==='project'?`project/${location.owner}`:location.page;
  const showCreate=route==='new';
  const setShowCreate=(value:boolean)=>navigate(value?'new':'projects');
  function navigate(next:string){setSelected(null);setGoal('');setTaskUrl('');setError('');go(legacyPath(next));}
  const [name, setName] = useState(''); const [area, setArea] = useState<'apps' | 'devkit'>('apps');
  const [port, setPort] = useState('4320'); const [purpose, setPurpose] = useState('');
  const [events, setEvents] = useState<CreationEvent[]>([]);
  const [created, setCreated] = useState<Project | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [goal, setGoal] = useState(''); const [planning, setPlanning] = useState(false);
  const [taskUrl, setTaskUrl] = useState(''); const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); const filter=location.area;
  function setFilter(value:string){go(value==='all'?'/projects':`/projects?area=${value}`,true);}
  async function refresh() { setLoading(true); try { setOverview(await loadOverview()); } catch (error) { setError(error instanceof Error ? error.message : 'Project list unavailable.'); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  useEffect(()=>{if(overview&&orderNo==='')setOrderNo(String(Math.max(0,...overview.projects.map(p=>p.orderNo))+1));},[overview,orderNo]);
  async function saveProjectSettings(event:React.FormEvent){event.preventDefault();if(!editingProject)return;setSavingSettings(true);setSettingsError('');try{await updateProject(editingProject.owner,{orderNo:editingProject.orderNo,active:editingProject.active});await refresh();setEditingProject(null);}catch(error){setSettingsError(error instanceof Error?error.message:'Save failed.');}finally{setSavingSettings(false);}}
  async function submitProject(event: React.FormEvent) {
    event.preventDefault(); setCreating(true); setError(''); setEvents([]); setCreated(null);
    try {
      await createProject({ name, area, port: Number(port), purpose,orderNo:Number(orderNo),active }, event => { setEvents(current => [...current, event]); if (event.type === 'complete') { setCreated(event.project); setSelected(event.project); } });
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Creation failed.'); }
    finally { setCreating(false); }
  }
  async function submitPlan(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; setPlanning(true); setError(''); setTaskUrl('');
    try { const task = await startPlan(selected.owner, goal); setTaskUrl(task.url); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Codeitz unavailable.'); }
    finally { setPlanning(false); }
  }
  const detailOwner = route.startsWith('project/') ? route.slice(8) : null;
  const detail = overview?.projects.find(project => project.owner === detailOwner);
  const projects = overview?.projects.filter(project => !project.retired && (filter === 'all' || project.area === filter)) ?? [];
  const progress = [...events].reverse().find(event => event.type === 'progress' && event.total !== undefined);
  const count = progress?.type === 'progress' ? progress.completed ?? 0 : 0;
  const total = progress?.type === 'progress' ? progress.total : undefined;
  const pageTitle = route==='github'?'GitHub Manager':showCreate ? 'Create a new project' : detailOwner ? detail?.name ?? 'Project details' : route === 'projects' ? 'Projects' : route === 'settings' ? 'Settings' : 'Projects';
  function newProject() { setOrderNo(String(Math.max(0,...(overview?.projects??[]).map(p=>p.orderNo))+1));setActive(true);setShowCreate(true); setCreated(null); setEvents([]); setError(''); }
  const breadcrumbs = detailOwner ? [
      {label:'Projects',href:'/projects'},
      {label:pageTitle,...(location.tab!=='overview'?{href:projectPath(detailOwner)}:{})},
      ...(location.tab!=='overview'?[{label:({notes:'Notes',modules:'Modules',tasks:'Tasks',review:'Review',architectures:'Architect',whiteboards:'White Board',schemas:'Schema',changelog:'Changelog',blueprint:'Blueprint'} as Record<string,string>)[location.tab],...(location.record||location.mode?{href:projectPath(detailOwner,location.tab)}:{})}]:[]),
      ...(location.record||location.mode?[{label:`${location.mode==='new'?'New ':location.mode==='edit'?'Edit ':''}${location.tab==='notes'?'note':location.tab==='tasks'||location.tab==='review'?'task':'record'}`}]:[]),
    ] : [{ label: pageTitle }];
  useEffect(() => {
    onHeader({ title: pageTitle, breadcrumbs, actions: detailOwner ? workspaceHeader : route === 'github' ? githubHeader : route === 'projects' ? <Button size="sm" disabled={creating} onClick={newProject}><Plus size={15}/> New project</Button> : undefined });
  }, [pageTitle, location.owner, location.tab, location.record, location.mode, creating, route, githubHeader, workspaceHeader, onHeader, overview]);
  useEffect(() => () => onHeader(null), [onHeader]);
  return (
    <main className={detailOwner ? "min-w-0" : route==='github'?"workspace-list-content space-y-4": route==='projects'?"workspace-list-content space-y-4": "mx-auto min-w-0 max-w-7xl space-y-6 p-5 sm:p-8"}>
      {!detailOwner && route!=='github' && route!=='projects' && <h1 className="text-2xl font-semibold tracking-tight">{pageTitle}</h1>}
      {route==='github'&&<GitHubManagerPage id={location.record} section={location.section} onHeaderChange={setGithubHeader}/>}
      {route === 'missing' && <p role="alert">Page not found. <a href="/projects" className="text-primary underline">Open projects</a></p>}

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-card p-3 text-sm text-destructive">{error}</p>}
      {route!=='github' && overview && !overview.codeitz.connected && <p className="rounded-lg bg-secondary p-3 text-sm">{overview.codeitz.message} Project creation still works.</p>}
      {showCreate ? <div className="grid items-start gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-lg">Start with one concept</CardTitle><p className="text-sm text-muted-foreground">Creates a governed app scaffold with local Git, shared UI, framework, environment files, and work records.</p></CardHeader><CardContent><form onSubmit={event => void submitProject(event)} className="space-y-4">
        <label className="grid gap-2 text-sm font-medium">Project name<Input required pattern="[a-z][a-z0-9]*(-[a-z0-9]+)*" maxLength={63} placeholder="customer-portal" value={name} disabled={creating || !!created} onChange={event => setName(event.target.value)}/></label>
        <div className="grid grid-cols-2 gap-4"><label className="grid gap-2 text-sm font-medium">Area<NativeSelect value={area} disabled={creating || !!created} onChange={event => setArea(event.target.value as 'apps' | 'devkit')}><NativeSelectOption value="apps">Business app</NativeSelectOption><NativeSelectOption value="devkit">Devkit</NativeSelectOption></NativeSelect></label><label className="grid gap-2 text-sm font-medium">App port<Input type="number" required min={1024} max={65535} value={port} disabled={creating || !!created} onChange={event => setPort(event.target.value)}/></label></div>
        <div className="grid grid-cols-2 gap-4"><label className="grid gap-2 text-sm font-medium">Order no<Input type="number" required min={1} max={2147483647} step={1} value={orderNo} disabled={creating||!!created} onChange={event=>setOrderNo(event.target.value)}/></label><label className="grid gap-2 text-sm font-medium">Status<NativeSelect value={active?'active':'inactive'} disabled={creating||!!created} onChange={event=>setActive(event.target.value==='active')}><NativeSelectOption value="active">Active</NativeSelectOption><NativeSelectOption value="inactive">Inactive</NativeSelectOption></NativeSelect></label></div>
        <label className="grid gap-2 text-sm font-medium">Concept / purpose<Textarea required rows={4} maxLength={2000} placeholder="What will this project help people do?" value={purpose} disabled={creating || !!created} onChange={event => setPurpose(event.target.value)}/></label>
        <p className="text-xs leading-relaxed text-muted-foreground">Creates {area}/{name || 'project-name'}. Existing files and occupied ports are refused. Dependencies are not installed and the new app is not started.</p>
        <Button type="submit" disabled={creating || !!created}>{creating ? <GlobalLoader/> : <Plus size={15}/>} {<>{creating && <GlobalLoader/>}{created ? 'Project created' : 'Create project scaffold'} </>}</Button>
      </form></CardContent></Card><Card><CardHeader><CardTitle className="text-lg">Creation activity</CardTitle></CardHeader><CardContent className="space-y-4">
        <progress aria-label="Scaffold files written" className="h-2 w-full accent-primary" value={count} max={total ?? 1}/><p role="status" className="text-sm">{created ? 'Scaffold created and audited.' : creating ? total ? `${count} of ${total} template files written` : 'Validating project…' : 'Ready to create your project.'}</p>
        <div className="max-h-72 space-y-3 overflow-auto rounded-lg bg-muted p-4">{!events.length && <p className="text-xs text-muted-foreground">Real creation steps appear here.</p>}{events.map((event, index) => <p key={index} className="flex gap-2 break-all text-xs leading-relaxed">{event.type === 'complete' ? <><Check size={14} className="shrink-0 text-primary"/> {event.project.owner} ready for setup</> : event.message}</p>)}</div>
        {created && <div className="space-y-3"><p className="text-sm">Saved at <code>{created.owner}</code>. Creation audit passed. Installation and runtime checks remain pending.</p><Button variant="outline" onClick={() => navigate(`project/${created.owner}`)}>View project details <ArrowUpRight size={15}/></Button></div>}
      </CardContent></Card></div> : <>
        {route === 'projects' && <>
        <div className="flex flex-wrap items-center justify-end gap-3"><label className="flex items-center gap-2 text-sm">Show<NativeSelect value={filter} onChange={event => setFilter(event.target.value)}><NativeSelectOption value="all">All projects</NativeSelectOption><NativeSelectOption value="apps">Business apps</NativeSelectOption><NativeSelectOption value="devkit">Devkit</NativeSelectOption></NativeSelect></label></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{projects.map(project => <Card key={project.owner} className="relative gap-3 py-4 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
          <CardHeader className="gap-2 px-4 py-0"><div className="flex min-w-0 items-center justify-between gap-2">
            <CardTitle className="min-w-0 text-sm"><a href={projectPath(project.owner)} className="block truncate after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring" title={project.name}>#{project.orderNo} · {project.name}</a></CardTitle>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><span>{project.area==='apps'?'App':'Devkit'}</span><span role="img" aria-label={project.active?'Active':'Inactive'} title={project.active?'Active':'Inactive'} className={`size-2 shrink-0 rounded-full ${project.active?'bg-emerald-500':'bg-muted-foreground/40'}`}/></span>
          </div>
          </CardHeader><CardContent className="space-y-3 px-4 pb-0">
            <p className="truncate text-xs text-muted-foreground">{project.retired?'Merged into Codeitz':project.state==='structure-only'?'Structure only':project.state==='scaffolded'?'Scaffold created':'Configured'}</p>
            <div className="space-y-1.5"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{overview?.codeitz.connected?`${project.completedTasks}/${project.taskCount} tasks`:'Tasks unavailable'}</span><span>{project.progressPercent===null?'—':`${project.progressPercent}%`}</span></div>{project.progressPercent!==null&&<ProgressMeter className="block h-0.5" label={`${project.name} task completion`} value={project.completedTasks} max={project.taskCount}/>}</div>
            <div className="relative z-10 flex flex-wrap items-center gap-1"><Button variant="outline" size="sm" disabled={project.state==='structure-only'||project.retired||!project.active} onClick={()=>{setSelected(project);setGoal('');setTaskUrl('');setError('');}}>Plan</Button><Button variant="ghost" size="icon-sm" aria-label={`Edit ${project.name}`} title="Edit project" onClick={()=>{setSettingsError('');setEditingProject(project);}}><Pencil size={14}/></Button><a href={project.tasksUrl} className="inline-flex items-center gap-1 px-2 text-xs text-primary hover:underline">Tasks<ArrowUpRight size={13}/></a></div>
          </CardContent></Card>)}</div>
        {!projects.length && <p className="py-10 text-center text-sm text-muted-foreground">{loading ? <GlobalLoader/> : 'No projects in this view. Create a project to begin.'}</p>}
        </>}
        {detailOwner && (detail ? <ProjectWorkspace key={detail.owner} project={detail} onHeaderActions={setWorkspaceHeader}>
          <Card><CardHeader><div className="flex flex-wrap items-center gap-3"><span className="rounded-lg bg-secondary p-3 text-primary"><FolderKanban size={24}/></span><div><CardTitle>{detail.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{detail.owner}</p></div><Badge variant="outline">{detail.area === 'apps' ? 'Business app' : 'Devkit'}</Badge></div></CardHeader>
            <CardContent className="space-y-6"><div><h2 className="mb-2 font-medium">Purpose</h2><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{detail.purpose}</p></div>
              <dl className="grid gap-6 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
                ['Order no',detail.orderNo],['Active status',detail.active?'Active':'Inactive'],['Project path', detail.owner], ['Status', detail.state === 'structure-only' ? 'Structure only' : detail.state === 'scaffolded' ? 'Scaffold created' : 'Configured'],
                ['App port', detail.port ?? 'Not configured'], ['Created', detail.createdAt ? new Date(detail.createdAt).toLocaleString() : 'Not recorded'],
                ['Creation audit', detail.auditPassed === null ? 'Not recorded' : detail.auditPassed ? 'Passed' : 'Failed'],
                ['Saved tasks', overview?.codeitz.connected ? detail.taskCount : 'Unavailable'], ['Active tasks', overview?.codeitz.connected ? detail.activeTasks : 'Unavailable'], ['Completed tasks', overview?.codeitz.connected ? detail.completedTasks : 'Unavailable'],
              ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
              <div className="flex flex-wrap gap-3"><Button disabled={detail.state === 'structure-only' || detail.retired || !detail.active} onClick={() => { setSelected(detail); setGoal(''); setTaskUrl(''); }}>Plan a goal</Button><a href={detail.tasksUrl} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Open tasks <ArrowUpRight size={14}/></a></div>
              {detail.retired && <p className="text-sm text-muted-foreground">Historical project records. New development belongs to devkit/codeitz.</p>}
              {detail.state === 'structure-only' && <p className="text-sm text-muted-foreground">Set up this application before planning work with Codeitz.</p>}
            </CardContent></Card>
        </ProjectWorkspace> : <p role="status">{loading ? <GlobalLoader/> : 'Project not found.'} <a className="text-primary underline" href="/projects">Back to projects</a></p>)}
        {selected && <Card><CardHeader><CardTitle className="text-lg">Plan work · {selected.name}</CardTitle><p className="text-sm text-muted-foreground">Send one goal to Codeitz. It reads governance and the project work record before planning.</p></CardHeader><CardContent><form onSubmit={event => void submitPlan(event)} className="space-y-4"><label className="grid gap-2 text-sm font-medium">Goal<Textarea rows={3} required maxLength={3000} value={goal} disabled={planning || !!taskUrl} onChange={event => setGoal(event.target.value)} placeholder="Describe one small result for this project…"/></label><div className="flex flex-wrap gap-3"><Button disabled={planning || !!taskUrl || !overview?.codeitz.connected}>{planning && <GlobalLoader/>} {taskUrl ? 'Plan sent to Codeitz' : 'Create Codeitz plan'}</Button><Button type="button" variant="ghost" disabled={planning} onClick={() => setSelected(null)}>Close</Button>{taskUrl && <a href={taskUrl} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Open live task <ArrowUpRight size={15}/></a>}</div><p className="text-xs text-muted-foreground">This starts planning only. Approve coding separately inside Codeitz.</p></form></CardContent></Card>}
      </>}
      <Dialog open={!!editingProject} onOpenChange={open=>{if(!open&&!savingSettings)setEditingProject(null);}}><DialogContent><DialogHeader><DialogTitle>Edit project</DialogTitle><DialogDescription>{editingProject?.name}</DialogDescription></DialogHeader>{editingProject&&<form onSubmit={event=>void saveProjectSettings(event)} className="space-y-4"><label className="grid gap-2 text-sm">Order no<Input type="number" min={1} max={2147483647} required step={1} value={editingProject.orderNo} onChange={event=>setEditingProject({...editingProject,orderNo:Number(event.target.value)})} disabled={savingSettings}/></label><label className="grid gap-2 text-sm">Status<NativeSelect value={editingProject.active?'active':'inactive'} onChange={event=>setEditingProject({...editingProject,active:event.target.value==='active'})} disabled={savingSettings}><NativeSelectOption value="active">Active</NativeSelectOption><NativeSelectOption value="inactive">Inactive</NativeSelectOption></NativeSelect></label>{settingsError&&<p role="alert" className="text-sm text-destructive">{settingsError}</p>}<DialogFooter><Button type="button" variant="outline" disabled={savingSettings} onClick={()=>setEditingProject(null)}>Cancel</Button><Button type="submit" disabled={savingSettings}>{<>{savingSettings && <GlobalLoader/>}{'Save'} </>}</Button></DialogFooter></form>}</DialogContent></Dialog>
    </main>
  );
}
