import type { Kysely } from 'kysely';
import type { ProjectDatabase } from '../types.ts';
import { ProjectStore } from '../../infrastructure/store.ts';
import { discoverProjects } from '../../infrastructure/discovery.ts';
// Import actual workspace projects once; never fabricate projects or rewrite imported records.
export async function seed(db:Kysely<ProjectDatabase>,workspaceRoot:string) {
 const store=new ProjectStore(db);
 if(await store.seeded())return {projects:'existing seed preserved'};
 await store.save(await discoverProjects(workspaceRoot,()=>''),true);
 return {projects:'workspace catalog seeded once'};
}
