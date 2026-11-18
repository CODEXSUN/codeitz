import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { NoteOptions, NoteOptionKind } from '../../../../../contracts/notes.ts';
import type { WorkspaceKind, WorkspaceRecord, WorkspaceInput } from '../../../../../contracts/workspace.ts';
import type { ContentRow } from '../database/types.ts';
import { contentTables } from '../database/types.ts';
import { ProjectStore } from './store.ts';
export function workspaceRecord(row:Omit<ContentRow,'revision'|'category'|'assigned_to'> & {revision:number;category?:string;assigned_to?:string},kind:WorkspaceKind):WorkspaceRecord {
 return {id:row.id,title:row.title,content:row.content,status:row.status,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,...(kind==='notes'?{properties:{category:row.category??'General',assignedTo:row.assigned_to??''}}:{})};
}
export class WorkspaceStore {
 private projects:ProjectStore;
 constructor(projects:ProjectStore){this.projects=projects;}
 async read(owner:string) {
  return this.projects.db.transaction().setIsolationLevel('repeatable read').execute(async tx=>{
   const project=await tx.selectFrom('projects').select('id').where('owner','=',owner).executeTakeFirst();if(!project)throw new Error('Project not found.');
   const records={} as Record<WorkspaceKind,WorkspaceRecord[]>;
   for(const kind of Object.keys(contentTables) as WorkspaceKind[]) records[kind]=(await tx.selectFrom(contentTables[kind]).selectAll().where('project_id','=',project.id).orderBy('updated_at','desc').orderBy('id').execute()).map(row=>workspaceRecord(row,kind));
   const changelog=await tx.selectFrom('project_changelog').select(['id','kind','title','action','created_at as createdAt']).where('project_id','=',project.id).orderBy('id','desc').limit(500).execute();
   return {records,changelog};
  });
 }
 async options(owner:string):Promise<NoteOptions> {
  return this.projects.db.transaction().execute(async tx=>{
   const project=await tx.selectFrom('projects').select('id').where('owner','=',owner).executeTakeFirst();if(!project)throw new Error('Project not found.');
   const values:{kind:NoteOptionKind;value:string}[]=[];
   for(const [kind,items] of Object.entries({category:['General','Idea','Decision','Research','Meeting'],status:['draft','active','completed']}))for(const value of items)values.push({kind:kind as NoteOptionKind,value});
   for(const row of await tx.selectFrom('project_notes').select(['category','status']).where('project_id','=',project.id).execute()) { values.push({kind:'category',value:row.category??'General'},{kind:'status',value:row.status}); }
   for(const value of values)await tx.insertInto('project_note_options').values({id:randomUUID(),project_id:project.id,...value}).onConflict(c=>c.doNothing()).execute();
   const rows=await tx.selectFrom('project_note_options').select(['kind','value']).where('project_id','=',project.id).orderBy(sql`translate(value,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')`).execute();
   return Object.fromEntries(['category','status'].map(kind=>[kind,rows.filter(row=>row.kind===kind).map(row=>({value:row.value,label:row.value}))])) as NoteOptions;
  });
 }
 async createOption(owner:string,kind:NoteOptionKind,label:string) {
  const value=label.trim();if(!value||value.length>100)throw new Error('Enter 1–100 characters.');
  return this.projects.db.transaction().execute(async tx=>{
   const project=await tx.selectFrom('projects').select('id').where('owner','=',owner).executeTakeFirst();if(!project)throw new Error('Project not found.');
   await tx.insertInto('project_note_options').values({id:randomUUID(),project_id:project.id,kind,value}).onConflict(c=>c.doNothing()).execute();
   const row=await tx.selectFrom('project_note_options').select('value').where('project_id','=',project.id).where('kind','=',kind).where(sql<boolean>`translate(value,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=translate(${value},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')`).executeTakeFirstOrThrow();
   return {value:row.value,label:row.value};
  });
 }
 async save(owner:string,kind:WorkspaceKind,input:WorkspaceInput) {
  const table=contentTables[kind];if(!table)throw new Error('Unknown project content.');
  return this.projects.db.transaction().execute(async tx=>{
   const project=await tx.selectFrom('projects').select('id').where('owner','=',owner).executeTakeFirst();if(!project)throw new Error('Project not found.');
   const id=input.id??randomUUID(),now=new Date().toISOString();
   if(input.id) {
    const result=await tx.updateTable(table).set({title:input.title,content:input.content,status:input.status,revision:sql`revision+1`,updated_at:now}).where('id','=',id).where('project_id','=',project.id).where('revision','=',input.revision??-1).returning('id').executeTakeFirst();
    if(!result)throw new Error('This record changed or is unavailable. Reload before saving.');
   } else await tx.insertInto(table).values({id,project_id:project.id,title:input.title,content:input.content,status:input.status,created_at:now,updated_at:now}).execute();
   if(kind==='notes'&&input.properties)await tx.updateTable('project_notes').set({category:input.properties.category,assigned_to:input.properties.assignedTo}).where('id','=',id).where('project_id','=',project.id).execute();
   await tx.insertInto('project_changelog').values({project_id:project.id,kind,title:input.title,action:input.id?'updated':'created',created_at:now}).execute();
   return workspaceRecord(await tx.selectFrom(table).selectAll().where('id','=',id).executeTakeFirstOrThrow(),kind);
  });
 }
}
