import { GlobalLoader } from '@workspace/ui/components/global-loader';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { ArrowLeft, FileText, Pencil, Save } from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, WorkspaceEditor } from '@workspace/ui';
import type { Project } from '../../../../contracts/projects';
import type { WorkspaceRecord } from '../../../../contracts/workspace';
import { go, projectPath, useProjectLocation } from './navigation';
import { loadNote, saveNote, loadNoteOptions, createNoteOption } from './workspace-services';
import { FormLookup } from '@workspace/ui/blocks/form-controls/lookup';
import type { NoteOptions, NoteOptionKind } from '../../../../contracts/notes';
import { UpsertFormField, UpsertFormValidationSummary } from '@workspace/ui/blocks/upsert-form';
import { noteFieldsSchema } from '../../../../contracts/notes';
function plainText(html: string) {
  const document=new DOMParser().parseFromString(html,'text/html');
  document.querySelectorAll('br').forEach(node=>node.replaceWith(' '));
  document.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6').forEach(node=>node.append(' '));
  return (document.body.textContent??'').replace(/\s+/g,' ').trim();
}
export type NotesWorkspaceHandle = { create: () => void };
export const NotesWorkspace = forwardRef<NotesWorkspaceHandle, {
  project: Project; records: WorkspaceRecord[]; loading: boolean; onSaved: (record:WorkspaceRecord)=>Promise<void>; onDirty: (dirty:boolean)=>void; onOpenChange:(open:boolean)=>void;
}>(function NotesWorkspace({ project, records, loading, onSaved, onDirty, onOpenChange }, ref) {
  const location=useProjectLocation();
  const [active,setActive]=useState<WorkspaceRecord|null>(null); const [mode,setMode]=useState<'read'|'edit'>('read');
  const [title,setTitle]=useState(''); const [content,setContent]=useState(''); const [status,setStatus]=useState<WorkspaceRecord['status']>('draft');
  const [options,setOptions]=useState<NoteOptions>({category:[],status:[]});const [optionsLoading,setOptionsLoading]=useState(true);
  const [category,setCategory]=useState('General');const [assignedTo,setAssignedTo]=useState('');
  const [dirty,setDirty]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  useEffect(()=>{onOpenChange(Boolean(active));},[active,onOpenChange]);
  useEffect(()=>()=>{onDirty(false);onOpenChange(false);},[onDirty,onOpenChange]);
  useEffect(()=>{let cancelled=false;setOptionsLoading(true);void loadNoteOptions(project.owner).then(value=>{if(!cancelled)setOptions(value);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Lookups unavailable.');}).finally(()=>{if(!cancelled)setOptionsLoading(false);});return()=>{cancelled=true;};},[project.owner]);
  async function createLookup(kind:NoteOptionKind,label:string){const option=await createNoteOption(project.owner,kind,label);setOptions(current=>({...current,[kind]:[...current[kind].filter(item=>item.value.toLowerCase()!==option.value.toLowerCase()),option]}));return option;}
  function clearIssue(field:string){setFieldErrors(current=>{const next={...current};delete next[field];return next;});}
  function fill(record:WorkspaceRecord){setTitle(record.title);setContent(record.content);setStatus(record.status);setCategory(record.properties?.category??'General');setAssignedTo(record.properties?.assignedTo??'');}
  function open(record?:WorkspaceRecord){go(projectPath(project.owner,'notes',record?.id,record?undefined:'new'));}
  useEffect(()=>{
    let cancelled=false;setError('');setMessage('');setFieldErrors({});
    if(location.mode==='new') {const next={id:'',title:'',content:'',status:'draft' as const,revision:0,createdAt:'',updatedAt:''};setActive(next);fill(next);setMode('edit');setDirty(false);}
    else if(location.record){setSaving(true);void loadNote(project.owner,location.record).then(note=>{if(cancelled)return;setActive(note);fill(note);setMode(location.mode==='edit'?'edit':'read');setDirty(false);}).catch(e=>{if(!cancelled){setActive(null);setError(e instanceof Error?e.message:'Note unavailable.');}}).finally(()=>{if(!cancelled)setSaving(false);});}
    else{setActive(null);setDirty(false);}
    return()=>{cancelled=true;};
  },[project.owner,location.record,location.mode]);
  useImperativeHandle(ref,()=>({create:()=>open()}));
  function back(){if(saving)return;if(dirty&&!window.confirm('Discard unsaved note changes?'))return;setActive(null);setDirty(false);setError('');setMessage('');go(projectPath(project.owner,'notes'));}
  function discard(){if(dirty&&!window.confirm('Discard unsaved note changes?'))return;setDirty(false);setError('');go(projectPath(project.owner,'notes',active?.id||undefined));}
  async function edit(){if(active?.id&&!saving)go(projectPath(project.owner,'notes',active.id,'edit'));}
  async function save(event:React.FormEvent){event.preventDefault();if(!active||mode!=='edit'||saving)return;
    const parsed=noteFieldsSchema.safeParse({title,content,status,properties:{category,assignedTo}});
    if(!parsed.success){const errors:Record<string,string>={};for(const issue of parsed.error.issues)errors[String(issue.path.at(-1))]=issue.message;setFieldErrors(errors);setError('');document.getElementById(`note-${Object.keys(errors)[0]}`)?.focus();return;}
    setFieldErrors({});setSaving(true);setError('');try{
    const next=await saveNote(project.owner,{...(active.id?{id:active.id,revision:active.revision}:{}),...parsed.data});
    setActive(next);fill(next);setDirty(false);setMode('read');go(projectPath(project.owner,'notes',next.id),true);setMessage('Saved');void onSaved(next).catch(()=>setMessage('Saved. The list will update on the next refresh.'));
  }catch(e){setError(e instanceof Error?e.message:'Note could not be saved.');}finally{setSaving(false);}}
  if(!active&&(location.record||location.mode))return <section className="p-5"><Button variant="ghost" onClick={back}>← Back to notes</Button><p role={error?'alert':'status'} className="mt-4 text-sm">{error||<GlobalLoader/>}</p></section>;
  if(!active)return <section>
    {loading?<GlobalLoader/>:!records.length?<div className="rounded-lg border border-dashed p-12 text-center"><FileText className="mx-auto mb-3 text-muted-foreground"/><p className="font-medium">No project notes yet</p><p className="mt-2 text-sm text-muted-foreground">Capture ideas, decisions and project knowledge.</p></div>:<div className="grid grid-cols-1 gap-2">{records.map(note=>{
      const text=plainText(note.content);const preview=text.length>180?`${text.slice(0,180)}…`:text;
      return <Card key={note.id} className="relative gap-0 py-0 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-ring motion-reduce:transform-none motion-reduce:transition-none"><CardContent className="space-y-1.5 px-4 py-3">
        <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="shrink-0 rounded-md bg-primary/10 p-1 text-primary"><FileText size={15}/></span><h2 className="min-w-0 truncate text-sm font-semibold"><Button variant="link" type="button" className="block h-auto max-w-full truncate p-0 text-left after:absolute after:inset-0 focus-visible:outline-none" title={note.title} onClick={()=>open(note)}>{note.title}</Button></h2></div><div className="flex shrink-0 items-center gap-3"><Badge variant="outline">{note.status}</Badge><time className="whitespace-nowrap text-xs text-muted-foreground" dateTime={note.updatedAt} title={new Date(note.updatedAt).toLocaleString()}>{new Date(note.updatedAt).toLocaleDateString()}</time></div></div>
        <p className="truncate pl-8 text-xs text-muted-foreground">{preview||'No content yet.'}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 text-xs text-muted-foreground"><span>Category: {note.properties?.category||'General'}</span><span>Assigned to: {note.properties?.assignedTo||'Unassigned'}</span></div>
      </CardContent></Card>;
    })}</div>}
  </section>;
  const readOnly=mode==='read';const tags=[...new Set(plainText(content).match(/#[\p{L}\p{N}_-]+/gu)??[])];
  return <form noValidate onSubmit={save} className="flex min-h-[calc(100dvh-7rem)] flex-col">
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-2"><div className="flex min-w-0 items-center gap-3"><Button type="button" variant="ghost" size="icon" aria-label="Back to notes" disabled={saving} onClick={back}><ArrowLeft size={18}/></Button><h1 className="truncate text-sm font-semibold">{title||'Untitled note'}</h1><Badge variant="outline">{readOnly?'Reader':'Editing'}</Badge></div><div className="flex items-center gap-2">{readOnly?<Button type="button" disabled={saving} onClick={()=>void edit()}><Pencil size={15}/> Edit note</Button>:<><Button type="button" variant="outline" disabled={saving} onClick={discard}>Discard</Button><Button type="submit" disabled={saving}><Save size={15}/>{<>{saving && <GlobalLoader/>}{'Save note'} </>}</Button></>}<Badge variant="secondary">{status}</Badge></div></header>
    <UpsertFormValidationSummary errors={fieldErrors} idPrefix="note"/>{error&&<p role="alert" className="border-b px-6 py-3 text-sm text-destructive">{error}</p>}{message&&<p role="status" className="px-6 py-2 text-xs text-primary">{message}</p>}
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_18rem]"><div className="min-w-0 space-y-4 p-5 sm:p-6">{readOnly?<h2 className="break-words text-2xl font-semibold">{title}</h2>:<UpsertFormField name="title" label="Note title" helper={`${title.length}/200 characters`} error={fieldErrors.title} required idPrefix="note"><Input placeholder="Note title" maxLength={200} value={title} disabled={saving} onChange={e=>{setTitle(e.target.value);setDirty(true);if(noteFieldsSchema.shape.title.safeParse(e.target.value).success)clearIssue('title');}} className="h-12 text-lg"/></UpsertFormField>}
      <fieldset disabled={saving} className="min-w-0"><WorkspaceEditor key={`${active.id||'new'}-${mode}`} content={content} readOnly={readOnly} fullPreview className="[&_.tiptap]:min-h-[calc(100dvh-18rem)]" onChange={value=>{setContent(value);setDirty(true);}} placeholder="Write your note…"/></fieldset>
    </div><aside aria-label="Note properties" className="border-t bg-card lg:border-t-0 lg:border-l"><div className="space-y-4 p-4 lg:sticky lg:top-14"><h2 className="text-sm font-semibold">Properties</h2>
      {readOnly?<dl className="space-y-3 text-sm"><div><dt className="mb-2 text-muted-foreground">Category</dt><dd>{category}</dd></div><div><dt className="mb-2 text-muted-foreground">Status</dt><dd><Badge variant="outline">{status}</Badge></dd></div></dl>:<>
        <UpsertFormField name="category" label="Category" helper="Search or create." error={fieldErrors.category} required idPrefix="note"><FormLookup ariaLabel="Category" required clearable={false} allowTextValue={false} compactOptions showAllOptionsOnFocus createMode="inline" value={category} disabled={saving||optionsLoading} loading={optionsLoading} invalid={!!fieldErrors.category} onValueChange={value=>{setCategory(value);setDirty(true);clearIssue('category');}} onCreate={label=>createLookup('category',label)} options={options.category} placeholder="Search category"/></UpsertFormField>
        <UpsertFormField name="status" label="Status" helper="Search or create." error={fieldErrors.status} required idPrefix="note"><FormLookup ariaLabel="Status" required clearable={false} allowTextValue={false} compactOptions showAllOptionsOnFocus createMode="inline" value={status} disabled={saving||optionsLoading} loading={optionsLoading} invalid={!!fieldErrors.status} onValueChange={value=>{setStatus(value);setDirty(true);clearIssue('status');}} onCreate={label=>createLookup('status',label)} options={options.status} placeholder="Search status"/></UpsertFormField>
      </>}

      {readOnly?<div className="text-sm"><p className="mb-2 text-muted-foreground">Assigned to</p><p className="break-words">{assignedTo||'Unassigned'}</p></div>:<UpsertFormField name="assignedTo" label="Assigned to" helper="Optional." error={fieldErrors.assignedTo} idPrefix="note"><Input placeholder="Name or email" autoComplete="off" value={assignedTo} disabled={saving} maxLength={200} className="h-11" onChange={e=>{setAssignedTo(e.target.value);setDirty(true);clearIssue('assignedTo');}}/></UpsertFormField>}
      <div className="space-y-2 text-sm"><p className="font-medium">Tags</p><div className="flex flex-wrap gap-1">{tags.length?tags.map(tag=><Badge key={tag} variant="outline">{tag}</Badge>):<p className="text-xs text-muted-foreground">#tags in content.</p>}</div></div>
      {active.id&&<dl className="space-y-3 border-t pt-4 text-xs text-muted-foreground"><div><dt>Created</dt><dd className="mt-1">{new Date(active.createdAt).toLocaleString()}</dd></div><div><dt>Updated · revision {active.revision}</dt><dd className="mt-1">{new Date(active.updatedAt).toLocaleString()}</dd></div></dl>}{dirty&&<p role="status" className="text-xs text-muted-foreground">Unsaved changes</p>}
    </div></aside></div>
  </form>;
});
