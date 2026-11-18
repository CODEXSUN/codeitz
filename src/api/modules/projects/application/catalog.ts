import type {Kysely} from 'kysely';
import type {ProjectDatabase} from '../database/types.ts';
import {ProjectStore} from '../infrastructure/store.ts';
import {discoverProjects} from '../infrastructure/discovery.ts';

// Explicit catalog refresh: append new workspace owners without overwriting saved settings.
export async function syncProjectCatalog(db:Kysely<ProjectDatabase>,root:string){
 const store=new ProjectStore(db);
 const existing=new Set((await store.list()).map(project=>project.owner));
 const added=(await discoverProjects(root,()=>''))
  .filter(project=>project.owner!=='devkit/project-manager'&&!existing.has(project.owner))
  .map(({orderNo,...project})=>project);
 await store.save(added);
 return {added:added.map(project=>project.owner)};
}
