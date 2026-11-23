import { GlobalLoader } from '@workspace/ui/components/global-loader';
import {FormAnimatedTabs} from '@workspace/ui/blocks/form-controls/animated-tabs';
import {GitBranch,FolderGit2} from 'lucide-react';
import {RepositoryChangesPage} from './changes-page';
import {useEffect,useState,type ReactNode} from 'react';
import {Badge,Button,Card,CardContent} from '@workspace/ui';
import {MasterListToolbar,MasterListFilterMenu} from '@workspace/ui/blocks/data-table';
import type {RepositoriesOverview} from '../../../../contracts/github-manager';
import {loadRepositories} from './services';
import {navigate as go} from '../../navigation';
export function GitHubManagerPage({id,section,onHeaderChange}:{id?:string;section?:string;onHeaderChange:(content:ReactNode)=>void}){
 const [data,setData]=useState<RepositoriesOverview|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 async function check(){setBusy(true);setError('');try{setData(await loadRepositories());}catch(e){setError(e instanceof Error?e.message:'Status unavailable.');}finally{setBusy(false);}}
 useEffect(()=>{void check();},[]);
 const [search,setSearch]=useState('');
 const [statusFilter,setStatusFilter]=useState<string|null>(null);
 useEffect(()=>{onHeaderChange(id?null:<div className="flex items-center gap-3"><span className="hidden text-xs text-muted-foreground sm:block">{data?`${data.repositories.length} repositories · ${data.repositories.filter(item=>item.url).length} connected · ${data.repositories.filter(item=>item.state==='modified'||item.state==='conflict').length} with changes`: 'Checking repositories…'}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>void check()}>{<>{busy && <GlobalLoader/>}{'Check status'} </>}</Button></div>);},[data,busy,id,onHeaderChange]);
 if(id)return <RepositoryChangesPage id={id}/>;
 const requestedArea=new URLSearchParams(window.location.search).get('area');
 const area=['addons','apps','devkit','foundation','packages','infrastructure'].includes(requestedArea??'')?requestedArea!:'all';
 const areaRecords=(data?.repositories??[]).filter(item=>area==='all'||item.path===area||item.path.startsWith(`${area}/`));
 const filterOptions=[{id:'connected',label:'GitHub connected',matches:(item:typeof areaRecords[number])=>!!item.url},{id:'unconnected',label:'Not connected',matches:(item:typeof areaRecords[number])=>!item.url},...['clean','modified','conflict','error'].map(state=>({id:state,label:state.charAt(0).toUpperCase()+state.slice(1),matches:(item:typeof areaRecords[number])=>item.state===state}))];
 const activeFilter=filterOptions.find(option=>option.id===statusFilter);
 const filtered=areaRecords.filter(item=>!activeFilter||activeFilter.matches(item)).filter(item=>[item.name,item.path,item.url,item.branch,item.state,item.upstream].some(value=>value?.toLowerCase().includes(search.toLowerCase())));
 const areaTones:Record<string,string>={addons:'bg-violet-500',apps:'bg-blue-500',devkit:'bg-teal-500',foundation:'bg-amber-500',packages:'bg-pink-500',infrastructure:'bg-orange-500',all:'bg-slate-500'};
 const cards=<div className="space-y-4"><MasterListToolbar label="repositories" search={search} onSearchChange={setSearch} placeholder="Search repositories…"><MasterListFilterMenu selected={statusFilter} onChange={setStatusFilter} onClear={()=>setStatusFilter(null)} total={areaRecords.length} allLabel="All repositories" options={filterOptions.map(option=>({id:option.id,label:option.label,count:areaRecords.filter(option.matches).length}))}/></MasterListToolbar>
 <div className="space-y-2" aria-label="Git repositories">{filtered.map(item=><Card key={item.id} className="relative gap-0 py-0 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-ring motion-reduce:transform-none motion-reduce:transition-none"><CardContent className="space-y-2 px-4 py-3">
 <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${areaTones[item.path.split('/')[0]]??areaTones.all}`}/><FolderGit2 className="size-4 shrink-0 text-muted-foreground"/><a href={`/github-manager/${item.id}`} className="font-medium text-sm after:absolute after:inset-0 focus-visible:outline-none">{item.name}</a><span className="truncate text-xs text-muted-foreground">{item.path}</span></div><div className="flex items-center gap-2"><span className="flex items-center gap-1 text-xs text-muted-foreground"><GitBranch className="size-3.5"/>{item.branch}</span><Badge variant={item.state==='conflict'||item.state==='error'?'destructive':item.state==='clean'?'studio-success':'studio-warning'}>{item.state}</Badge><Button className="relative z-10" size="sm" variant="outline" onClick={()=>go(`/github-manager/${item.id}`)}>Commit & push</Button></div></div>
 <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-muted-foreground"><div className="min-w-0 space-y-1">{item.url?<a className="relative z-10 block break-all hover:underline" href={item.url} target="_blank" rel="noreferrer">{item.url} ↗</a>:<p>GitHub not connected</p>}<p>{item.upstream?[item.upstream,item.ahead>0?`${item.ahead} ahead`:null,item.behind>0?`${item.behind} behind`:null].filter(Boolean).join(' · '):'No tracking branch'}</p></div><dl className="flex flex-wrap gap-x-4 gap-y-1">{[['Staged',item.staged],['Modified',item.modified],['Untracked',item.untracked],['Conflicts',item.conflicts]].filter(([,value])=>Number(value)>0).map(([label,value])=><div key={label} className="flex items-center gap-1.5"><dt>{label}</dt><dd><Badge variant={label==='Conflicts'?'destructive':label==='Staged'?'studio-success':label==='Modified'?'studio-warning':'default'}>{value}</Badge></dd></div>)}</dl></div>
 {item.error&&<p className="text-xs text-destructive">{item.error}</p>}{item.filesTruncated&&<p className="text-xs text-muted-foreground">File preview limited to 200 paths.</p>}
 </CardContent></Card>)}</div>{!filtered.length&&<p role="status" className="py-6 text-center text-sm text-muted-foreground">{busy?<GlobalLoader/>:search?'No matching repositories.':'No repositories found.'}</p>}{data&&<p className="text-xs text-muted-foreground">Checked {new Date(data.checkedAt).toLocaleTimeString()}</p>}</div>;
 return <section className="space-y-3">
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {data?.warnings.map(message=><p key={message} className="text-sm text-muted-foreground">{message}</p>)}
 {!id?<FormAnimatedTabs label="Repository areas" value={area} onValueChange={value=>go(value==='all'?'/github-manager':`/github-manager?area=${value}`)} tabs={[
 ...[{value:'apps',label:'Apps'},{value:'addons',label:'Add-ons'},{value:'devkit',label:'Devkits'},{value:'foundation',label:'Foundations'},{value:'packages',label:'Packages'},{value:'infrastructure',label:'Infrastructure'},{value:'all',label:'All'}].map(tab=>({...tab,icon:<span aria-hidden="true" className={`size-2 rounded-full ${areaTones[tab.value]}`}/>,count:(data?.repositories??[]).filter(item=>tab.value==='all'||item.path===tab.value||item.path.startsWith(`${tab.value}/`)).length,content:cards})),
 ]}/>:null}
 {data&&<p className="text-xs text-muted-foreground">{data.syncNote}</p>}
 </section>;
}
