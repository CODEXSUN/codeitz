import { appFetch } from '../../platform-client';
import { GlobalLoader } from '@workspace/ui/components/global-loader';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Input } from '@workspace/ui';
import { MasterListV1 } from '@workspace/ui/blocks/data-table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog';
import type { TodoData } from '../../../../contracts/todo';

export function TodoCategoriesPage({ onHeader }: { onHeader: (actions: ReactNode) => void }) {
  const [data, setData] = useState<TodoData | null>(null);
  const [error, setError] = useState(''); const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<{ mode: 'new' | 'edit' | 'delete'; original: string } | null>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    appFetch('/api/v1/todos', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Categories could not be loaded.');
      const result: TodoData = await response.json(); if (!controller.signal.aborted) { setData(result); setError(''); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  function open(mode: 'new' | 'edit' | 'delete', original = '') { setEditor({ mode, original }); setName(original); setFormError(''); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!data || !editor || busy) return;
    setBusy(true); setFormError('');
    try {
      const method = editor.mode === 'new' ? 'POST' : editor.mode === 'edit' ? 'PATCH' : 'DELETE';
      const response = await appFetch('/api/v1/todos/categories', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: data.revision, name: editor.mode === 'new' ? name : editor.original, ...(editor.mode === 'edit' ? { nextName: name } : {}) }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) setReload(value => value + 1); throw new Error(result.message || 'Category could not be saved.'); }
      setData(result); setEditor(null);
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Category could not be saved.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    onHeader(<Button size="sm" disabled={!data || loading} onClick={() => open('new')}>New category</Button>);
    return () => onHeader(null);
  }, [onHeader, data, loading]);
  const rows = (data?.categories ?? []).map(category => ({ name: category, todos: data?.todos.filter(todo => todo.category === category).length ?? 0 }));
  return <main className="workspace-list-content space-y-4">
    <MasterListV1 label="Todo categories" itemLabel="categories" data={rows} getRowId={row => row.name} columns={[{ id: 'name', label: 'Name', value: row => row.name }, { id: 'todos', label: 'Todos', value: row => row.todos }]} loading={loading} error={error} onRetry={() => setReload(value => value + 1)} onOpen={row => open('edit', row.name)} actions={[{ id: 'edit', label: 'Edit category', onSelect: row => open('edit', row.name) }, { id: 'delete', label: 'Delete category', destructive: true, onSelect: row => open('delete', row.name) }]} />
    <Dialog open={!!editor} onOpenChange={value => { if (!value && !busy) setEditor(null); }}><DialogContent><DialogHeader><DialogTitle>{editor?.mode === 'delete' ? 'Delete category' : editor?.mode === 'new' ? 'New category' : 'Edit category'}</DialogTitle><DialogDescription>{editor?.mode === 'delete' ? `Delete “${editor.original}”? Linked todos will keep their content and become uncategorized.` : 'Renaming updates this category on linked todos.'}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">{editor?.mode !== 'delete' && <div className="space-y-2"><label htmlFor="todo-category-name" className="text-sm font-medium">Category name</label><Input id="todo-category-name" autoFocus required maxLength={80} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></div>}{formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" variant={editor?.mode === 'delete' ? 'destructive' : 'default'} disabled={busy || !data || loading}>{<>{busy && <GlobalLoader/>}{editor?.mode === 'delete' ? 'Delete category' : 'Save category'} </>}</Button></DialogFooter></form></DialogContent></Dialog>
  </main>;
}
