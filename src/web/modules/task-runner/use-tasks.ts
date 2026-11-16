import { useEffect, useState } from 'react';
import type { CodingTask, TaskEvent } from '../../../../contracts/task';

export function useTasks() {
  const [tasks, setTasks] = useState<CodingTask[]>([]);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [error, setError] = useState('');
  useEffect(() => {
    const stream = new EventSource('/api/tasks/stream');
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
  return { tasks, connection, error };
}

export async function taskRequest(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Task action failed.');
  return result;
}
