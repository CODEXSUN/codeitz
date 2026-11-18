import { openDatabase } from '../src/api/database.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { sourceSnapshot, importProjectSqlite, verifyProjectImport } from '../src/api/modules/projects/database/import-sqlite.ts';
import { prepareProjectDatabase, projectDatabase, projectSchema } from './project-fixture.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Projects } from '../src/api/modules/projects/application/service.ts';
import { TaskRunner } from '../src/api/modules/task-runner/application/service.ts';
import { registerTaskRoutes } from '../src/api/modules/task-runner/routes.ts';
import { registerProjectRoutes } from '../src/api/modules/projects/routes.ts';
import { createHttpServer } from '@workspace/framework';
import { parseLocation } from '../contracts/navigation.ts';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-project-merge-'));
  for (const name of ['apps/sample/docs','devkit','mcp-governance/docs']) await mkdir(path.join(root,name),{recursive:true});
  for (const name of ['governance.md','coding-standard.md','app-structure.md','frontend-design-system.md','server-startup.md']) await writeFile(path.join(root,'mcp-governance/docs',name),'# Rules');
  await writeFile(path.join(root,'apps/sample/package.json'),'{}');
  await writeFile(path.join(root,'apps/sample/AGENTS.md'),'Follow central governance');
  await writeFile(path.join(root,'apps/sample/docs/work-record.md'),'# Existing records');
  if(process.env.CODEITZ_TEST_POSTGRES==='1')await prepareProjectDatabase(root);
  return root;
}

test('PostgreSQL import preserves all SQLite rows and refuses changed or occupied sources', {skip:process.env.CODEITZ_TEST_POSTGRES!=='1'}, async()=>{
  const root=await fixture();
  try {
    const source=path.join(root,'projects.sqlite'), legacy=new DatabaseSync(source),id=randomUUID();
    legacy.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);CREATE TABLE seed_records(name TEXT PRIMARY KEY);');
    for(const name of ['001-projects','002-project-workspace','003-note-properties','004-note-lookups','005-module-designs']){legacy.exec(readFileSync(new URL('../src/api/modules/projects/database/legacy-migrations/'+name+'.sql',import.meta.url),'utf8'));legacy.prepare('INSERT INTO schema_migrations VALUES (?)').run(Number(name.slice(0,3)));}
    legacy.exec("INSERT INTO projects(id,owner,name,area,purpose,created_at) VALUES (42,'apps/sample','sample','apps','Exact legacy purpose','2026-11-17T01:02:03.123Z');INSERT INTO project_setup(project_id,state) VALUES (42,'configured');INSERT INTO seed_records VALUES ('workspace-projects');");
    legacy.prepare('INSERT INTO project_notes(id,project_id,title,content,status,revision,created_at,updated_at,category,assigned_to) VALUES (?,42,?,?,?,?,?,?,?,?)').run(id,'Keep note','<p>Exact content</p>','Custom status',7,'2026-11-17T01:02:03.123Z','2026-11-17T02:03:04.234Z','Research','Maya');
    legacy.exec("INSERT INTO project_changelog(id,project_id,kind,title,action,created_at) VALUES (57,42,'notes','Keep note','updated','2026-11-17T02:03:04.234Z');");
    legacy.close();
    const snapshot=sourceSnapshot(source),db=projectDatabase(root);
    const result=await importProjectSqlite(db,snapshot,projectSchema(root));assert.equal(result.alreadyImported,false);assert.equal(result.counts.projects,1);
    assert.equal((await importProjectSqlite(db,snapshot,projectSchema(root))).alreadyImported,true);
    assert.equal((await verifyProjectImport(db,snapshot,projectSchema(root))).project_notes,1);
    const gateway={list:async()=>[]};const service=new Projects(root,gateway,db);
    assert.equal((await service.note('apps/sample',id)).revision,7);assert.equal((await service.note('apps/sample',id)).properties.assignedTo,'Maya');
    const [one,two]=await Promise.allSettled([service.saveWorkspace('apps/sample','notes',{id,revision:7,title:'Updated',content:'New',status:'active'}),service.saveWorkspace('apps/sample','notes',{id,revision:7,title:'Concurrent',content:'New',status:'active'})]);
    assert.equal([one,two].filter(value=>value.status==='fulfilled').length,1);
    assert.equal((await db.selectFrom('project_changelog').selectAll().orderBy('id','desc').executeTakeFirst()).id,58);
    assert.equal((await service.note('apps/sample',id)).revision,8);
    const following=await db.insertInto('projects').values({owner:'apps/following',name:'following',area:'apps',purpose:'Verify preserved identity sequence',created_at:null}).returning('id').executeTakeFirstOrThrow();
    assert.equal(following.id,43);
    const separate=openDatabase().withSchema(projectSchema(root));
    try {assert.equal((await new Projects(root,gateway,separate).note('apps/sample',id)).revision,8);} finally {await separate.destroy();}
    const changed=structuredClone(snapshot);changed.checksum='changed';await assert.rejects(importProjectSqlite(db,changed,projectSchema(root)),/changed after/);
    assert.equal(sourceSnapshot(source).checksum,snapshot.checksum);
    const otherRoot=await fixture(),other=projectDatabase(otherRoot);await new Projects(otherRoot,gateway,other).catalog();await assert.rejects(importProjectSqlite(other,snapshot,projectSchema(otherRoot)),/not empty/);await rm(otherRoot,{recursive:true,force:true});
  }finally{await rm(root,{recursive:true,force:true});}
});

test('projects and task APIs share one runner; planning never approves coding', {skip:process.env.CODEITZ_TEST_POSTGRES!=='1'}, async()=>{
  const root=await fixture();const calls=[];
  const runner=new TaskRunner(root,projectDatabase(root),async input=>{calls.push(input.mode);return 'A small plan';});
  const app=createHttpServer({name:'merge-test',logLevel:'silent'});
  registerTaskRoutes(app,root,root,runner);registerProjectRoutes(app,new Projects(root,runner,projectDatabase(root)));
  try {
    const response=await app.inject({method:'POST',url:'/api/v1/projects/plan',payload:{owner:'apps/sample',goal:'Plan a small feature'}});
    assert.equal(response.statusCode,202,response.body);const id=response.json().id;
    for(let deadline=Date.now()+15000;Date.now()<deadline;){if((await runner.list())[0]?.status==='planned')break;await new Promise(resolve=>setTimeout(resolve,5));}
    const tasks=(await app.inject('/api/v1/tasks')).json().tasks;
    const workspace=(await app.inject('/api/v1/projects/apps/sample/workspace')).json();
    assert.equal(tasks[0].id,id);assert.equal(workspace.tasks[0].id,id);assert.equal(workspace.tasks[0].owner,'apps/sample');
    assert.equal(response.json().url,`/tasks/${id}`);assert.deepEqual(calls,['plan']);assert.equal(tasks[0].status,'planned');
    assert.equal((await app.inject('/api/v1/projects')).json().projects[0].taskCount,1);
  } finally {await app.close();await rm(root,{recursive:true,force:true});}
});

test('Codeitz restores project and GitHub URLs and retains dashboard landing',()=>{
  const id='f0c19fb4-746e-40a6-8e92-353106865cc3';
  for(const tab of ['notes','modules','architectures','whiteboards','schemas','tasks','review','changelog']){
    const url=`/projects/devkit-codeitz/${tab}`;assert.equal(parseLocation(url).page,'projects');assert.equal(parseLocation(url).canonical,url);
  }
  assert.equal(parseLocation(`/projects/devkit-codeitz/modules/${id}/tables/${id}`).page,'projects');
  const url='/github-manager/d560e093758a19b732ee81bd?area=devkit&group=folder&file=src%2Fmain.ts';
  assert.equal(parseLocation(url).canonical,url);assert.equal(parseLocation(url).page,'github');
  assert.equal(parseLocation('/').canonical,'/dashboard');
  assert.equal(parseLocation('/projects/invalid-owner').page,'missing');
});
