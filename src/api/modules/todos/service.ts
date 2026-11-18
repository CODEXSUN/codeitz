import type { TodoInput, TodoSnapshot } from '../../../../contracts/todo.ts';
export class TodoError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 409) { super(message); this.statusCode = statusCode; }
}
type Result<T> = T | Promise<T>;
export interface TodoRepository {
  read(): Result<TodoSnapshot>;
  createCategory(revision: number, name: string): Result<TodoSnapshot>;
  changeCategory(revision: number, name: string, nextName?: string): Result<TodoSnapshot>;
  create(revision: number, input: TodoInput): Result<TodoSnapshot>;
  update(revision: number, id: string, changes: Partial<TodoInput>): Result<TodoSnapshot>;
  remove(revision: number, id: string): Result<TodoSnapshot>;
  reorder(revision: number, ids: string[]): Result<TodoSnapshot>;
  deliverDue(now?: string): Result<number>;
  close?(): Promise<void>;
}
