# Codeitz Desktop Projects Guide

Codeitz Desktop Preview is a local preview for Windows, not a published release. Have Node.js and Docker available locally before using it. The preview runs one executing operation at a time; wait for the current operation to finish before starting another.

## Organize the work

Open the App and use a supervisor chat to describe what you want to achieve. The supervisor works with named coworkers, each responsible for an assigned piece of work. Existing local Codeitz project and task links provide context; using those links does not change the source task's status.

Choose the Git repository containing the checkout you want to work on. Prepare a clear goal that identifies the desired outcome and any limits the coworker should respect. Review the proposed work before approving it.

## Run and review

When you approve work, it runs in an isolated snapshot of the selected checkout. The snapshot is a working copy for the operation, not the checkout itself. Snapshots do not include all build dependencies, so checks that depend on missing local dependencies may need separate attention.

Review the resulting text diff carefully. Approval to run the work does not apply its changes to your checkout: separately approve **Apply** when you are satisfied with the diff and the selected checkout. If checkout contents have changed since the snapshot was prepared, stale Apply is blocked; review the current state and prepare fresh work as needed.

If work is interrupted, explicitly review its state and results before deciding what to do next. Interrupted work is not automatically replayed.
## Main repository entry points

Desktop source is now alongside web source in the main `devkit/codeitz` repository. Use `npm run desktop:build` for its frontend, `npm run desktop:native:build` for its local Tauri build, `npm run desktop:test` for focused checks and `npm run desktop:verify` for disposable full-app acceptance. See [Desktop/web consolidation](desktop-web-consolidation.md). Existing records, private runtime configuration, worker snapshots and dependency folders are retained; source consolidation does not merge or import data.
