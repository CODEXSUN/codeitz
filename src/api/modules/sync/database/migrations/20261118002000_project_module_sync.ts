import {sql,type Kysely} from 'kysely';
export async function up(db:Kysely<any>){
 const schema=/from "([^"]+)"\."projects"/.exec(db.selectFrom('projects').select('id').compile().sql)?.[1]??'public';
 const q='"'+schema.replaceAll('"','""')+'"';
 await sql.raw(`
 CREATE TABLE ${q}.sync_identity(id boolean PRIMARY KEY DEFAULT true CHECK(id), origin uuid NOT NULL);
 INSERT INTO ${q}.sync_identity VALUES(true,gen_random_uuid());
 CREATE TABLE ${q}.sync_connections(id uuid PRIMARY KEY, name text NOT NULL, url text NOT NULL, owners jsonb NOT NULL, token text NOT NULL UNIQUE, secret_hash text NOT NULL, remote_token text NOT NULL DEFAULT '', secret_env text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true);
 CREATE TABLE ${q}.sync_policies(table_name text PRIMARY KEY,entity text NOT NULL,save_mode text NOT NULL DEFAULT 'draft_confirm' CHECK(save_mode='draft_confirm'));
 INSERT INTO ${q}.sync_policies(table_name,entity) VALUES ('projects','project'),('project_modules','module'),('module_details','module'),('module_api_routes','module'),('module_actions','module'),('module_events','module'),('module_dependencies','module'),('module_tables','module'),('module_table_fields','module');
 CREATE TABLE ${q}.sync_heads(kind text NOT NULL,owner text NOT NULL,record_id text NOT NULL,payload jsonb,fingerprint text,PRIMARY KEY(kind,owner,record_id));
 CREATE TABLE ${q}.sync_activities(seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,id uuid NOT NULL UNIQUE,origin uuid NOT NULL,kind text NOT NULL,owner text NOT NULL,record_id text NOT NULL,action text NOT NULL,before_hash text,payload jsonb,happened_at text NOT NULL,source text NOT NULL);
 CREATE TABLE ${q}.sync_deliveries(id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES ${q}.sync_activities(id),connection_id uuid NOT NULL REFERENCES ${q}.sync_connections(id),state text NOT NULL DEFAULT 'queued',attempts integer NOT NULL DEFAULT 0,error text NOT NULL DEFAULT '',next_attempt timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,connection_id));
 CREATE TABLE ${q}.sync_inbox(id uuid PRIMARY KEY,connection_id uuid NOT NULL REFERENCES ${q}.sync_connections(id),origin uuid NOT NULL,event_id uuid NOT NULL,event jsonb NOT NULL,state text NOT NULL DEFAULT 'draft',received_at text NOT NULL,reviewed_at text,reviewed_by text,detail text NOT NULL DEFAULT '',UNIQUE(origin,event_id));
 CREATE INDEX sync_deliveries_due ON ${q}.sync_deliveries(next_attempt) WHERE state IN ('queued','failed','awaiting_confirmation','conflict');
 CREATE OR REPLACE FUNCTION ${q}.sync_snapshot(k text,o text,r text) RETURNS jsonb LANGUAGE plpgsql SET search_path TO ${q},pg_catalog AS $$
 DECLARE result jsonb; mid text;
 BEGIN
 IF k='project' THEN SELECT jsonb_build_object('owner',owner,'name',name,'area',area,'purpose',purpose,'orderNo',order_no,'active',active) INTO result FROM projects WHERE owner=o; RETURN result; END IF;
 SELECT jsonb_build_object('title',m.title,'content',m.content,'status',m.status,'spec',jsonb_build_object('code','','owner','','version','','responsibility','')||coalesce(d.body::jsonb,'{}')||jsonb_build_object(
 'apiRoutes',coalesce((SELECT jsonb_agg(body::jsonb ORDER BY position) FROM module_api_routes WHERE module_id=m.id),'[]'),
 'actions',coalesce((SELECT jsonb_agg(body::jsonb ORDER BY position) FROM module_actions WHERE module_id=m.id),'[]'),
 'events',coalesce((SELECT jsonb_agg(body::jsonb ORDER BY position) FROM module_events WHERE module_id=m.id),'[]'),
 'dependencies',coalesce((SELECT jsonb_agg(body::jsonb ORDER BY position) FROM module_dependencies WHERE module_id=m.id),'[]'),
 'tables',coalesce((SELECT jsonb_agg(t.body::jsonb||jsonb_build_object('fields',coalesce((SELECT jsonb_agg(f.body::jsonb ORDER BY f.position) FROM module_table_fields f WHERE f.table_id=t.id),'[]')) ORDER BY t.position) FROM module_tables t WHERE t.module_id=m.id),'[]'))) INTO result
 FROM project_modules m JOIN projects p ON p.id=m.project_id LEFT JOIN module_details d ON d.module_id=m.id WHERE p.owner=o AND m.id=r;
 RETURN result; END $$;
 CREATE OR REPLACE FUNCTION ${q}.sync_capture(k text,o text,r text) RETURNS void LANGUAGE plpgsql SET search_path TO ${q},pg_catalog AS $$
 DECLARE value jsonb; old_hash text; new_hash text; eid uuid; source_id uuid;
 BEGIN
 value:=sync_snapshot(k,o,r);new_hash:=CASE WHEN value IS NULL THEN NULL ELSE encode(sha256(convert_to(value::text,'UTF8')),'hex') END;
 SELECT fingerprint INTO old_hash FROM sync_heads WHERE kind=k AND owner=o AND record_id=r FOR UPDATE;
 IF old_hash IS NOT DISTINCT FROM new_hash THEN RETURN; END IF;
 INSERT INTO sync_heads VALUES(k,o,r,value,new_hash) ON CONFLICT(kind,owner,record_id) DO UPDATE SET payload=excluded.payload,fingerprint=excluded.fingerprint;
 IF current_setting('codeitz.sync_apply',true)='on' THEN RETURN; END IF;
 eid:=gen_random_uuid();SELECT origin INTO source_id FROM sync_identity;
 INSERT INTO sync_activities(id,origin,kind,owner,record_id,action,before_hash,payload,happened_at,source) VALUES(eid,source_id,k,o,r,CASE WHEN value IS NULL THEN 'deleted' WHEN old_hash IS NULL THEN 'created' ELSE 'updated' END,old_hash,value,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'local');
 INSERT INTO sync_deliveries(id,event_id,connection_id) SELECT gen_random_uuid(),eid,id FROM sync_connections WHERE enabled AND owners ? o;
 END $$;
 CREATE OR REPLACE FUNCTION ${q}.sync_changed() RETURNS trigger LANGUAGE plpgsql SET search_path TO ${q},pg_catalog AS $$
 DECLARE o text;r text;
 BEGIN
 IF TG_TABLE_NAME='projects' THEN o:=CASE WHEN TG_OP='DELETE' THEN OLD.owner ELSE NEW.owner END;PERFORM sync_capture('project',o,o);
 ELSE r:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;SELECT owner INTO o FROM projects WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END;IF o IS NULL THEN SELECT owner INTO o FROM sync_heads WHERE kind='module' AND record_id=r;END IF;IF o IS NOT NULL THEN PERFORM sync_capture('module',o,r);END IF;END IF;
 RETURN NULL;END $$;
 CREATE CONSTRAINT TRIGGER sync_projects AFTER INSERT OR UPDATE OR DELETE ON ${q}.projects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${q}.sync_changed();
 CREATE CONSTRAINT TRIGGER sync_modules AFTER INSERT OR UPDATE OR DELETE ON ${q}.project_modules DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${q}.sync_changed();
 SELECT set_config('codeitz.sync_apply','on',true);
 SELECT ${q}.sync_capture('project',owner,owner) FROM ${q}.projects;
 SELECT ${q}.sync_capture('module',p.owner,m.id) FROM ${q}.project_modules m JOIN ${q}.projects p ON p.id=m.project_id;
 SELECT set_config('codeitz.sync_apply','off',true);
 `).execute(db);
}
export async function down(){throw new Error('Sync history is retained; no destructive automatic rollback.');}
