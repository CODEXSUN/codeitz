import { type Kysely } from 'kysely';
import type { ProjectDatabase } from '../database/types.ts';
import type { Project } from '../../../../../contracts/projects.ts';
export type StoredProject = Omit<Project,'taskCount'|'activeTasks'|'completedTasks'|'tasksUrl'|'progressPercent'|'orderNo'|'active'> & {orderNo?:number;active?:boolean;installation?:string;runtimeVerification?:string};
export class ProjectStore {
 db:Kysely<ProjectDatabase>;
 constructor(db:Kysely<ProjectDatabase>) { this.db=db; }
 async seeded() { return !!await this.db.selectFrom('project_seed_records').select('name').where('name','=','workspace-projects').executeTakeFirst(); }
 async save(projects:StoredProject[],seed=false) {
  await this.db.transaction().execute(async tx=>{
   // A single transactional seed marker serializes concurrent first catalog requests.
   if(seed && !await tx.insertInto('project_seed_records').values({name:'workspace-projects'}).onConflict(c=>c.doNothing()).returning('name').executeTakeFirst()) return;
   for(const project of projects) {
    const last=await tx.selectFrom('projects').select(tx.fn.max<number>('order_no').as('maximum')).executeTakeFirst();
    await tx.insertInto('projects').values({owner:project.owner,name:project.name,area:project.area,purpose:project.purpose,created_at:project.createdAt??null,order_no:project.orderNo??Number(last?.maximum??0)+1,active:project.active??true}).onConflict(c=>c.column('owner').doNothing()).execute();
    const row=await tx.selectFrom('projects').select('id').where('owner','=',project.owner).executeTakeFirstOrThrow();
    await tx.insertInto('project_setup').values({project_id:row.id,port:project.port??null,state:project.state,audit_passed:project.auditPassed===null?null:Number(project.auditPassed),installation:project.installation??'pending',runtime_verification:project.runtimeVerification??'pending'}).onConflict(c=>c.column('project_id').doNothing()).execute();
   }
  });
 }
 async list():Promise<(StoredProject & {orderNo:number;active:boolean})[]> {
  const rows=await this.db.selectFrom('projects as p').innerJoin('project_setup as s','s.project_id','p.id').selectAll('p').select(['s.port','s.state','s.audit_passed']).orderBy('p.order_no').orderBy('p.owner').execute();
  return rows.map(row=>({owner:row.owner,name:row.name,area:row.area,purpose:row.purpose,orderNo:row.order_no,active:row.active,createdAt:row.created_at??undefined,port:row.port??undefined,state:row.state,auditPassed:row.audit_passed===null?null:Boolean(row.audit_passed)}));
 }
 async update(owner:string,input:{orderNo:number;active:boolean}){
  await this.db.transaction().execute(async tx=>{
   const result=await tx.updateTable('projects').set({order_no:input.orderNo,active:input.active}).where('owner','=',owner).returning('id').executeTakeFirst();
   if(!result)throw new Error('Project not found.');
   await tx.insertInto('project_changelog').values({project_id:result.id,kind:'project',title:'Project settings',action:`Order ${input.orderNo}; ${input.active?'active':'inactive'}.`,created_at:new Date().toISOString()}).execute();
  });
 }
}
