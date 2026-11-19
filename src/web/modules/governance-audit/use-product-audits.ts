import {appFetch} from '../../platform-client';
import { setQuery, useLocation } from '../../navigation';
import { useEffect, useRef, useState, type SetStateAction } from 'react';
import type { AuditCheck, Product, ProductAuditEvent, ProductAuditReport, ProductCheckId } from '../../../../contracts/audit';

type ProductState = Product & {
  status: 'idle' | 'queued' | 'running' | 'passed' | 'failed' | 'error';
  completed: number; total: number; checks: AuditCheck[];
  report?: ProductAuditReport; error?: string;
};

export function useProductAudits() {
  const [products, setProducts] = useState<ProductState[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<{ id: ProductCheckId; label: string; description: string }[]>([]);
  const location = useLocation();
  const checkParam = location.params.get('checks');
  const selectedChecks = catalog.filter(check => checkParam === null || checkParam.split(',').includes(check.id)).map(check => check.id);
  const setSelectedChecks = (action: SetStateAction<ProductCheckId[]>) => {
    const next = typeof action === 'function' ? action(selectedChecks) : action;
    setQuery({ checks: next.length === catalog.length ? undefined : next.length ? next.join(',') : 'none' });
  };
  const active = useRef(false);
  const stream = useRef<AbortController | null>(null);
  const discovery = useRef<AbortController | null>(null);

  async function loadProducts() {
    discovery.current?.abort();
    const controller = new AbortController();
    discovery.current = controller;
    setLoading(true); setError('');
    try {
      const response = await appFetch('/api/v1/audit/products', { signal: controller.signal });
      if (!response.ok) throw new Error('Product list unavailable. Check the backend and retry.');
      const result = await response.json() as { products: Product[]; checksPerProduct: number; checks: typeof catalog };
      setCatalog(result.checks);
      setProducts(result.products.map(product => ({ ...product, status: 'idle', completed: 0, total: result.checksPerProduct, checks: [] })));
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load products.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  useEffect(() => {
    void loadProducts();
    return () => { discovery.current?.abort(); stream.current?.abort(); };
  }, []);

  async function run(owner?: string) {
    if (active.current || selectedChecks.length === 0) return;
    active.current = true; setRunning(true); setError('');
    const controller = new AbortController(); stream.current = controller;
    let finished = false;
    const receive = (event: ProductAuditEvent) => {
      if (event.type === 'run-error') throw new Error(event.message);
      if (event.type === 'run-complete') { finished = true; return; }
      if (event.type === 'run-start') {
        setProducts(current => current.map(product => event.owners.includes(product.owner)
          ? { ...product, status: 'queued', completed: 0, total: selectedChecks.length, checks: [], report: undefined, error: undefined } : product));
        return;
      }
      setProducts(current => current.map(product => {
        if (product.owner !== event.owner) return product;
        if (event.type === 'owner-start') return { ...product, status: 'running', total: event.totalChecks };
        if (event.type === 'check') return { ...product, completed: event.completedChecks, checks: [...product.checks, event.check] };
        if (event.type === 'owner-complete') return { ...product, status: event.report.passed ? 'passed' : 'failed', report: event.report, checks: event.report.checks, completed: event.report.checks.length };
        return { ...product, status: 'error', error: event.message };
      }));
    };
    try {
      const response = await appFetch('/api/v1/audit/products/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(owner ? { owner } : {}), checkIds: selectedChecks }), signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error('Product audit could not start. Check the backend and retry.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const result = await reader.read();
        buffer += result.done ? decoder.decode() : decoder.decode(result.value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) receive(JSON.parse(line) as ProductAuditEvent);
        if (result.done) break;
      }
      if (buffer.trim()) receive(JSON.parse(buffer) as ProductAuditEvent);
      if (!finished) throw new Error('Audit connection ended before completion. Retry unfinished products.');
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : 'Audit connection failed.';
        setError(message);
        setProducts(current => current.map(product => product.status === 'running'
          ? { ...product, status: 'error', error: message }
          : product.status === 'queued' ? { ...product, status: 'idle' } : product));
      }
    } finally { active.current = false; if (!controller.signal.aborted) setRunning(false); }
  }
  return { products, loading, running, error, run, reload: loadProducts, catalog, selectedChecks, setSelectedChecks };
}
