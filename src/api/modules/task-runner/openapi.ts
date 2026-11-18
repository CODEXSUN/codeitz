const text = { type: 'string' };
const task = { type: 'object', required: ['id', 'owner', 'goal', 'status', 'plan', 'result', 'checks', 'changedFiles', 'createdAt', 'updatedAt'], properties: {
  id: { type: 'string', format: 'uuid' }, owner: text, goal: text,
  status: { type: 'string', enum: ['draft','planning','planned','coding','coded','checking','completed','failed'] },
  plan: text, result: text, createdAt: text, updatedAt: text, error: text,
  checks: { type: 'array', items: { type: 'object', properties: { name: text, passed: { type: 'boolean' }, output: text } } },
  changedFiles: { type: 'array', items: text }, events: { type: 'array', items: { type: 'object', properties: { id: text, taskId: text, time: text, kind: text, message: text } } },
  review: { type: 'object', properties: { decision: { enum: ['accepted', 'changes_requested'] }, reviewedAt: text, feedback: text, followUpTaskId: text } },
  sourceChat: { type: 'object', properties: { conversationId: {type:'string',format:'uuid'}, messageId: {type:'string',format:'uuid'}, approvedAt: text } },
  parentTaskId: text, archivedAt: text, droppedAt: text,
} };
const object = (properties: object, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
export const taskOperations = {
  'GET /api/v1/tasks': { operationId: 'listTasks', summary: 'Read saved task records', response: object({ tasks: { type: 'array', items: task } }) },
  'GET /api/v1/tasks/stream': { operationId: 'streamTasks', summary: 'Live snapshots and task/activity events; heartbeat comments every 15 seconds', media: 'text/event-stream', response: { type: 'string', description: 'SSE data: JSON snapshot, task, activity or error event, separated by blank lines.' } },
  'GET /api/v1/tasks/setup': { operationId: 'getTaskSetup', summary: 'List products and detect the existing local Codex session; never starts login', response: object({ products: { type: 'array', items: object({ owner: text, name: text }) }, codex: object({ available: { type: 'boolean' }, signedIn: { type: 'boolean' }, version: text, message: text }) }) },
  'POST /api/v1/tasks': { operationId: 'createTaskPlan', summary: 'Create a task and start read-only planning', body: object({ owner: { type: 'string', minLength: 1, maxLength: 150 }, goal: { type: 'string', minLength: 1, maxLength: 3000 } }), status: '202', response: task },
  'POST /api/v1/tasks/{id}/step': { operationId: 'runTaskStep', summary: 'Explicitly start planning, approved coding, or checks', body: object({ action: { enum: ['plan', 'code', 'check'] } }), status: '202', response: task },
  'POST /api/v1/tasks/{id}/review': { operationId: 'reviewTaskResult', summary: 'Accept a result or request a linked follow-up', body: object({ decision: { enum: ['accepted', 'changes_requested'] }, feedback: { type: 'string', maxLength: 3000 } }, ['decision']), response: object({ task, followUpTaskId: text }, ['task']) },
  'POST /api/v1/tasks/{id}/manage': { operationId: 'manageTaskRecord', summary: 'Archive, drop or restore a saved task', body: object({ action: { enum: ['archive', 'restore', 'drop'] } }), response: task },
  'POST /api/v1/tasks/{id}/audit': { operationId: 'auditTaskRecord', summary: 'Audit saved evidence without rerunning code', response: object({ passed: { type: 'boolean' }, findings: { type: 'array', items: object({ label: text, passed: { type: 'boolean' }, detail: text }) } }) },
};
