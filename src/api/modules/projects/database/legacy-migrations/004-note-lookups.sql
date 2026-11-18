CREATE TABLE project_note_options (
 id TEXT PRIMARY KEY,
 project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('category','status')),
 value TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(value)) BETWEEN 1 AND 100),
 UNIQUE(project_id,kind,value)
) STRICT;
CREATE INDEX project_note_options_project ON project_note_options(project_id,kind);
CREATE TABLE project_notes_updated (
 id TEXT PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(length(trim(status)) BETWEEN 1 AND 100),
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'General', assigned_to TEXT NOT NULL DEFAULT ''
) STRICT;
INSERT INTO project_notes_updated SELECT id,project_id,title,content,status,revision,created_at,updated_at,category,assigned_to FROM project_notes;
DROP TABLE project_notes;
ALTER TABLE project_notes_updated RENAME TO project_notes;
CREATE INDEX project_notes_project ON project_notes(project_id,updated_at DESC);
