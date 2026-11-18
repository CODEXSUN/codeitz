import { z } from 'zod';
import { todoFields, todoInput, todoId } from '../../../../contracts/todo.ts';
const revision = z.number().int().nonnegative();
const response = z.toJSONSchema(z.object({ revision, todos: z.array(todoFields.extend({ id: todoId, position: z.number().int(), createdAt: z.string(), updatedAt: z.string(), remindedAt: z.string().optional() })), projects: z.array(z.object({ id: z.string(), name: z.string(), icon: z.string() })), categories: z.array(z.string()) }));
export const todoOperations = {
  'PATCH /api/v1/todos/categories': { operationId: 'renameTodoCategory', summary: 'Rename a category and all linked todo assignments atomically; reject stale revisions and duplicate names', body: z.toJSONSchema(z.object({ revision, name: z.string().trim().min(1).max(80), nextName: z.string().trim().min(1).max(80) }).strict()), response },
  'DELETE /api/v1/todos/categories': { operationId: 'removeTodoCategory', summary: 'Delete a category and clear its todo assignments without deleting todos', body: z.toJSONSchema(z.object({ revision, name: z.string().trim().min(1).max(80) }).strict()), response },
  'POST /api/v1/todos/categories': { operationId: 'createTodoCategory', summary: 'Persist an independent reusable category; case-insensitive duplicates reuse its saved name', status: '201', body: z.toJSONSchema(z.object({ revision, name: z.string().trim().min(1).max(80) }).strict()), response },
  'GET /api/v1/todos': { operationId: 'listTodos', summary: 'Read database-backed todos, workspace projects, categories and collection revision', response },
  'POST /api/v1/todos': { operationId: 'createTodo', summary: 'Create a private-by-default todo; public visibility is local metadata only', status: '201', body: z.toJSONSchema(z.object({ revision, input: todoInput }).strict()), response },
  'PATCH /api/v1/todos/{id}': { operationId: 'updateTodo', summary: 'Persist inline title, priority, category, date, project, status and visibility changes; stale revisions return 409', body: z.toJSONSchema(z.object({ revision, changes: todoFields.partial() }).strict()), response },
  'DELETE /api/v1/todos/{id}': { operationId: 'deleteTodo', summary: 'Soft-delete a todo in the database', body: z.toJSONSchema(z.object({ revision }).strict()), response },
  'POST /api/v1/todos/reorder': { operationId: 'reorderTodos', summary: 'Atomically save every current todo ID in the chosen order; reject stale or incomplete orders', body: z.toJSONSchema(z.object({ revision, orderedIds: z.array(todoId).max(10000) }).strict()), response },
};
