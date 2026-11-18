import type { Generated } from 'kysely';
export interface ChatDatabase {
 agent_conversations:{id:string;owner:string;title:string;created_at:string;updated_at:string};
 agent_messages:{id:string;chat_id:string;body:string;request_id:string|null;reply_to:string|null;position:Generated<number>};
 agent_chat_activity:{id:Generated<number>;chat_id:string;kind:string;message:string;time:string};
 agent_chat_task_links:{message_id:string;chat_id:string;task_id:string;approved_at:string;state:'pending'|'ready'};
 agent_chat_imports:{source:string;checksum:string;details:string};
 agent_chat_state:{id:number};
}
