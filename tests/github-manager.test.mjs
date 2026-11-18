import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {GitHubManager,githubUrl,parseStatus} from '../src/api/modules/github-manager/service.ts';
import {createProjectTestServer as createServer} from './project-fixture.mjs';
test('GitHub URLs reject credentials and non-GitHub destinations',()=>{
 assert.equal(githubUrl('git@github.com:CODEXSUN/project-manager.git'),'https://github.com/CODEXSUN/project-manager');
 assert.equal(githubUrl('https://github.com/CODEXSUN/project-manager.git'),'https://github.com/CODEXSUN/project-manager');
 assert.equal(githubUrl('https://token@github.com/org/repo.git'),null);
 assert.equal(githubUrl('https://example.com/org/repo'),null);
});
test('porcelain parser preserves rename paths and conflict counts',()=>{
 const result=parseStatus('R  new name\0old name\0UU conflict\0?? new file\0 M unstaged\0');
 assert.equal(result.files[0].previousPath,'old name');assert.equal(result.conflicts,1);assert.equal(result.untracked,1);assert.equal(result.modified,1);assert.equal(result.staged,1);
});
test('workspace repository inspection is read-only and API is guarded',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'pm-github-'));let app;
 const git=(directory,...args)=>execFileSync('git',['-C',directory,...args],{encoding:'utf8',windowsHide:true});
 try{
 const repository=path.join(root,'devkit','sample');await mkdir(repository,{recursive:true});git(repository,'init','-b','main');git(repository,'config','user.name','Test');git(repository,'config','user.email','test@example.invalid');await writeFile(path.join(repository,'tracked.txt'),'base');git(repository,'add','.');git(repository,'commit','-m','baseline');git(repository,'remote','add','origin','https://github.com/CODEXSUN/sample.git');
 await writeFile(path.join(repository,'tracked.txt'),'modified');await writeFile(path.join(repository,'new.txt'),'new');
 const before=git(repository,'status','--porcelain=v1');const snapshot=await new GitHubManager(root).list();assert.equal(snapshot.repositories.length,1);const row=snapshot.repositories[0];assert.equal(row.state,'modified');assert.equal(row.modified,1);assert.equal(row.untracked,1);assert.equal(row.url,'https://github.com/CODEXSUN/sample');assert.equal(row.path,'devkit/sample');assert.equal(row.branch,'main');assert.equal(row.upstream,null);assert.equal(git(repository,'status','--porcelain=v1'),before);
 app=await createServer({workspaceRoot:root});const response=await app.inject({method:'GET',url:'/api/v1/github-manager/repositories'});assert.equal(response.statusCode,200);assert.equal(response.json().repositories[0].id,row.id);
 const denied=await app.inject({method:'GET',url:'/api/v1/github-manager/repositories',headers:{origin:'https://example.com'}});assert.equal(denied.statusCode,403);
 const spec=await app.inject({method:'GET',url:'/api/openapi.json'});assert.ok(spec.json().paths['/api/v1/github-manager/repositories']);
 }finally{await app?.close();await rm(root,{recursive:true,force:true});}
});

import {GitOperations} from '../src/api/modules/github-manager/operations.ts';
test('review previews and selected commit preserve unselected changes and reject stale reviews',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'pm-git-actions-'));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true});
 try{git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');await writeFile(path.join(root,'one.txt'),'one');await writeFile(path.join(root,'two.txt'),'two');git('add','.');git('commit','-m','base');
 await writeFile(path.join(root,'one.txt'),'changed one');await writeFile(path.join(root,'two.txt'),'changed two');const manager=new GitHubManager(root);const operations=new GitOperations(manager);const id=(await manager.list()).repositories[0].id;const review=await operations.review(id);const preview=await operations.preview(id,'one.txt');assert.match(preview.working,/changed one/);await assert.rejects(()=>operations.preview(id,'../outside'));
 await writeFile(path.join(root,'one.txt'),'newer one');await assert.rejects(()=>operations.commit(id,'stale',['one.txt'],review.token),/changed/);
 const fresh=await operations.review(id);const result=await operations.commit(id,'Commit selected file',['one.txt'],fresh.token);assert.ok(result.commit);assert.equal(git('log','-1','--format=%s').trim(),'Commit selected file');assert.match(git('status','--porcelain'),/two.txt/);assert.doesNotMatch(git('status','--porcelain'),/one.txt/);
 await assert.rejects(()=>operations.push(id,review.head),/changed/);await assert.rejects(()=>operations.push(id,result.commit),/GitHub|unavailable|No such remote/);
 git('add','two.txt');await writeFile(path.join(root,'three.txt'),'three');const staged=await operations.review(id);await assert.rejects(()=>operations.commit(id,'omit staged',['three.txt'],staged.token),/already staged/);
 const withNew=await operations.preview(id,'three.txt');assert.equal(withNew.content,'three');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('repository mutation APIs reject foreign origins and invalid action bodies',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'pm-git-api-'));const app=await createServer({workspaceRoot:root});try{
 for(const action of ['commit','push']){const url=`/api/v1/github-manager/repositories/${'a'.repeat(24)}/${action}`;const denied=await app.inject({method:'POST',url,headers:{origin:'https://example.com'},payload:{}});assert.equal(denied.statusCode,403);const invalid=await app.inject({method:'POST',url,payload:{}});assert.equal(invalid.statusCode,400);}
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
