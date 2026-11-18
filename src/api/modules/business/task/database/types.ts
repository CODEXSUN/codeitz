import type { Generated } from "kysely";
interface Audit {
  id: Generated<number>;
  public_id: string;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  created_by: string;
  updated_by: string;
  deleted_at: Date | null;
  deleted_by: string | null;
}
export interface TaskDatabase {
  tasks: Audit & {
    title: string;
    details: string;
    contact_id: number | null;
    list_id: number | null;
    assigned_user_id: number | null;
    priority_id: number;
    status_id: number;
    due_date: string | null;
    revision: Generated<number>;
    request_id: string;
    request_hash: string;
  };
  task_comments: Audit & {
    task_id: number;
    parent_id: number | null;
    body: string;
  };
  task_jobs: Audit & {
    task_id: number;
    started_at: Generated<Date>;
    stopped_at: Date | null;
    note: string;
  };
  task_charges: Audit & {
    task_id: number;
    description: string;
    amount: string;
    currency: string;
  };
  task_schedules: Audit & {
    task_id: number;
    title: string;
    scheduled_at: Date;
    state: string;
    reminded_at: Date | null;
  };
  task_checkpoints: Audit & {
    task_id: number;
    checked_in_at: Generated<Date>;
    checked_out_at: Date | null;
    note: string;
  };
  task_closure_requests: Audit & {
    task_id: number;
    reason: string;
    state: string;
    review_note: string | null;
    reviewed_by: string | null;
    reviewed_at: Date | null;
  };
  task_activities: Audit & {
    task_id: number;
    kind: string;
    details: string;
    request_id: string | null;
    request_hash: string;
  };
}
