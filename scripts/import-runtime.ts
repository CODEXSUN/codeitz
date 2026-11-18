import path from 'node:path';
import {openDatabase} from '../src/api/database.ts';
import {appRoot} from '../src/api/config.ts';
import {sqliteSnapshot as runnerSnapshot,importSqlite as importRunner} from '../src/api/modules/task-runner/database/import-sqlite.ts';
import {sqliteSnapshot as chatSnapshot,importSqlite as importChat} from '../src/api/modules/agent-chat/database/import-sqlite.ts';
const db=openDatabase();try{console.log(JSON.stringify({runner:await importRunner(db,runnerSnapshot(path.join(appRoot,'.codeitz/tasks/runner.sqlite'))),chat:await importChat(db,chatSnapshot(path.join(appRoot,'.codeitz/chat/chat.sqlite')))}));}finally{await db.destroy();}
