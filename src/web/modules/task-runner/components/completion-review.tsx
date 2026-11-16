import { useState } from 'react';
import { Check, MessageSquare, ArrowUpRight } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@workspace/ui';
import type { CodingTask } from '../../../../../contracts/task';
import { taskRequest } from '../use-tasks';

export function CompletionReview({ task, onOpen, disabled = false }: { task: CodingTask; onOpen: (id: string) => void; disabled?: boolean }) {
  const [requesting, setRequesting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function review(decision: 'accepted' | 'changes_requested') {
    setBusy(true); setError('');
    try {
      await taskRequest(`/api/tasks/${task.id}/review`, { decision, ...(decision === 'changes_requested' ? { feedback } : {}) });
      setRequesting(false); setFeedback('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save review.'); }
    finally { setBusy(false); }
  }
  const locked = disabled || busy || !!task.archivedAt || !!task.droppedAt;
  return <>
    {task.parentTaskId && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm"><span className="text-muted-foreground">Follow-up task</span><Button variant="link" size="sm" onClick={() => onOpen(task.parentTaskId!)}>View original task <ArrowUpRight size={14}/></Button></div>}
    {task.status === 'completed' && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-lg">Completion review</CardTitle><Badge variant={task.review?.decision === 'accepted' ? 'secondary' : 'outline'}>{task.review?.decision === 'accepted' ? 'Accepted' : task.review?.decision === 'changes_requested' ? 'Changes requested' : 'Awaiting review'}</Badge></div></CardHeader><CardContent className="space-y-5">
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{task.result}</p>
      <section><h3 className="mb-2 text-sm font-medium">Final changes · {task.changedFiles.length} files</h3>{task.changedFiles.length ? <ul className="space-y-2 rounded-lg bg-muted p-3 font-mono text-xs">{task.changedFiles.map(file => <li key={file} className="break-all">{file}</li>)}</ul> : <p className="text-sm text-muted-foreground">No file changes recorded.</p>}</section>
      <section><h3 className="mb-2 text-sm font-medium">Check results</h3><div className="flex flex-wrap gap-2">{task.checks.map(check => <Badge key={check.name} variant={check.passed ? 'secondary' : 'destructive'}>{check.name}: {check.passed ? 'passed' : 'failed'}</Badge>)}</div><p className="mt-2 text-xs text-muted-foreground">Passing checks do not independently prove every goal. Read the result and changes.</p></section>
      {task.review ? <div className="space-y-2 rounded-lg bg-secondary p-3"><p className="text-sm">{task.review.decision === 'accepted' ? 'Result accepted' : 'Changes requested'} · {new Date(task.review.reviewedAt).toLocaleString()}</p>{task.review.feedback && <p className="whitespace-pre-wrap text-sm">{task.review.feedback}</p>}{task.review.followUpTaskId && <Button variant="outline" size="sm" onClick={() => onOpen(task.review!.followUpTaskId!)}>Open linked follow-up <ArrowUpRight size={14}/></Button>}</div> : <>
        <div className="flex flex-wrap gap-2"><Button disabled={locked} onClick={() => void review('accepted')}><Check size={15}/> Accept result</Button><Button variant="outline" disabled={locked} onClick={() => setRequesting(true)}><MessageSquare size={15}/> Request changes</Button></div>
        {(task.archivedAt || task.droppedAt) && <p className="text-xs text-muted-foreground">Restore this task before reviewing.</p>}
        {requesting && <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={event => { event.preventDefault(); void review('changes_requested'); }}><label className="grid gap-2 text-sm font-medium">Requested changes<Textarea rows={4} maxLength={3000} value={feedback} disabled={locked} onChange={event => setFeedback(event.target.value)} placeholder="Describe what should change…"/></label><p className="text-xs text-muted-foreground">Creates a linked draft in the same app. Planning and coding remain separate approvals.</p><div className="flex gap-2"><Button disabled={locked || !feedback.trim()} type="submit">Create linked follow-up</Button><Button variant="ghost" disabled={busy} type="button" onClick={() => setRequesting(false)}>Cancel</Button></div></form>}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>}
  </>;
}
