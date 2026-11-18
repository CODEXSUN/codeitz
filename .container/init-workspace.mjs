import {access,cp,mkdir,symlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.env.CODEITZ_WORKSPACE_ROOT;
if(root!=='/workspace')throw new Error('Container workspace must be /workspace.');
const marker=path.join(root,'.codeitz-workspace-initialized');
try{await access(marker);}catch(error){
 if(error.code!=='ENOENT')throw error;
 for(const area of ['apps','devkit','foundation','packages','addons','infrastructure'])await mkdir(path.join(root,area),{recursive:true});
 for(const owner of ['mcp-governance','foundation/framework','packages/ui','devkit/codeitz']){
  const target=path.join(root,owner);try{await access(target);throw new Error('Workspace is partially initialized. Inspect it before retrying.');}catch(e){if(e.code!=='ENOENT')throw e;}
  await cp(path.join('/opt/codebiz',owner),target,{recursive:true,filter:source=>!['node_modules','.git','.codeitz','.env'].includes(path.basename(source))&&!path.basename(source).startsWith('.env.')});
  if(owner!=='mcp-governance')await symlink(path.join('/opt/codebiz',owner,'node_modules'),path.join(target,'node_modules'));
 }
 await writeFile(marker,'Persistent editable workspace. Application updates do not overwrite these files.\n',{flag:'wx'});
}
// The audit inventory includes this scaffold even before it has an implementation.
const databaseManager=path.join(root,'infrastructure/database-manager');
try{await access(databaseManager);}catch(error){
 if(error.code!=='ENOENT')throw error;
 await cp('/opt/codebiz/infrastructure/database-manager',databaseManager,{recursive:true,filter:source=>!['node_modules','.git','.codeitz','.env'].includes(path.basename(source))&&!path.basename(source).startsWith('.env.')});
}
for(const folder of ['contracts','src/api/modules','src/web/modules','tests','docs'])await mkdir(path.join(databaseManager,folder),{recursive:true});
