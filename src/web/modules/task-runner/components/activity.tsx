import { StreamingStatus } from '../../../../shared/streaming/streaming-status';
import { GlobalLoader } from '@workspace/ui/components/global-loader';
import { StageProgress } from '@workspace/ui/blocks/work-progress';
import { ActivityFeed } from '@workspace/ui/blocks/activity-feed';
import { Activity, LoaderCircle, Pause, Terminal, X } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@workspace/ui';
import { activeTaskStatuses, type CodingTask } from '../../../../../contracts/task';

export function TaskProgress({ task, compact = false }: { task: CodingTask; compact?: boolean }) {
  const active = activeTaskStatuses.includes(task.status);
  const completed = task.status === 'completed' ? 3 : task.result ? 2 : task.plan ? 1 : 0;
  return <div className="space-y-4">
    {!compact && <div className="flex items-center justify-between gap-3"><Badge variant={task.status === 'failed' ? 'destructive' : 'secondary'}>{task.status}</Badge><span className="text-xs text-muted-foreground">{completed} of 3 stages finished</span></div>}
    <StageProgress label="Completed task stages" stages={['Plan', 'Code', 'Check']} completed={completed} activeIndex={task.status === 'planning' ? 0 : task.status === 'coding' ? 1 : 2} running={active}/>
  </div>;
}

export function WorkerPanel({ task, connection, workerTask }: { task?: CodingTask; workerTask?: CodingTask; connection: string }) {
  const active = !!workerTask;
  const Icon = active ? LoaderCircle : Pause;
  return <Card className="overflow-hidden">
    <CardHeader className="border-b border-border"><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Terminal size={17}/> Local Codex worker</CardTitle><span className={'size-2 rounded-full ' + (connection === 'live' ? 'bg-primary' : 'bg-destructive')} aria-label={connection}/></div><p className="text-xs text-muted-foreground">One worker · Existing local session</p></CardHeader>
    <CardContent className="space-y-5 pt-5">
      <div className="flex items-center gap-3 rounded-lg bg-secondary p-3"><>{((active)) && <GlobalLoader/>}<Icon size={19} className={'text-primary ' + (active ? ' ' : '')}/></><div><p className="text-sm font-medium">{active ? `${workerTask.status === 'planning' ? 'Planning' : workerTask.status === 'coding' ? 'Coding' : 'Checking'} in progress` : 'Worker ready'}</p><p className="text-xs text-muted-foreground">{active ? workerTask.owner : 'Waiting for your next step'}</p></div></div>
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-medium"><Activity size={15}/> Live activity</h2>{connection === 'live' || connection === 'reconnecting' ? <StreamingStatus active={false} label={connection === 'live' ? 'Connected' : 'Reconnecting…'} /> : <GlobalLoader/>}</div>
      <p className="text-xs leading-relaxed text-muted-foreground">Reported Codex activity and runner events. Stages show completed work; no estimated percentage.</p>
      <ActivityFeed label="Task activity" items={(task?.events ?? []).map(event => ({ id: event.id, kind: event.kind, time: new Date(event.time).toLocaleTimeString(), message: event.message }))} emptyMessage={task ? 'No live events were saved for this earlier task.' : 'Start a plan to see activity here.'}/>
      {task?.error && <p role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><X size={15} className="shrink-0"/>{task.error}</p>}
    </CardContent>
  </Card>;
}
