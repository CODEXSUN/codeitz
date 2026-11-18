import {fieldProblems} from '../../../../../contracts/field-definition.ts';
import {createHash} from 'node:crypto';
import type {ProjectBlueprint,BlueprintIssue} from '../../../../../contracts/blueprint.ts';
import type {Project} from '../../../../../contracts/projects.ts';
import type {ProjectModule} from '../../../../../contracts/modules.ts';

export function buildBlueprint(project:Project,modules:ProjectModule[]):ProjectBlueprint{
 const issues:BlueprintIssue[]=[];
 const names=new Set(modules.map(m=>m.spec.code));
 const tables=new Map(modules.flatMap(m=>m.spec.tables.map(t=>[t.name,t] as const)));
 const routes=new Set<string>(),codes=new Set<string>(),tableNames=new Set<string>();
 for(const module of modules){
  const spec=module.spec;
  const issue=(section:string,path:string,message:string)=>issues.push({moduleId:module.id,module:module.title,section,path,message});
  const required=(value:string,section:string,path:string)=>{if(!value.trim())issue(section,path,'Required detail is missing.');};
  const schema=(value:string,section:string,path:string)=>{if(!value.trim()){issue(section,path,'Define a JSON schema; use {} explicitly when no fields are needed.');return;}try{const parsed=JSON.parse(value);if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();}catch{issue(section,path,'Use a valid JSON object for the schema.');}};
  required(spec.code,'details','code');required(spec.owner,'details','owner');required(spec.responsibility,'details','responsibility');required(spec.version,'details','version');
  if(codes.has(spec.code))issue('details','code','Module code must be unique in this project.');codes.add(spec.code);
  if(!spec.apiRoutes.length&&!spec.actions.length&&!spec.events.length&&!spec.tables.length)issue('details','scope','Define at least one API, action, event or table before coding.');
  for(const [index,route]of spec.apiRoutes.entries()){
   const prefix=`apiRoutes[${index}]`;required(route.summary,'api-routes',prefix+'.summary');required(route.permission,'api-routes',prefix+'.permission');
   schema(route.requestSchema,'api-routes',prefix+'.requestSchema');schema(route.responseSchema,'api-routes',prefix+'.responseSchema');
   const key=route.method+' '+route.path.replace(/:[\w]+|\{[^}]+\}/g,'{parameter}');if(routes.has(key))issue('api-routes',prefix+'.path','Method/path conflicts with another project route.');routes.add(key);
  }
  for(const [index,action]of spec.actions.entries()){const p=`actions[${index}]`;required(action.description,'actions',p+'.description');required(action.permission,'actions',p+'.permission');schema(action.input,'actions',p+'.input');schema(action.output,'actions',p+'.output');}
  for(const [index,event]of spec.events.entries()){const p=`events[${index}]`;required(event.description,'events',p+'.description');schema(event.payload,'events',p+'.payload');}
  if(spec.tables.length&&!spec.dataScope)issue('details','dataScope','Choose app, tenant or master data ownership.');
  if(spec.tables.length&&!spec.databaseSchema)issue('details','databaseSchema','Confirm the owned PostgreSQL schema.');
  for(const [index,table]of spec.tables.entries()){
   const p=`tables[${index}]`;required(table.description,'tables',p+'.description');if(tableNames.has(table.name))issue('tables',p+'.name','Table name must have one owner in this project.');tableNames.add(table.name);
   if(!/^[a-z][a-z0-9_]*$/.test(table.name))issue('tables',p+'.name','Use a lowercase SQL table name.');
   if(!table.fields.length)issue('fields',p+'.fields','Add the fields this table needs.');
   if(table.fields.length&&!table.fields.some(f=>f.primary))issue('fields',p+'.fields','Choose the primary key fields.');
   for(const [n,field]of table.fields.entries()){
    const fp=p+`.fields[${n}]`;
    required(field.description,'fields',fp+'.description');
    if(field.indexed===undefined)issue('fields',fp+'.indexed','Confirm whether this field needs an index.');
    if(field.reference&&!field.onDelete)issue('fields',fp+'.onDelete','Choose reference delete behavior.');
    for(const problem of fieldProblems(field))issue('fields',fp+'.sqlType',problem);
    if(!/^[a-z][a-z0-9_]*$/.test(field.name))issue('fields',fp+'.name','Use a lowercase SQL column name.');
    if(!field.sqlType)issue('fields',fp+'.sqlType','Confirm the SQL type, including length or precision when required.');
    if(field.sqlType){const base=field.sqlType.toUpperCase().split('(')[0];const family=base==='BYTEA'?'BLOB':base==='TIMESTAMPTZ'?'TIMESTAMP':base==='JSONB'?'JSON':base==='NUMERIC'?'DECIMAL':base;if(family!==field.type)issue('fields',fp+'.sqlType','SQL type must match the selected field type.');}
    if(field.generation==='identity'&&field.defaultValue)issue('fields',fp+'.defaultValue','Identity fields cannot also declare a default.');
    if(field.generation===undefined)issue('fields',fp+'.generation','Choose identity or no generated identity.');
    if(field.generation==='identity'&&field.type!=='INTEGER')issue('fields',fp+'.generation','Identity generation requires an integer field.');
    if(field.reference){const parts=field.reference.split('.');const target=tables.get(parts.slice(0,-1).join('.'));if(!target?.fields.some(f=>f.name===parts.at(-1)))issue('fields',fp+'.reference','Reference must resolve to a recorded project table and field.');}
   }
  }
  for(const [index,dependency]of spec.dependencies.entries()){required(dependency.description,'dependencies',`dependencies[${index}].description`);required(dependency.contract,'dependencies',`dependencies[${index}].contract`);if(dependency.kind==='module'&&!names.has(dependency.name)&&!modules.some(m=>m.title.toLowerCase()===dependency.name.toLowerCase()||m.spec.code.split('.').at(-1)===dependency.name))issue('dependencies',`dependencies[${index}].name`,'Record the referenced module in this project.');}
 }
 if(!project.active)issues.push({moduleId:'',module:project.name,section:'modules',path:'project.active',message:'Activate the project before coding.'});
 if(!modules.length)issues.push({moduleId:'',module:project.name,section:'modules',path:'modules',message:'Add project modules before coding.'});
 const definition={project:{owner:project.owner,name:project.name,purpose:project.purpose,active:project.active},modules};
 return {format:'codeitz.project-blueprint',version:1,owner:project.owner,generatedAt:new Date().toISOString(),fingerprint:createHash('sha256').update(JSON.stringify(definition)).digest('hex'),readyForCoding:issues.length===0,ownerApproved:issues.length===0&&modules.length>0&&modules.every(module=>module.approval?.current===true),...definition,issues};
}
