import { sql, type Kysely } from 'kysely';
export async function up(db: Kysely<any>) {
  await db.schema.createTable('task_lists')
    .addColumn('id', 'integer', c => c.generatedAlwaysAsIdentity().primaryKey())
    .addColumn('public_id', 'varchar(32)', c => c.notNull().unique())
    .addColumn('code', 'varchar(40)', c => c.notNull().unique())
    .addColumn('name', 'varchar(100)', c => c.notNull())
    .addColumn('active', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('created_by', 'text', c => c.notNull()).addColumn('updated_by', 'text', c => c.notNull())
    .addColumn('deleted_at', 'timestamptz').addColumn('deleted_by', 'text')
    .addCheckConstraint('task_lists_public_id', sql`public_id ~ '^[a-z0-9]{8}$'`).execute();
}
export async function down() { throw new Error('Restore a reviewed backup; reference data rollback is not automatically destructive.'); }
