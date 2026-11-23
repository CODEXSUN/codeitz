import { appFetch } from '../../platform-client';
import { GlobalLoader } from '@workspace/ui/components/global-loader';
import { ProgressMeter } from '@workspace/ui/blocks/work-progress';
import { Button, Badge, Card, CardContent, CardHeader, CardTitle, Checkbox, Tabs, TabsList, TabsTrigger, TabsContent } from '@workspace/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Play, RefreshCw, TriangleAlert } from 'lucide-react';
import type { AuditReport } from '../../../../contracts/audit';
import { setQuery, useLocation } from '../../navigation';
import { useProductAudits } from './use-product-audits';

export function AuditPage({onHeader}:{onHeader:(actions:ReactNode)=>void}) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const location = useLocation();
  const productAudit = useProductAudits();

  async function runAudit() {
    if (running.current || productAudit.running) return;
    running.current = true;
    setLoading(true);
    setError('');
    try {
      const response = await appFetch('/api/v1/audit/run', { method: 'POST' });
      if (!response.ok) throw new Error('Audit could not finish. Check the server and workspace access, then try again.');
      setReport(await response.json() as AuditReport);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to reach the audit server.');
    } finally {
      running.current = false;
      setLoading(false);
    }
  }

  useEffect(()=>{onHeader(<Button size="sm" disabled={loading||productAudit.running} onClick={()=>void runAudit()}><>{((loading)) && <GlobalLoader/>}<RefreshCw size={16} className={loading?'':''}/></>{loading?'Running audit…':'Run workspace audit'}</Button>);return()=>onHeader(null);},[onHeader,loading,productAudit.running]);
  return <main className="workspace-list-content space-y-4">
        <Tabs value={location.params.get('tab') ?? 'products'} onValueChange={value => setQuery({ tab: value === 'checks' ? value : undefined })} className="mt-6">
          <TabsList aria-label="Audit sections"><TabsTrigger value="products">Products</TabsTrigger><TabsTrigger value="checks">Audit checks</TabsTrigger></TabsList>
          <TabsContent value="checks">
            <Card><CardHeader><CardTitle>Audit checks</CardTitle><p>Applies to product runs. Workspace audit runs all checks.</p></CardHeader>
              <CardContent>
                <div className="mb-5 flex flex-wrap items-center gap-3"><Badge variant="outline">{productAudit.selectedChecks.length} of {productAudit.catalog.length} selected</Badge>
                  <Button variant="outline" size="sm" disabled={loading || productAudit.running || productAudit.loading} onClick={() => productAudit.setSelectedChecks(productAudit.catalog.map(check => check.id))}>Select all</Button>
                  <Button variant="ghost" size="sm" disabled={loading || productAudit.running || productAudit.loading} onClick={() => productAudit.setSelectedChecks([])}>Clear selection</Button>
                </div>
                {productAudit.loading && <GlobalLoader/>}
                {productAudit.error && !productAudit.catalog.length && <p role="alert" className="text-destructive">{productAudit.error}</p>}
                <fieldset disabled={loading || productAudit.running} className="space-y-3"><legend className="sr-only">Product audit checks</legend>
                  {productAudit.catalog.map(check => <div key={check.id} className="flex items-start gap-3 rounded-lg border border-border p-4">
                    <Checkbox className="mt-0.5" id={`check-${check.id}`} aria-describedby={`description-${check.id}`} checked={productAudit.selectedChecks.includes(check.id)} disabled={loading || productAudit.running} onCheckedChange={checked => productAudit.setSelectedChecks(current => checked === true ? [...current.filter(id => id !== check.id), check.id] : current.filter(id => id !== check.id))}/>
                    <div><label className="cursor-pointer text-sm font-semibold" htmlFor={`check-${check.id}`}>{check.label}</label><p id={`description-${check.id}`} className="mt-1">{check.description}</p></div>
                  </div>)}
                </fieldset>
                {!productAudit.selectedChecks.length && <p className="mt-4 text-warning">Select at least one check.</p>}

              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="products">
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-4 sm:flex-row">
            <div><CardTitle>Product checklist</CardTitle><p className="mt-2">{productAudit.products.length} products · {productAudit.products.filter(product => ['passed', 'failed', 'error'].includes(product.status)).length} finished · {productAudit.selectedChecks.length}/{productAudit.catalog.length} checks selected</p></div>
            <Button variant="outline" disabled={loading || productAudit.loading || productAudit.running || productAudit.products.length === 0 || productAudit.selectedChecks.length === 0} onClick={() => void productAudit.run()}><Play size={15}/>Run all products</Button>
          </CardHeader>
          <CardContent>
            {productAudit.error && <div role="alert" className="mb-4 text-sm text-destructive">{productAudit.error}{!productAudit.products.length && <Button variant="link" disabled={productAudit.loading} onClick={() => void productAudit.reload()}>Retry product list</Button>}</div>}
            {productAudit.loading ? <GlobalLoader/> : <ul className="divide-y divide-border">{productAudit.products.map(product => <li key={product.owner} className="py-4 first:pt-0">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1"><h3 className="capitalize">{product.name.replaceAll('-', ' ')}</h3><p className="break-all text-xs">{product.owner}</p></div>
                <Badge variant={product.status === 'failed' || product.status === 'error' ? 'destructive' : 'secondary'}>{({ idle: 'Not run', queued: 'Queued', running: 'Running', passed: product.report && product.report.selectedCheckIds.length < productAudit.catalog.length ? 'Selected checks passed' : 'Passed', failed: 'Violations', error: 'Error' })[product.status]}</Badge>
                <Button variant="outline" size="icon" aria-label={`Start audit for ${product.name}`} title={`Start audit for ${product.name}`} disabled={loading || productAudit.running || productAudit.selectedChecks.length === 0} onClick={() => void productAudit.run(product.owner)}>{product.status === 'running' ? <>{true && <GlobalLoader/>}<RefreshCw size={16} className=""/></> : <Play size={16}/>}</Button>
              </div>
              <div className="mt-3 flex items-center gap-3"><ProgressMeter className="h-2 min-w-0 flex-1 accent-primary" label={`${product.name} audit progress`} value={product.completed} max={Math.max(1, product.status === 'idle' ? productAudit.selectedChecks.length : product.total)}/><span className="text-xs tabular-nums text-muted-foreground">{product.completed}/{product.status === 'idle' ? productAudit.selectedChecks.length : product.total} checks</span></div>
              {product.error && <p className="mt-2 text-destructive">{product.error}</p>}
              {!!product.checks.length && <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">View checks{product.report ? ` · ${product.report.selectedCheckIds.length}/${productAudit.catalog.length} selected · ${product.report.durationMs} ms · ${new Date(product.report.checkedAt).toLocaleTimeString()}` : ''}</summary><ul className="mt-3 space-y-2">{product.checks.map(check => <li key={check.id} className={'flex items-start gap-2 ' + (check.skipped ? 'text-muted-foreground' : check.passed ? 'text-success' : 'text-destructive')}>{check.passed ? <CheckCircle2 size={14} className="shrink-0"/> : <TriangleAlert size={14} className="shrink-0"/>}<div><span>{check.message}</span><p className="mt-1 text-muted-foreground">{productAudit.catalog.find(item => item.id === check.id)?.description}</p></div></li>)}</ul></details>}
            </li>)}</ul>}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
        <div className="my-6 grid gap-4 sm:grid-cols-3">{[
          ['Owners checked', report?.ownersChecked ?? '—'],
          ['Products checked', report?.productsChecked ?? '—'],
          ['Violations', report?.violations.length ?? '—'],
        ].map(([label, value]) => <Card key={String(label)} className="gap-2 p-5"><span className="text-xs text-muted-foreground">{label}</span><strong className="text-3xl font-semibold">{value}</strong></Card>)}</div>
        <Card aria-busy={loading}>
          <CardHeader><CardTitle>Workspace results</CardTitle>{report && <p>Last completed: {new Date(report.checkedAt).toLocaleString()} · {report.durationMs} ms</p>}</CardHeader>
          <CardContent><div aria-live="polite">
            {loading ? <p>Running checks against the workspace on disk…</p>
              : error ? <div role="alert" className="text-destructive"><TriangleAlert size={22}/><span>{error}</span>{report && <p>Counts above show the previous successful run; they are not a new result.</p>}</div>
              : !report ? <div className="py-3"><p>No workspace audit run yet.</p></div>
              : report.passed ? <div className="flex items-center gap-3 py-3 text-success"><CheckCircle2 size={26}/><div><h3>All checks passed</h3><p>{report.ownersChecked} owners checked. No violations found.</p></div></div>
              : <div><div className="mb-4 flex items-center gap-2 text-warning"><TriangleAlert size={20}/><strong>{report.violations.length} violations found</strong></div><ul className="divide-y divide-border">{report.violations.map((violation, index) => <li key={index} className="py-4"><div className="mb-2 flex flex-wrap items-center gap-2"><strong className="text-sm">{violation.owner}</strong><Badge variant="outline">{violation.rule}</Badge></div><p>{violation.message}</p></li>)}</ul></div>}
          </div></CardContent>
        </Card>

  </main>;
}
