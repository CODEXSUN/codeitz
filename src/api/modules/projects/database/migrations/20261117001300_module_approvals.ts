import type {Kysely} from 'kysely';
export async function up(db:Kysely<any>){
 await db.schema.createTable('module_approvals').addColumn('id','uuid',c=>c.primaryKey()).addColumn('module_id','text',c=>c.notNull().references('project_modules.id').onDelete('cascade')).addColumn('revision','integer',c=>c.notNull()).addColumn('approved_at','text',c=>c.notNull()).addColumn('approved_by','text',c=>c.notNull()).addColumn('fingerprint','text',c=>c.notNull()).addColumn('snapshot','text',c=>c.notNull()).addColumn('audit','text',c=>c.notNull()).addUniqueConstraint('module_approvals_revision',['module_id','revision']).execute();
}
export async function down(db:Kysely<any>){await db.schema.dropTable('module_approvals').execute();}
