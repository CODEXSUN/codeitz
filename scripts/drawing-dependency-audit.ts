import type {Plugin} from 'vite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const allowed:Record<string,readonly string[]>={nanoid:['3.3.20','5.1.16'],'lodash-es':['4.18.1'],katex:['0.18.10']};
// Check the emitted browser graph; a server-only npm audit cannot cover producer imports.
export function drawingDependencyAudit():Plugin {
 return {name:'codeitz-drawing-dependency-audit',generateBundle(_options,bundle){
  const entries:{file:string;id:string;package:string;version:string;renderedLength:number}[]=[];
  for(const chunk of Object.values(bundle)){
   if(chunk.type!=='chunk')continue;
   for(const[id,info]of Object.entries(chunk.modules)){
    if(!info.renderedLength||!/[\\/]node_modules[\\/](?:nanoid|lodash-es|katex)[\\/]/.test(id))continue;
    let dir=path.dirname(id.replaceAll('\0','').split('?')[0]);
    while(path.dirname(dir)!==dir){
     const file=path.join(dir,'package.json');
     if(existsSync(file)){const pkg=JSON.parse(readFileSync(file,'utf8')) as {name:string;version:string};
      if(pkg.name in allowed){if(!allowed[pkg.name]!.includes(pkg.version))this.error('Unreviewed emitted drawing dependency: '+pkg.name+'@'+pkg.version);
       entries.push({file:chunk.fileName,id,package:pkg.name,version:pkg.version,renderedLength:info.renderedLength});break;}}
     dir=path.dirname(dir);
    }
   }
  }
  for(const[name,versions]of Object.entries(allowed))for(const version of versions)if(!entries.some(entry=>entry.package===name&&entry.version===version))this.error('Drawing graph evidence missing: '+name+'@'+version);
  const root=fileURLToPath(new URL('../.codeitz/',import.meta.url));mkdirSync(root,{recursive:true});writeFileSync(path.join(root,'drawing-module-graph.json'),JSON.stringify(entries,null,2)+'\n');
  console.log('Drawing graph verified: Nanoid3.3.20/5.1.16, lodash-es4.18.1, KaTeX0.18.10.');
 }};
}
