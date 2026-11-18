import {sql,type Kysely} from 'kysely';
export async function up(db:Kysely<any>){
 await db.schema.createTable('agent_conversations').addColumn('id','text',c=>c.primaryKey()).addColumn('owner','text',c=>c.notNull()).addColumn('title','text',c=>c.notNull()).addColumn('created_at','text',c=>c.notNull()).addColumn('updated_at','text',c=>c.notNull()).execute();
 await db.schema.createTable('agent_messages').addColumn('id','text',c=>c.primaryKey()).addColumn('chat_id','text',c=>c.notNull()).addColumn('body','text',c=>c.notNull()).addColumn('request_id','text',c=>c.unique()).addColumn('reply_to','text',c=>c.unique()).addColumn('position','integer',c=>c.generatedByDefaultAsIdentity().notNull().unique()).addCheckConstraint('agent_message_json',sql`body::jsonb IS NOT NULL`).execute();
 await db.schema.createIndex('agent_messages_chat').on('agent_messages').columns(['chat_id','position']).execute();
 await db.schema.createTable('agent_chat_activity').addColumn('id','integer',c=>c.generatedByDefaultAsIdentity().primaryKey()).addColumn('chat_id','text',c=>c.notNull()).addColumn('kind','text',c=>c.notNull()).addColumn('message','text',c=>c.notNull()).addColumn('time','text',c=>c.notNull()).execute();
 await db.schema.createIndex('agent_activity_chat').on('agent_chat_activity').columns(['chat_id','id']).execute();
 await db.schema.createTable('agent_chat_task_links').addColumn('message_id','text',c=>c.primaryKey()).addColumn('chat_id','text',c=>c.notNull()).addColumn('task_id','text',c=>c.notNull().unique()).addColumn('approved_at','text',c=>c.notNull()).addColumn('state','text',c=>c.notNull()).addCheckConstraint('agent_link_state',sql`state IN ('pending','ready')`).execute();
 await db.schema.createTable('agent_chat_imports').addColumn('source','text',c=>c.primaryKey()).addColumn('checksum','text',c=>c.notNull()).addColumn('details','text',c=>c.notNull()).execute();
 await db.schema.createTable('agent_chat_state').addColumn('id','integer',c=>c.primaryKey()).execute();
 await db.insertInto('agent_chat_state').values({id:1}).execute();
}
export async function down(db:Kysely<any>){for(const t of ['agent_chat_imports','agent_chat_state','agent_chat_task_links','agent_chat_activity','agent_messages','agent_conversations'])await db.schema.dropTable(t).execute();}
