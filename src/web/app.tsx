import { TodosPage } from './modules/todos/page';
import { lazy, Suspense, useEffect, useState } from 'react';
import { AsyncState, ContentBoundary } from '@workspace/ui/blocks/async-state';
import { navigate, useLocation } from './navigation';
import { RefreshCw, GitBranch, Bot, ClipboardList, FolderKanban, LayoutDashboard, ListTodo, MessagesSquare, Palette, Plug, Settings2, ShieldCheck } from 'lucide-react';
import { AgentWorkspace } from '@workspace/ui/layouts/agent-workspace';
import { MainLayout } from '@workspace/ui/layouts/main-layout';
import packageInfo from '../../package.json';
import { AuditPage } from './modules/governance-audit/page';
import { TaskRunnerPage } from './modules/task-runner/page';
import { TaskRecordsPage } from './modules/task-runner/records';
import { SettingsPage } from './modules/task-runner/settings';
import { useTaskStatus } from './modules/task-runner/use-tasks';

const SyncPage=lazy(()=>import('./modules/sync/page').then(module=>({default:module.SyncPage})));
const ProjectsPage = lazy(() => import('./modules/projects/page').then(module => ({ default: module.ProjectsPage })));
const WorkTasksPage = lazy(() => import('./modules/business/task/page').then(module => ({ default: module.WorkTasksPage })));
const TodoCategoriesPage = lazy(() => import('./modules/todos/categories').then(module => ({ default: module.TodoCategoriesPage })));
const DashboardPage = lazy(() => import('./modules/dashboard/page').then(module => ({ default: module.DashboardPage })));
const AgentChatPage = lazy(() => import('./modules/agent-chat/page').then(module => ({ default: module.AgentChatPage })));

export function Application() {
  const location = useLocation();
  const [projectHeader, setProjectHeader] = useState<import('./modules/projects/page').ProjectHeader | null>(null);
  const [categoryHeader, setCategoryHeader] = useState<import('react').ReactNode>(null);
  const [auditHeader,setAuditHeader]=useState<import('react').ReactNode>(null);
  const [workHeader, setWorkHeader] = useState<import('react').ReactNode>(null);
  const { page, taskId } = location;
  useEffect(() => { navigate(location.canonical, true); }, [location.canonical]);
  const setPage = (page: 'work-tasks' | 'todo-categories' | 'dashboard' | 'tasks' | 'records' | 'audit' | 'settings' | 'todos' | 'agent-chat') => navigate(({ 'work-tasks': '/work-tasks', 'todo-categories': '/todos/categories', dashboard: '/dashboard', tasks: '/tasks/new', records: '/task-records', audit: '/governance-audit', settings: '/settings/appearance', todos: '/todos', 'agent-chat': '/agent-chat' })[page]);
  const status = useTaskStatus();
  const labels = { sync:'Sync', projects: 'Projects', github: 'GitHub Manager', 'work-tasks': 'Tasks', 'todo-categories': 'Todo categories', dashboard: 'Dashboard', tasks: 'Task runner', records: 'Task records', audit: 'Governance audit', settings: 'Settings', todos: 'Todos', 'agent-chat': 'Agent chat', missing: 'Page not found' };
  const workBreadcrumbs = [{ label: 'Tasks', href: '/work-tasks' }, ...(location.workMode === 'new' ? [{ label: 'New task' }] : location.workId ? [{ label: location.workId, href: '/work-tasks/' + location.workId }, ...(location.workMode === 'edit' ? [{label:'Edit'}] : [])] : [])].map((crumb, index, items) => ({ ...crumb, emphasis: index === items.length - 1 }));
  return <AgentWorkspace
    className="h-dvh w-full"
    primaryRail={{ label: 'Agent navigation rail', items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, active: page === 'dashboard', onSelect: () => setPage('dashboard') },
      { id: 'chat', label: 'Agent chat', icon: MessagesSquare, active: page === 'agent-chat', onSelect: () => setPage('agent-chat') },
      { id: 'work-tasks', label: 'Tasks', icon: ClipboardList, active: page === 'work-tasks', onSelect: () => setPage('work-tasks') },
      { id: 'todos', label: 'Todos', icon: ListTodo, active: page === 'todos', onSelect: () => setPage('todos') },
      { id: 'projects', label: 'Projects', icon: FolderKanban, active: page === 'projects', onSelect: () => navigate('/projects') },
      { id: 'github', label: 'GitHub Manager', icon: GitBranch, active: page === 'github', onSelect: () => navigate('/github-manager') },
    ], footerItems: [
      { id: 'settings', label: 'Settings', icon: Settings2, active: page === 'settings', onSelect: () => setPage('settings') },
    ] }}
    secondaryRail={{ label: 'Agent tools rail', items: [
      { id: 'records', label: 'Task records', icon: ClipboardList, active: page === 'records', onSelect: () => setPage('records') },
      { id:'sync',label:'Sync',icon:RefreshCw,active:page==='sync',onSelect:()=>navigate('/sync') },
      { id: 'audit', label: 'Governance audit', icon: ShieldCheck, active: page === 'audit', onSelect: () => setPage('audit') },
      { id: 'codex', label: 'Codex settings', icon: Plug, active: page === 'settings' && location.section === 'codex', onSelect: () => navigate('/settings/codex') },
    ], footerItems: [
      { id: 'appearance', label: 'Appearance settings', icon: Palette, active: page === 'settings' && location.section === 'appearance', onSelect: () => navigate('/settings/appearance') },
    ] }}
  ><MainLayout
    applicationName="Codeitz"
    className="h-dvh w-full"
    navigation={[
      { label: 'Workspace', items: [
        { label: labels.tasks, icon: LayoutDashboard, onSelect: () => setPage('tasks') },
        { label: labels.records, icon: ClipboardList, onSelect: () => setPage('records') },
        { label: labels['agent-chat'], icon: MessagesSquare, onSelect: () => setPage('agent-chat') },
        { label: labels['todo-categories'], icon: ListTodo, onSelect: () => setPage('todo-categories') },
        { label: labels.audit, icon: ShieldCheck, onSelect: () => setPage('audit') },
      ] },
    ]}
    appItems={[
      { title: 'Codeitz', description: 'Local coding workspace', icon: Bot, active: true, url: '/' },

    ]}
    user={{ name: 'Local workspace', email: '', fallback: 'CZ' }}
    selectedPage={labels[page]}
    homeHref="/dashboard"
    headerActions={page === 'projects' || page === 'github' ? projectHeader?.actions : page === 'work-tasks' ? workHeader : page === 'todo-categories' ? categoryHeader : page === 'audit' ? auditHeader : undefined}
    headerClassName={page === 'work-tasks' && (location.workMode === 'new' || location.workMode === 'edit') ? 'pr-4 sm:pr-[5%]' : undefined}
    headerBreadcrumbs={page === 'projects' || page === 'github' ? projectHeader?.breadcrumbs ?? [{ label: labels[page] }] : page === 'work-tasks' ? workBreadcrumbs : page === 'settings' ? [{ label: 'Settings', href: '/settings/appearance' }, { label: location.section[0].toUpperCase() + location.section.slice(1) }] : location.chatId ? [{ label: 'Agent chat', href: '/agent-chat' }, { label: location.chatId.slice(0,8) }] : taskId ? [{ label: labels[page], href: page === 'records' ? '/task-records' : '/tasks/new' }, { label: taskId.slice(0, 8) }] : [{ label: labels[page] }]}
    workspaceTitle="Codeitz"
    showOverview={false}
    headerName={null}
    onOverviewSelect={() => setPage('tasks')}
    onSettingsSelect={() => setPage('settings')}
    searchPlaceholder="Search Codeitz pages…"
    statusLabel={status}
    versionLabel={`v ${packageInfo.version}`}
  >
    {page === 'sync' ? <ContentBoundary resetKey={page}><Suspense fallback={<AsyncState loading>{null}</AsyncState>}><SyncPage/></Suspense></ContentBoundary> : page === 'projects' || page === 'github' ? <ContentBoundary resetKey={page}><Suspense fallback={<AsyncState loading loadingMessage="Loading workspace…">{null}</AsyncState>}><ProjectsPage onHeader={setProjectHeader}/></Suspense></ContentBoundary> : page === 'work-tasks' ? <ContentBoundary resetKey={location.canonical}><Suspense fallback={<AsyncState loading loadingMessage="Loading tasks…">{null}</AsyncState>}><WorkTasksPage onHeader={setWorkHeader}/></Suspense></ContentBoundary> : page === 'todo-categories' ? <ContentBoundary resetKey={location.canonical}><Suspense fallback={<AsyncState loading loadingMessage="Loading categories…">{null}</AsyncState>}><TodoCategoriesPage onHeader={setCategoryHeader} /></Suspense></ContentBoundary> : page === 'dashboard' ? <ContentBoundary resetKey={location.canonical}><Suspense fallback={<AsyncState loading loadingMessage="Loading dashboard…">{null}</AsyncState>}><DashboardPage /></Suspense></ContentBoundary> : page === 'agent-chat' ? <ContentBoundary resetKey={location.canonical}><Suspense fallback={<AsyncState loading loadingMessage="Loading agent chat…">{null}</AsyncState>}><AgentChatPage /></Suspense></ContentBoundary> : page === 'todos' ? <TodosPage /> : page === 'tasks' ? <TaskRunnerPage key={taskId || 'new'} initialTaskId={taskId} onHistory={() => setPage('records')}/> : page === 'records' ? <TaskRecordsPage onOpen={id => { navigate(`/tasks/${id}`); }}/> : page === 'audit' ? <AuditPage onHeader={setAuditHeader} /> : page === 'settings' ? <SettingsPage /> : <main className="p-8"><h1>Page not found</h1><a href="/tasks/new">Open task runner</a></main>}
  </MainLayout></AgentWorkspace>;
}
