import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>) {
  await db.schema.createTable('todo_categories')
    .addColumn('id', 'integer', column => column.generatedAlwaysAsIdentity().primaryKey())
    .addColumn('public_id', 'varchar(32)', column => column.notNull().unique())
    .addColumn('name', 'varchar(80)', column => column.notNull())
    .addColumn('active', 'boolean', column => column.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', column => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamptz', column => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('created_by', 'text', column => column.notNull())
    .addColumn('updated_by', 'text', column => column.notNull())
    .addColumn('deleted_at', 'timestamptz').addColumn('deleted_by', 'text')
    .addCheckConstraint('todo_category_public_id_format', sql`public_id ~ '^[a-z0-9]{8}$'`)
    .addCheckConstraint('todo_category_name_valid', sql`length(trim(name)) > 0`)
    .execute();
  await db.schema.createIndex('todo_category_name_unique').on('todo_categories').expression(sql`lower(name)`).where(sql<boolean>`deleted_at IS NULL`).unique().execute();
  await db.schema.createTable('todos')
    .addColumn('id', 'integer', column => column.generatedAlwaysAsIdentity().primaryKey())
    .addColumn('public_id', 'varchar(32)', column => column.notNull().unique())
    .addColumn('legacy_id', 'varchar(36)', column => column.unique())
    .addColumn('title', 'varchar(500)', column => column.notNull())
    .addColumn('priority', 'varchar(10)', column => column.notNull())
    .addColumn('category_id', 'integer', column => column.references('todo_categories.id'))
    .addColumn('due_date', 'date').addColumn('scheduled_at', 'timestamptz').addColumn('reminded_at', 'timestamptz')
    .addColumn('status', 'varchar(20)', column => column.notNull())
    .addColumn('project_id', 'varchar(150)', column => column.notNull())
    .addColumn('visibility', 'varchar(10)', column => column.notNull())
    .addColumn('position', 'integer', column => column.notNull())
    .addColumn('active', 'boolean', column => column.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', column => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamptz', column => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('created_by', 'text', column => column.notNull())
    .addColumn('updated_by', 'text', column => column.notNull())
    .addColumn('deleted_at', 'timestamptz').addColumn('deleted_by', 'text')
    .addCheckConstraint('todo_public_id_format', sql`public_id ~ '^[a-z0-9]{8}$'`)
    .addCheckConstraint('todo_title_valid', sql`length(trim(title)) > 0`)
    .addCheckConstraint('todo_priority_valid', sql`priority in ('low','medium','high','urgent')`)
    .addCheckConstraint('todo_status_valid', sql`status in ('open','in-progress','done')`)
    .addCheckConstraint('todo_visibility_valid', sql`visibility in ('private','public')`)
    .execute();
  await db.schema.createIndex('todo_visible_order').on('todos').columns(['position', 'id']).where(sql<boolean>`deleted_at IS NULL`).execute();
  await db.schema.createIndex('todo_category_reference').on('todos').column('category_id').execute();
  await db.schema.createIndex('todo_reminders_due').on('todos').column('scheduled_at').where(sql<boolean>`deleted_at IS NULL`).where(sql<boolean>`reminded_at IS NULL`).execute();
  await db.schema.createTable('todo_state').addColumn('id', 'integer', column => column.primaryKey()).addColumn('revision', 'integer', column => column.notNull()).addCheckConstraint('todo_single_state', sql`id = 1 AND revision >= 0`).execute();
  await db.schema.createTable('todo_imports').addColumn('source', 'text', column => column.primaryKey()).addColumn('checksum', 'text', column => column.notNull()).addColumn('imported_at', 'timestamptz', column => column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)).addColumn('details', 'text', column => column.notNull()).execute();
}
export async function down() {
  throw new Error('Todo migration rollback can destroy personal history. Restore a verified backup through an explicitly reviewed recovery instead.');
}
