import type { Generated } from 'kysely';
export type AuditFields = {
  id: Generated<number>; public_id: string; active: Generated<boolean>;
  created_at: Generated<Date>; updated_at: Generated<Date>; created_by: string; updated_by: string;
  deleted_at: Date | null; deleted_by: string | null;
};
export type TodoDatabase = {
  todos: AuditFields & {
    legacy_id: string | null; title: string; priority: string; category_id: number | null;
    due_date: string | null; scheduled_at: Date | null; reminded_at: Date | null;
    status: string; project_id: string; visibility: string; position: number;
  };
  todo_categories: AuditFields & { name: string };
  todo_state: { id: number; revision: number };
  todo_imports: { source: string; checksum: string; imported_at: Generated<Date>; details: string };
};
