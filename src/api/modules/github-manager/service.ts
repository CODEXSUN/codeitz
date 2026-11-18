import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {GitRepository,RepositoriesOverview,RepositoryFile} from '../../../../contracts/github-manager.ts';
const run=promisify(execFile);
const ignored=new Set(['node_modules','.git','dist','data','.cache','coverage','.next','.codex']);
export async function git(directory:string,args:string[],timeout=8000){return (await run('git',['--no-optional-locks','-c','core.fsmonitor=false','-C',directory,...args],{timeout,maxBuffer:4*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}})).stdout;}
export function githubUrl(raw:string):string|null{
 const value=raw.trim();const match=value.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
 return match?`https://github.com/${match[1]}/${match[2]}`:null;
}
export function parseStatus(output:string){
 const parts=output.split('\0');const files:RepositoryFile[]=[];let staged=0,modified=0,untracked=0,conflicts=0;
 for(let i=0;i<parts.length;i++){const line=parts[i];if(!line)continue;const index=line[0],worktree=line[1],file=line.slice(3);let previousPath:string|undefined;if(index==='R'||index==='C'||worktree==='R'||worktree==='C')previousPath=parts[++i];
 const conflict=['DD','AU','UD','UA','DU','AA','UU'].includes(index+worktree);if(conflict)conflicts++;else if(index==='?'&&worktree==='?')untracked++;else{if(index!==' '&&index!=='?')staged++;if(worktree!==' '&&worktree!=='?')modified++;}
 files.push({path:file,...(previousPath?{previousPath}:{}),index,worktree,status:conflict?'Conflict':index==='?'?'Untracked':index==='D'||worktree==='D'?'Deleted':previousPath?'Renamed':'Modified'});
 }return {files,staged,modified,untracked,conflicts};
}
export class GitHubManager{
 root:string;
 constructor(root:string){this.root=path.resolve(root);}
 async list():Promise<RepositoriesOverview>{
 const directories:string[]=[];const warnings:string[]=[];let visited=0;
 const walk=async(directory:string,depth:number):Promise<void>=>{if(++visited>3000){if(!warnings.includes('Discovery limit reached.'))warnings.push('Discovery limit reached.');return;}let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch{warnings.push(`Could not inspect ${path.relative(this.root,directory)||'workspace'}.`);return;}
 const marker=entries.find(entry=>entry.name==='.git');if(marker&&!marker.isSymbolicLink()){directories.push(directory);return;}if(depth>=4)return;
 for(const entry of entries){if(entry.isDirectory()&&!entry.isSymbolicLink()&&!ignored.has(entry.name)&&!entry.name.startsWith('.'))await walk(path.join(directory,entry.name),depth+1);}};
 await walk(this.root,0);const repositories:GitRepository[]=[];
 for(let offset=0;offset<directories.length;offset+=4){const batch=await Promise.all(directories.slice(offset,offset+4).map(async directory=>{
 const relative=path.relative(this.root,directory).replaceAll('\\','/')||'.';const base={id:createHash('sha256').update(relative).digest('hex').slice(0,24),name:path.basename(directory),path:relative,url:null,branch:'Unknown',upstream:null,ahead:0,behind:0,staged:0,modified:0,untracked:0,conflicts:0,files:[],filesTruncated:false};
 try{
 const marker=await lstat(path.join(directory,'.git'));if(marker.isSymbolicLink())return null;
 const rawRemotes=await git(directory,['config','--get-regexp','^remote\\..*\\.url$']).catch(()=> '');const remotes=rawRemotes.split(/\r?\n/).filter(Boolean);const urls=remotes.map(line=>({origin:line.startsWith('remote.origin.url '),url:githubUrl(line.slice(line.indexOf(' ')+1))})).filter(item=>item.url);const url=(urls.find(item=>item.origin)??urls[0])?.url??null;
 const [status,branch,upstream]=await Promise.all([git(directory,['status','--porcelain=v1','-z','--untracked-files=all']),git(directory,['symbolic-ref','--short','HEAD']).catch(()=> 'Detached HEAD'),git(directory,['rev-parse','--abbrev-ref','--symbolic-full-name','@{upstream}']).catch(()=> '')]);
 const parsed=parseStatus(status);const counts=upstream.trim()?await git(directory,['rev-list','--left-right','--count','HEAD...@{upstream}']).catch(()=> ''):'';const [ahead,behind]=counts.trim().split(/\s+/).map(Number);
 return {...base,...parsed,url,branch:branch.trim(),upstream:upstream.trim()||null,ahead:ahead||0,behind:behind||0,state:parsed.conflicts?'conflict':parsed.files.length?'modified':'clean',files:parsed.files.slice(0,200),filesTruncated:parsed.files.length>200} as GitRepository;
 }catch{return {...base,state:'error',error:'Repository status unavailable. Check local Git access.'} as GitRepository;}
 }));repositories.push(...batch.filter((item):item is GitRepository=>item!==null));}
 return {repositories:repositories.sort((a,b)=>a.path.localeCompare(b.path)),checkedAt:new Date().toISOString(),warnings,syncNote:'Ahead/behind uses locally cached tracking branches. No network fetch is performed.'};
 }
}
