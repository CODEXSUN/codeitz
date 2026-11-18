import { databaseSettings } from '../../../database.ts';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { legacyTables, destinationTable, type ProjectDatabase } from './types.ts';
export type ProjectSnapshot = {tables:Record<string,Record<string,any>[]>;checksum:string};
function canonical(rows:Record<string,any>[]) { return rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).sort(); }
export function sourceSnapshot(file:string):ProjectSnapshot {
 const db=new DatabaseSync(file,{readOnly:true});
 try {
  db.exec('BEGIN');
  if(Object.values(db.prepare('PRAGMA integrity_check').get()??{})[0]!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite source integrity failed.');
  const tables:ProjectSnapshot['tables']={};
  for(const name of legacyTables)tables[name]=db.prepare(`SELECT * FROM "${name}"`).all();
  const versions=tables.schema_migrations.map(row=>row.version).sort().join(',');if(versions!=='1,2,3,4,5')throw new Error('Source project migrations are incomplete.');
  db.exec('COMMIT');
  const checksum=createHash('sha256').update(JSON.stringify(Object.entries(tables).map(([name,rows])=>[name,canonical(rows)]))).digest('hex');
  return {tables,checksum};
 } finally {db.close();}
}
export async function verifyProjectImport(db:Kysely<ProjectDatabase>,snapshot:ProjectSnapshot,schema=databaseSettings().schema) {
 const counts:Record<string,number>={};
 for(const name of legacyTables) {
  const rows=(await sql<Record<string,any>>`select * from ${sql.table(schema+'.'+destinationTable(name))}`.execute(db)).rows;
  // Compare the immutable v1 source columns; later PostgreSQL-owned settings are independent.
  const legacyRows=name==='projects'?rows.map(({order_no,active,...legacy})=>legacy):rows;
  if(JSON.stringify(canonical(legacyRows))!==JSON.stringify(canonical(snapshot.tables[name])))throw new Error('Project migration verification failed: '+name);
  counts[name]=rows.length;
 }
 return counts;
}
export async function importProjectSqlite(db:Kysely<ProjectDatabase>,snapshot:ProjectSnapshot,schema=databaseSettings().schema) {
 return db.transaction().execute(async tx=>{
  // Cutover is performed offline. Lock every destination table so another writer cannot join the import.
  await sql`LOCK TABLE ${sql.join(legacyTables.map(name=>sql.table(schema+'.'+destinationTable(name))))}, ${sql.table(schema+'.project_imports')} IN ACCESS EXCLUSIVE MODE`.execute(tx);
  const previous=await tx.selectFrom('project_imports').selectAll().where('source','=','sqlite-projects-v1').executeTakeFirst();
  if(previous) {
   if(previous.checksum!==snapshot.checksum)throw new Error('SQLite changed after import. Refusing to overwrite PostgreSQL.');
   return {alreadyImported:true,checksum:previous.checksum,counts:JSON.parse(previous.details)};
  }
  for(const name of legacyTables)if((await sql`select 1 from ${sql.table(schema+'.'+destinationTable(name))} limit 1`.execute(tx)).rows.length)throw new Error('Project destination is not empty. No records were overwritten.');
  for(const name of legacyTables)for(const row of snapshot.tables[name]) {
   const entries=Object.entries(row);
   await sql`insert into ${sql.table(schema+'.'+destinationTable(name))} (${sql.join(entries.map(([key])=>sql.ref(key)))}) values (${sql.join(entries.map(([,value])=>sql.val(value)))})`.execute(tx);
  }
  const counts=await verifyProjectImport(tx,snapshot,schema);
  // Advance identities past imported IDs without depending on public or search_path.
  for(const name of ['projects','project_changelog']) {
   const result=await sql<{maximum:number}>`select coalesce(max(id),0)::int as maximum from ${sql.table(schema+'.'+name)}`.execute(tx);
   const maximum=result.rows[0].maximum;
   const qualified=sql.table(schema+'.'+name).compile(tx).sql;
   await sql`select setval(pg_get_serial_sequence(${qualified},'id'),${Math.max(1,maximum)},${maximum>0})`.execute(tx);
  }
  await tx.insertInto('project_imports').values({source:'sqlite-projects-v1',checksum:snapshot.checksum,details:JSON.stringify(counts)}).execute();
  return {alreadyImported:false,checksum:snapshot.checksum,counts};
 });
}
