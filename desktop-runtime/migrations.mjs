import { sql } from "kysely";
export const migrations = {
  "20261121_agent_foundation": {
    async up(db) {
      await db.schema
        .createTable("agent_conversations")
        .addColumn("id", "uuid", (c) => c.primaryKey())
        .addColumn("title", "text", (c) => c.notNull())
        .addColumn("provider_thread_id", "text")
        .addColumn("provider_session_id", "text")
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .execute();
      await db.schema
        .createTable("agent_operations")
        .addColumn("id", "uuid", (c) => c.primaryKey())
        .addColumn("conversation_id", "uuid", (c) =>
          c.notNull().references("agent_conversations.id"),
        )
        .addColumn("request_key", "text", (c) => c.notNull())
        .addColumn("kind", "text", (c) => c.notNull())
        .addColumn("goal", "text", (c) => c.notNull())
        .addColumn("workspace", "text", (c) => c.notNull())
        .addColumn("digest", "text", (c) => c.notNull())
        .addColumn("state", "text", (c) => c.notNull())
        .addColumn("provider_thread_id", "text")
        .addColumn("provider_session_id", "text")
        .addColumn("provider_turn_id", "text")
        .addColumn("approved_at", "timestamptz")
        .addColumn("result", "text")
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .execute();
      await db.schema
        .createIndex("agent_request_identity")
        .on("agent_operations")
        .columns(["conversation_id", "request_key"])
        .unique()
        .execute();
      await db.schema
        .createTable("agent_messages")
        .addColumn("id", "uuid", (c) => c.primaryKey())
        .addColumn("conversation_id", "uuid", (c) =>
          c.notNull().references("agent_conversations.id"),
        )
        .addColumn("operation_id", "uuid", (c) =>
          c.references("agent_operations.id"),
        )
        .addColumn("role", "text", (c) => c.notNull())
        .addColumn("text", "text", (c) => c.notNull())
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .execute();
      await db.schema
        .createTable("agent_events")
        .addColumn("id", "bigserial", (c) => c.primaryKey())
        .addColumn("operation_id", "uuid", (c) =>
          c.references("agent_operations.id"),
        )
        .addColumn("type", "text", (c) => c.notNull())
        .addColumn("data", "jsonb", (c) => c.notNull())
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .execute();
    },
    async down() {
      throw new Error(
        "Forward-only agent records; restore a checked backup instead",
      );
    },
  },
  "20261121_agent_runtime_constraints": {
    async up(db) {
      await sql`ALTER TABLE agent_operations ADD CONSTRAINT agent_operation_state CHECK (state IN ('awaiting-approval','running','completed','interrupted','rejected'))`.execute(
        db,
      );
      await sql`ALTER TABLE agent_operations ADD CONSTRAINT agent_operation_kind CHECK (kind IN ('chat','worker'))`.execute(
        db,
      );
      await sql`ALTER TABLE agent_messages ADD CONSTRAINT agent_message_role CHECK (role IN ('user','assistant'))`.execute(
        db,
      );
      await sql`CREATE UNIQUE INDEX agent_one_running_operation ON agent_operations ((1)) WHERE state = 'running'`.execute(
        db,
      );
      await sql`CREATE UNIQUE INDEX agent_one_assistant_result ON agent_messages(operation_id) WHERE role = 'assistant'`.execute(
        db,
      );
    },
    async down() {
      throw new Error("Forward-only agent records");
    },
  },
  "20261121_agent_runtime_reviewed_recovery": {
    async up(db) {
      await sql`ALTER TABLE agent_operations DROP CONSTRAINT agent_operation_state`.execute(
        db,
      );
      await sql`ALTER TABLE agent_operations ADD CONSTRAINT agent_operation_state CHECK (state IN ('awaiting-approval','running','completed','interrupted','rejected','reviewed'))`.execute(
        db,
      );
    },
    async down() {
      throw new Error("Forward-only reviewed recovery records");
    },
  },
  "20261121_agent_workspace_projects": {
    async up(db) {
      await db.schema
        .createTable("agent_apps")
        .addColumn("id", "uuid", (c) => c.primaryKey())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("repository", "text", (c) => c.notNull().unique())
        .addColumn("source_project_owner", "text")
        .addColumn("head", "text", (c) => c.notNull())
        .addColumn("dirty_fingerprint", "text", (c) => c.notNull())
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .execute();
      await db.schema
        .alterTable("agent_conversations")
        .addColumn("app_id", "uuid", (c) => c.references("agent_apps.id"))
        .execute();
      await db.schema
        .createTable("agent_coworkers")
        .addColumn("id", "uuid", (c) => c.primaryKey())
        .addColumn("conversation_id", "uuid", (c) =>
          c.notNull().references("agent_conversations.id"),
        )
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("provider_thread_id", "text")
        .addColumn("provider_session_id", "text")
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .execute();
      await sql`CREATE UNIQUE INDEX agent_coworker_names ON agent_coworkers(conversation_id,lower(name))`.execute(
        db,
      );
      await db.schema
        .alterTable("agent_operations")
        .addColumn("app_id", "uuid", (c) => c.references("agent_apps.id"))
        .addColumn("coworker_id", "uuid", (c) =>
          c.references("agent_coworkers.id"),
        )
        .addColumn("task_reference", "jsonb")
        .addColumn("repository_snapshot", "jsonb")
        .addColumn("change_manifest", "jsonb")
        .addColumn("apply_receipt", "jsonb")
        .addColumn("applied_at", "timestamptz")
        .execute();
    },
    async down() {
      throw new Error("Project/chat/coworker history is forward-only");
    },
  },
  "20261121_agent_workspace_z_attachments": {
    async up(db) {
      await db.schema
        .createTable("agent_attachments")
        .addColumn("id", "uuid", (c) => c.primaryKey())
        .addColumn("conversation_id", "uuid", (c) =>
          c.notNull().references("agent_conversations.id"),
        )
        .addColumn("request_key", "text", (c) => c.notNull())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("mime", "text", (c) => c.notNull())
        .addColumn("size", "integer", (c) => c.notNull())
        .addColumn("sha256", "text", (c) => c.notNull())
        .addColumn("state", "text", (c) => c.notNull())
        .addColumn("extracted_text", "text")
        .addColumn("width", "integer")
        .addColumn("height", "integer")
        .addColumn("error", "text")
        .addColumn("sent_at", "timestamptz")
        .addColumn("store_sent_at", "timestamptz")
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .addUniqueConstraint("agent_attachment_request_identity", [
          "conversation_id",
          "request_key",
        ])
        .execute();
      await sql`ALTER TABLE agent_attachments ADD CONSTRAINT agent_attachment_state CHECK (state IN ('uploading','ready','failed','removed'))`.execute(
        db,
      );
      await sql`ALTER TABLE agent_attachments ADD CONSTRAINT agent_attachment_bytes CHECK (size > 0 AND size <= 5242880)`.execute(
        db,
      );
      await db.schema
        .createTable("agent_message_attachments")
        .addColumn("operation_id", "uuid", (c) =>
          c.notNull().references("agent_operations.id"),
        )
        .addColumn("attachment_id", "uuid", (c) =>
          c.notNull().references("agent_attachments.id"),
        )
        .addColumn("sha256", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint("agent_message_attachment_identity", [
          "operation_id",
          "attachment_id",
        ])
        .execute();
      await db.schema
        .alterTable("agent_operations")
        .addColumn("attachment_refs", "jsonb")
        .execute();
      await sql`CREATE UNIQUE INDEX agent_one_user_input ON agent_messages(operation_id) WHERE role='user'`.execute(
        db,
      );
    },
    async down() {
      throw new Error(
        "Sent attachment identities and message history are forward-only",
      );
    },
  },
  "20261122_agent_parallel_coworkers": {
    async up(db) {
      await db.schema
        .alterTable("agent_operations")
        .addColumn("execution_slot", "smallint")
        .addColumn("progress", "jsonb")
        .addColumn("progress_sequence", "integer", (c) =>
          c.notNull().defaultTo(0),
        )
        .addColumn("execution_error", "text")
        .addColumn("dispatch_started_at", "timestamptz")
        .execute();
      await sql`ALTER TABLE agent_operations ADD CONSTRAINT agent_execution_slot_range CHECK (execution_slot IS NULL OR execution_slot BETWEEN 0 AND 2)`.execute(
        db,
      );
      await sql`DROP INDEX agent_one_running_operation`.execute(db);
      await sql`CREATE UNIQUE INDEX agent_running_slot ON agent_operations(execution_slot) WHERE state='running' AND execution_slot IS NOT NULL`.execute(
        db,
      );
      await sql`CREATE UNIQUE INDEX agent_running_coworker ON agent_operations(coworker_id) WHERE state='running' AND kind='worker' AND coworker_id IS NOT NULL`.execute(
        db,
      );
      await sql`CREATE UNIQUE INDEX agent_running_supervisor ON agent_operations(conversation_id) WHERE state='running' AND kind='chat'`.execute(
        db,
      );
      await sql`CREATE UNIQUE INDEX agent_running_legacy_worker ON agent_operations(conversation_id) WHERE state='running' AND kind='worker' AND coworker_id IS NULL`.execute(
        db,
      );
      await sql`CREATE UNIQUE INDEX agent_running_provider_thread ON agent_operations(provider_thread_id) WHERE state='running' AND provider_thread_id IS NOT NULL`.execute(
        db,
      );
    },
    async down() {
      throw new Error("Concurrent task/progress history is forward-only");
    },
  },
  "20261122_agent_verification_activity": {
    async up(db) {
      await db.schema
        .alterTable("agent_operations")
        .addColumn("verification_profile", "jsonb")
        .execute();
      await db.schema
        .createTable("agent_verifications")
        .addColumn("id", "uuid", (c) => c.primaryKey())
        .addColumn("operation_id", "uuid", (c) =>
          c.notNull().references("agent_operations.id"),
        )
        .addColumn("digest", "text", (c) => c.notNull())
        .addColumn("profile", "jsonb", (c) => c.notNull())
        .addColumn("manifest_digest", "text", (c) => c.notNull())
        .addColumn("workspace", "text", (c) => c.notNull())
        .addColumn("state", "text", (c) => c.notNull())
        .addColumn("approved_at", "timestamptz")
        .addColumn("approved_by", "text")
        .addColumn("started_at", "timestamptz")
        .addColumn("finished_at", "timestamptz")
        .addColumn("receipt", "jsonb")
        .addColumn("created_at", "timestamptz", (c) =>
          c.notNull().defaultTo(sql`now()`),
        )
        .addUniqueConstraint("agent_verification_approval", [
          "operation_id",
          "digest",
        ])
        .execute();
      await sql`ALTER TABLE agent_verifications ADD CONSTRAINT agent_verification_state CHECK (state IN ('awaiting-approval','running','passed','failed','interrupted'))`.execute(
        db,
      );
      await sql`CREATE UNIQUE INDEX agent_one_running_verification ON agent_verifications(operation_id) WHERE state='running'`.execute(
        db,
      );
      await sql`CREATE INDEX agent_operation_activity_cursor ON agent_events(operation_id,id)`.execute(
        db,
      );
    },
    async down() {
      throw new Error("Verification approval history is forward-only");
    },
  },
  "20261123_agent_completion_assessment": {
    async up(db) {
      await db.schema.alterTable("agent_operations").addColumn("completion_assessment", "jsonb").execute();
    },
    async down() {
      throw new Error("Completion assessment history is forward-only");
    },
  },
};
