import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access,open,rename,unlink} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),workspace=path.resolve(root,'../..');
const args=process.argv.slice(2),mode=args.shift();
let envFile=path.join(root,'.codeitz/docker/deploy.env'),check=false,resume=false,project,port;
for(let i=0;i<args.length;i++){
 const key=args[i];if(key==='--env')envFile=path.resolve(args[++i]??'');else if(key==='--check')check=true;else if(key==='--resume')resume=true;else if(key==='--project')project=args[++i];else if(key==='--port')port=args[++i];else if(key==='--help'){console.log('node .container/deploy.mjs setup|update|verify [--env path] [--check] [--project name --port number (first setup only)]');process.exit(0);}else throw new Error('Unknown deployment option: '+key);
}
if(resume&&mode!=='setup')throw new Error('--resume is only for an interrupted first setup.');
if(!['setup','update','verify'].includes(mode))throw new Error('Choose setup, update or verify.');
if(envFile===path.join(root,'.env')||envFile===path.join(root,'.env.example'))throw new Error('Development environment files cannot be used for deployment.');
let config;
try{config=parseEnv(await readFile(envFile,'utf8'));if(project||port)throw new Error('Existing configuration is retained. Use a different --env file for a separate deployment.');}
catch(error){if(error.code!=='ENOENT')throw error;if(mode!=='setup'||check)throw new Error('Deployment configuration does not exist. Run setup first.');
 config={COMPOSE_PROJECT_NAME:project??'codeitz-docker-local',HOST_PORT:port??'4410',CODEITZ_IMAGE:'codeitz-runtime:'+JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version,NODE_IMAGE:'node:26.13.1-bookworm-slim',POSTGRES_IMAGE:'postgres:17',NGINX_IMAGE:'nginx:1.28-alpine',CODEX_CLI_VERSION:'0.169.0-alpha.11.1',POSTGRES_PASSWORD:randomBytes(24).toString('hex'),CODEITZ_DB_PASSWORD:randomBytes(24).toString('hex')};
 await mkdir(path.dirname(envFile),{recursive:true});await writeFile(envFile,serialize(config),{mode:0o600,flag:'wx'});
}
function serialize(values){return Object.entries(values).map(([key,value])=>{if(!/^[A-Z][A-Z0-9_]*$/.test(key)||/[\r\n\0]/.test(value))throw new Error('Invalid deployment setting.');return `${key}=${JSON.stringify(value)}`;}).join('\n')+'\n';}
if(!/^[a-z][a-z0-9-]{2,40}$/.test(config.COMPOSE_PROJECT_NAME)||!/^\d+$/.test(config.HOST_PORT)||+config.HOST_PORT<1024||+config.HOST_PORT>65535||config.HOST_PORT==='4310')throw new Error('Use a valid isolated project name and port (development port 4310 is reserved).');
if(!config.POSTGRES_PASSWORD||!config.CODEITZ_DB_PASSWORD)throw new Error('Deployment database passwords are required.');
for(const owner of ['devkit/codeitz','foundation/framework','packages/ui','mcp-governance','infrastructure/database-manager'])await access(path.join(workspace,owner));
const environment={...process.env,...config};
function command(args,{image,stdio='inherit',input}={}){
 const result=spawnSync('docker',args,{cwd:root,env:{...environment,...(image?{CODEITZ_IMAGE:image}:{})},stdio,input,windowsHide:true,maxBuffer:4*1024*1024});
 if(result.error||result.status!==0)throw new Error('Docker command failed: '+args.slice(0,3).join(' '));return result;
}
const composeBase=['compose','--env-file',envFile,'--project-name',config.COMPOSE_PROJECT_NAME,'-f',path.join(root,'.container/compose.yml')];
const compose=(args,options)=>command([...composeBase,...args],options);
const capture=args=>compose(args,{stdio:['ignore','pipe','pipe']}).stdout.toString().trim();
if(command(['info','--format','{{.OSType}}'],{stdio:['ignore','pipe','pipe']}).stdout.toString().trim()!=='linux')throw new Error('Select a Linux Docker engine.');compose(['config','--quiet']);
async function verify(){
 const base=`http://127.0.0.1:${config.HOST_PORT}`;
 for(const route of ['/api/health','/dashboard','/projects','/task-records','/agent-chat','/api/docs','/api/v1/projects','/api/v1/tasks','/api/v1/chats','/api/v1/todos']){
  const response=await fetch(base+route,{signal:AbortSignal.timeout(20000)});if(response.status!==200)throw new Error(`Deployment check failed: ${route} (${response.status})`);
 }
 const foreign=await fetch(base+'/api/v1/tasks',{headers:{Origin:'https://example.invalid'},signal:AbortSignal.timeout(10000)});if(foreign.status!==403)throw new Error('Local same-origin protection failed.');
 console.log(`Codeitz verified at ${base}: pages, PostgreSQL APIs and cross-origin denial passed.`);
}
if(mode==='verify'){await verify();process.exit(0);}
if(check){console.log('Deployment configuration and Docker checked. No changes made.');process.exit(0);}
const lockFile=envFile+'.lock';let lock;
try{lock=await open(lockFile,'wx',0o600);}catch{throw new Error('Deployment is locked. Inspect the existing operation before retrying.');}
let stopped=false,migrationStarted=false;
try{
 const stateFile=envFile+'.release.json';let previous;
 try{previous=JSON.parse(await readFile(stateFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(mode==='setup'){
  const volume=spawnSync('docker',['volume','inspect',config.COMPOSE_PROJECT_NAME+'_pgdata'],{stdio:'ignore',windowsHide:true});
  const retained=volume.status===0||!!capture(['ps','-aq']);
  if(previous||retained&&!resume)throw new Error('Retained deployment data exists. Use update, or setup --resume for an interrupted initial installation.');
  if(resume&&!retained)throw new Error('--resume requires an existing initial deployment.');
 }else{
  if(!previous)throw new Error('No successful deployment record. Inspect the existing deployment before updating.');
  if(previous.postgresImage!==config.POSTGRES_IMAGE)throw new Error('PostgreSQL image changes require a separately reviewed database upgrade.');
 }
 const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
 const release=version+'-'+new Date().toISOString().replace(/\D/g,'').slice(0,14)+'-'+randomBytes(3).toString('hex'),image=config.COMPOSE_PROJECT_NAME+':'+release;
 console.log('Building Codeitz '+release+' from the current workspace. No Git fetch, commit or push.');
 compose(['build','app'],{image});
 if(mode==='setup')compose(['up','-d','--wait','--wait-timeout','180','database']);
 if(mode==='update'||resume){
  const active=capture(['exec','-T','database','sh','-c',`PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select (select count(*) from codeitz.coding_tasks where body::jsonb->>'status' in ('planning','coding','checking'))+(select count(*) from codeitz.agent_messages where body::jsonb->>'status'='running')"`]);
  if(active!=='0')throw new Error('A worker is active. Stop or finish it before updating.');
  compose(['stop','gateway','app']);stopped=true;
  const backupDir=path.join(path.dirname(envFile),'backups');await mkdir(backupDir,{recursive:true});
  const backup=path.join(backupDir,release+'.dump'),descriptor=openSync(backup,'wx',0o600);
  try{compose(['exec','-T','database','sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],{stdio:['ignore',descriptor,'pipe']});}finally{closeSync(descriptor);}
  const reader=openSync(backup,'r');try{compose(['exec','-T','database','pg_restore','--list'],{stdio:[reader,'ignore','pipe']});}finally{closeSync(reader);}
  const checksum=createHash('sha256').update(await readFile(backup)).digest('hex');
  await writeFile(backup+'.json',JSON.stringify({sha256:checksum,previousImage:previous?.image??'initial setup recovery',createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Verified PostgreSQL backup saved: '+backup);
 }
 migrationStarted=true;compose(['run','--rm','--no-deps','migrate'],{image});
 if(mode==='setup')compose(['run','--rm','--no-deps','seed'],{image});
 compose(['up','-d','--no-build','--no-deps','--wait','--wait-timeout','180','app'],{image});
 compose(['up','-d','--no-deps','--wait','--wait-timeout','120','gateway'],{image});
 await verify();
 config.CODEITZ_IMAGE=image;await writeFile(envFile+'.next',serialize(config),{mode:0o600});await rename(envFile+'.next',envFile);
 await writeFile(stateFile,JSON.stringify({image,previousImage:previous?.image??null,version,postgresImage:config.POSTGRES_IMAGE,deployedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
 console.log('Deployment complete. Workspace and PostgreSQL volumes are retained.');
}catch(error){
 if(stopped&&!migrationStarted)try{compose(['up','-d','--no-build','--no-deps','app','gateway']);}catch{}
 if(migrationStarted)console.error('Deployment did not finish. Retain PostgreSQL/workspace volumes and inspect migration/health output before recovery. No automatic database rollback was performed.');
 throw error;
}finally{await lock.close();await unlink(lockFile);}
