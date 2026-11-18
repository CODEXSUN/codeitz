# Codeitz Docker deployment

Local development remains `npm run dev` on port 4310 with its existing PostgreSQL database. This deployment is a separate production-mode test at `http://127.0.0.1:4410`; it never reads the development `.env`, PostgreSQL records or Codex credentials.

## Requirements

Docker Engine/Desktop with Linux containers, Docker Compose and Node.js 26.13.1 on the deployment host. Build from the existing workspace layout: `devkit/codeitz`, `foundation/framework`, `packages/ui`, `mcp-governance` and the `infrastructure/database-manager` scaffold expected by governance audit. Each owner keeps its lockfile; the image installs/builds Linux dependencies itself. A standalone cloud checkout must include these sibling dependencies at those locations.

## Deploy and update

From `devkit/codeitz`:

```sh
bash setup.sh
bash setup.sh --check
bash update.sh --check
bash update.sh
node .container/deploy.mjs verify
```

On PowerShell, use `node .container/deploy.mjs setup` or `update` directly. First setup generates independent passwords and a private deployment file at `.codeitz/docker/deploy.env`; existing files and retained database volumes are never reset. A deployment lock prevents overlapping operations. Setup refuses a previous installation; update requires its successful release record. If the first setup was interrupted, inspect its output and run `bash setup.sh --resume` to retain and back up its data before retrying.

Update builds the current checked-out source, refuses active workers, stops the app briefly, creates a PostgreSQL custom-format backup and checksum, checks the archive, runs pending migrations and verifies the replacement app. It does not fetch, merge, commit or push Git. Existing workspaces and database volumes stay in place; updates do not reseed records. If migration/health verification fails, inspect the saved backup and logs before recovery. There is no automatic destructive database rollback. A PostgreSQL image/version change needs a separate database-upgrade task.

Backups and release metadata are under `.codeitz/docker/`. Keep their database credentials private and preserve PostgreSQL backups outside the running containers.

## Persistent data and access

Three named volumes belong to this Compose project: PostgreSQL data, editable workspace and local app state. Only `127.0.0.1:4410` is published; PostgreSQL has no host port. The app connects to PostgreSQL over loopback in an isolated shared network namespace. Nginx in that namespace forwards to the loopback-only app and preserves Host/Origin checks and unbuffered activity streams. No app access guard was weakened.

The initial editable workspace is copied once from the image, including governance and Codeitz source. Installed Linux dependencies are linked from the image; future image updates preserve edited workspace files. The installed application runs separately under `/opt/codebiz`; updating the deployed app does not overwrite project work. Containers run the application as the `node` user; the database app role owns only its schema and is not a superuser. No Docker socket, host development directory or host credentials are mounted.

## Cloud production

Use the same scripts with a separate configuration and project name on the cloud server:

```sh
bash setup.sh --env .codeitz/docker/production.env --project codeitz-production --port 4410
bash update.sh --env .codeitz/docker/production.env
```

This remains a private single-user coding workspace. Access it through an SSH tunnel or private network, for example `ssh -N -L 4410:127.0.0.1:4410 user@server`, then open localhost. Public-domain authentication/authorization is not implemented; do not change the loopback publication into public access. No cloud resources are created by these scripts.

## Codex

The image includes the pinned Linux Codex CLI, but does not copy or automatically mount the Windows signed-in session. Settings reports the container's actual connection state. No fresh login or coding execution is performed during deployment. An explicitly configured, compatible existing credential source is a separate connection step; host keyring credentials do not automatically become Linux container credentials.

## Manual container inspection

Use `docker compose --env-file .codeitz/docker/deploy.env -f .container/compose.yml ps` for status and `logs app` for sanitized app logs. Never use `down -v` against records you want to keep. Offline legacy import tools remain separate from deployment; setup creates a fresh isolated PostgreSQL database and does not import or alter local development records.


## Codeship release handoff

Codeship owns deployment and updates; this app supplies its image, migrations and verification contract. Run pending PostgreSQL migrations before replacing the app, including module approvals and Projects/Modules sync. Back up the target first. Sync migration baselines existing records without sending them. Preserve the workspace, PostgreSQL volume, `.codeitz` state and instance sync identity; do not reseed an update.

Set `CODEITZ_OWNER_APPROVAL_KEY` and `CODEITZ_SYNC_REMOTE_SECRET` in the private deployment environment through Codeship when enabling approval and the default connected peer. Compose passes these into the app. Leave them blank until configured. Additional named peer secrets require matching container environment bindings; defining a value in a Compose interpolation file alone does not inject it into the app. Do not copy development credentials or publish deployment environment files.

Build context must include matching `foundation/framework`, `packages/ui`, `mcp-governance` and infrastructure scaffolds. The Codeitz Git repository alone does not supply these sibling owners. Cloud connection and deployment verification remain Codeship operations.
