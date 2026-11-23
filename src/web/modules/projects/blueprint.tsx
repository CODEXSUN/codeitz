import { appFetch } from '../../platform-client';
import {useEffect,useState} from 'react';
import {Button,Badge} from '@workspace/ui';
import {AsyncState} from '@workspace/ui/blocks/async-state';
import {MasterListV1} from '@workspace/ui/blocks/data-table';
import {Download,RefreshCw} from 'lucide-react';
import type {ProjectBlueprint} from '../../../../contracts/blueprint';
import {go,projectPath} from './navigation';
export function BlueprintPage({owner}:{owner:string}){
 const [blueprint,setBlueprint]=useState<ProjectBlueprint>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 async function refresh(){setLoading(true);setError('');try{const response=await appFetch(`/api/v1/projects/${owner}/blueprint`);const data=await response.json();if(!response.ok)throw new Error(data.message??'Blueprint unavailable.');setBlueprint(data);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[owner]);
 function download(){if(!blueprint)return;const url=URL.createObjectURL(new Blob([JSON.stringify(blueprint,null,2)+'\n'],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=owner.replace('/','-')+'-blueprint.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Project blueprint</h2><p className="text-xs text-muted-foreground">Definitions for planning and coding. Coding approval remains in the task runner.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading} onClick={()=>void refresh()}><RefreshCw className="size-4"/>Check</Button><Button size="sm" disabled={!blueprint||loading} onClick={download}><Download className="size-4"/>Export JSON</Button></div></div>
 <AsyncState loading={loading&&!blueprint} error={error} onRetry={refresh}>{blueprint&&<div className="space-y-4"><div className="flex flex-wrap items-center gap-3 text-sm"><Badge variant="outline">{blueprint.readyForCoding?'Definitions complete':`${blueprint.issues.length} details need attention`}</Badge><span className="text-muted-foreground">{blueprint.modules.length} modules · {blueprint.modules.reduce((n,m)=>n+m.spec.apiRoutes.length,0)} APIs · {blueprint.modules.reduce((n,m)=>n+m.spec.tables.length,0)} tables</span></div>
 <MasterListV1 label="Blueprint modules" data={blueprint.modules} getRowId={m=>m.id} onOpen={m=>go(projectPath(owner,'modules',m.id))} openOnRowClick columns={[{id:'name',label:'Module',value:m=>m.title},{id:'code',label:'Code',value:m=>m.spec.code},{id:'approval',label:'Owner approval',value:m=>m.approval?.current?'Approved':m.approval?'Needs reapproval':'Not approved'},{id:'revision',label:'Revision',value:m=>m.revision},{id:'issues',label:'Missing details',value:m=>blueprint.issues.filter(i=>i.moduleId===m.id).length}]}/>
 {!!blueprint.issues.length&&<MasterListV1 label="Details to complete" data={blueprint.issues.map((issue,index)=>({...issue,id:String(index)}))} getRowId={i=>i.id} columns={[{id:'module',label:'Module',value:i=>i.module},{id:'section',label:'Section',value:i=>i.section},{id:'field',label:'Field',value:i=>i.path},{id:'message',label:'Needed',value:i=>i.message}]} onOpen={i=>go(i.moduleId?projectPath(owner,'modules',i.moduleId)+(i.section==='details'?'':'/'+i.section):projectPath(owner,'modules'))} openOnRowClick/>}
 </div>}</AsyncState></div>;
}
