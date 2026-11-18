import { sql, type Kysely } from 'kysely';
export async function up(db: Kysely<any>) {
  await db.schema.createIndex('task_lists_name_unique').on('task_lists').expression(sql`lower(name)`).where(sql<boolean>`deleted_at IS NULL`).unique().execute();
}
export async function down(db: Kysely<any>) { await db.schema.dropIndex('task_lists_name_unique').execute(); }
