import {appFetch} from '../../platform-client';
import type { CreationEvent, ProjectInput, Project, ProjectsOverview } from '../../../../contracts/projects';
export async function updateProject(owner:string,input:{orderNo:number;active:boolean}):Promise<Project>{
  const response=await appFetch('/api/v1/projects/'+owner,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const result=await response.json();if(!response.ok)throw new Error(result.message||'Project update failed.');return result;
}
export async function loadOverview(): Promise<ProjectsOverview> {
  const response = await appFetch('/api/v1/projects'); const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Unable to load projects.'); return result;
}
export async function createProject(input: ProjectInput, onEvent: (event: CreationEvent) => void) {
  const response = await appFetch('/api/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) { const error = await response.json(); throw new Error(error.message || 'Creation failed.'); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('Creation stream unavailable.');
  const decoder = new TextDecoder(); let pending = ''; let finished = false;
  const consume = (line: string) => { if (!line.trim()) return; const event = JSON.parse(line) as CreationEvent; onEvent(event); if (event.type === 'error') throw new Error(event.message); if (event.type === 'complete') finished = true; };
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; pending += decoder.decode(value, { stream: true }); const lines = pending.split('\n'); pending = lines.pop()!; for (const line of lines) consume(line); }
    pending += decoder.decode(); if (pending.trim()) consume(pending);
    if (!finished) throw new Error('Connection ended before creation was confirmed. Refresh projects and inspect the target before retrying.');
  } finally { reader.releaseLock(); }
}
export async function startPlan(owner: string, goal: string): Promise<{ id: string; status: string; url: string }> {
  const response = await appFetch('/api/v1/projects/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner, goal }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Codeitz plan could not start.'); return result;
}
