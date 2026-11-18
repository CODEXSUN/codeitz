import { after } from 'node:test';
import { randomBytes } from 'node:crypto';
import { openDatabase } from '../src/api/database.ts';
import { migrate } from '../scripts/database.ts';
const databases=new Map();
const testBase=openDatabase();
export async function prepareProjectDatabase(root) {
 if(databases.has(root))return databases.get(root).db;
 const base=testBase,schema='project_test_'+randomBytes(8).toString('hex'),db=base.withSchema(schema);
 await base.schema.createSchema(schema).execute();
 try{await migrate(db,schema);}catch(error){await base.schema.dropSchema(schema).cascade().execute();throw error;}
 databases.set(root,{base,schema,db});return db;
}
export function projectSchema(root){return databases.get(root).schema;}
export function projectDatabase(root){const value=databases.get(root);if(!value)throw new Error('Prepare an isolated project database first.');return value.db;}
after(async()=>{for(const {base,schema} of databases.values()){await base.schema.dropSchema(schema).cascade().execute();}await testBase.destroy();});
import { createTestServer } from './server-fixture.mjs';
import { Projects as ProjectService } from '../src/api/modules/projects/application/service.ts';
// Legacy suite's fake runner HTTP server remains test-only; production uses the in-process runner.
function runner(origin = 'http://127.0.0.1:1') {
  async function request(endpoint, body) {
    const result = await fetch(origin + endpoint, { ...(body ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) } : {}) });
    const data = await result.json(); if (!result.ok) throw new Error(data.message || 'Runner unavailable'); return data;
  }
  return { list:async()=>(await request('/api/tasks')).tasks, create:(owner,goal)=>request('/api/tasks',{owner,goal}), audit:id=>request(`/api/tasks/${id}/audit`,{}), review:(id,decision,feedback)=>request(`/api/tasks/${id}/review`,{decision,feedback}) };
}
export class Projects extends ProjectService {
  constructor(root, origin) { super(root,runner(origin),projectDatabase(root)); }
}
export async function createProjectTestServer({workspaceRoot,codeitzUrl} = {}) {
  return createTestServer({ auditRoot:workspaceRoot, projectDatabase:databases.get(workspaceRoot)?.db, projectTaskRunner:runner(codeitzUrl) });
}
