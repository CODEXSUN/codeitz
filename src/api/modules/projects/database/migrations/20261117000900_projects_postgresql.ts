import { sql, type Kysely } from 'kysely';
// Existing project IDs, UUID links and timestamp strings are retained unchanged.
// This migration deliberately preserves the legacy public contract during cutover.
export async function up(db:Kysely<any>) {
 await db.schema.createTable('projects').addColumn('id','integer',c=>c.generatedByDefaultAsIdentity().primaryKey()).addColumn('owner','text',c=>c.notNull().unique()).addColumn('name','text',c=>c.notNull()).addColumn('area','text',c=>c.notNull()).addColumn('purpose','text',c=>c.notNull()).addColumn('created_at','text').addColumn('recorded_at','text',c=>c.notNull().defaultTo(sql`to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`)).addUniqueConstraint('projects_area_name',['area','name']).addCheckConstraint('projects_area',sql`area IN ('apps','devkit')`).execute();
 await db.schema.createIndex('projects_created_at').on('projects').column('created_at').execute();
 await db.schema.createTable('project_setup').addColumn('project_id','integer',c=>c.primaryKey().references('projects.id').onDelete('cascade')).addColumn('port','integer').addColumn('state','text',c=>c.notNull()).addColumn('audit_passed','integer').addColumn('installation','text',c=>c.notNull().defaultTo('pending')).addColumn('runtime_verification','text',c=>c.notNull().defaultTo('pending')).addCheckConstraint('project_port',sql`port BETWEEN 1024 AND 65535`).addCheckConstraint('project_state',sql`state IN ('scaffolded','configured','structure-only')`).addCheckConstraint('project_audit',sql`audit_passed IN (0,1)`).execute();
 for(const table of ['project_notes','project_modules','project_architectures','project_whiteboards','project_schemas']) {
  let builder=db.schema.createTable(table).addColumn('id','text',c=>c.primaryKey()).addColumn('project_id','integer',c=>c.notNull().references('projects.id').onDelete('cascade')).addColumn('title','text',c=>c.notNull()).addColumn('content','text',c=>c.notNull().defaultTo('')).addColumn('status','text',c=>c.notNull()).addColumn('revision','integer',c=>c.notNull().defaultTo(1)).addColumn('created_at','text',c=>c.notNull()).addColumn('updated_at','text',c=>c.notNull()).addCheckConstraint(table+'_revision',sql`revision > 0`);
  if(table==='project_notes')builder=builder.addColumn('category','text',c=>c.notNull().defaultTo('General')).addColumn('assigned_to','text',c=>c.notNull().defaultTo('')).addCheckConstraint('project_note_status',sql`length(trim(status)) BETWEEN 1 AND 100`);
  else builder=builder.addCheckConstraint(table+'_status',sql`status IN ('draft','active','completed')`);
  await builder.execute();await db.schema.createIndex(table+'_project').on(table).columns(['project_id','updated_at']).execute();
 }
 await db.schema.createTable('project_changelog').addColumn('id','integer',c=>c.generatedByDefaultAsIdentity().primaryKey()).addColumn('project_id','integer',c=>c.notNull().references('projects.id').onDelete('cascade')).addColumn('kind','text',c=>c.notNull()).addColumn('title','text',c=>c.notNull()).addColumn('action','text',c=>c.notNull()).addColumn('created_at','text',c=>c.notNull()).execute();
 await db.schema.createIndex('project_changelog_project').on('project_changelog').columns(['project_id','id']).execute();
 await db.schema.createTable('project_note_options').addColumn('id','text',c=>c.primaryKey()).addColumn('project_id','integer',c=>c.notNull().references('projects.id').onDelete('cascade')).addColumn('kind','text',c=>c.notNull()).addColumn('value','text',c=>c.notNull()).addCheckConstraint('project_option_kind',sql`kind IN ('category','status')`).addCheckConstraint('project_option_value',sql`length(trim(value)) BETWEEN 1 AND 100`).execute();
 await db.schema.createIndex('project_note_option_unique').on('project_note_options').expression(sql`project_id,kind,translate(value,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')`).unique().execute();
 await db.schema.createTable('module_details').addColumn('module_id','text',c=>c.primaryKey().references('project_modules.id').onDelete('cascade')).addColumn('body','text',c=>c.notNull()).addCheckConstraint('module_details_json',sql`body::jsonb IS NOT NULL`).execute();
 for(const table of ['module_api_routes','module_actions','module_events','module_tables','module_dependencies','module_table_fields']) {
  const fields=table==='module_table_fields', parent=fields?'table_id':'module_id';
  await db.schema.createTable(table).addColumn('id','text',c=>c.primaryKey()).addColumn(parent,'text',c=>c.notNull().references(fields?'module_tables.id':'project_modules.id').onDelete('cascade')).addColumn('position','integer',c=>c.notNull()).addColumn('body','text',c=>c.notNull()).addCheckConstraint(table+'_json',sql`body::jsonb IS NOT NULL`).execute();
  await db.schema.createIndex(table+'_parent').on(table).columns([parent,'position']).execute();
 }
 await db.schema.createTable('project_seed_records').addColumn('name','text',c=>c.primaryKey()).execute();
 await db.schema.createTable('project_legacy_migrations').addColumn('version','integer',c=>c.primaryKey()).execute();
 await db.schema.createTable('project_imports').addColumn('source','text',c=>c.primaryKey()).addColumn('checksum','text',c=>c.notNull()).addColumn('details','text',c=>c.notNull()).addColumn('imported_at','timestamptz',c=>c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)).execute();
}
export async function down(db:Kysely<any>) {
 for(const table of ['project_imports','project_legacy_migrations','project_seed_records','module_table_fields','module_dependencies','module_tables','module_events','module_actions','module_api_routes','module_details','project_note_options','project_changelog','project_schemas','project_whiteboards','project_architectures','project_modules','project_notes','project_setup','projects'])await db.schema.dropTable(table).execute();
}
