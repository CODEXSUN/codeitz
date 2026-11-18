export const projectTabs = ['overview','notes','modules','tasks','review','architectures','whiteboards','schemas','changelog','blueprint'] as const;
export type ProjectTab = typeof projectTabs[number];
export type ProjectLocation = { page: 'projects'|'new'|'settings'|'project'|'github'|'missing'; owner?: string; tab: ProjectTab; record?: string; mode?: 'edit'|'new'; section?: string; subrecord?: string; area: 'all'|'apps'|'devkit' };
const namePattern=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function projectPath(owner: string, tab: string='overview', record?: string, mode?: string) {
  const [area,name]=owner.split('/');
  const root=`/projects/${area}-${name}`;
  return root+(tab==='overview'?'':`/${tab}`)+(record?`/${record}`:'')+(mode?`/${mode}`:'');
}
export function parseLocation(value: string): ProjectLocation {
  const url=new URL(value,'http://localhost');const parts=url.pathname.split('/').filter(Boolean);
  const area=url.searchParams.get('area');const common: Pick<ProjectLocation,'tab'|'area'>={tab:'overview' as ProjectTab,area:area==='apps'||area==='devkit'?area:'all' as const};
  if(url.pathname==='/github-manager')return {...common,page:'github'};
  if(parts[0]==='github-manager'&&parts.length===3&&/^[a-f0-9]{24}$/.test(parts[1])&&parts[2]==='changes')return {...common,page:'github',record:parts[1],section:'changes'};
  if(parts[0]==='github-manager'&&parts.length===2&&/^[a-f0-9]{24}$/.test(parts[1]))return {...common,page:'github',record:parts[1]};
  if(url.pathname==='/projects')return {...common,page:'projects'};
  if(url.pathname==='/projects/new')return {...common,page:'new'};
  if(url.pathname==='/settings/appearance')return {...common,page:'settings'};
  const match=parts[1]?.match(/^(apps|devkit)-(.+)$/);
  if(parts[0]!=='projects'||!match||!namePattern.test(match[2]))return {...common,page:'missing'};
  const tab=parts[2]??'overview';if(!projectTabs.includes(tab as ProjectTab))return {...common,page:'missing'};
  const tail=parts.slice(3);let record:string|undefined;let mode:'edit'|'new'|undefined;let section:string|undefined;let subrecord:string|undefined;
  if(tail[0]==='new'&&tail.length===1)mode='new';
  else if(tab==='modules'&&tail[0]&&uuid.test(tail[0])&&tail[1]&&['details','api-routes','actions','events','tables','fields','dependencies'].includes(tail[1])){record=tail[0];section=tail[1];if(tail[2]){if(!['tables','fields'].includes(section)||!uuid.test(tail[2]))return {...common,page:'missing'};subrecord=tail[2];}if(tail.length>3)return {...common,page:'missing'};}
  else if(tail.length){if(!uuid.test(tail[0])||tail.length>2||(tail[1]&&tail[1]!=='edit'))return {...common,page:'missing'};record=tail[0];if(tail[1])mode='edit';}
  if(mode==='new'&&['tasks','review'].includes(tab))return {...common,page:'missing'};
  if((record||mode)&&!['notes','modules','architectures','whiteboards','schemas','tasks','review'].includes(tab))return {...common,page:'missing'};
  return {...common,page:'project',owner:`${match[1]}/${match[2]}`,tab:tab as ProjectTab,record,mode,section,subrecord};
}
export function legacyPath(route: string) {
  if(route.startsWith('project/'))return projectPath(route.slice(8));
  return route==='github'?'/github-manager':route==='projects'?'/projects':route==='new'?'/projects/new':route==='settings'?'/settings/appearance':'/projects';
}
