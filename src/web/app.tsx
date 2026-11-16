import { useState } from 'react';
import { Bot, ClipboardList, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react';
import { Button } from '@workspace/ui';
import { AuditPage } from './modules/governance-audit/page';
import { TaskRunnerPage } from './modules/task-runner/page';
import { TaskRecordsPage } from './modules/task-runner/records';
import { SettingsPage } from './modules/task-runner/settings';

export function Application() {
  const [page, setPage] = useState<'tasks' | 'records' | 'audit' | 'settings'>(() => new URLSearchParams(window.location.search).get('view') === 'records' ? 'records' : 'tasks');
  const [taskId, setTaskId] = useState(() => new URLSearchParams(window.location.search).get('task') ?? '');
  const navigation = [
    { id: 'tasks', label: 'Task runner', icon: LayoutDashboard },
    { id: 'records', label: 'Task records', icon: ClipboardList },
    { id: 'audit', label: 'Governance audit', icon: ShieldCheck },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;
  return <div className="min-h-screen bg-background font-sans text-foreground md:flex">
    <aside className="border-b border-border bg-card p-4 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
      <div className="mb-8 mt-2 flex items-center gap-3 px-3"><span className="rounded-xl bg-primary p-2 text-primary-foreground"><Bot size={22}/></span><div><p className="text-lg font-semibold tracking-tight">Codeitz</p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Coding workspace</p></div></div>
      <nav aria-label="Codeitz" className="flex flex-wrap gap-2 md:flex-col">{navigation.map(({ id, label, icon: Icon }) => <Button key={id} className="justify-start gap-3" variant={page === id ? 'secondary' : 'ghost'} aria-pressed={page === id} onClick={() => setPage(id)}><Icon size={17}/>{label}</Button>)}</nav>
      <a href="http://127.0.0.1:4312" className="mt-6 flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">Project Manager ↗</a>
      <div className="mt-8 border-t border-border px-3 pt-4 text-xs leading-relaxed text-muted-foreground">Local Codex session<br/>One step at a time</div>
    </aside>
    <div className="min-w-0 flex-1">{page === 'tasks' ? <TaskRunnerPage initialTaskId={taskId} onHistory={() => setPage('records')}/> : page === 'records' ? <TaskRecordsPage onOpen={id => { setTaskId(id); setPage('tasks'); }}/> : page === 'audit' ? <AuditPage /> : <SettingsPage />}</div>
  </div>;
}
