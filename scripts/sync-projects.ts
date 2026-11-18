import {openDatabase} from '../src/api/database.ts';
import {loadCodeitzConfig} from '../src/api/config.ts';
import {syncProjectCatalog} from '../src/api/modules/projects/application/catalog.ts';
const db=openDatabase();
try{console.log(await syncProjectCatalog(db,loadCodeitzConfig().auditRoot));}
catch(error){console.error(error instanceof Error?error.message:'Project catalog refresh failed.');process.exitCode=1;}
finally{await db.destroy();}
