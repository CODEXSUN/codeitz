import { appFetch } from '../../platform-client';
import { GlobalLoader } from '@workspace/ui/components/global-loader';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, ClipboardList, FileText, LoaderCircle, Plus } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, NativeSelect, NativeSelectOption, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@workspace/ui';
import { ActivityFeed } from '@workspace/ui/blocks/activity-feed';
import { CheckResults } from '@workspace/ui/blocks/check-results';
import { activeTaskStatuses, type CodingTask } from '../../../../contracts/task';
import type { Product } from '../../../../contracts/audit';
import { taskRequest, useTasks } from './use-tasks';
import { TaskProgress } from './components/activity';
import { CompletionReview } from './components/completion-review';
import { navigate, useLocation, setQuery } from '../../navigation';

const statusLabels: Record<CodingTask['status'], string> = { draft: 'Needs a plan', planning: 'Planning', planned: 'Plan ready', coding: 'Coding', coded: 'Ready for checks', checking: 'Checking', completed: 'Ready for review', failed: 'Needs attention' };
function nextStep(task: CodingTask) {
  if (task.status === 'draft') return ['Create a plan', 'Start with a read-only plan for this goal.'];
  if (task.status === 'planned') return ['Review the plan', 'Coding starts only when you approve it.'];
  if (task.status === 'coded') return ['Verify the changes', 'Run the app checks before accepting the result.'];
  if (task.status === 'completed') return [task.review?.decision === 'accepted' ? 'Result accepted' : task.review?.decision === 'changes_requested' ? 'Changes requested' : 'Review the result', task.review?.decision === 'changes_requested' ? 'Continue with the linked follow-up in Results.' : task.review ? 'The result and check evidence are saved.' : 'Check the outcome below, then accept it or request changes.'];
  if (task.status === 'failed') return ['Review what needs attention', 'The failure and any saved changes are available in Results.'];
  return [statusLabels[task.status], task.events?.at(-1)?.message || 'Activity updates appear as the worker runs.'];
}
export function TaskRunnerPage({ initialTaskId = '', onHistory }: { initialTaskId?: string; onHistory: () => void }) {
  const { tasks, connection, error: streamError } = useTasks();
  const [products, setProducts] = useState<Product[]>([]);
  const location = useLocation();
  const requestedOwner = location.params.get('owner') ?? '';
  const owner = products.some(product => product.owner === requestedOwner) ? requestedOwner : products[0]?.owner ?? '';
  const [goal, setGoal] = useState('');
  const [codex, setCodex] = useState<{ signedIn: boolean; message: string } | null>(null);
  const [error, setError] = useState(''); const [sending, setSending] = useState(false);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const task = tasks.find(task => task.id === initialTaskId);
  const workerTask = tasks.find(task => activeTaskStatuses.includes(task.status));
  const busy = sending || !!workerTask;
  const active = !!task && activeTaskStatuses.includes(task.status);
  const tab = location.params.get('tab') ?? (active ? 'activity' : task && ['coded', 'completed', 'failed'].includes(task.status) ? 'results' : 'plan');
  const chooseTab = (tab: string) => setQuery({ tab });
  useEffect(() => {
    const controller = new AbortController();
    appFetch('/api/v1/tasks/setup', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Task runner setup unavailable.');
      const setup = await response.json(); setProducts(setup.products); setCodex(setup.codex); setError('');
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [setupAttempt]);
  async function action(step?: 'plan' | 'code' | 'check') {
    if (busy) return; setSending(true); setError('');
    try { const result = await taskRequest(step ? `/api/v1/tasks/${initialTaskId}/step` : '/api/v1/tasks', step ? { action: step } : { owner, goal }); navigate(`/tasks/${result.id}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Task request failed.'); }
    finally { setSending(false); }
  }
  const next = task ? nextStep(task) : null;
  const locked = busy || connection !== 'live';
  return <main className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold tracking-tight">Task runner</h1><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{codex?.signedIn ? 'Codex connected' : codex ? 'Codex not connected' : 'Checking Codex…'}</Badge><Button variant="ghost" size="sm" onClick={onHistory}><ClipboardList className="size-4"/>Task records</Button>{initialTaskId && <Button variant="outline" size="sm" disabled={sending} onClick={() => navigate('/tasks/new')}><Plus className="size-4"/>New task</Button>}</div></header>
    {(error || streamError) && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"><span>{error || streamError}</span>{error && !codex && <Button variant="outline" size="sm" onClick={() => setSetupAttempt(value => value + 1)}>Retry</Button>}</div>}
    {codex && !codex.signedIn && <p className="text-xs text-muted-foreground">{codex.message} <Button variant="link" size="sm" onClick={() => navigate('/settings/codex')}>Codex settings</Button></p>}
    {workerTask && workerTask.id !== initialTaskId && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm"><span className="inline-flex items-center gap-2"><GlobalLoader/>Another task is running in {workerTask.owner}.</span><Button variant="ghost" size="sm" onClick={() => navigate(`/tasks/${workerTask.id}`)}>Open running task</Button></div>}
    {!initialTaskId ? <Card className="mx-auto max-w-3xl"><CardHeader><CardTitle className="text-lg">New task</CardTitle><p className="text-sm text-muted-foreground">Choose a project and one goal. Plan first, then approve coding and checks separately.</p></CardHeader><CardContent><form className="space-y-4" onSubmit={event => { event.preventDefault(); if (owner && goal.trim() && codex?.signedIn && !locked) void action(); }}><label className="grid gap-2 text-sm font-medium">Project<NativeSelect value={owner} disabled={busy} onChange={event => setQuery({ owner: event.target.value })}>{products.map(product => <NativeSelectOption key={product.owner} value={product.owner}>{product.owner}</NativeSelectOption>)}</NativeSelect></label><label className="grid gap-2 text-sm font-medium">Goal<Textarea value={goal} disabled={busy} onChange={event => setGoal(event.target.value)} maxLength={3000} rows={4} placeholder="What result do you want?"/></label><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Reads governance and the latest work record.</p><Button type="submit" disabled={locked || !owner || !goal.trim() || !codex?.signedIn}>Create plan<ArrowRight className="size-4"/></Button></div></form></CardContent></Card> : !task ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{connection === 'live' ? 'Task not found. Choose a task from Task records.' : <GlobalLoader/>}</CardContent></Card> : <>
      <Card className="gap-0 py-0"><CardContent className="space-y-3 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline">{task.owner}</Badge><Badge variant={task.status === 'failed' ? 'destructive' : 'secondary'}>{task.review?.decision === 'accepted' ? 'Accepted' : task.review?.decision === 'changes_requested' ? 'Changes requested' : statusLabels[task.status]}</Badge></div><h2 className="line-clamp-2 text-base font-semibold leading-6">{task.goal}</h2>{task.goal.length > 200 && <details className="text-sm"><summary className="text-muted-foreground">Full goal</summary><p className="mt-2 whitespace-pre-wrap">{task.goal}</p></details>}
        <TaskProgress task={task} compact/>
        {task.status !== 'completed' && !(task.status === 'failed' && tab === 'results') && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-sm font-medium">{active ? <GlobalLoader/> : task.review?.decision === 'accepted' ? <Check className="size-4 text-primary"/> : null}{next?.[0]}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{next?.[1]}</p></div>
          {task.status === 'draft' && <Button disabled={locked || !codex?.signedIn} onClick={() => void action('plan')}>Create plan<ArrowRight className="size-4"/></Button>}
          {task.status === 'planned' && <Button disabled={locked || !codex?.signedIn} onClick={() => void action('code')}>Approve & start coding<ArrowRight className="size-4"/></Button>}
          {task.status === 'coded' && <Button disabled={locked} onClick={() => void action('check')}>Run app checks<ArrowRight className="size-4"/></Button>}
          {task.status === 'failed' && tab !== 'results' && <Button variant="outline" onClick={() => chooseTab('results')}>View results</Button>}
        </div>}
      </CardContent></Card>
      <Tabs value={tab} onValueChange={chooseTab} className="space-y-4"><TabsList aria-label="Task workspace"><TabsTrigger value="plan">Plan</TabsTrigger><TabsTrigger value="results">Results{task.checks.length ? ` · ${task.checks.filter(check => check.passed).length}/${task.checks.length} checks` : ''}</TabsTrigger><TabsTrigger value="activity">Activity{task.events?.length ? ` · ${task.events.length}` : ''}</TabsTrigger></TabsList>
        <TabsContent value="plan"><Card><CardHeader className="pb-3"><CardTitle className="text-base">{task.sourceChat ? 'Approved chat plan' : 'Implementation plan'}</CardTitle>{task.sourceChat && <Button asChild variant="link" size="sm" className="h-auto justify-start p-0"><a href={`/agent-chat/${task.sourceChat.conversationId}`}>View source chat</a></Button>}</CardHeader><CardContent><p className="whitespace-pre-wrap break-words text-sm leading-7">{task.plan || (task.status === 'planning' ? 'The plan will appear here when Codex finishes.' : 'Create a plan before coding.')}</p>{task.parentTaskId && <Button variant="link" className="mt-3 px-0" onClick={() => navigate(`/tasks/${task.parentTaskId}`)}>View original task</Button>}</CardContent></Card></TabsContent>
        <TabsContent value="results">{task.status === 'completed' ? <CompletionReview key={task.id} task={task} disabled={locked} onOpen={id => navigate(`/tasks/${id}`)}/> : <Card><CardHeader><CardTitle className="text-base">{task.status === 'failed' ? 'Needs attention' : 'Result'}</CardTitle></CardHeader><CardContent className="space-y-5">{task.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{task.error}</p>}<p className="whitespace-pre-wrap break-words text-sm leading-7">{task.codingResult || task.result || (task.status === 'coding' ? 'Coding is running. The result will appear when it finishes.' : 'No coding result yet. Review the plan and approve coding first.')}</p>{task.changedFiles.length > 0 && <details><summary className="text-sm">Changed files · {task.changedFiles.length}</summary><ul className="mt-3 space-y-1 rounded-lg bg-muted p-3 font-mono text-xs">{task.changedFiles.map(file => <li key={file} className="break-all">{file}</li>)}</ul></details>}<section className="space-y-3"><h3 className="text-sm font-medium">Checks</h3><CheckResults items={task.checks}/></section></CardContent></Card>}</TabsContent>
        <TabsContent value="activity"><Card><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{active ? 'Live activity' : 'Activity record'}</CardTitle><Badge variant="outline">{connection === 'live' ? 'Stream connected' : connection === 'reconnecting' ? 'Reconnecting…' : <GlobalLoader/>}</Badge></div></CardHeader><CardContent><ActivityFeed label="Task activity" items={(task.events ?? []).map(event => ({ id: event.id, kind: event.kind, time: new Date(event.time).toLocaleTimeString(), message: event.message }))} emptyMessage="No activity saved for this task."/></CardContent></Card></TabsContent>
      </Tabs>
      <details className="text-xs text-muted-foreground"><summary className="inline-flex items-center gap-2"><FileText className="size-3.5"/>Task details</summary><dl className="mt-3 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2"><div><dt>Task ID</dt><dd className="mt-1 break-all font-mono">{task.id}</dd></div><div><dt>Last updated</dt><dd className="mt-1">{new Date(task.updatedAt).toLocaleString()}</dd></div></dl></details>
    </>}
  </main>;
}
