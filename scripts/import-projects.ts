import path from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { loadCodeitzConfig } from '../src/api/config.ts';
import { openDatabase } from '../src/api/database.ts';
import { sourceSnapshot, importProjectSqlite } from '../src/api/modules/projects/database/import-sqlite.ts';
const config=loadCodeitzConfig();
const source=path.resolve(process.argv[2]??path.join(config.appRoot,'.codeitz/projects/projects.sqlite'));
const snapshot=sourceSnapshot(source), db=openDatabase();
try {
 const result=await importProjectSqlite(db,snapshot);
 if(sourceSnapshot(source).checksum!==snapshot.checksum)throw new Error('Source changed during cutover. Keep the server stopped and inspect both databases.');
 const marker=source+'.postgresql-cutover.json';
 try {const existing=JSON.parse(await readFile(marker,'utf8'));if(existing.checksum!==snapshot.checksum)throw new Error('Cutover marker differs from source.');}
 catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await writeFile(marker,JSON.stringify({target:'postgresql',completedAt:new Date().toISOString(),...result},null,2)+'\n',{flag:'wx'});}
 console.log(JSON.stringify(result));
} finally {await db.destroy();}
