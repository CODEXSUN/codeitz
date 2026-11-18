# Codeitz Task Runner

The Projects module creates plan-only tasks through the runner public interface in the same server. `/tasks/<id>` opens a task; `/task-records?owner=<owner>` opens project-scoped records. Owner filters are presentation, not permissions. Projects live at `/projects` in Codeitz. Coding approval stays separate. Legacy query links remain compatible.

## Daily work

1. Choose an app and a small goal. Create plan reads central governance, app instructions, and the latest 30,000 characters of its work record.
2. Review the saved plan and explicitly approve coding.
3. Run app checks separately. Declared typecheck, build, and test scripts run in order, stopping on failure. Review changes before committing or releasing.

The workspace shows one real local worker, completed-stage progress, and live Codex commentary/tool lifecycle plus runner events. It does not guess completion percentages or expose hidden reasoning. The stream reconnects automatically and reloads persisted state; the timeline shows the latest 200 events per task. A disconnected browser does not stop server-side work.

## Task records

Task records is a separate list and review page. Inspect plans, changed files, check output, and activity. Audit record compares saved evidence, declared scripts, and the app work-record entry; it does not rerun checks or prove business correctness. Earlier imported tasks have no historical live events and are labelled accordingly.

Completed and failed tasks can be archived. Only completed tasks can be dropped. Dropped tasks move to a recoverable view; restore returns the task and its evidence to Current. Nothing is permanently deleted. Unfinished tasks cannot be archived or dropped. Record actions and audit results are retained as activity entries.

## Local storage

PostgreSQL owns `coding_tasks`, `coding_task_events` and `coding_task_metadata`. Plans, results, checks, reviews, visibility and full activity survive restart. Existing UUIDs, timestamps and history were imported unchanged. Finished/failed steps still append app work records. Startup recovery rechecks a task's latest saved status before marking an interrupted run; streamed activity is saved before publication.

Run one Codeitz server against this database. One task step runs at a time. Closing the server cancels the active child process; changes remain for review. No automatic retry, rollback, parallel workers, scheduling, or release flow is included.

## Existing Codex session

Settings → Connect local Codex reuses the installed CLI's existing authentication. On Windows, discovery checks PATH then current-user installed Codex app metadata. Connection failures show command errors, exit codes/output, or timeout details. No fresh sign-in is launched and auth files are not copied.

Planning uses read-only permissions; coding uses the selected app workspace profile. The installed Windows native sandbox backend must already be set up. User CLI configuration is excluded; CLI authentication stays local. Blocked or invalid structured results fail the step even if the process exits successfully.

Execution is local-only and accepts registered app IDs and fixed actions, never frontend shell commands. No installs, Git mutations, deployments, or sibling-repository edits are authorized. App npm scripts are trusted local code. Keep credentials out of goals, work records, and app script output; basic secret patterns are redacted from live activity. Environment files are excluded from change snapshots.

Follow [central coding standards](../../../mcp-governance/docs/coding-standard.md). Shared-package changes require their own scoped task.

## Completion review

Completed tasks show a final summary, changed files, and saved check results in both the runner and task records. Final summaries are rebuilt from actual check outcomes; original coding reports remain stored separately. Earlier completed tasks receive the corrected summary once, with an appended app work-record entry; historical notes and JSON backups remain intact.

Accept result records a user decision; it does not commit, release, or execute code. Request changes requires feedback and creates one linked draft in the same app. The original review and follow-up links are saved together in one PostgreSQL transaction. Repeated identical submissions return the same follow-up. A recorded decision is not overwritten.

Open linked follow-up → Create follow-up plan → review plan → approve coding → run checks. Creating the draft does not run Codex. The follow-up receives the original task context, governance, and latest app work record. Archived or dropped tasks must be restored before reviewing; unfinished and failed tasks cannot be accepted. Review decisions are saved in PostgreSQL, activity, and the app work record (append failures are reported in activity).
