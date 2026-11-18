import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { activeTaskStatuses, type CodingTask, type TaskEvent } from '../../../../contracts/task';

type TaskStreamState = { tasks: CodingTask[]; connection: 'connecting' | 'live' | 'reconnecting'; error: string };
const TaskStreamContext = createContext<TaskStreamState | null>(null);
const TaskStatusContext = createContext('Task stream connecting');

// The app owns one stream. Page changes only replace consumers, not the connection.
export function TaskStreamProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<CodingTask[]>([]);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [error, setError] = useState('');
  useEffect(() => {
    const stream = new EventSource('/api/v1/tasks/stream');
    stream.onopen = () => { setConnection('live'); setError(''); };
    stream.onmessage = message => {
      try {
        const update = JSON.parse(message.data);
        if (update.type === 'snapshot') setTasks(update.tasks);
        if (update.type === 'task') setTasks(current => {
          const previous = current.find(task => task.id === update.task.id);
          const task = { ...update.task, events: previous?.events ?? update.task.events ?? [] };
          return [task, ...current.filter(item => item.id !== task.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        });
        if (update.type === 'activity') setTasks(current => current.map(task => task.id === update.event.taskId ? { ...task, events: [...(task.events ?? []).filter(event => event.id !== update.event.id), update.event as TaskEvent].slice(-200) } : task));
        if (update.type === 'error') setError(update.message);
      } catch { setError('Unable to read a task update. Reopen this page to reconnect.'); }
    };
    stream.onerror = () => { setConnection('reconnecting'); };
    return () => stream.close();
  }, []);
  const state = useMemo(() => ({ tasks, connection, error }), [tasks, connection, error]);
  const worker = tasks.find(task => activeTaskStatuses.includes(task.status));
  const status = error ? 'Task stream needs attention' : connection !== 'live' ? `Task stream ${connection}` : worker ? `${worker.status} · ${worker.owner}` : 'Task stream connected · Worker idle';
  return createElement(TaskStreamContext.Provider, { value: state }, createElement(TaskStatusContext.Provider, { value: status }, children));
}

export function useTasks() {
  const state = useContext(TaskStreamContext);
  if (!state) throw new Error('Task pages must be inside TaskStreamProvider.');
  return state;
}
// A stable string prevents activity events from rerendering the entire shell.
export function useTaskStatus() { return useContext(TaskStatusContext); }

export async function taskRequest(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Task action failed.');
  return result;
}
