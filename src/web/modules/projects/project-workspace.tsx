import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Input, NativeSelect, NativeSelectOption, Textarea, WorkspaceEditor } from '@workspace/ui';
import { MasterListV1 } from '@workspace/ui/blocks/data-table';
import type { Project } from '../../../../contracts/projects';
import type { ArchitectureDocument, SchemaField, WorkspaceKind, WorkspaceRecord, ProjectWorkspace as WorkspaceData, CodingTask, TaskAudit } from '../../../../contracts/workspace';
import { go, projectPath, useProjectLocation } from './navigation';
import { loadWorkspace, saveWorkspace, auditTask, reviewTask } from './workspace-services';
import type { WhiteboardHandle } from './whiteboard';
import { startPlan } from './services';
import { ArchitectureCanvas } from './architecture-canvas';
import { NotesWorkspace, type NotesWorkspaceHandle } from './notes-workspace';
import { ModulesWorkspace, type ModulesWorkspaceHandle } from './modules-workspace';
import { SchemaFields } from './schema-fields';
import {BlueprintPage} from './blueprint';
const Whiteboard=lazy(()=>import('./whiteboard'));
const tabs=[['overview','Overview'],['notes','Notes'],['modules','Modules'],['tasks','Tasks'],['review','Review'],['architectures','Architect'],['whiteboards','White Board'],['schemas','Schema'],['changelog','Changelog'],['blueprint','Blueprint']] as const;
type Tab=typeof tabs[number][0];
const emptyContent=(kind:WorkspaceKind)=>kind==='architectures'?JSON.stringify({blocks:[],connections:[]}):kind==='whiteboards'?JSON.stringify({elements:[],appState:{},files:{}}):kind==='schemas'?'[]':'';
export function ProjectWorkspace({project,children,onHeaderActions}:{project:Project;children:ReactNode;onHeaderActions:(actions:ReactNode)=>void}) {
  const location=useProjectLocation();
  const tab=location.tab;
  const appliedRoute=useRef('');
  const [noteOpen,setNoteOpen]=useState(false);
  const notesRef=useRef<NotesWorkspaceHandle>(null);
  const modulesRef=useRef<ModulesWorkspaceHandle>(null);
  const [data,setData]=useState<WorkspaceData|null>(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState<WorkspaceRecord|null>(null); const [title,setTitle]=useState(''); const [content,setContent]=useState(''); const [status,setStatus]=useState<WorkspaceRecord['status']>('draft'); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(''); const [dirty,setDirty]=useState(false);
  const generation=useRef(0);
  const board=useRef<WhiteboardHandle|null>(null);
  const refresh=useCallback(async(quiet=false)=>{const current=++generation.current;if(!quiet)setLoading(true);try{const next=await loadWorkspace(project.owner);if(current===generation.current){setData(next);if(!quiet)setError('');}}catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Workspace unavailable.');}finally{if(current===generation.current)setLoading(false);}},[project.owner]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(true),10000);return()=>{generation.current++;clearInterval(timer);};},[refresh]);
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[dirty]);
  const kind = ['notes','modules','architectures','whiteboards','schemas'].includes(tab) ? tab as WorkspaceKind : null;
  function open(record?:WorkspaceRecord){if(dirty&&!window.confirm('Discard unsaved changes?'))return;setEditing(record??{id:'',title:'',content:emptyContent(kind!),status:'draft',revision:0,createdAt:'',updatedAt:''});setTitle(record?.title??'');setContent(record?.content??emptyContent(kind!));setStatus(record?.status??'draft');setDirty(false);setMessage('');go(projectPath(project.owner,tab,record?.id,record?'edit':'new'));}
  function changeTab(next:Tab){if(dirty&&!window.confirm('Discard unsaved changes?'))return;go(projectPath(project.owner,next));setEditing(null);setDirty(false);setError('');setMessage('');}
  async function save(event:React.FormEvent){event.preventDefault();if(!kind||!editing)return;setSaving(true);setError('');try{const record=await saveWorkspace(project.owner,kind,{...(editing.id?{id:editing.id,revision:editing.revision}:{}),title,content:kind==='whiteboards'?board.current?.serialize()??content:content,status});setEditing(record);appliedRoute.current=`${tab}/${record.id}/edit`;go(projectPath(project.owner,tab,record.id,'edit'),true);setDirty(false);setMessage('Saved');await refresh(true);}catch(e){setError(e instanceof Error?e.message:'Save failed.');}finally{setSaving(false);}}
  useEffect(()=>{
    if(tab==='notes'||tab==='modules'||tab==='tasks'||tab==='review')return;
    const key=`${tab}/${location.record??''}/${location.mode??''}`;
    if(key===appliedRoute.current)return;
    if(!location.record&&!location.mode){appliedRoute.current=key;setEditing(null);setDirty(false);return;}
    if(!kind||!data)return;
    if(location.mode==='new'){setEditing({id:'',title:'',content:emptyContent(kind),status:'draft',revision:0,createdAt:'',updatedAt:''});setTitle('');setContent(emptyContent(kind));setStatus('draft');}
    else {const record=data.records[kind].find(r=>r.id===location.record);if(!record){setError('Record not found in this project.');setEditing(null);}else{setEditing(record);setTitle(record.title);setContent(record.content);setStatus(record.status);}}
    appliedRoute.current=key;setDirty(false);
  },[tab,location.record,location.mode,data,kind]);
  const records=kind?data?.records[kind]??[]:[];
  const listView=tab!=='overview'&&!location.record&&!location.mode;
  useEffect(()=>{
    const action=tab==='notes'?()=>notesRef.current?.create():tab==='modules'?()=>modulesRef.current?.create():kind?()=>open():null;
    onHeaderActions(listView&&action?<Button size="sm" disabled={saving} onClick={action}>+ New {tab==='notes'?'note':tab==='modules'?'module':tab==='architectures'?'architecture':tab==='whiteboards'?'board':'schema'}</Button>:null);
    return()=>onHeaderActions(null);
  },[onHeaderActions,listView,tab,saving,dirty,project.owner]);
  const completed=data?.tasks.filter(task=>task.review?.decision==='accepted').length??0;
  return <section>
    {!(tab==='notes'&&noteOpen)&&<div className="sticky top-0 z-10 flex items-center border-b bg-background px-3"><div role="tablist" aria-label="Project details" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">{tabs.map(([id,label])=><button type="button" role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} tabIndex={tab===id?0:-1} onKeyDown={event=>{const index=tabs.findIndex(([value])=>value===id);const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;if(next>=0){event.preventDefault();changeTab(tabs[next][0]);document.getElementById(`tab-${tabs[next][0]}`)?.focus();}}} aria-selected={tab===id} key={id} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium ${tab===id?'border-primary text-foreground':'border-transparent text-muted-foreground hover:text-foreground'}`} onClick={()=>changeTab(id)}>{label}</button>)}</div></div>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {message&&<p role="status" className="text-sm text-primary">{message}</p>}
    {data&&!data.codeitz.connected&&<p className="rounded-md bg-muted p-3 text-sm">Codeitz unavailable: {data.codeitz.message}. Saved project content remains available.</p>}
    <div className={listView?'workspace-list-content space-y-4':tab==='notes'?(noteOpen?'':'p-3'):tab==='modules'?'space-y-3 p-3':'space-y-5 p-5 sm:p-6'} role="tabpanel" id={`panel-${tab}`} aria-label={tab==='notes'&&noteOpen?'Note':undefined} aria-labelledby={tab==='notes'&&noteOpen?undefined:`tab-${tab}`}>
    {tab==='overview'&&<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]"><div className="space-y-5">{children}</div><aside className="space-y-3 rounded-lg border bg-card p-4"><h2 className="font-medium">Workspace</h2><p className="text-sm text-muted-foreground">{completed} accepted of {data?.tasks.length??0} tasks</p>{tabs.filter(([id])=>id!=='overview').map(([id,label])=><button key={id} type="button" onClick={()=>changeTab(id)} className="flex w-full items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"><span>{label}</span><strong>{id==='tasks'?data?.tasks.length??0:id==='review'?data?.tasks.filter(t=>t.status==='completed'||t.review).length??0:id==='changelog'?data?.changelog.length??0:data?.records[id as WorkspaceKind]?.length??0}</strong></button>)}</aside></div>}
    {tab==='blueprint'&&<BlueprintPage owner={project.owner}/>}
    {tab==='notes'&&<NotesWorkspace ref={notesRef} project={project} records={data?.records.notes??[]} loading={loading&&!data} onSaved={async record=>{setData(current=>current?{...current,records:{...current.records,notes:[record,...current.records.notes.filter(note=>note.id!==record.id)]}}:current);await refresh(true);}} onDirty={setDirty} onOpenChange={setNoteOpen}/> }
    {tab==='modules'&&<ModulesWorkspace ref={modulesRef} project={project} records={data?.records.modules??[]} loading={loading&&!data} onSaved={async record=>{setData(current=>current?{...current,records:{...current.records,modules:[record,...current.records.modules.filter(module=>module.id!==record.id)]}}:current);await refresh(true);}}/>}
    {kind&&kind!=='notes'&&kind!=='modules'&&<div className={tab==='schemas'?'grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]':'space-y-5'}>
      <div className="min-w-0 space-y-3">
      <MasterListV1 label={tabs.find(([id])=>id===tab)![1]} data={records} getRowId={r=>r.id} loading={loading&&!data} onOpen={r=>open(r)} columns={[
        {id:'title',label:'Title',value:r=>r.title}, {id:'status',label:'Status',value:r=>r.status,render:r=><Badge variant="outline">{r.status}</Badge>}, {id:'updated',label:'Updated',value:r=>r.updatedAt,render:r=>new Date(r.updatedAt).toLocaleString()},
      ]} actions={[{id:'edit',label:'Edit',onSelect:r=>open(r)}]} emptyMessage={`No ${tab} yet. Add one to begin.`}/></div>
      {editing&&<form onSubmit={save} className="min-w-0 space-y-4 rounded-lg border bg-card p-4"><div className="flex items-center justify-between"><h2 className="font-medium">{editing.id?'Edit':'New'} {tab==='schemas'?'schema':tab==='whiteboards'?'whiteboard':tab==='architectures'?'architecture':'record'}</h2><Button type="button" variant="ghost" disabled={saving} onClick={()=>{if(!dirty||window.confirm('Discard unsaved changes?')){setEditing(null);setDirty(false);go(projectPath(project.owner,tab));}}}>Close</Button></div>
        <label className="grid gap-2 text-sm">Title<Input required maxLength={200} value={title} onChange={e=>{setTitle(e.target.value);setDirty(true);}}/></label><label className="grid gap-2 text-sm">Status<NativeSelect value={status} onChange={e=>{setStatus(e.target.value as WorkspaceRecord['status']);setDirty(true);}}>{['draft','active','completed'].map(s=><NativeSelectOption key={s}>{s}</NativeSelectOption>)}</NativeSelect></label>
        {kind==='schemas'&&<SchemaFields fields={JSON.parse(content) as SchemaField[]} onChange={value=>{setContent(JSON.stringify(value));setDirty(true);}}/>}
        {kind==='architectures'&&<ArchitectureCanvas value={JSON.parse(content) as ArchitectureDocument} onChange={value=>{setContent(JSON.stringify(value));setDirty(true);}}/>}
        {kind==='whiteboards'&&<Suspense fallback={<p>Loading whiteboard…</p>}><Whiteboard ref={board} key={editing.id||'new'} content={content} onDirty={()=>setDirty(true)}/></Suspense>}
        <div className="flex items-center gap-3"><Button disabled={saving} type="submit">{saving?'Saving…':'Save'}</Button>{dirty&&<span className="text-xs text-muted-foreground">Unsaved changes</span>}</div>
      </form>}
    </div>}
    {(tab==='tasks'||tab==='review')&&<ProjectTasks project={project} tasks={data?.tasks??[]} connected={data?.codeitz.connected??false} review={tab==='review'} refresh={()=>refresh(true)}/>}
    {tab==='changelog'&&<MasterListV1 label="Changelog" data={data?.changelog??[]} getRowId={r=>String(r.id)} loading={loading&&!data} columns={[{id:'time',label:'Time',value:r=>r.createdAt,render:r=>new Date(r.createdAt).toLocaleString()},{id:'kind',label:'Area',value:r=>r.kind},{id:'record',label:'Record',value:r=>r.title},{id:'action',label:'Change',value:r=>r.action}]} emptyMessage="No recorded project changes yet."/>}
    </div>
  </section>;
}
function ProjectTasks({project,tasks,connected,review,refresh}:{project:Project;tasks:CodingTask[];connected:boolean;review:boolean;refresh:()=>Promise<void>}) {
  const location=useProjectLocation();const selected=location.record??'';const [goal,setGoal]=useState('');const [feedback,setFeedback]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [audit,setAudit]=useState<TaskAudit|null>(null);
  const task=tasks.find(t=>t.id===selected);const records=review?tasks.filter(t=>t.status==='completed'||t.review):tasks;
  async function run(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();await refresh();}catch(e){setError(e instanceof Error?e.message:'Task request failed.');}finally{setBusy(false);}}
  return <div className="space-y-5">{error&&<p role="alert" className="text-destructive">{error}</p>}
    {!review&&<form className="flex flex-wrap items-end gap-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void run(async()=>{await startPlan(project.owner,goal);setGoal('');});}}><label className="grid min-w-64 flex-1 gap-2 text-sm">Plan a project goal<Textarea required maxLength={3000} value={goal} onChange={e=>setGoal(e.target.value)}/></label><Button disabled={!connected||busy||project.state==='structure-only'}>Create Codeitz plan</Button><p className="w-full text-xs text-muted-foreground">Planning only. Approve coding separately in Codeitz.</p></form>}
    <MasterListV1 label={review?'Reviews':'Tasks'} data={records} getRowId={t=>t.id} onOpen={t=>{go(projectPath(project.owner,review?'review':'tasks',t.id));setAudit(null);setFeedback('');}} columns={[{id:'goal',label:'Goal',value:t=>t.goal},{id:'status',label:'Status',value:t=>t.status},{id:'review',label:'Review',value:t=>t.review?.decision??'Not reviewed'},{id:'updated',label:'Updated',value:t=>t.updatedAt}]} emptyMessage={connected?review?'No completed reports to review yet.':'No Codeitz tasks for this project yet.':'Task data is unavailable while Codeitz is offline.'}/>
    {selected&&connected&&!task&&<p role="alert">Task not found in this project.</p>}
    {task&&<article className="space-y-4 rounded-lg border bg-card p-5"><div className="flex items-center justify-between gap-4"><h2 className="font-medium">{task.goal}</h2><a className="text-sm text-primary underline" href={`${project.tasksUrl.split('?')[0]}?task=${task.id}`}>Open live task</a></div><Badge variant="outline">{task.status}</Badge>
      {task.error&&<p className="text-destructive">{task.error}</p>}
      {[['Plan',task.plan],['Report',task.result||task.codingResult]].map(([label,value])=><section key={label}><h3 className="mb-2 text-sm font-medium">{label}</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-sm">{value||'Not available yet.'}</pre></section>)}
      <h3 className="text-sm font-medium">Changed files</h3><ul className="list-inside list-disc text-sm">{task.changedFiles.map(f=><li key={f}>{f}</li>)}</ul>
      <h3 className="text-sm font-medium">Checks</h3>{task.checks.map((check,i)=><details key={i} className="rounded border p-2 text-sm"><summary>{check.passed?'Passed':'Failed'} · {check.name}</summary><pre className="overflow-auto whitespace-pre-wrap">{check.output}</pre></details>)}
      <Button variant="outline" disabled={busy||!connected} onClick={()=>void run(async()=>setAudit(await auditTask(project.owner,task.id)))}>Audit saved task</Button>
      {audit&&<div role="status" className="space-y-2 text-sm"><strong>{audit.passed?'Audit passed':'Audit needs attention'}</strong>{audit.findings.map((finding,i)=><p key={i}>{finding.passed?'✓':'!'} {finding.label}: {finding.detail}</p>)}</div>}
      {task.review&&<p className="text-sm">Review: {task.review.decision} · {task.review.feedback}{task.review.followUpTaskId&&<a className="ml-2 text-primary underline" href={`${project.tasksUrl.split('?')[0]}?task=${task.review.followUpTaskId}`}>Open follow-up plan</a>}</p>}
      {task.status==='completed'&&!task.review&&!task.archivedAt&&<div className="space-y-3"><label className="grid gap-2 text-sm">Review feedback<Textarea maxLength={3000} value={feedback} onChange={e=>setFeedback(e.target.value)}/></label><div className="flex gap-3"><Button disabled={busy||!connected||!task.result||!task.checks.length||task.checks.some(check=>!check.passed)} onClick={()=>void run(()=>reviewTask(project.owner,task.id,'accepted',feedback))}>Accept report</Button><Button variant="outline" disabled={busy||!connected||!feedback.trim()} onClick={()=>void run(()=>reviewTask(project.owner,task.id,'changes_requested',feedback))}>Request changes</Button></div><p className="text-xs text-muted-foreground">Requesting changes creates a follow-up draft in Codeitz. Planning and coding require separate actions there.</p></div>}
    </article>}
  </div>;
}
