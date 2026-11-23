# Local release reconciliation

23 November 2026

Local application metadata and reviewed application changes now follow released 1.0.20 (commit 5e57c0e19d25b62826361f7f7a4363a1e3845c20). The existing clean release checkout was reused; no new workspace or dependency installation was created.

Desktop, web, shared streaming modules, branding, local Platform login, direct-browser SDK resolution and unfinished work remain in the main repository. Local overlays remain, so the working tree is not byte-identical to the released Docker image. Git history was not reset or rewritten.

Web typecheck/build, Desktop build, 21 Desktop tests, 11 stream/login tests, the canonical SDK direct-browser test and built login browser checks passed. Native port 4305 reports 1.0.20; authenticated login/session/workspace/projects/tasks returned 200. The idle native API alone was restarted; the Desktop broker and Docker were left running unchanged.

Read-only before/after snapshots confirm unchanged contents and grants across 11 Desktop and 55 web tables. Existing package requirements, lock dependency entries, active links and recovery sources were preserved. Docker configuration files were also preserved. No migrations, imports, permission changes, commits, pushes or deployments were performed for reconciliation. Installed native Desktop window checks and live model calls were not repeated.

Private verification receipts: .codeitz/reconcile-1.0.20-20261123/verification.json.

A subsequent publication instruction is separate: reproducible publication requires reviewed, published shared UI and SDK dependencies before private local aliases can be replaced. No deployment is authorized by that publication instruction.

## Publication checkpoint — resumed cleanup

The human-authorized cleanup publication has resumed, with Platform explicitly excluded and no deployment authorized. Remote inspection confirms main remains at the preserved 1.0.12 commit while released 1.0.20 exists on a separate release lineage that descends from it. The canonical repository has one linked worktree; no branch or checkout has been removed.

Publication is gated on the shared UI owner’s published CompactMessage streaming/loader contract and the SDK owner’s exact published direct-browser fix. Current app and Desktop package references, TypeScript mapping and focused browser fixtures still use protected local dependency paths. These are preserved until a verified public replacement is available; a release must not silently depend on ignored private workspace files. Existing source, histories, records and active installs are unchanged by this checkpoint.

## Resolved source closure — 1.0.21

The former dependency gates are resolved with published SDK17/UI27 pins and public imports. Catalogue requests use the published app selector through the shared public callback, with cancellation and actor-context invalidation. Accepted source is retained and reviewed for main integration; no rollback of Desktop/login work was needed. Before/after records, grants and private configuration fingerprints match across 66 tables. Source verification and limitations are recorded in work-record.md. The attempted idle native API restart was rejected by automatic review before execution and not retried; running API/Docker releases were not updated.
