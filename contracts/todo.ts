import { z } from 'zod';
// Legacy UUIDs remain accepted for imported records; new PostgreSQL records use public IDs.
export const todoId = z.union([z.string().regex(/^[a-z0-9]{8}$/), z.string().uuid()]);
export const todoFields = z.object({
  title: z.string().trim().min(1).max(500),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  category: z.string().trim().max(80),
  dueDate: z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Choose a valid date.'),
  scheduledAt: z.union([z.literal(''), z.iso.datetime()]).optional(),
  status: z.enum(['open', 'in-progress', 'done']),
  projectId: z.string().max(150),
  visibility: z.enum(['private', 'public']),
}).strict();
export const todoInput = todoFields.partial().required({ title: true });
export type TodoInput = z.infer<typeof todoFields>;
export type Todo = TodoInput & { id: string; position: number; createdAt: string; updatedAt: string; remindedAt?: string };
export type TodoSnapshot = { todos: Todo[]; revision: number; categories: string[] };
export type TodoProject = { id: string; name: string; icon: string };
export type TodoData = TodoSnapshot & { projects: TodoProject[]; categories: string[] };
