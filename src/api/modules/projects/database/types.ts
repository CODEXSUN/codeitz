import type { Generated } from 'kysely';
export interface ProjectRow { id: Generated<number>; owner: string; name: string; area: 'apps'|'devkit'; purpose: string; order_no: Generated<number>; active: Generated<boolean>; created_at: string|null; recorded_at: Generated<string> }
export interface ContentRow { id:string; project_id:number; title:string; content:string; status:string; revision:Generated<number>; created_at:string; updated_at:string; category?:Generated<string>; assigned_to?:Generated<string> }
interface DesignRow { id:string; module_id:string; position:number; body:string }
export interface ProjectDatabase {
 module_approvals:{id:string;module_id:string;revision:number;approved_at:string;approved_by:string;fingerprint:string;snapshot:string;audit:string};
 projects: ProjectRow;
 project_setup: {project_id:number;port:number|null;state:'scaffolded'|'configured'|'structure-only';audit_passed:number|null;installation:string;runtime_verification:string};
 project_notes: ContentRow; project_modules: ContentRow; project_architectures: ContentRow; project_whiteboards:ContentRow; project_schemas:ContentRow;
 project_changelog:{id:Generated<number>;project_id:number;kind:string;title:string;action:string;created_at:string};
 project_note_options:{id:string;project_id:number;kind:'category'|'status';value:string};
 module_details:{module_id:string;body:string};module_api_routes:DesignRow;module_actions:DesignRow;module_events:DesignRow;module_tables:DesignRow;module_dependencies:DesignRow;
 module_table_fields:{id:string;table_id:string;position:number;body:string};
 project_seed_records:{name:string};project_legacy_migrations:{version:number};
 project_imports:{source:string;checksum:string;details:string;imported_at:Generated<Date>};
}
export const contentTables = {notes:'project_notes',modules:'project_modules',architectures:'project_architectures',whiteboards:'project_whiteboards',schemas:'project_schemas'} as const;
export const designTables = {apiRoutes:'module_api_routes',actions:'module_actions',events:'module_events',tables:'module_tables',dependencies:'module_dependencies'} as const;
export const legacyTables = ['projects','project_setup',...Object.values(contentTables),'project_changelog','project_note_options','module_details',...Object.values(designTables),'module_table_fields','schema_migrations','seed_records'] as const;
export const destinationTable = (name:string) => name==='schema_migrations'?'project_legacy_migrations':name==='seed_records'?'project_seed_records':name;
