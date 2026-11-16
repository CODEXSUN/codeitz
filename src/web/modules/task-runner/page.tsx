import { useEffect, useState } from 'react';
import { ArrowRight, Plus, Sparkles } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, NativeSelect, NativeSelectOption, Textarea } from '@workspace/ui';
import { activeTaskStatuses } from '../../../../contracts/task';
import type { Product } from '../../../../contracts/audit';
import { taskRequest, useTasks } from './use-tasks';
import { TaskProgress, WorkerPanel } from './components/activity';
import { CompletionReview } from './components/completion-review';
import { TaskDetail } from './components/task-detail';

export function TaskRunnerPage({ initialTaskId = '', onHistory }: { initialTaskId?: string; onHistory: () => void }) {
  const { tasks, connection, error: streamError } = useTasks();
  const [products, setProducts] = useState<Product[]>([]);
  const [owner, setOwner] = useState('');
  const [goal, setGoal] = useState('');
  const [selected, setSelected] = useState(initialTaskId);
  const [composing, setComposing] = useState(false);
  const [codex, setCodex] = useState<{ signedIn: boolean; message: string } | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const task = tasks.find(task => task.id === selected);
  const workerTask = tasks.find(task => activeTaskStatuses.includes(task.status));
  const busy = sending || !!workerTask;
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/tasks/setup', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Task runner setup unavailable.');
      const setup = await response.json(); setProducts(setup.products); setCodex(setup.codex); const requestedOwner = new URLSearchParams(window.location.search).get('owner');
      setOwner(setup.products.some((product: Product) => product.owner === requestedOwner) ? requestedOwner! : setup.products[0]?.owner ?? '');
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selected && tasks.length && !composing) setSelected((workerTask ?? tasks.find(task => !task.archivedAt && !task.droppedAt))?.id ?? '');
  }, [tasks, selected, composing, workerTask]);
  async function action(step?: 'plan' | 'code' | 'check') {
    if (busy) return;
    setSending(true); setError('');
    try {
      const result = await taskRequest(step ? `/api/tasks/${selected}/step` : '/api/tasks', step ? { action: step } : { owner, goal });
      setSelected(result.id); setComposing(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Task request failed.'); }
    finally { setSending(false); }
  }
  const showForm = composing || !task;
  return <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">Codeitz workspace</p><h1 className="text-2xl font-semibold tracking-tight">Task runner</h1></div><div className="flex items-center gap-2"><Badge variant="outline">{codex?.signedIn ? 'Local Codex connected' : 'Check connection in Settings'}</Badge><Button variant="outline" disabled={busy} onClick={() => { setComposing(true); setSelected(''); }}><Plus size={15}/> New task</Button></div></header>
    {(error || streamError) && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error || streamError}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        {showForm ? <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles size={18}/> What should we work on?</CardTitle><p className="text-sm text-muted-foreground">Choose an app and one small goal. Review the plan before coding.</p></CardHeader><CardContent className="space-y-5"><label className="grid gap-2 text-sm font-medium">Application<NativeSelect value={owner} disabled={busy} onChange={event => setOwner(event.target.value)}>{products.map(product => <NativeSelectOption key={product.owner} value={product.owner}>{product.owner}</NativeSelectOption>)}</NativeSelect></label><label className="grid gap-2 text-sm font-medium">Goal<Textarea value={goal} disabled={busy} onChange={event => setGoal(event.target.value)} maxLength={3000} rows={5} placeholder="Describe the result you want to achieve…"/></label><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Governance and latest work records are read first.</p><Button disabled={busy || !owner || !goal.trim() || !codex?.signedIn || connection !== 'live'} onClick={() => void action()}>Create plan <ArrowRight size={15}/></Button></div></CardContent></Card> : <>
          <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline">{task.owner}</Badge><span className="text-xs text-muted-foreground">{new Date(task.createdAt).toLocaleString()}</span></div><CardTitle className="line-clamp-3 text-lg leading-relaxed">{task.goal}</CardTitle>{task.goal.length > 200 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Read full goal</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed">{task.goal}</p></details>}</CardHeader><CardContent><TaskProgress task={task}/><div className="mt-6 flex flex-wrap items-center gap-3">{task.status === 'draft' && <Button disabled={busy || !codex?.signedIn || connection !== 'live'} onClick={() => void action('plan')}>Create follow-up plan <ArrowRight size={15}/></Button>}{task.status === 'planned' && <Button disabled={busy || !codex?.signedIn || connection !== 'live'} onClick={() => void action('code')}>Approve & start coding <ArrowRight size={15}/></Button>}{task.status === 'coded' && <Button disabled={busy || connection !== 'live'} onClick={() => void action('check')}>Run app checks <ArrowRight size={15}/></Button>}{activeTaskStatuses.includes(task.status) && <p className="text-sm text-muted-foreground">Worker is running. Activity appears on the right.</p>}{task.status === 'completed' && <p className="text-sm text-primary">{task.review?.decision === 'accepted' ? 'Result accepted.' : task.review?.decision === 'changes_requested' ? 'Changes requested. Open the linked follow-up below.' : 'Checks passed. Ready for your review.'}</p>}<Button variant="ghost" onClick={onHistory}>View task records</Button></div></CardContent></Card>
          <CompletionReview key={task.id} task={task} disabled={busy || connection !== 'live'} onOpen={id => { setSelected(id); setComposing(false); }}/>
          <Card><CardContent className="pt-2"><TaskDetail key={`${task.id}-${task.status}`} task={task}/></CardContent></Card>
        </>}
      </div>
      <aside className="xl:sticky xl:top-6"><WorkerPanel task={task ?? workerTask} workerTask={workerTask} connection={connection}/></aside>
    </div>
  </main>;
}
