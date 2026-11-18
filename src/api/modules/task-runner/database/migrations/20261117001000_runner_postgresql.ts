import {sql,type Kysely} from 'kysely';
export async function up(db:Kysely<any>){
 await db.schema.createTable('coding_tasks').addColumn('id','text',c=>c.primaryKey()).addColumn('created_at','text',c=>c.notNull()).addColumn('body','text',c=>c.notNull()).addCheckConstraint('coding_task_json',sql`body::jsonb IS NOT NULL`).execute();
 await db.schema.createTable('coding_task_events').addColumn('id','integer',c=>c.generatedByDefaultAsIdentity().primaryKey()).addColumn('task_id','text',c=>c.notNull()).addColumn('time','text',c=>c.notNull()).addColumn('kind','text',c=>c.notNull()).addColumn('message','text',c=>c.notNull()).execute();
 await db.schema.createIndex('coding_task_events_task').on('coding_task_events').columns(['task_id','id']).execute();
 await db.schema.createTable('coding_task_metadata').addColumn('key','text',c=>c.primaryKey()).addColumn('value','text',c=>c.notNull()).execute();
}
export async function down(db:Kysely<any>){for(const t of ['coding_task_metadata','coding_task_events','coding_tasks'])await db.schema.dropTable(t).execute();}
