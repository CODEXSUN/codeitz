CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('apps', 'devkit')),
  purpose TEXT NOT NULL,
  created_at TEXT,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(area, name)
) STRICT;
CREATE TABLE project_setup (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  port INTEGER CHECK (port BETWEEN 1024 AND 65535),
  state TEXT NOT NULL CHECK (state IN ('scaffolded','configured','structure-only')),
  audit_passed INTEGER CHECK (audit_passed IN (0,1)),
  installation TEXT NOT NULL DEFAULT 'pending',
  runtime_verification TEXT NOT NULL DEFAULT 'pending'
) STRICT;
CREATE INDEX projects_created_at ON projects(created_at DESC);
