import { ArrowUpRight, CheckCheck, CircleHelp, ListTodo, RefreshCw, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@workspace/ui';
import { Table, TableBody, TableCell, TableRow } from '@workspace/ui/components/table';
import { activeTaskStatuses } from '../../../../contracts/task';
import { useTasks } from '../task-runner/use-tasks';
import { navigate } from '../../navigation';
import { readDashboardSource, type DashboardSources } from './services';

export function DashboardPage() {
  const { tasks, connection, error } = useTasks();
  const [todos, setTodos] = useState<DashboardSources['todos'] | null>(null);
  const [chats, setChats] = useState<DashboardSources['chats'] | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [updated, setUpdated] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 10000); return () => clearInterval(timer); }, []);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); let busy = false;
    async function refresh() {
      if (busy) return; busy = true; setRefreshing(true);
      const results = await Promise.allSettled([
        readDashboardSource<DashboardSources['todos']>('/api/v1/todos', controller.signal),
        readDashboardSource<DashboardSources['chats']>('/api/v1/chats', controller.signal),
      ]);
      busy = false; if (controller.signal.aborted) return; setRefreshing(false);
      if (results[0].status === 'fulfilled') setTodos(results[0].value);
      if (results[1].status === 'fulfilled') setChats(results[1].value);
      setFailures(results.flatMap((result, index) => result.status === 'rejected' ? [index === 0 ? 'Todos and workspace projects' : 'Chat history'] : []));
      if (results.every(result => result.status === 'fulfilled')) { setUpdated(Date.now()); setClock(Date.now()); }
    }
    void refresh(); const timer = window.setInterval(() => void refresh(), 30000);
    const focus = () => void refresh(); window.addEventListener('focus', focus);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [reload]);

  const ageSeconds = updated === null ? 0 : Math.max(0, Math.floor((clock - updated) / 1000));
  const updatedLabel = updated === null ? 'Not updated yet' : ageSeconds < 60 ? 'Just now' : ageSeconds < 3600 ? `${Math.floor(ageSeconds / 60)} m ago` : ageSeconds < 86400 ? `${Math.floor(ageSeconds / 3600)} h ago` : `${Math.floor(ageSeconds / 86400)} d ago`;
  const current = tasks.filter(task => !task.archivedAt && !task.droppedAt);
  const active = current.filter(task => activeTaskStatuses.includes(task.status));
  const approvals = current.filter(task => task.status === 'planned' || task.status === 'completed' && !task.review);
  const attention = current.filter(task => task.status === 'failed' || task.status === 'coded');
  const openTodos = todos?.todos.filter(todo => todo.status !== 'done');
  const today = new Date(); const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const due = openTodos?.filter(todo => todo.dueDate && todo.dueDate <= date || todo.scheduledAt && new Date(todo.scheduledAt) <= today);
  const accepted = tasks.filter(task => task.review?.decision === 'accepted');
  const acceptedToday = accepted.filter(task => task.review?.reviewedAt && new Date(task.review.reviewedAt).toLocaleDateString() === today.toLocaleDateString());
  const taskValue = (count: number) => connection === 'live' && !error ? count : '—';
  const events = tasks.flatMap(task => (task.events ?? []).map(event => ({ ...event, id: `${task.id}:${event.id}`, owner: task.owner }))).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8);
  const metrics = [
    { href: '/todos', icon: ListTodo, border: 'border-l-sky-400 dark:border-l-sky-500', label: 'My open todos', value: openTodos?.length ?? '—', detail: 'Personal actions' },
    { href: '/task-records', icon: Workflow, border: 'border-l-violet-400 dark:border-l-violet-500', label: 'Agent work running', value: taskValue(active.length), detail: 'Active executions' },
    { href: '/task-records', icon: CircleHelp, border: 'border-l-amber-400 dark:border-l-amber-500', label: 'Awaiting my approval', value: taskValue(approvals.length), detail: 'Plans and results' },
    { href: '/task-records', icon: CheckCheck, border: 'border-l-emerald-400 dark:border-l-emerald-500', label: 'Accepted today', value: taskValue(acceptedToday.length), detail: 'Reviewed and accepted' },
  ];
  return <main className="mx-auto w-[calc(100%-2rem)] min-w-0 space-y-8 py-6 sm:w-[90%] sm:space-y-10 sm:py-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p><h1 className="mt-1 text-2xl font-semibold">My dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Focus, decisions and progress.</p></div><Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); setReload(value => value + 1); }} disabled={refreshing} aria-busy={refreshing} aria-label={`Refresh dashboard summary. Last updated: ${updatedLabel}`} title={updated ? `Refresh summary · ${new Date(updated).toLocaleString()}` : 'Refresh summary'} className="shrink-0 gap-1.5 text-xs text-muted-foreground"><RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true"/>{refreshing ? <span>Refreshing…</span> : updated ? <time dateTime={new Date(updated).toISOString()}>{updatedLabel}</time> : <span>{updatedLabel}</span>}</Button></header>

    {(failures.length > 0 || error) && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{failures.length > 0 ? `${failures.join(', ')} unavailable; previously loaded values may be stale. ` : ''}{error || (connection !== 'live' ? 'Task counts are unavailable while reconnecting.' : '')} Use the refresh icon above to retry.</p>}
    <section aria-label="Work summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <a key={metric.label} href={metric.href} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(metric.href); } }} className="group min-w-0 rounded-xl outline-none transition-transform duration-300 ease-out hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none" aria-label={`Open ${metric.label}`}><Card variant="default" className={`h-full gap-0 border-border border-l-4 bg-white py-4 shadow-sm transition-shadow duration-300 ease-out group-hover:shadow-lg group-focus-visible:shadow-lg motion-reduce:transition-none dark:bg-neutral-950 ${metric.border}`}><CardContent className="px-4"><dl><dt className="flex items-center gap-2 text-sm text-muted-foreground"><metric.icon className="size-4" aria-hidden="true"/>{metric.label}</dt><dd className="my-2 text-3xl font-medium tracking-tight">{metric.value}</dd><dd className="flex items-center justify-between gap-2 text-xs text-muted-foreground">{metric.detail}<ArrowUpRight className="size-4" aria-hidden="true"/></dd></dl></CardContent></Card></a>)}</section>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card variant="default" className="min-w-0 gap-4 bg-white shadow-sm dark:bg-neutral-950"><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle><a href="/todos" className="hover:underline">My actions</a></CardTitle><p className="ml-auto text-right text-sm text-muted-foreground">Personal workload</p></CardHeader><CardContent><Table aria-label="Personal action summary"><TableBody>{[
        ['All todos', todos?.todos.length ?? '—'], ['Open', todos?.todos.filter(todo => todo.status === 'open').length ?? '—'], ['In progress', todos?.todos.filter(todo => todo.status === 'in-progress').length ?? '—'], ['Due or overdue', due?.length ?? '—'], ['Completed', todos?.todos.filter(todo => todo.status === 'done').length ?? '—'],
      ].map(([label, value]) => <TableRow key={label}><TableCell className="px-0 py-2 text-muted-foreground">{label}</TableCell><TableCell className="px-0 py-2 text-right font-medium">{value}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      <Card variant="default" className="min-w-0 gap-4 bg-white shadow-sm dark:bg-neutral-950"><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle><a href="/task-records" className="hover:underline">Agent task actions</a></CardTitle><p className="ml-auto text-right text-sm text-muted-foreground">Current execution workload</p></CardHeader><CardContent><Table aria-label="Agent action summary"><TableBody>{[
        ['All current executions', taskValue(current.length)], ['Working', taskValue(active.length)], ['Awaiting approval or review', taskValue(approvals.length)], ['Needs checks or failure review', taskValue(attention.length)], ['Accepted overall', taskValue(accepted.length)],
      ].map(([label, value]) => <TableRow key={label}><TableCell className="px-0 py-2 text-muted-foreground">{label}</TableCell><TableCell className="px-0 py-2 text-right font-medium">{value}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
    <Card variant="default" className="min-w-0 border-violet-200 bg-white shadow-none dark:border-violet-900 dark:bg-neutral-950"><CardHeader><CardTitle>Development pipeline</CardTitle><p className="text-sm text-muted-foreground">Current execution states.</p></CardHeader><CardContent><dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">{(['draft', 'planning', 'planned', 'coding', 'coded', 'checking', 'completed', 'failed'] as const).map(state => <div key={state} className="rounded-lg border border-violet-100 p-3 dark:border-violet-950"><dt className="text-xs capitalize text-muted-foreground">{state}</dt><dd className="mt-2 text-xl font-semibold">{taskValue(current.filter(task => task.status === state).length)}</dd></div>)}</dl><p className="mt-4 text-xs text-muted-foreground">{taskValue(accepted.length)} accepted overall · {taskValue(tasks.filter(task => !!task.archivedAt).length)} archived · {taskValue(tasks.filter(task => !!task.droppedAt).length)} dropped.</p></CardContent></Card>
    <Card variant="default" className="min-w-0 gap-4 bg-white shadow-sm dark:bg-neutral-950"><CardHeader><CardTitle>Latest worker activity</CardTitle><p className="text-sm text-muted-foreground">Saved changes, checks and execution updates</p></CardHeader><CardContent><Table className="table-fixed" aria-label="Latest worker activity"><TableBody>{events.map(event => <TableRow key={event.id}><TableCell className="w-2/3 px-0 py-2"><a href={`/tasks/${event.taskId}`} className="block truncate text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring" title={event.message}><span className="font-medium">{event.owner}</span> · {event.kind} · {event.message.replace(/\s+/g, ' ')}</a></TableCell><TableCell className="px-0 py-2 text-right text-xs text-muted-foreground"><time dateTime={event.time}>{new Date(event.time).toLocaleString()}</time></TableCell></TableRow>)}{!events.length && <TableRow><TableCell className="px-0 text-muted-foreground">No saved worker activity yet.</TableCell></TableRow>}</TableBody></Table><p className="mt-4 text-xs text-muted-foreground">{todos?.projects.length ?? '—'} local products · {chats?.conversations.length ?? '—'} recent chats (latest 100)</p></CardContent></Card>
    <Card variant="default" className="min-w-0 border-rose-200 bg-white shadow-none dark:border-rose-900 dark:bg-neutral-950"><CardHeader><CardTitle>My team</CardTitle><Badge variant="outline" className="w-fit">Planned coordination</Badge></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Maya', 'Supervisor', 'Clarify ideas, organize focus and request your decisions.'], ['Arun', 'Project lead', 'Maintain project context, assign tasks and review outcomes.'], ['Dev', 'Coding worker', 'Implement approved changes and report evidence.'], ['Tara', 'Verification worker', 'Verify completion criteria and report issues.']].map(([name, role, detail]) => <div key={name} className="rounded-lg border border-rose-100 p-4 dark:border-rose-950"><h3 className="font-medium">{name} <span className="text-xs text-muted-foreground">· {role}</span></h3><p className="mt-2 text-sm text-muted-foreground">{detail}</p><p className="mt-3 text-xs text-muted-foreground">Not active yet.</p></div>)}</CardContent></Card>
    <section aria-label="Planned personal summaries" className="grid gap-4 md:grid-cols-3">{[['Enquiries and goals', 'Ideas to approved tasks and accepted results.'], ['Personal growth and skills', 'Learning goals, practice and progress.'], ['Writing and daily review', 'Drafts, feedback and daily reflection.']].map(([title, detail]) => <Card key={title} variant="default" className="min-w-0 border-orange-200 bg-white shadow-none dark:border-orange-900 dark:bg-neutral-950"><CardHeader><CardTitle>{title}</CardTitle><Badge variant="outline" className="w-fit">Planned · no data yet</Badge></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{detail}</p></CardContent></Card>)}</section>
    <p className="text-xs leading-5 text-muted-foreground">Live summaries use saved records. Planned sections are not active yet.</p>
  </main>;
}
