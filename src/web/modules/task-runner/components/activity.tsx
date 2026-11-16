import { useEffect, useRef } from 'react';
import { Activity, Check, Circle, LoaderCircle, Pause, Terminal, X } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@workspace/ui';
import { activeTaskStatuses, type CodingTask } from '../../../../../contracts/task';

export function TaskProgress({ task }: { task: CodingTask }) {
  const active = activeTaskStatuses.includes(task.status);
  const completed = task.status === 'completed' ? 3 : task.result ? 2 : task.plan ? 1 : 0;
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><Badge variant={task.status === 'failed' ? 'destructive' : 'secondary'}>{task.status}</Badge><span className="text-xs text-muted-foreground">{completed} of 3 stages finished</span></div>
    <progress aria-label="Completed task stages" className="h-2 w-full overflow-hidden rounded-full accent-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" value={completed} max={3}/>
    <ol className="grid grid-cols-3 gap-2">{['Plan', 'Code', 'Check'].map((label, index) => {
      const current = index === (task.status === 'planning' ? 0 : task.status === 'coding' ? 1 : 2);
      const Icon = index < completed ? Check : active && current ? LoaderCircle : Circle;
      return <li key={label} className={'flex items-center gap-2 text-xs ' + (index < completed || active && current ? 'text-primary' : 'text-muted-foreground')}><Icon size={15} className={active && current ? 'animate-spin motion-reduce:animate-none' : ''}/>{label}</li>;
    })}</ol>
  </div>;
}

export function WorkerPanel({ task, connection, workerTask }: { task?: CodingTask; workerTask?: CodingTask; connection: string }) {
  const active = !!workerTask;
  const Icon = active ? LoaderCircle : Pause;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (end.current) end.current.scrollTop = end.current.scrollHeight; }, [task?.events?.at(-1)?.id]);
  return <Card className="overflow-hidden">
    <CardHeader className="border-b border-border"><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Terminal size={17}/> Local Codex worker</CardTitle><span className={'size-2 rounded-full ' + (connection === 'live' ? 'bg-primary' : 'bg-destructive')} aria-label={connection}/></div><p className="text-xs text-muted-foreground">One worker · Existing local session</p></CardHeader>
    <CardContent className="space-y-5 pt-5">
      <div className="flex items-center gap-3 rounded-lg bg-secondary p-3"><Icon size={19} className={'text-primary ' + (active ? 'animate-spin motion-reduce:animate-none' : '')}/><div><p className="text-sm font-medium">{active ? `${workerTask.status === 'planning' ? 'Planning' : workerTask.status === 'coding' ? 'Coding' : 'Checking'} in progress` : 'Worker ready'}</p><p className="text-xs text-muted-foreground">{active ? workerTask.owner : 'Waiting for your next step'}</p></div></div>
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-medium"><Activity size={15}/> Live activity</h2><span role="status" className="text-xs text-muted-foreground">{connection === 'live' ? 'Connected' : connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</span></div>
      <p className="text-xs leading-relaxed text-muted-foreground">Reported Codex activity and runner events. Stages show completed work; no estimated percentage.</p>
      <div className="max-h-[420px] min-h-48 space-y-4 overflow-y-auto pr-2" aria-label="Task activity" ref={end}>
        {!task?.events?.length && <p className="py-8 text-center text-sm text-muted-foreground">{task ? 'No live events were saved for this earlier task.' : 'Start a plan to see activity here.'}</p>}
        {task?.events?.map(event => <div key={event.id} className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/50"/><div className="min-w-0 flex-1"><div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground"><span>{event.kind}</span><time>{new Date(event.time).toLocaleTimeString()}</time></div><p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{event.message}</p></div></div>)}
      </div>
      {task?.error && <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><X size={15} className="shrink-0"/>{task.error}</p>}
    </CardContent>
  </Card>;
}
