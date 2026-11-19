import { emptyModuleSpec } from '../contracts/modules.ts';
import nodeTest from 'node:test';
const test=(name,fn)=>nodeTest(name,{skip:process.env.CODEITZ_TEST_POSTGRES!=='1'},fn);
import { prepareProjectDatabase, projectDatabase } from './project-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, lstat, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as httpServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { createProjectTestServer as createServer, Projects } from './project-fixture.mjs';


const governance = fileURLToPath(new URL('../../../mcp-governance', import.meta.url));
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'project-manager-'));
  for (const folder of ['apps', 'devkit', 'mcp-governance/docs', 'foundation/framework', 'packages/ui']) await mkdir(path.join(root, folder), { recursive: true });
  for (const name of ['scripts', 'templates']) await cp(path.join(governance, name), path.join(root, 'mcp-governance', name), { recursive: true });
  await writeFile(path.join(root, 'mcp-governance/docs/governance.md'), '# Governance');
  for (const name of ['foundation/framework', 'packages/ui']) await writeFile(path.join(root, name, 'package.json'), '{}');
  await prepareProjectDatabase(root);
  return root;
}
async function port() { const server = netServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function codexStub() {
  const tasks = []; const calls = [];
  const server = httpServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'GET' && request.url === '/api/tasks') return response.end(JSON.stringify({ tasks }));
    if (request.method === 'POST' && request.url === '/api/tasks') {
      let body = ''; for await (const chunk of request) body += chunk;
      const input = JSON.parse(body); calls.push(input);
      const task = { id: randomUUID(), ...input, status: 'planning' }; tasks.push(task); response.statusCode = 202; return response.end(JSON.stringify(task));
    }
    const action = request.url.match(/^\/api\/tasks\/([^/]+)\/(audit|review)$/);
    if (request.method === 'POST' && action) {
      const task=tasks.find(task=>task.id===action[1]);
      if (!task) { response.statusCode=404;return response.end('{}'); }
      if (action[2]==='audit') return response.end(JSON.stringify({passed:true,findings:[{label:'Scope',passed:true,detail:task.owner}]}));
      let body='';for await(const chunk of request)body+=chunk;
      task.review={...JSON.parse(body),reviewedAt:new Date().toISOString()};
      return response.end(JSON.stringify({task}));
    }
    response.statusCode = 404; response.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, tasks, calls, close: () => new Promise(resolve => server.close(resolve)) };
}

test('live scaffold creation records audit and links project-scoped planning to Codeitz', async () => {
  const root = await fixture(); const codeitz = await codexStub();
  const app = await createServer({ workspaceRoot: root, codeitzUrl: codeitz.origin });
  try {
    const payload = { name: 'customer-portal', area: 'apps', port: await port(), purpose: 'Customer self-service concept',orderNo:18,active:false };
    const response = await app.inject({ method: 'POST', url: '/api/v1/projects', payload });
    assert.equal(response.statusCode, 200);
    const events = response.body.trim().split('\n').map(JSON.parse);
    assert.ok(events.some(event => event.type === 'progress' && event.stage === 'file'));
    assert.ok(events.some(event => event.stage === 'audit'));
    assert.equal(events.at(-1).type, 'complete');
    const project = events.at(-1).project;
    assert.equal(project.owner, 'apps/customer-portal'); assert.equal(project.auditPassed, true);
    assert.equal(project.orderNo,18);assert.equal(project.active,false);
    const activate=await app.inject({method:'PATCH',url:'/api/v1/projects/apps/customer-portal',payload:{orderNo:18,active:true}});assert.equal(activate.statusCode,200);assert.equal(activate.json().active,true);
    const target = path.join(root, project.owner);
    assert.ok((await lstat(path.join(target, '.git'))).isDirectory());
    const record = JSON.parse(await readFile(path.join(target, 'docs/creation.json'), 'utf8'));
    assert.equal(record.installation, 'pending'); assert.equal(record.runtimeVerification, 'pending');
    assert.equal(record.audit.passed, true);
    assert.match(await readFile(path.join(target, 'src/styles/index.css'), 'utf8'), /@workspace\/ui\/styles.css/);
    assert.match(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), /\.\.\/\.\.\/mcp-governance\/docs\/governance.md/);
    assert.match(await readFile(path.join(root, 'mcp-governance/records/app-events.jsonl'), 'utf8'), /app.created/);
    const plan = await app.inject({ method: 'POST', url: '/api/v1/projects/plan', payload: { owner: project.owner, goal: 'Plan the first small feature' } });
    assert.equal(plan.statusCode, 202); assert.equal(plan.json().status, 'planning');
    assert.equal(plan.json().url, '/tasks/' + codeitz.tasks[0].id);
    assert.deepEqual(codeitz.calls, [{ owner: project.owner, goal: 'Plan the first small feature' }]);
    const overview = (await app.inject('/api/v1/projects')).json();
    assert.equal(overview.projects[0].taskCount, 1); assert.equal(overview.activeTasks, 1);
    const tasksUrl = new URL(overview.projects[0].tasksUrl, 'http://localhost');
    assert.equal(tasksUrl.searchParams.get('owner'), project.owner); assert.equal(tasksUrl.pathname, '/task-records');
    const before = await readFile(path.join(target, 'docs/work-record.md'), 'utf8');
    const duplicate = await app.inject({ method: 'POST', url: '/api/v1/projects', payload });
    assert.match(duplicate.body, /existing work/);
    assert.equal(await readFile(path.join(target, 'docs/work-record.md'), 'utf8'), before);
  } finally { await app.close(); await codeitz.close(); await rm(root, { recursive: true, force: true }); }
});

test('project routes reject cross-origin requests, traversal, arbitrary commands, and unknown project tasks', async () => {
  const root = await fixture(); const app = await createServer({ workspaceRoot: root, codeitzUrl: 'http://127.0.0.1:1' });
  try {
    const payload = { name: 'new-app', area: 'apps', port: await port(), purpose: 'Small concept' };
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/projects', headers: { origin: 'https://other.invalid' }, payload })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/projects', payload: { ...payload, name: '../outside' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/projects', payload: { ...payload, area: 'foundation' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/projects', payload: { ...payload, command: 'anything' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/projects/plan', payload: { owner: 'apps/missing', goal: 'Goal' } })).statusCode, 409);
    assert.deepEqual(await readdir(path.join(root, 'apps')), []);


  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('creation works while Codeitz is offline and concurrent creations are refused', async () => {
  const root = await fixture(); const service = new Projects(root, 'http://127.0.0.1:1');
  try {
    const overview = await service.overview(); assert.equal(overview.codeitz.connected, false);
    const input = { name: 'offline-app', area: 'apps', port: await port(), purpose: 'Offline creation' };
    const pending = service.create(input, () => {});
    await assert.rejects(service.create({ ...input, name: 'parallel-app' }, () => {}), /Another project/);
    const project = await pending; assert.equal(project.owner, 'apps/offline-app');
    assert.deepEqual(await readdir(path.join(root, 'apps')), ['offline-app']);
    await assert.rejects(service.plan(project.owner, 'Plan next'), /fetch failed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('project seed persists master and child records without overwriting stored content or duplicating on restart', async () => {
  const root = await fixture();
  const database = path.join(root, '.codeitz/projects/projects.sqlite');
  await mkdir(path.join(root, 'apps/existing/docs'), { recursive: true });
  await writeFile(path.join(root, 'apps/existing/package.json'), '{}');
  await writeFile(path.join(root, 'apps/existing/docs/creation.json'), JSON.stringify({ purpose: 'Original purpose', port: 4325, audit: { passed: true }, installation: 'verified', runtimeVerification: 'verified' }));
  try {
    const service = new Projects(root, 'http://127.0.0.1:1');
    assert.equal((await service.catalog()).length, 1);
    const db = projectDatabase(root);
    try {
      assert.equal((await db.selectFrom('project_setup').selectAll().execute()).length,1);
      assert.equal((await db.selectFrom('project_setup').select('installation').executeTakeFirst()).installation,'verified');
      await db.updateTable('projects').set({purpose:'Stored purpose'}).execute();
      await assert.rejects(db.insertInto('project_setup').values({project_id:999,state:'configured',port:null,audit_passed:null,installation:'pending',runtime_verification:'pending'}).execute(),/foreign key/);
    } finally { /* fixture owns the shared test pool */ }
    await writeFile(path.join(root, 'apps/existing/docs/creation.json'), JSON.stringify({ purpose: 'Changed file purpose' }));
    await mkdir(path.join(root, 'apps/later'), { recursive: true });
    const restarted = new Projects(root, 'http://127.0.0.1:1');
    const projects = await restarted.catalog();
    assert.equal(projects.length, 1);
    assert.equal(projects[0].purpose, 'Stored purpose');
    assert.equal(projects[0].port, 4325);
    assert.equal(projects[0].auditPassed, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('project workspace saves each child record, records changes, rejects stale edits and isolates projects', async () => {
  const root=await fixture(); const codeitz=await codexStub();
  for (const name of ['first','second']) { await mkdir(path.join(root,`apps/${name}`),{recursive:true}); await writeFile(path.join(root,`apps/${name}/package.json`),'{}'); }
  const app=await createServer({workspaceRoot:root,codeitzUrl:codeitz.origin});
  try {
    const payloads={notes:'<p>Design note</p>',modules:'<p>Owns project planning</p>',architectures:JSON.stringify({blocks:[],connections:[]}),whiteboards:JSON.stringify({elements:[],appState:{},files:{}}),schemas:JSON.stringify([{name:'id',type:'INTEGER',primary:true,required:true,reference:''}])};
    const saved={};
    for(const [kind,content] of Object.entries(payloads)) {
      const response=await app.inject({method:'POST',url:`/api/v1/projects/apps/first/workspace/${kind}`,payload:{title:`First ${kind}`,content,status:'draft'}});
      assert.equal(response.statusCode,200,response.body);saved[kind]=response.json();
    }
    const workspace=(await app.inject('/api/v1/projects/apps/first/workspace')).json();
    assert.equal(workspace.changelog.length,5);
    for(const kind of Object.keys(payloads)) assert.equal(workspace.records[kind][0].content,payloads[kind]);
    assert.equal((await app.inject('/api/v1/projects/apps/second/workspace')).json().records.notes.length,0);
    const note=saved.notes;
    const update={id:note.id,revision:note.revision,title:'Revised note',content:'<p>Saved revision</p>',status:'active',properties:{category:'Decision',assignedTo:'Project owner'}};
    assert.equal((await app.inject({method:'POST',url:'/api/v1/projects/apps/first/workspace/notes',payload:update})).json().revision,2);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/projects/apps/first/workspace/notes',payload:update})).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/projects/apps/second/workspace/notes',payload:{...update,revision:2}})).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/projects/apps/first/workspace/schemas',payload:{title:'Bad schema',content:'{}',status:'draft'}})).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/projects/apps/first/workspace/notes',headers:{origin:'https://other.invalid'},payload:update})).statusCode,403);
    const foreignTask={id:randomUUID(),owner:'apps/second',goal:'Other project',status:'completed'};codeitz.tasks.push(foreignTask);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/projects/apps/first/tasks/${foreignTask.id}/audit`,payload:{}})).statusCode,409);
    const board=saved.whiteboards;
    const drawing=JSON.stringify({elements:[{id:'audit-rectangle',type:'rectangle',x:20,y:30,width:180,height:90,version:1,isDeleted:false}],appState:{viewBackgroundColor:'#ffffff'},files:{}});
    const draft=await app.inject({method:'POST',url:'/api/v1/projects/apps/first/workspace/whiteboards',payload:{id:board.id,revision:board.revision,title:'Drawing audit',content:drawing,status:'draft'}});
    assert.equal(draft.statusCode,200,draft.body);assert.equal(draft.json().revision,2);
    const activated=await app.inject({method:'POST',url:'/api/v1/projects/apps/first/workspace/whiteboards',payload:{id:board.id,revision:2,title:'Drawing audit',content:drawing,status:'active'}});
    assert.equal(activated.statusCode,200,activated.body);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/projects/apps/first/workspace/whiteboards',payload:{id:board.id,revision:2,title:'Stale',content:drawing,status:'draft'}})).statusCode,409);
    const restarted=new Projects(root,codeitz.origin);
    const persisted=await restarted.workspace('apps/first');
    assert.equal(persisted.records.whiteboards[0].id,board.id);
    assert.equal(persisted.records.whiteboards[0].content,drawing);
    assert.equal(persisted.records.whiteboards[0].status,'active');
    assert.equal(persisted.records.whiteboards[0].revision,3);
    assert.equal(persisted.records.notes[0].title,'Revised note');assert.deepEqual(persisted.records.notes[0].properties,{category:'Decision',assignedTo:'Project owner'});assert.equal(persisted.changelog.length,8);
  }finally{await app.close();await codeitz.close();await rm(root,{recursive:true,force:true});}
});


test('Codeitz reports and review/audit actions retain project ownership', async()=>{
  const root=await fixture();const codeitz=await codexStub();
  await mkdir(path.join(root,'devkit/codeitz'),{recursive:true});await writeFile(path.join(root,'devkit/codeitz/package.json'),'{}');
  const app=await createServer({workspaceRoot:root,codeitzUrl:codeitz.origin});
  const task={id:randomUUID(),owner:'devkit/codeitz',goal:'Integration audit',status:'completed',plan:'Plan',result:'Verified',checks:[{name:'test',passed:true,output:'passed'}],changedFiles:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};codeitz.tasks.push(task);
  try{
    const read=(await app.inject('/api/v1/projects/devkit/codeitz/workspace')).json();assert.equal(read.tasks[0].result,'Verified');
    const audit=await app.inject({method:'POST',url:`/api/v1/projects/devkit/codeitz/tasks/${task.id}/audit`,payload:{}});assert.equal(audit.statusCode,200);assert.equal(audit.json().passed,true);
    const review=await app.inject({method:'POST',url:`/api/v1/projects/devkit/codeitz/tasks/${task.id}/review`,payload:{decision:'accepted',feedback:''}});assert.equal(review.statusCode,200);assert.equal(task.review.decision,'accepted');
    assert.equal((await app.inject({method:'POST',url:`/api/v1/projects/devkit/codeitz/tasks/${task.id}/review`,payload:{decision:'anything'}})).statusCode,400);
  }finally{await app.close();await codeitz.close();await rm(root,{recursive:true,force:true});}
});


test('note create/read/update API persists all fields offline, validates edits and prevents lost updates', async()=>{
  const root=await fixture();for(const name of ['notes-app','other-app']){await mkdir(path.join(root,`apps/${name}`),{recursive:true});await writeFile(path.join(root,`apps/${name}/package.json`),'{}');}
  const app=await createServer({workspaceRoot:root,codeitzUrl:'http://127.0.0.1:1'});const base='/api/v1/projects/apps/notes-app/notes';
  const fields={title:'  Design decision  ',content:'<h2>Saved content</h2><p>Project #notes</p>',status:'draft',properties:{category:'Decision',assignedTo:'Project owner'}};
  try{
    assert.equal((await app.inject({method:'POST',url:base,payload:{...fields,title:'  '}})).statusCode,400);
    const created=await app.inject({method:'POST',url:base,payload:fields});assert.equal(created.statusCode,201,created.body);const note=created.json();assert.equal(note.title,'Design decision');assert.equal(note.revision,1);assert.deepEqual(note.properties,fields.properties);
    const list=await app.inject(base);assert.equal(list.statusCode,200);assert.equal(list.json().notes.length,1);
    assert.equal((await app.inject(`${base}/${note.id}`)).json().content,fields.content);
    const patch={...fields,title:'Updated decision',status:'active',revision:note.revision,properties:{category:'Research',assignedTo:''}};
    assert.equal((await app.inject({method:'PATCH',url:`${base}/${note.id}`,payload:{...fields}})).statusCode,400);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/projects/apps/other-app/notes/${note.id}`,payload:patch})).statusCode,404);
    assert.equal((await app.inject({method:'PATCH',url:`${base}/${note.id}`,headers:{origin:'https://other.invalid'},payload:patch})).statusCode,403);
    const responses=await Promise.all([app.inject({method:'PATCH',url:`${base}/${note.id}`,payload:patch}),app.inject({method:'PATCH',url:`${base}/${note.id}`,payload:patch})]);assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,409]);
    const saved=(await app.inject(`${base}/${note.id}`)).json();assert.equal(saved.title,patch.title);assert.equal(saved.content,fields.content);assert.equal(saved.status,'active');assert.deepEqual(saved.properties,patch.properties);assert.equal(saved.revision,2);
    const restarted=new Projects(root,'http://127.0.0.1:1');const reopened=await restarted.note('apps/notes-app',note.id);assert.deepEqual(reopened,saved);
    assert.equal((await app.inject('/api/v1/projects/apps/other-app/notes')).json().notes.length,0);
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});


test('OpenAPI documents registered versioned APIs, guarded docs and safe legacy redirects',async()=>{
  const root=await fixture();const app=await createServer({workspaceRoot:root,codeitzUrl:'http://127.0.0.1:1'});
  try{
    const response=await app.inject('/api/openapi.json');assert.equal(response.statusCode,200);const spec=response.json();const operations=[];
    for(const [path,methods] of Object.entries(spec.paths))for(const [method,operation] of Object.entries(methods)){
      assert.ok(app.hasRoute({method:method.toUpperCase(),url:path.replace(/\{(\w+)\}/g,':$1')}),`${method} ${path}`);
      assert.ok(path.startsWith('/api/v1/')||path==='/api/health');assert.ok(operation.parameters);assert.ok(operation.responses);if(path.startsWith('/api/v1/projects')||path.startsWith('/api/v1/github-manager'))assert.ok(operation['x-permissions']);operations.push(operation.operationId);
    }
    assert.equal(new Set(operations).size,operations.length);
    assert.equal((await app.inject('/api/docs')).statusCode,200);
    assert.equal((await app.inject({url:'/api/openapi.json',headers:{origin:'https://other.invalid'}})).statusCode,403);
    const legacy=await app.inject({method:'POST',url:'/api/projects',payload:{}});assert.equal(legacy.statusCode,307);assert.equal(legacy.headers.location,'/api/v1/projects');
    assert.deepEqual(await readdir(path.join(root,'apps')),[]);
    assert.equal((await app.inject('/projects/devkit-codeitz/notes')).statusCode,200);
    assert.equal((await app.inject('/api/v1/unknown')).statusCode,404);
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});


test('note lookups persist custom categories/statuses without duplicates or cross-project leakage',async()=>{
  const root=await fixture();for(const name of ['one','two']){await mkdir(path.join(root,`apps/${name}`),{recursive:true});await writeFile(path.join(root,`apps/${name}/package.json`),'{}');}
  const app=await createServer({workspaceRoot:root,codeitzUrl:'http://127.0.0.1:1'});const base='/api/v1/projects/apps/one/notes';
  try{
    const options=(await app.inject(`${base}/options`)).json();assert.ok(options.status.some(option=>option.value==='draft'));assert.ok(options.category.some(option=>option.value==='General'));
    const created=await app.inject({method:'POST',url:`${base}/options/status`,payload:{label:'On hold'}});assert.equal(created.statusCode,201,created.body);
    const duplicate=await app.inject({method:'POST',url:`${base}/options/status`,payload:{label:' on HOLD '}});assert.equal(duplicate.json().value,'On hold');
    assert.equal((await app.inject({method:'POST',url:`${base}/options/category`,payload:{label:'Planning'}})).statusCode,201);
    const fields={title:'Custom choices',content:'<p>Saved note</p>',status:'On hold',properties:{category:'Planning',assignedTo:''}};
    const note=(await app.inject({method:'POST',url:base,payload:fields})).json();assert.equal(note.status,'On hold');
    const updated=await app.inject({method:'PATCH',url:`${base}/${note.id}`,payload:{...fields,revision:note.revision,content:'<p>Edited with custom status</p>'}});assert.equal(updated.statusCode,200,updated.body);
    const read=(await app.inject(`${base}/options`)).json();assert.equal(read.status.filter(option=>option.value.toLowerCase()==='on hold').length,1);
    assert.ok(!(await app.inject('/api/v1/projects/apps/two/notes/options')).json().status.some(option=>option.value==='On hold'));
    assert.equal((await app.inject({method:'POST',url:`${base}/options/status`,payload:{label:' '}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:`${base}/options/status`,headers:{origin:'https://other.invalid'},payload:{label:'Blocked'}})).statusCode,403);
    const reopened=new Projects(root,'http://127.0.0.1:1');assert.ok((await reopened.noteOptions('apps/one')).category.some(option=>option.value==='Planning'));assert.equal((await reopened.note('apps/one',note.id)).status,'On hold');
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});


test('module design API persists children/fields atomically and rejects stale or cross-project changes',async()=>{
 const root=await fixture();for(const name of ['design','other']){await mkdir(path.join(root,`apps/${name}`),{recursive:true});await writeFile(path.join(root,`apps/${name}/package.json`),'{}');}
 const app=await createServer({workspaceRoot:root,codeitzUrl:'http://127.0.0.1:1'});const base='/api/v1/projects/apps/design/modules';
 const fields={title:'Enquiries',content:'<p>Own enquiries</p>',status:'active',spec:{...emptyModuleSpec(),code:'ENQ',owner:'Team',version:'1.0',responsibility:'Manage enquiries',
 apiRoutes:[{id:randomUUID(),method:'GET',path:'/api/v1/enquiries',summary:'List',permission:'enquiries.read',requestSchema:'{}',responseSchema:'[]'}],
 actions:[{id:randomUUID(),name:'assign',description:'Assign an owner',permission:'enquiries.assign',input:'ownerId',output:'enquiry'}],
 events:[{id:randomUUID(),name:'enquiry.created',direction:'published',description:'New enquiry',payload:'{id}'}],
 tables:[{id:randomUUID(),name:'enquiries',description:'Module-owned data',fields:[{id:randomUUID(),name:'id',type:'UUID',sqlType:'UUID',generation:'none',primary:true,required:true,unique:true,defaultValue:'',reference:'',description:'Identity'}]}],
 dependencies:[{id:randomUUID(),name:'identity',kind:'service',description:'Actor scope',contract:'verified actor'}]}};
 try{
 const created=await app.inject({method:'POST',url:base,payload:fields});assert.equal(created.statusCode,201,created.body);const module=created.json();assert.equal(module.revision,1);assert.deepEqual(module.spec,fields.spec);
 const updated=await app.inject({method:'PATCH',url:`${base}/${module.id}`,payload:{...fields,title:'Enquiry management',revision:1}});assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().revision,2);
 assert.equal((await app.inject({method:'PATCH',url:`${base}/${module.id}`,payload:{...fields,revision:1}})).statusCode,409);
 assert.equal((await app.inject(`/api/v1/projects/apps/other/modules/${module.id}`)).statusCode,404);
 assert.equal((await app.inject({method:'PATCH',url:`/api/v1/projects/apps/other/modules/${module.id}`,payload:{...fields,revision:2}})).statusCode,404);
 const invalid=structuredClone(fields);invalid.spec.tables[0].fields[0].type='COMMAND';assert.equal((await app.inject({method:'PATCH',url:`${base}/${module.id}`,payload:{...invalid,revision:2}})).statusCode,400);
 const duplicate=structuredClone(fields);duplicate.spec.tables[0].fields.push({...duplicate.spec.tables[0].fields[0],id:randomUUID()});assert.equal((await app.inject({method:'PATCH',url:`${base}/${module.id}`,payload:{...duplicate,revision:2}})).statusCode,400);
 assert.equal((await app.inject({method:'POST',url:base,headers:{origin:'https://other.invalid'},payload:fields})).statusCode,403);
 const restarted=new Projects(root,'http://127.0.0.1:1');const persisted=await restarted.module('apps/design',module.id);assert.equal(persisted.title,'Enquiry management');assert.deepEqual(persisted.spec,fields.spec);
 const {id:recordId,createdAt:createdTime,updatedAt:updatedTime,...design}=persisted;
 const addedField={id:randomUUID(),name:'customer_label',type:'TEXT',sqlType:'TEXT',generation:'none',indexed:true,primary:false,required:false,unique:false,defaultValue:'',reference:'',description:'Optional label'};
 const added=structuredClone(design);added.spec.tables[0].fields.push(addedField);
 let saved=await app.inject({method:'PATCH',url:`${base}/${module.id}`,payload:added});assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().spec.tables[0].fields.length,2);
 let next=saved.json();const edited={title:next.title,content:next.content,status:next.status,spec:next.spec,revision:next.revision};edited.spec.tables[0].fields[1].type='VARCHAR';edited.spec.tables[0].fields[1].required=true;
 saved=await app.inject({method:'PATCH',url:`${base}/${module.id}`,payload:edited});assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().spec.tables[0].fields[1].required,true);assert.equal(saved.json().spec.tables[0].fields[1].indexed,true);
 next=saved.json();const removed={title:next.title,content:next.content,status:next.status,spec:next.spec,revision:next.revision};removed.spec.tables[0].fields=removed.spec.tables[0].fields.filter(f=>f.id!==addedField.id);
 saved=await app.inject({method:'PATCH',url:`${base}/${module.id}`,payload:removed});assert.equal(saved.statusCode,200,saved.body);
 const reloaded=await new Projects(root,'http://127.0.0.1:1').module('apps/design',module.id);assert.deepEqual(reloaded.spec,fields.spec);assert.equal(reloaded.spec.tables[0].fields[0].id,fields.spec.tables[0].fields[0].id);
 const blueprint=await app.inject('/api/v1/projects/apps/design/blueprint');assert.equal(blueprint.statusCode,200);assert.equal(blueprint.json().format,'codeitz.project-blueprint');assert.deepEqual(blueprint.json().modules[0].spec,fields.spec);assert.equal((await app.inject({url:'/api/v1/projects/apps/design/blueprint',headers:{origin:'https://other.invalid'}})).statusCode,403);
 const db=projectDatabase(root);assert.equal((await db.selectFrom('module_table_fields').selectAll().execute()).length,1);
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});


test('project ordering, active status and coding task progress persist without changing IDs',async()=>{
 const root=await fixture(),codeitz=await codexStub();
 const {ProjectStore}=await import('../src/api/modules/projects/infrastructure/store.ts');
 const store=new ProjectStore(projectDatabase(root));
 await store.save([{owner:'apps/alpha',name:'alpha',area:'apps',purpose:'Alpha',state:'configured',auditPassed:null,orderNo:20,active:true},{owner:'apps/beta',name:'beta',area:'apps',purpose:'Beta',state:'configured',auditPassed:null,orderNo:10,active:true}],true);
 const before=await projectDatabase(root).selectFrom('projects').select(['id','owner']).orderBy('owner').execute();
 codeitz.tasks.push({id:randomUUID(),owner:'apps/alpha',status:'completed'},{id:randomUUID(),owner:'apps/alpha',status:'coding'},{id:randomUUID(),owner:'apps/alpha',status:'completed',droppedAt:new Date().toISOString()});
 const app=await createServer({workspaceRoot:root,codeitzUrl:codeitz.origin});
 try{
  let result=(await app.inject('/api/v1/projects')).json();assert.deepEqual(result.projects.map(p=>p.name),['beta','alpha']);assert.equal(result.projects[1].progressPercent,50);assert.equal(result.projects[0].progressPercent,null);
  assert.equal((await app.inject({method:'PATCH',url:'/api/v1/projects/apps/alpha',payload:{orderNo:0,active:false}})).statusCode,400);
  assert.equal((await app.inject({method:'PATCH',url:'/api/v1/projects/apps/alpha',headers:{origin:'https://outside.invalid'},payload:{orderNo:1,active:false}})).statusCode,403);
  assert.equal((await app.inject({method:'PATCH',url:'/api/v1/projects/apps/alpha',payload:{orderNo:1,active:false}})).statusCode,200);
  result=(await app.inject('/api/v1/projects')).json();assert.deepEqual(result.projects.map(p=>p.name),['alpha','beta']);assert.equal(result.projects[0].active,false);
  assert.equal((await app.inject({method:'POST',url:'/api/v1/projects/plan',payload:{owner:'apps/alpha',goal:'Should not start'}})).statusCode,409);assert.equal(codeitz.calls.length,0);
  await store.save([{owner:'apps/alpha',name:'alpha',area:'apps',purpose:'discovery must not overwrite',state:'configured',auditPassed:null,orderNo:99,active:true}]);
  const saved=await new ProjectStore(projectDatabase(root)).list();assert.equal(saved[0].orderNo,1);assert.equal(saved[0].active,false);
  assert.deepEqual(await projectDatabase(root).selectFrom('projects').select(['id','owner']).orderBy('owner').execute(),before);
  assert.equal(await projectDatabase(root).selectFrom('project_changelog').select('id').execute().then(rows=>rows.length),1);
 }finally{await app.close();await codeitz.close();await rm(root,{recursive:true,force:true});}
});


test('catalog refresh appends new apps once and preserves saved project settings',async()=>{
 const root=await fixture();
 try{
  const {ProjectStore}=await import('../src/api/modules/projects/infrastructure/store.ts');
  const {syncProjectCatalog}=await import('../src/api/modules/projects/application/catalog.ts');
  const store=new ProjectStore(projectDatabase(root));
  await mkdir(path.join(root,'apps/alpha'));await mkdir(path.join(root,'devkit/new-tool'));await mkdir(path.join(root,'devkit/project-manager'));
  await store.save([{owner:'apps/alpha',name:'alpha',area:'apps',purpose:'Saved purpose',state:'configured',auditPassed:null,orderNo:7,active:false}],true);
  const original=await projectDatabase(root).selectFrom('projects').selectAll().executeTakeFirst();
  assert.deepEqual((await syncProjectCatalog(projectDatabase(root),root)).added,['devkit/new-tool']);
  assert.deepEqual((await syncProjectCatalog(projectDatabase(root),root)).added,[]);
  assert.deepEqual(await projectDatabase(root).selectFrom('projects').selectAll().where('owner','=','apps/alpha').executeTakeFirst(),original);
  const list=await store.list();assert.equal(list.length,2);assert.equal(list[1].orderNo,8);assert.equal(list[1].active,true);assert.ok(!list.some(p=>p.owner==='devkit/project-manager'));
 }finally{await rm(root,{recursive:true,force:true});}
});


test('module approval is owner-key protected, revision-bound, idempotent and durable',async()=>{
 const previous=process.env.CODEITZ_OWNER_APPROVAL_KEY;process.env.CODEITZ_OWNER_APPROVAL_KEY='isolated-owner-key-for-test-only';
 const root=await fixture();await mkdir(path.join(root,'apps/approve'),{recursive:true});await writeFile(path.join(root,'apps/approve/package.json'),'{}');
 const app=await createServer({workspaceRoot:root,codeitzUrl:'http://127.0.0.1:1'});const base='/api/v1/projects/apps/approve/modules';
 try{
 const spec={...emptyModuleSpec(),code:'notes',owner:'apps/approve',version:'1.0.0',responsibility:'Manage notes',actions:[{id:randomUUID(),name:'save',description:'Validate and save a note',permission:'notes.write',input:'{}',output:'{}'}]};
 const input={title:'Notes',content:'Reviewed scope',status:'draft',spec};
 let response=await app.inject({method:'POST',url:base,payload:input});assert.equal(response.statusCode,201,response.body);const record=response.json();
 const url=`${base}/${record.id}`;
 let review=await app.inject(url+'/review');assert.equal(review.statusCode,200,review.body);assert.equal(review.json().canApprove,true);assert.equal(review.json().ownerKeyConfigured,true);
 const body={revision:1,ownerKey:'isolated-owner-key-for-test-only',confirmed:true};
 response=await app.inject({method:'POST',url:url+'/approve',payload:{...body,ownerKey:'wrong-owner-key-is-long'}});assert.equal(response.statusCode,403);assert.ok(!response.body.includes(body.ownerKey));
 assert.equal((await app.inject({method:'POST',url:url+'/approve',payload:{...body,confirmed:false}})).statusCode,400);
 assert.equal((await app.inject({method:'POST',url:url+'/approve',headers:{origin:'https://other.invalid'},payload:body})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:url+'/approve',payload:{...body,revision:2}})).statusCode,409);
 response=await app.inject({method:'POST',url:url+'/approve',payload:body});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().approval.current,true);assert.equal(response.json().approval.approvedBy,'workspace-owner');assert.ok(!response.body.includes(body.ownerKey));
 assert.equal((await app.inject({method:'POST',url:url+'/approve',payload:body})).statusCode,200);
 review=await app.inject(url+'/review');assert.equal(review.json().history.length,1);assert.deepEqual(review.json().history[0].snapshot,input);assert.equal(review.json().history[0].audit.passed,true);
 const restarted=new Projects(root,'http://127.0.0.1:1');assert.equal((await restarted.module('apps/approve',record.id)).approval.current,true);assert.equal((await restarted.blueprint('apps/approve')).ownerApproved,true);
 response=await app.inject({method:'PATCH',url,payload:{...input,title:'Changed notes',revision:1}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().approval.current,false);
 assert.equal((await restarted.blueprint('apps/approve')).ownerApproved,false);
 review=await app.inject(url+'/review');assert.equal(review.json().history.length,1);assert.equal(review.json().history[0].snapshot.title,'Notes');assert.equal(review.json().history[0].current,false);
 assert.equal((await app.inject({method:'PATCH',url,payload:{...input,revision:2,approval:{current:true}}})).statusCode,400);
 const changed=structuredClone(input);changed.spec.actions[0].input='not JSON';response=await app.inject({method:'PATCH',url,payload:{...changed,revision:2}});assert.equal(response.statusCode,200);
 response=await app.inject({method:'POST',url:url+'/approve',payload:{...body,revision:3}});assert.equal(response.statusCode,409);assert.match(response.body,/audit findings/);
 const duplicateInput=structuredClone(input);duplicateInput.spec.actions[0].id=randomUUID();const duplicate=await app.inject({method:'POST',url:base,payload:duplicateInput});assert.equal(duplicate.statusCode,201);review=await app.inject(url+'/review');assert.ok(review.json().issues.some(issue=>issue.message.includes('unique in this project')));
 process.env.CODEITZ_OWNER_APPROVAL_KEY='';assert.equal((await app.inject({method:'POST',url:url+'/approve',payload:{...body,revision:3}})).statusCode,503);
 }finally{await app.close();await rm(root,{recursive:true,force:true});if(previous===undefined)delete process.env.CODEITZ_OWNER_APPROVAL_KEY;else process.env.CODEITZ_OWNER_APPROVAL_KEY=previous;}
});
