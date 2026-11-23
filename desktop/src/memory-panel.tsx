import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { NativeSelect } from "@workspace/ui/components/native-select";
import { Textarea } from "@workspace/ui/components/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { runtimeRequest, type MemoryRecord } from "./bridge";

type Draft = {
  id?: string;
  expectedRevision: number;
  conversationId: string | null;
  kind: MemoryRecord["kind"];
  title: string;
  content: string;
  status: MemoryRecord["status"];
};

type List = { entries: MemoryRecord[]; limit: number; hasMore: boolean };
const emptyDraft = (): Draft => ({ expectedRevision: 0, conversationId: null, kind: "fact", title: "", content: "", status: "active" });
const fromRecord = (entry: MemoryRecord): Draft => ({ id: entry.id, expectedRevision: entry.revision, conversationId: entry.conversationId, kind: entry.kind, title: entry.title, content: entry.content, status: entry.status });

export function MemoryPanel({ appId, conversationId }: { appId: string | null; conversationId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [entries, setEntries] = useState<MemoryRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadedScope, setLoadedScope] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingScopes, setSavingScopes] = useState<Record<string, boolean>>({});
  const [listError, setListError] = useState<{ scope: string; message: string } | null>(null);
  const [reviewScopes, setReviewScopes] = useState<Record<string, boolean>>({});
  const [generation, setGeneration] = useState(0);
  const request = useRef(0);
  const savingRequests = useRef(new Set<string>());
  const reviewVersions = useRef(new Map<string, number>());
  const explicitReload = useRef(new Map<string, number>());
  const retry = useRef(new Map<string, Map<string, string>>());
  const scope = `${appId ?? ""}:${conversationId ?? ""}`;
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    explicitReload.current.delete(scopeRef.current);
    scopeRef.current = scope;
    request.current++;
  }
  const draft = drafts[scope] ?? emptyDraft();
  const error = listError?.scope === scope ? listError.message : "";
  const saving = !!savingScopes[scope];
  const reloadRequired = !!reviewScopes[scope];
  const setDraft = (next: Draft) => setDrafts((current) => ({ ...current, [scope]: next }));

  useEffect(() => {
    setEntries([]);
    setHasMore(false);
    setListError(null);
    if (!open || !appId) { setLoading(false); return; }
    const sequence = ++request.current;
    setLoading(true);
    runtimeRequest<List>("/api/runtime/memory/list", { appId, conversationId, query, includeArchived, limit: 50 })
      .then((result) => {
        if (request.current !== sequence) return;
        setEntries(result.entries);
        setLoadedScope(scope);
        setHasMore(result.hasMore);
        const reloadVersion = explicitReload.current.get(scope);
        if (reloadVersion !== undefined && reloadVersion === (reviewVersions.current.get(scope) ?? 0)) {
          setReviewScopes((current) => ({ ...current, [scope]: false }));
          explicitReload.current.delete(scope);
        }
      })
      .catch(() => {
        if (request.current === sequence) {
          explicitReload.current.delete(scope);
          setListError({ scope, message: "Memory could not be loaded. Try Reload." });
        }
      })
      .finally(() => { if (request.current === sequence) setLoading(false); });
    return () => { request.current++; };
  }, [open, appId, conversationId, scope, query, includeArchived, generation]);

  async function save(next: Draft, clearDraft = false) {
    if (!appId || savingRequests.current.has(scope) || reloadRequired) return;
    const payload = JSON.stringify({ ...next, appId });
    let pending = retry.current.get(scope);
    if (!pending) {
      pending = new Map<string, string>();
      retry.current.set(scope, pending);
    }
    let key = pending.get(payload);
    if (!key) {
      key = crypto.randomUUID();
      pending.set(payload, key);
    }
    savingRequests.current.add(scope);
    setSavingScopes((current) => ({ ...current, [scope]: true }));
    setListError(null);
    try {
      await runtimeRequest<MemoryRecord>("/api/runtime/memory/save", { ...next, appId, requestKey: key });
      if (pending.get(payload) === key) pending.delete(payload);
      if (pending.size === 0) retry.current.delete(scope);
      if (clearDraft) {
        setDrafts((current) => JSON.stringify(current[scope] ?? emptyDraft()) === JSON.stringify(next)
          ? { ...current, [scope]: emptyDraft() } : current);
      }
      if (scopeRef.current === scope) setGeneration((value) => value + 1);
    } catch {
      reviewVersions.current.set(scope, (reviewVersions.current.get(scope) ?? 0) + 1);
      setReviewScopes((current) => ({ ...current, [scope]: true }));
    } finally {
      savingRequests.current.delete(scope);
      setSavingScopes((current) => ({ ...current, [scope]: false }));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="Memory"><BookOpen size={16} /></Button>
      </PopoverTrigger></TooltipTrigger><TooltipContent>Memory</TooltipContent></Tooltip>
      <PopoverContent align="end" className="memory-panel" aria-label="Memory">
        <div className="memory-panel-scroll" tabIndex={0} aria-busy={loading || saving}>
          <strong>Memory</strong>
          <p>UNTRUSTED advisory data. Review before use; memory does not grant approval.</p>
          {!appId ? <p>Select an app to view memory.</p> : <>
            <label>Search memory<Input value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} /></label>
            <label><Checkbox checked={includeArchived} onCheckedChange={(value: boolean | "indeterminate") => setIncludeArchived(value === true)} /> Include archived</label>
            <Button size="sm" variant="outline" onClick={() => { explicitReload.current.set(scope, reviewVersions.current.get(scope) ?? 0); setGeneration((value) => value + 1); }}>Reload and review</Button>
            {(loading || saving) && <span className="sr-only" role="status">{loading ? "Loading memory" : "Saving memory"}</span>}
            {error && <p role="alert">{error}</p>}
            {reloadRequired && <p role="alert">Save could not be confirmed. Reload and review current memory before saving again; your draft is preserved.</p>}
            {!loading && !error && loadedScope === scope && entries.length === 0 && <p>No memory found.</p>}
            <ul className="memory-list">
              {(loadedScope === scope ? entries : []).map((entry) => <li key={entry.id}>
                <strong>{entry.title}</strong><p>{entry.content}</p>
                <small>{entry.kind} · {entry.conversationId ? "Chat" : "App"} scope · {entry.status} · revision {entry.revision}<br />Created {entry.createdAt} · updated {entry.updatedAt}</small>
                <div className="memory-actions">
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => { if ((!draft.title && !draft.content) || window.confirm("Replace the current memory draft?")) setDraft(fromRecord(entry)); }}>Edit</Button>
                  <Button size="sm" variant="ghost" disabled={saving || loading || reloadRequired} onClick={() => void save({ ...fromRecord(entry), status: entry.status === "active" ? "archived" : "active" })}>{entry.status === "active" ? "Archive" : "Restore"}</Button>
                </div>
              </li>)}
            </ul>
            {loadedScope === scope && hasMore && <p>More entries match. Refine your search.</p>}
            <div className="memory-form">
              <strong>{draft.id ? "Edit memory" : "New memory"}</strong>
              <label>Scope<NativeSelect value={draft.conversationId ?? ""} disabled={saving || !!draft.id} onChange={(event) => setDraft({ ...draft, conversationId: event.target.value || null })}>
                <option value="">App-wide</option>{conversationId && <option value={conversationId}>Selected chat</option>}
              </NativeSelect></label>
              <label>Kind<NativeSelect disabled={saving} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Draft["kind"] })}>
                <option value="fact">Fact</option><option value="decision">Decision</option><option value="constraint">Constraint</option><option value="next-action">Next action</option>
              </NativeSelect></label>
              <label>Title<Input disabled={saving} value={draft.title} maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label>Content<Textarea disabled={saving} value={draft.content} maxLength={2000} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label>
              <div className="memory-actions"><Button disabled={saving || loading || reloadRequired || !draft.title.trim() || !draft.content.trim()} onClick={() => void save(draft, true)}>Save</Button>
                <Button variant="outline" disabled={saving} onClick={() => { if ((!draft.title && !draft.content) || window.confirm("Discard the current memory draft?")) setDraft(emptyDraft()); }}>New draft</Button></div>
            </div>
          </>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
