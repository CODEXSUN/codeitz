import { RecordList } from '@workspace/ui/blocks/record-list';
import { useEffect, useState } from 'react';
import { navigate, setQuery, useLocation } from '../../navigation';
import { Archive, ArrowUpRight, ClipboardCheck, RotateCcw, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, NativeSelect, NativeSelectOption } from '@workspace/ui';
import { activeTaskStatuses, type TaskAudit } from '../../../../contracts/task';
import { TaskProgress, WorkerPanel } from './components/activity';
import { CompletionReview } from './components/completion-review';
import { TaskDetail } from './components/task-detail';
import { taskRequest, useTasks } from './use-tasks';

export function TaskRecordsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { tasks, connection, error: streamError } = useTasks();
  const location = useLocation();
  const filter = location.params.get('status') ?? 'current';
  const owner = location.params.get('owner') ?? '';
  const selected = location.taskId;
  const setFilter = (value: string) => { navigate('/task-records' + (value === 'current' ? '' : `?status=${value}`) + (owner ? `${value === 'current' ? '?' : '&'}owner=${encodeURIComponent(owner)}` : '')); };
  const setOwner = (value: string) => setQuery({ owner: value });
  const setSelected = (id: string) => navigate(`/task-records/${id}` + (location.params.size ? `?${location.params}` : ''));
  const [audit, setAudit] = useState<TaskAudit | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { setAudit(null); setMessage(''); }, [selected]);
  const visible = tasks.filter(task => !owner || task.owner === owner).filter(task => filter === 'dropped' ? !!task.droppedAt : filter === 'archived' ? !!task.archivedAt && !task.droppedAt : !task.archivedAt && !task.droppedAt);
  const task = tasks.find(task => task.id === selected);
  const finished = task && ['completed', 'failed'].includes(task.status);
  async function act(action: 'audit' | 'archive' | 'drop' | 'restore') {
    if (!task) return; setBusy(true); setMessage('');
    try {
      const result = await taskRequest(`/api/v1/tasks/${task.id}/${action === 'audit' ? 'audit' : 'manage'}`, action === 'audit' ? {} : { action });
      if (action === 'audit') setAudit(result);
      else { setAudit(null); setMessage(action === 'drop' ? 'Moved to Dropped. The task and its audit history can be restored.' : `Task ${action === 'archive' ? 'archived' : 'restored'}.`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Record action failed.'); }
    finally { setBusy(false); }
  }
  return <main className="workspace-list-content space-y-4">
    <header className="flex flex-wrap items-center justify-end gap-4"><label className="flex items-center gap-3 text-sm">View<NativeSelect value={filter} onChange={event => setFilter(event.target.value)}><NativeSelectOption value="current">Current</NativeSelectOption><NativeSelectOption value="archived">Archived</NativeSelectOption><NativeSelectOption value="dropped">Dropped</NativeSelectOption></NativeSelect></label></header>
    {owner && <div className="flex items-center gap-2 text-sm"><Badge variant="outline">{owner}</Badge><Button variant="ghost" size="sm" onClick={() => setOwner('')}>Show all projects</Button></div>}
    {(message || streamError) && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">{message || streamError}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle className="flex justify-between text-base">{filter === 'current' ? 'Current' : filter === 'archived' ? 'Archived' : 'Dropped'} tasks<Badge variant="outline">{visible.length}</Badge></CardTitle></CardHeader><CardContent className="space-y-2">
        <RecordList selected={selected} items={visible.map(item => ({ id: item.id, eyebrow: item.owner, title: item.goal, status: item.review?.decision === 'accepted' ? 'accepted' : item.review?.decision === 'changes_requested' ? 'changes requested' : item.status, time: new Date(item.createdAt).toLocaleString() }))} emptyMessage="No tasks in this view." onSelect={id => { setSelected(id); setAudit(null); setMessage(''); }}/>
      </CardContent></Card>
      {task ? <div className="min-w-0 space-y-5"><Card><CardHeader><CardTitle className="line-clamp-3 text-lg leading-relaxed">{task.goal}</CardTitle>{task.goal.length > 200 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Read full goal</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed">{task.goal}</p></details>}<p className="break-all font-mono text-xs text-muted-foreground">{task.id}</p></CardHeader><CardContent className="space-y-5"><TaskProgress task={task}/><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onOpen(task.id)}><ArrowUpRight size={14}/> Open in runner</Button><Button variant="outline" disabled={busy || activeTaskStatuses.includes(task.status)} onClick={() => void act('audit')}><ClipboardCheck size={14}/> Audit record</Button>{finished && (task.archivedAt || task.droppedAt ? <Button variant="outline" disabled={busy} onClick={() => void act('restore')}><RotateCcw size={14}/> Restore</Button> : <Button variant="outline" disabled={busy} onClick={() => void act('archive')}><Archive size={14}/> Archive</Button>)}{task.status === 'completed' && !task.droppedAt && <Button variant="ghost" disabled={busy} onClick={() => void act('drop')}><Trash2 size={14}/> Drop completed task</Button>}</div>
        {audit && <section className="rounded-lg border border-border p-4" aria-label="Record audit"><h2 className="mb-3 text-sm font-medium">{audit.passed ? 'Record audit passed' : 'Record needs review'}</h2><ul className="space-y-3">{audit.findings.map(finding => <li key={finding.label} className="text-sm"><span className={finding.passed ? 'text-primary' : 'text-destructive'}>{finding.passed ? '✓' : '!'} {finding.label}</span><p className="mt-1 text-xs text-muted-foreground">{finding.detail}</p></li>)}</ul><p className="mt-4 text-xs text-muted-foreground">Audits saved evidence. Does not rerun checks or prove business correctness.</p></section>}
        <CompletionReview key={task.id} task={task} onOpen={onOpen} disabled={busy || connection !== 'live'}/>
        <TaskDetail task={task}/>
      </CardContent></Card><WorkerPanel task={task} workerTask={tasks.find(task => activeTaskStatuses.includes(task.status))} connection={connection}/></div> : <Card><CardContent className="py-20 text-center"><ClipboardCheck className="mx-auto mb-4 text-muted-foreground" size={28}/><p className="text-sm text-muted-foreground">{selected ? connection === 'live' ? 'Task not found.' : 'Loading task…' : 'Choose a task to review its record.'}</p></CardContent></Card>}
    </div>
  </main>;
}
