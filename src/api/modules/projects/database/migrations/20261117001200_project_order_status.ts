import {sql,type Kysely} from 'kysely';
export async function up(db:Kysely<any>){
 await db.schema.alterTable('projects').addColumn('order_no','integer').addColumn('active','boolean',c=>c.notNull().defaultTo(true)).execute();
 const ordered=await db.selectFrom('projects').select('id').orderBy(sql`coalesce(created_at,'')`,'desc').orderBy('owner').execute();
 for(let index=0;index<ordered.length;index++)await db.updateTable('projects').set({order_no:index+1}).where('id','=',ordered[index].id).execute();
 await db.schema.alterTable('projects').alterColumn('order_no',c=>c.setNotNull()).execute();
 await db.schema.alterTable('projects').alterColumn('order_no',c=>c.setDefault(1)).execute();
 await db.schema.alterTable('projects').addCheckConstraint('projects_order_no_positive',sql`order_no > 0`).execute();
 await db.schema.createIndex('projects_order_owner').on('projects').columns(['order_no','owner']).execute();
}
export async function down(db:Kysely<any>){
 await db.schema.dropIndex('projects_order_owner').execute();
 await db.schema.alterTable('projects').dropConstraint('projects_order_no_positive').execute();
 await db.schema.alterTable('projects').dropColumn('order_no').execute();
 await db.schema.alterTable('projects').dropColumn('active').execute();
}
