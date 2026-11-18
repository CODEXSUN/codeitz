import { sql } from 'kysely';
import {createHash} from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { ProjectStore } from './store.ts';
import { designTables } from '../database/types.ts';
import { workspaceRecord } from './workspace-store.ts';
import { emptyModuleSpec, type ModuleInput, type ModuleSpec, type ProjectModule } from '../../../../../contracts/modules.ts';
export function moduleFingerprint(record:ProjectModule){return createHash('sha256').update(JSON.stringify({title:record.title,content:record.content,status:record.status,spec:record.spec})).digest('hex');}
export class ModuleStore {
 private projects:ProjectStore;
 constructor(projects:ProjectStore){this.projects=projects;}
 async read(owner:string,id:string):Promise<ProjectModule> {
  return this.projects.db.transaction().setIsolationLevel('repeatable read').execute(async tx=>{
   const record=await tx.selectFrom('project_modules as m').innerJoin('projects as p','p.id','m.project_id').selectAll('m').where('p.owner','=',owner).where('m.id','=',id).executeTakeFirst();if(!record)throw new Error('Module not found.');
   const detail=await tx.selectFrom('module_details').select('body').where('module_id','=',id).executeTakeFirst();
   const spec:ModuleSpec={...emptyModuleSpec(),...(detail?JSON.parse(detail.body):{})};
   for(const [key,table] of Object.entries(designTables)) {
    const rows=(await tx.selectFrom(table).select('body').where('module_id','=',id).orderBy('position').execute()).map(row=>JSON.parse(row.body));
    if(key==='tables')for(const row of rows)row.fields=(await tx.selectFrom('module_table_fields').select('body').where('table_id','=',row.id).orderBy('position').execute()).map(field=>JSON.parse(field.body));
    Object.assign(spec,{[key]:rows});
   }
   const result:ProjectModule={...workspaceRecord(record,'modules'),status:record.status as ProjectModule['status'],spec};
   const approval=await tx.selectFrom('module_approvals').selectAll().where('module_id','=',id).orderBy('revision','desc').executeTakeFirst();
   if(approval)result.approval={id:approval.id,revision:approval.revision,approvedAt:approval.approved_at,approvedBy:'workspace-owner',fingerprint:approval.fingerprint,current:approval.revision===result.revision&&approval.fingerprint===moduleFingerprint(result)};
   return result;
  });
 }
 async approvalHistory(owner:string,id:string){await this.read(owner,id);return (await this.projects.db.selectFrom('module_approvals').selectAll().where('module_id','=',id).orderBy('revision','desc').execute()).map(row=>({id:row.id,revision:row.revision,approvedAt:row.approved_at,approvedBy:'workspace-owner' as const,fingerprint:row.fingerprint,current:false,snapshot:JSON.parse(row.snapshot),audit:JSON.parse(row.audit)}));}
 async approve(owner:string,record:ProjectModule,issues:unknown[]){
  if(issues.length)throw new Error('Resolve the audit findings before approval.');
  await this.projects.db.transaction().execute(async tx=>{
   const row=await tx.selectFrom('project_modules as m').innerJoin('projects as p','p.id','m.project_id').select(['m.revision','m.project_id']).where('p.owner','=',owner).where('m.id','=',record.id).forUpdate('m').executeTakeFirst();
   if(!row||row.revision!==record.revision)throw new Error('Module changed. Review the latest revision.');
   const now=new Date().toISOString(),snapshot={title:record.title,content:record.content,status:record.status,spec:record.spec};
   const saved=await tx.insertInto('module_approvals').values({id:randomUUID(),module_id:record.id,revision:record.revision,approved_at:now,approved_by:'workspace-owner',fingerprint:moduleFingerprint(record),snapshot:JSON.stringify(snapshot),audit:JSON.stringify({passed:true,issues:[]})}).onConflict(c=>c.columns(['module_id','revision']).doNothing()).returning('id').executeTakeFirst();
   if(saved)await tx.insertInto('project_changelog').values({project_id:row.project_id,kind:'modules',title:record.title,action:`Owner approved revision ${record.revision}`,created_at:now}).execute();
  });return this.read(owner,record.id);
 }
 async save(owner:string,input:ModuleInput,id?:string,revision?:number):Promise<ProjectModule> {
  const moduleId=id??randomUUID();
  await this.projects.db.transaction().execute(async tx=>{
   const project=await tx.selectFrom('projects').select('id').where('owner','=',owner).executeTakeFirst();if(!project)throw new Error('Project not found.');const now=new Date().toISOString();
   if(id){const result=await tx.updateTable('project_modules').set({title:input.title,content:input.content,status:input.status,revision:sql`revision+1`,updated_at:now}).where('id','=',id).where('project_id','=',project.id).where('revision','=',revision??-1).returning('id').executeTakeFirst();if(!result)throw new Error('Module changed or is unavailable. Reload before editing.');}
   else await tx.insertInto('project_modules').values({id:moduleId,project_id:project.id,title:input.title,content:input.content,status:input.status,created_at:now,updated_at:now}).execute();
   const {apiRoutes,actions,events,tables,dependencies,...details}=input.spec;
   await tx.insertInto('module_details').values({module_id:moduleId,body:JSON.stringify(details)}).onConflict(c=>c.column('module_id').doUpdateSet({body:JSON.stringify(details)})).execute();
   for(const [key,table] of Object.entries(designTables)) {
    await tx.deleteFrom(table).where('module_id','=',moduleId).execute();
    for(const [position,row] of input.spec[key as keyof typeof designTables].entries()) {
     const {fields,...body}=row as typeof row & {fields?:{id:string}[]};
     await tx.insertInto(table).values({id:row.id,module_id:moduleId,position,body:JSON.stringify(body)}).execute();
     for(const [index,field] of (fields??[]).entries())await tx.insertInto('module_table_fields').values({id:field.id,table_id:row.id,position:index,body:JSON.stringify(field)}).execute();
    }
   }
   await tx.insertInto('project_changelog').values({project_id:project.id,kind:'modules',title:input.title,action:id?'updated':'created',created_at:now}).execute();
  });
  return this.read(owner,moduleId);
 }
}
