import {appFetch} from '../../platform-client';
import type { ProjectWorkspace, WorkspaceKind, WorkspaceInput, WorkspaceRecord, TaskAudit } from '../../../../contracts/workspace';
async function request<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await appFetch(url, body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.message ?? 'Request failed.'); return data;
}
const base = (owner: string) => `/api/v1/projects/${owner}`;
export const loadWorkspace = (owner: string) => request<ProjectWorkspace>(`${base(owner)}/workspace`);
export const saveWorkspace = (owner: string, kind: WorkspaceKind, record: WorkspaceInput) => request<WorkspaceRecord>(`${base(owner)}/workspace/${kind}`, record);
export const auditTask = (owner: string, id: string) => request<TaskAudit>(`${base(owner)}/tasks/${id}/audit`, {});
export const reviewTask = (owner: string, id: string, decision: 'accepted' | 'changes_requested', feedback: string) => request(`${base(owner)}/tasks/${id}/review`, { decision, feedback });

export const loadNote = (owner: string, id: string) => request<WorkspaceRecord>(`/api/v1/projects/${owner}/notes/${id}`);
export const saveNote = (owner: string, record: WorkspaceInput) => {
  const { id, revision, ...fields } = record;
  return id ? request<WorkspaceRecord>(`/api/v1/projects/${owner}/notes/${id}`, { ...fields, revision }, 'PATCH') : request<WorkspaceRecord>(`/api/v1/projects/${owner}/notes`, fields);
};

export const loadNoteOptions=(owner:string)=>request<import('../../../../contracts/notes').NoteOptions>(`/api/v1/projects/${owner}/notes/options`);
export const createNoteOption=(owner:string,kind:'category'|'status',label:string)=>request<import('../../../../contracts/notes').NoteOption>(`/api/v1/projects/${owner}/notes/options/${kind}`,{label});
