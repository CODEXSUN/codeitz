ALTER TABLE project_notes ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
ALTER TABLE project_notes ADD COLUMN assigned_to TEXT NOT NULL DEFAULT '';
