import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation, projectPath, legacyPath } from '../contracts/project-navigation.ts';
test('clean URLs restore project, tab, selected record and edit/new modes',()=>{
  const id='f0c19fb4-746e-40a6-8e92-353106865cc3';
  for(const tab of ['notes','modules','schemas','architectures','whiteboards','tasks','review']){
    const path=projectPath('devkit/codeitz',tab,id,'edit');const route=parseLocation(path);
    assert.equal(route.owner,'devkit/codeitz');assert.equal(route.tab,tab);assert.equal(route.record,id);assert.equal(route.mode,'edit');
  }
  assert.equal(parseLocation('/projects/apps-crm/notes/new').mode,'new');
  const moduleRoute=parseLocation(`/projects/devkit-codeitz/modules/${id}/tables/${id}`);assert.equal(moduleRoute.section,'tables');assert.equal(moduleRoute.subrecord,id);
  const fieldsRoute=parseLocation(`/projects/devkit-codeitz/modules/${id}/fields/${id}`);assert.equal(fieldsRoute.section,'fields');assert.equal(fieldsRoute.subrecord,id);
  assert.equal(parseLocation(`/projects/devkit-codeitz/modules/${id}/fields`).section,'fields');
  assert.equal(parseLocation(`/projects/devkit-codeitz/modules/${id}/fields/invalid`).page,'missing');
  assert.equal(parseLocation(`/projects/devkit-codeitz/modules/${id}/api-routes`).section,'api-routes');
  assert.equal(parseLocation('/projects?area=apps').area,'apps');
  assert.equal(parseLocation('/projects?area=outside').area,'all');
  assert.equal(parseLocation('/settings/appearance').page,'settings');
  for(const path of ['/projects/overview','/projects/bad-owner','/projects/apps-crm/unknown','/projects/apps-crm/notes/not-a-uuid','/projects/apps-crm/changelog/new'])assert.equal(parseLocation(path).page,'missing',path);
  assert.equal(legacyPath('project/devkit/codeitz'),'/projects/devkit-codeitz');
});

test('GitHub Manager routes restore selected repository and reject invalid paths',()=>{
 const id='d560e093758a19b732ee81bd';
 assert.equal(parseLocation('/github-manager').page,'github');
 assert.equal(parseLocation(`/github-manager/${id}`).record,id);
 assert.equal(parseLocation('/github-manager/../../outside').page,'missing');
 assert.equal(parseLocation('/github-manager/invalid').page,'missing');
 assert.equal(legacyPath('github'),'/github-manager');
});

test('GitHub changes route restores selected file on refresh',()=>{
 const route=parseLocation('/github-manager/d560e093758a19b732ee81bd/changes?file=src%2Fmain.ts');assert.equal(route.page,'github');assert.equal(route.section,'changes');assert.equal(route.record,'d560e093758a19b732ee81bd');
 assert.equal(parseLocation('/github-manager/d560e093758a19b732ee81bd/other').page,'missing');
});
