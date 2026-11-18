import {sql,type Kysely} from 'kysely';
export async function up(db:Kysely<any>){
 await db.schema.alterTable('sync_connections').addColumn('allow_send','boolean',c=>c.notNull().defaultTo(false)).addColumn('remote_environment','text',c=>c.notNull().defaultTo('production')).execute();
 await db.schema.alterTable('sync_deliveries').addColumn('approved_to_send','boolean',c=>c.notNull().defaultTo(false)).execute();
 await db.schema.alterTable('sync_deliveries').alterColumn('state',c=>c.setDefault('held')).execute();
 await db.updateTable('sync_deliveries').set({state:'held'}).where('state','in',['queued','failed']).execute();
 // Already transmitted events may still poll their receipts; nothing is resent automatically.
 await db.updateTable('sync_deliveries').set({approved_to_send:true}).where('state','in',['awaiting_confirmation','conflict','confirmed','rejected']).execute();
}
export async function down(){throw new Error('Retain explicit sending permissions and review records.');}
