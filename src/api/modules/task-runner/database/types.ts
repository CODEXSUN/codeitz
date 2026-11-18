import type { Generated } from 'kysely';
export interface RunnerDatabase {
 coding_tasks:{id:string;created_at:string;body:string};
 coding_task_events:{id:Generated<number>;task_id:string;time:string;kind:string;message:string};
 coding_task_metadata:{key:string;value:string};
}
