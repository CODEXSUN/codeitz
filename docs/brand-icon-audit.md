# Codeitz icon — 22 November 2026

Black rounded square with a centered white `>_` mark. Light and dark variants intentionally use the same icon.

- App-owned assets: `src/web/assets/brand-logo.svg` and `brand-logo-dark.svg`.
- Shared mapping: `src/web/app-shell.ts` exports `appBrand` and the app-switcher `CodeitzIcon`.
- Header and app switcher reuse that mapping. Shared React loader receives `appBrand`; HTML bootstrap and favicon use the emitted asset URL.
- The released20-based isolated consumer also passes `appBrand` to its existing Platform login/password-change gate. The older dirty native checkout has no Platform gate; this change does not introduce or replace authentication there.

Verification is against `.codeitz/loader-consumer/workspace/devkit/codeitz`, preserving the older native checkout and installed release20. Typecheck passed. Mocked browser proof at 390px and 1280px verified the original logo on login, favicon mapping, centered cold bootstrap, one React loader, and explicit module/configuration failure states. No live credentials, backend writes or provider calls.

Evidence: `.codeitz/loader-consumer/browser-receipt.json`, `icon-login-390.png`, `icon-login-1280.png`, and `icon-build.log`. An overlapping earlier build hit the existing font-copy output race; the final build runs alone. No commit, publication or deployment is included.

## Local port 4305 rebuild

The native frontend was rebuilt successfully with Vite's runner config loader. Typecheck passed. Its installed KaTeX 0.19.1 contradicted the existing 0.18.10 override; the old dependency directory was preserved under `.codeitz/icon-dependency-backup/` and replaced with the already reviewed local 0.18.10 package. Vite deduplicates the drawing library, KaTeX and lodash-es through the app installation; the emitted drawing-dependency audit passed without weakening its version checks. No package/version/lock changes were needed for this repair.

Browser checks against the actual HTTP server at 4305 passed in light and dark mode: header, cold loader and favicon all matched the new icon bytes. API calls were intercepted to avoid record mutations. Evidence: `.codeitz/icon-local-receipt.json`, `icon-local-light.png`, `icon-local-dark.png`, `icon-local-build-runner.log`.

This older native app has no login gate. Login and React-loader light/dark checks therefore ran against the isolated prepared login-enabled build with mocked APIs, not against native 4305 authentication. Evidence: `.codeitz/icon-login-receipt.json`. No old branding remains in the checked mappings/assets; unrelated feature icons such as the Codex settings robot are not app branding. Existing Node and Docker listener processes were unchanged; no server restart, Docker operation, commit or push.
