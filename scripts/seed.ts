import {seed as seed_runner} from '../src/api/modules/task-runner/database/seeders/seed.ts';
import {seed as seed_chat} from '../src/api/modules/agent-chat/database/seeders/seed.ts';
import { seed as seed_projects } from '../src/api/modules/projects/database/seeders/seed.ts';
import { loadCodeitzConfig } from '../src/api/config.ts';
import { seed as seed_user } from '../src/api/modules/master/user/database/seeders/seed.ts';
import { seed as seed_contact } from '../src/api/modules/master/contact/database/seeders/seed.ts';
import { seed as seed_task_list } from '../src/api/modules/master/task-list/database/seeders/seed.ts';
import { seed as seed_task_priority } from '../src/api/modules/master/task-priority/database/seeders/seed.ts';
import { seed as seed_task_status } from '../src/api/modules/master/task-status/database/seeders/seed.ts';
import { seed as seed_business_task } from '../src/api/modules/business/task/database/seeders/seed.ts';
import { openDatabase } from '../src/api/database.ts';
import { seed } from '../src/api/modules/todos/database/seeders/seed.ts';
const db = openDatabase();
try { console.log(await seed(db)); console.log(await seed_user(db)); console.log(await seed_contact(db)); console.log(await seed_task_list(db)); console.log(await seed_task_priority(db)); console.log(await seed_task_status(db)); console.log(await seed_business_task(db)); console.log(await seed_projects(db,loadCodeitzConfig().auditRoot));console.log(await seed_runner());console.log(await seed_chat()); }
catch (error) { console.error(error instanceof Error ? error.message : 'Seed failed.'); process.exitCode = 1; }
finally { await db.destroy(); }
