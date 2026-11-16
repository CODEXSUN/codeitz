# Repository tools

The local changelog is `docs/CHAGELOG.md` (intentional filename). It records version state and separate Database Changes / App Codebase Changes sections. The latest versioned entry supplies the Git subject: `#<minor>.<patch> - <title>`.

## Audit now

- `npm run check:versions`: compare this app package, lock root, changelog state, and latest entry.
- `npm run version:preview -- --title "Short title"`: preview a patch bump; no files change.
- `npm run github:audit`: preview changed files and commit subject; no Git mutation or network call.
- `npm run verify`: app checks, tool tests, version consistency, and governance audit.

Current application version: 1.0.1. Audit and preview commands never commit, push, pull, tag, change versions, or operate on SSH keys. Publishing is a separate authorized action.

## Later, only when authorized

`npm run version:bump -- --title "Verified change" --no-database-update` updates only this Codeitz package version, lock root, and changelog. Use `--database-update` for database-facing changes. Automatic database detection reports Unknown when Git history is unavailable. Review the generated entry and add actual changes and verification. Shared UI/framework versions and dependency pins are not bumped.

`node tools/github-helper.mjs --publish` is the separate interactive publishing entry point. It shows the version, subject, and files; asks about an optional patch bump; asks for the commit subject and final confirmation. Only then does the existing workflow fetch/pull when an upstream exists, stage changes, commit, and push. Default invocation and `--dry-run` audit only. No task-runner action or hook invokes publishing automatically. The release-tag field is a naming convention; the helper does not create a Git tag.

`github-ssh-key.mjs` remains an unconnected copied utility. It is not imported, run, or exposed by these scripts.
