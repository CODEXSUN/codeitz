import { sql, type Kysely } from 'kysely';
export async function up(db: Kysely<any>) {
  await db.schema.createTable('contacts')
    .addColumn('id', 'integer', c => c.generatedAlwaysAsIdentity().primaryKey())
    .addColumn('public_id', 'varchar(32)', c => c.notNull().unique())
    .addColumn('name', 'varchar(150)', c => c.notNull())
    .addColumn('mobile', 'varchar(30)', c => c.notNull())
    .addColumn('active', 'boolean', c => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('created_by', 'text', c => c.notNull()).addColumn('updated_by', 'text', c => c.notNull())
    .addColumn('deleted_at', 'timestamptz').addColumn('deleted_by', 'text')
    .addCheckConstraint('contacts_public_id', sql`public_id ~ '^[a-z0-9]{8}$'`).execute();
  await db.schema.createIndex('contacts_mobile_unique').on('contacts').column('mobile').where(sql<boolean>`mobile <> '' AND deleted_at IS NULL`).unique().execute();
}
export async function down() { throw new Error('Restore a reviewed backup; reference data rollback is not automatically destructive.'); }
