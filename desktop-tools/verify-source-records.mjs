import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const db='codeitz';
const base=['exec','-i','codebiz-infra-postgres-1','psql','-U','postgres','-d',db,'-Atq','-v','ON_ERROR_STOP=1'];
const query=sql=>execFileSync('docker.exe',base,{input:sql,encoding:'utf8',maxBuffer:8*1024*1024});
const names=query("BEGIN READ ONLY; SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename; COMMIT;").trim().split(/\r?\n/).filter(Boolean);
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const statements=names.map(n=>`SELECT json_build_object('table',${literal(n)},'rows',count(*),'hash',encode(sha256(convert_to(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),''),'UTF8')),'hex')) FROM public.${ident(n)} t;`).join('\n');
const tables=query('BEGIN READ ONLY;\n'+statements+'\nCOMMIT;').trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
const file=resolve(root,'desktop-proof/projects-source-records-before.json');
if(process.argv.includes('--record')){
 try{readFileSync(file);throw Error('Existing baseline will not be overwritten');}catch(e){if(e.code!=='ENOENT')throw e;}
 writeFileSync(file,JSON.stringify({at:new Date().toISOString(),database:db,tables},null,2));
 console.log(JSON.stringify({recorded:true,tables:tables.length,rows:tables.reduce((a,t)=>a+Number(t.rows),0)}));
}else{
 const before=JSON.parse(readFileSync(file,'utf8'));
 const changes=tables.filter(t=>{const b=before.tables.find(x=>x.table===t.table);return !b||b.rows!==t.rows||b.hash!==t.hash;}).map(x=>x.table);
 const missing=before.tables.filter(t=>!tables.some(x=>x.table===t.table)).map(x=>x.table);
 const receipt={at:new Date().toISOString(),tables:tables.length,rows:tables.reduce((a,t)=>a+Number(t.rows),0),changedTables:changes,missingTables:missing,passed:!changes.length&&!missing.length};
 writeFileSync(resolve(root,'desktop-proof/projects-source-records-after.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));if(!receipt.passed)process.exitCode=1;
}
