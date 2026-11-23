import { appFetch } from '../../platform-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TodoWorkspace, type TodoValues } from '@workspace/ui/blocks/todo-workspace';
import type { TodoData } from '../../../../contracts/todo';
import { setQuery, useLocation } from '../../navigation';
export function TodosPage() {
  const [data, setData] = useState<TodoData | null>(null);
  const current = useRef<TodoData | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const mounted = useRef(false); const writing = useRef(false);
  const location = useLocation();
  const receive = useCallback((next: TodoData) => {
    if (!mounted.current || current.current && next.revision < current.current.revision) return;
    current.current = next; setData(next);
  }, []);
  const reload = useCallback(async () => {
    try {
      const response = await appFetch('/api/v1/todos', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Todos could not be loaded.');
      receive(result); if (mounted.current) setError('');
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Unable to load todos.'); }
    finally { if (mounted.current) setLoading(false); }
  }, [receive]);
  useEffect(() => { mounted.current = true; void reload(); const focus = () => { if (!writing.current) void reload(); }; window.addEventListener('focus', focus); return () => { mounted.current = false; window.removeEventListener('focus', focus); }; }, [reload]);
  useEffect(() => { if (!data?.todos.some(todo => todo.scheduledAt && !todo.remindedAt && todo.status !== 'done')) return; const timer = setInterval(() => { if (!writing.current) void reload(); }, 15000); return () => clearInterval(timer); }, [data, reload]);
  async function write(method: string, suffix: string, input: object = {}) {
    if (!current.current || writing.current) throw new Error('Wait for the current save.');
    writing.current = true;
    try {
      const response = await appFetch(`/api/v1/todos${suffix}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: current.current.revision, ...input }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) await reload(); throw new Error(result.message || 'Todo could not be saved.'); }
      receive(result);
    } finally { writing.current = false; }
  }
  return <main className="workspace-list-content"><TodoWorkspace showHeading={false} items={data?.todos ?? []} projects={data?.projects ?? []} categories={data?.categories ?? []} loading={loading} error={error} onRetry={() => void reload()}
    visibility={(location.params.get('visibility') ?? 'all') as 'all' | 'private' | 'public'} project={location.params.get('project') ?? ''}
    onVisibilityChange={visibility => setQuery({ visibility: visibility === 'all' ? undefined : visibility })} onProjectChange={project => setQuery({ project: project || undefined })}
    onCreateCategory={name => write('POST', '/categories', { name })}
    onCreate={(input: TodoValues) => write('POST', '', { input })} onUpdate={(id, changes) => write('PATCH', `/${id}`, { changes })} onDelete={id => write('DELETE', `/${id}`)} onReorder={orderedIds => write('POST', '/reorder', { orderedIds })}/></main>;
}
