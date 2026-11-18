import { parseLocation as parseProjectLocation } from './project-navigation.ts';
import { productCheckCatalog } from './audit.ts';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseLocation(value: string) {
  const url = new URL(value, 'http://localhost');
  const params = new URLSearchParams();
  const owner = url.searchParams.get('owner') ?? '';
  if (/^(apps|devkit)\/[a-z0-9-]+$/.test(owner) || owner === 'infrastructure/database-manager') params.set('owner', owner);
  const status = url.searchParams.get('status');
  if (status === 'archived' || status === 'dropped') params.set('status', status);
  const tab = url.searchParams.get('tab');
  if (tab === 'checks') params.set('tab', tab);
  const visibility = url.searchParams.get('visibility');
  if (visibility === 'private' || visibility === 'public') params.set('visibility', visibility);
  const project = url.searchParams.get('project');
  if (project && (/^(apps|devkit)\/[a-z0-9-]+$/.test(project) || project === 'infrastructure/database-manager')) params.set('project', project);
  const requestedChecks = url.searchParams.get('checks');
  if (requestedChecks !== null) {
    const valid = productCheckCatalog.filter(check => requestedChecks.split(',').includes(check.id)).map(check => check.id);
    if (valid.length !== productCheckCatalog.length) params.set('checks', valid.length ? valid.join(',') : 'none');
  }
  let page: 'sync' | 'projects' | 'github' | 'work-tasks' | 'todo-categories' | 'dashboard' | 'tasks' | 'records' | 'audit' | 'settings' | 'todos' | 'agent-chat' | 'missing' = 'missing';
  let syncConnectionId='';
  let chatId = '';
  let workId = ''; let workMode: 'list' | 'new' | 'show' | 'edit' = 'list';
  const workTabs = ['actions','comments','checkpoints','jobs','charges','schedules','properties','closure'];
  let taskId = ''; let section: 'application' | 'appearance' | 'codex' = 'appearance';
  let pathname = url.pathname;
  if (pathname === '/') {
    const oldId = url.searchParams.get('task') ?? '';
    pathname = url.searchParams.get('view') === 'records' ? '/task-records' : uuid.test(oldId) ? `/tasks/${oldId}` : url.searchParams.has('owner') ? '/tasks/new' : '/dashboard';
  }
  const route = pathname.split('/').filter(Boolean);
  if (route[0] === 'tasks' && route.length === 2 && (route[1] === 'new' || uuid.test(route[1]))) { page = 'tasks'; taskId = route[1] === 'new' ? '' : route[1]; }
  if (route[0] === 'task-records' && (route.length === 1 || route.length === 2 && uuid.test(route[1]))) { page = 'records'; taskId = route[1] ?? ''; }
  if ((pathname === '/agent-chat' || pathname.startsWith('/agent-chat/')) && (route.length === 1 || route.length === 2 && uuid.test(route[1]))) { page = 'agent-chat'; chatId = route[1] ?? ''; }
  if (page === 'agent-chat' && ['plan','review'].includes(url.searchParams.get('mode') ?? '')) params.set('mode', url.searchParams.get('mode')!);
  if (page === 'tasks') { params.delete('tab'); if (taskId && ['plan','results','activity'].includes(tab ?? '')) params.set('tab', tab!); }
  if (route[0] === 'work-tasks' && (route.length === 1 || route.length === 2 && (route[1] === 'new' || /^[a-z0-9]{8}$/.test(route[1])) || route.length === 3 && /^[a-z0-9]{8}$/.test(route[1]) && route[2] === 'edit')) {
    page = 'work-tasks'; workMode = route.length === 1 ? 'list' : route[1] === 'new' ? 'new' : route.length === 3 ? 'edit' : 'show'; workId = workMode === 'show' || workMode === 'edit' ? route[1] : '';
    if (workMode === 'show' && workTabs.includes(tab ?? '') && tab !== 'actions') params.set('tab', tab!); else params.delete('tab');
    if(workMode === 'list') for(const key of ['from','to']) { const value=url.searchParams.get(key); if(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value) params.set(key,value); }
  }
  if(pathname==='/sync'||route[0]==='sync'&&route[1]==='connections'&&route.length===3&&uuid.test(route[2])){page='sync';syncConnectionId=route[2]??'';if(['incoming','connections','queue','activity'].includes(tab??''))params.set('tab',tab!);else params.delete('tab');const entry=url.searchParams.get('entry');if(entry&&uuid.test(entry))params.set('entry',entry);}
  if (pathname === '/dashboard') page = 'dashboard';
  if (pathname === '/todos/categories') page = 'todo-categories';
  if (pathname === '/todos') page = 'todos';
  if (pathname === '/governance-audit') page = 'audit';
  if (route[0] === 'settings' && (route.length === 1 || route.length === 2 && ['application', 'appearance', 'codex'].includes(route[1]))) {
    page = 'settings'; section = (route[1] || 'appearance') as 'application' | 'appearance' | 'codex'; pathname = `/settings/${section}`;
  }
  for (const key of [...params.keys()]) if (!(page === 'sync' && ['tab','entry'].includes(key) || page === 'work-tasks' && (key === 'tab' && workMode === 'show' || ['from','to'].includes(key) && workMode === 'list') || key === 'owner' && (['tasks', 'records'].includes(page) || page === 'agent-chat' && !chatId) || key === 'mode' && page === 'agent-chat' || key === 'tab' && page === 'tasks' && !!taskId || key === 'status' && page === 'records' || ['tab', 'checks'].includes(key) && page === 'audit' || ['visibility', 'project'].includes(key) && page === 'todos')) params.delete(key);
  if (pathname === '/projects' || pathname.startsWith('/projects/') || pathname === '/github-manager' || pathname.startsWith('/github-manager/')) {
    const projectLocation = parseProjectLocation(value);
    if (projectLocation.page !== 'missing') {
      page = projectLocation.page === 'github' ? 'github' : 'projects'; params.forEach((_value,key)=>params.delete(key));
      if (page === 'projects' && ['apps','devkit'].includes(url.searchParams.get('area') ?? '')) params.set('area',url.searchParams.get('area')!);
      if (page === 'github') {
        const area = url.searchParams.get('area'); if (['apps','addons','devkit','foundation','packages','infrastructure'].includes(area ?? '')) params.set('area',area!);
        if (url.searchParams.get('group') === 'folder') params.set('group','folder');
        const file = url.searchParams.get('file'); if (file && file.length <= 2000 && !file.split(/[\\/]/).includes('..')) params.set('file',file);
      }
    }
  }
  if (page !== 'missing') pathname = '/' + pathname.split('/').filter(Boolean).join('/');
  const query = params.toString();
  return { page, syncConnectionId, chatId, workId, workMode, taskId, section, params, canonical: pathname + (query ? `?${query}` : '') };
}
