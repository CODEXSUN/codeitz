export type TaskStatus = 'draft' | 'planning' | 'planned' | 'coding' | 'coded' | 'checking' | 'completed' | 'failed';
export type CodingTask = {
  id: string; owner: string; goal: string; status: TaskStatus;
  createdAt: string; updatedAt: string; plan: string; result: string;
  checks: { name: string; passed: boolean; output: string }[];
  changedFiles: string[]; error?: string;
  sourceChat?: { conversationId: string; messageId: string; approvedAt: string };
  codingResult?: string; completionSummaryVersion?: number; parentTaskId?: string;
  review?: { decision: 'accepted' | 'changes_requested'; reviewedAt: string; feedback?: string; followUpTaskId?: string };
  archivedAt?: string; droppedAt?: string; events?: TaskEvent[];
};
export const activeTaskStatuses: TaskStatus[] = ['planning', 'coding', 'checking'];

export type TaskEvent = { id: number; taskId: string; time: string; kind: 'phase' | 'codex' | 'tool' | 'check' | 'audit' | 'record'; message: string };
export type TaskAudit = { passed: boolean; findings: { label: string; passed: boolean; detail: string }[] };

export type ApprovedChatPlan = { taskId: string; owner: string; goal: string; plan: string; source: NonNullable<CodingTask['sourceChat']> };
export type ChatPlanTaskCreator = { createFromChatPlan(input: ApprovedChatPlan): Promise<CodingTask> };
