import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('plaintext PostgreSQL stays loopback-only unless the fixed private Docker hostname is explicitly selected',()=>{
 const run=(host,transport)=>spawnSync(process.execPath,['--input-type=module','-e',"import {databaseSettings} from './src/api/database.ts';databaseSettings();"],{cwd:root,env:{...process.env,PGHOST:host,PGSSLMODE:'disable',CODEITZ_PG_TRANSPORT:transport},encoding:'utf8',windowsHide:true});
 assert.equal(run('127.0.0.1','').status,0);
 assert.notEqual(run('postgres','').status,0);
 assert.equal(run('postgres','docker-network').status,0);
 assert.notEqual(run('example.invalid','docker-network').status,0);
});
