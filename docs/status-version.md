# App version reference

Codeitz displays its own build identity at the right of the status bar: Codeitz - V followed by the root package.json version. src/shared/app-version.ts owns the label; web and the locally consolidated Desktop frontend consume it. Settings and API service-info already read that same manifest.

Run npm run check:versions before publication. It checks root package/lock/current changelog state and the canonical label/consumer bindings. The focused version-tool test simulates a patch bump and rejects stale hardcoded labels. The normal version-bump tool updates root manifest, root lock metadata and current changelog fields; rebuilding picks up the new frontend label without a source edit.

Historical changelog records, dependencies, API/schema identifiers and independently versioned Desktop wrapper/native manifests are not application-version mirrors. A source label is not proof that an installed build was updated or matches the latest GitHub release. Rebuild and verify the selected installed artifact separately.

23 November 2026: local package, lock and current changelog agree on 1.0.20; typecheck, five version-tool tests and web build passed. The consolidated Desktop source label is updated locally but remains part of the separately deferred consolidation. Its final rebuild and rendered-footer verification are queued under resource coordination; they are not claimed passed here. Central guidance and non-Platform app notifications are coordinated with Governance and CodeShip from chat 01a1e243-23e8-7fd3-93ad-89660ed272c3. No deployment or dependency upgrade is part of this status-label task.
