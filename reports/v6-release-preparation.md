# OneLeadQ V6 release preparation — 25 October 2026

Source: `fix/v6-gemini-generate`, descended from verified V5 `cea85d3670098a38bac6cd7a9aa8d3c0f69c54c0`. All development is isolated here. Package remains `com.oneleadq.app`; only this candidate has versionCode 6. Original V5 source, dirty main worktree, live worker processes and Android app data were not modified.

## HTTP 404 diagnosis and implementation

The running trusted transport points at the original repository's `windows/trusted-gateway.cjs`. Its `device-trust.cjs` permits Windows jobs but rejects `/orchestrator/runs` with `404 ROUTE_UNAVAILABLE`; the running legacy gateway source also lacks orchestration. Direct backend `/ai` health/inference success cannot establish this authenticated route. A controlled in-memory P-256 enrollment/proxy reproduction returns 404 with the actual legacy module and accepts the scoped route with V6. This is source/fixture evidence, not a new physical Generate PASS.

V6 retains pinned native TLS, P-256 device proofs, per-client/project mapping and explicit owner-authorized draft scope. Its worker advertises a protocol version and per-device draft access through authenticated status. The phone preflights these before submission, producing an upgrade/scope message for incompatible deployments instead of calling direct `/ai`.

Frontend `give` intent is integrated selectively. The prepared V3 HTTP client was not copied. Server-owned SEO/Local SEO/general metadata is verified by the phone. A second regression found that V5's fact-grounding shortcut intercepted SEO requests before Gemini; explicit SEO/Local SEO advice now reaches the backend-held Gemini planner with the corresponding specialist instruction. General verified-client-fact grounding remains intact.

The UI rechecks health after request failure and has a synchronous duplicate lock plus cancellation. Whole-request timeout includes initial create. Cancellation of an in-flight create attempts to cancel its exact late-returned run. Stable uncertain request identities persist in existing encrypted trust records across app restart; same-ID retries use server idempotency rather than generating another request. Client/history scope is validated server-side before provider calls. Wrong-project responses, malformed plans and unknown states fail closed. HTTP 401/403/404/409/429/500/503 and malformed/native timeout responses have safe messages without raw backend error disclosure.

## Tests and compatibility

Final local consolidation: **27 PASS groups; ESLint NOT RUN** because the project has no lint script/config or installed ESLint binary. No dependency was installed to manufacture a lint result.

- Retained V5 release, storage/date/layout, all eight adapter, assistant, dashboard, conversation, trusted-device, cancellation and worker tests passed.
- V6 Generate: 10/10 fixture tests passed, including server-agent selection, no trust bypass, duplicate prevention, cancellation before/after submission, initial-create timeout and foreign-history rejection before provider calls.
- Mobile controller: 8/8 tests passed, including legacy protocol/scope rejection, safe HTTP/malformed-response matrix and uncertain submission/restart identity continuity.
- Backend/Bridge fixtures: 59/59 passed. Existing V5 orchestrator: 17/17 passed. Windows TLS/DPAPI test processes use disposable fixtures, not production trust stores or signing keys.
- TypeScript passed. YAML, 13 Bash steps, three embedded Node blocks and two embedded Python blocks passed syntax validation. Modified backend/gateway JavaScript passed syntax checks.
- Expo introspection and Android autolinking verified package/version/network resource and OneLeadQTrust. Nineteen existing storage/native-module/plugin files remain byte-equivalent after line-ending normalization to V5. App configuration differs from V5 only by versionCode.

Raw/initial failures are retained under ignored `artifacts/v6-evidence` and `artifacts/v5-regression`. Initial missing Express fixture dependencies were resolved using existing installed dependency junctions. A temporary new-test syntax error and the real grounding regression were fixed and rerun; an overlapping earlier TypeScript run is superseded by the final passing typecheck. No tests were disabled. Fixture/code results never count as physical/live Gemini success.

## Release gates and expected artifact

The V5 production workflow is adapted for V6 while retaining main-only execution, exact reviewed source checkout, protected `android-production`, certificate pin, unchanged narrow network policy, native-module verification, read-only permissions and production APK checks. The candidate workflow intentionally has an empty approved SHA; the separate main launcher must pin the final candidate commit after review. Source checks run on the candidate's workflow, not on the separate launcher pin.

Expected artifact: `oneleadq-v6-production-signed-<SOURCE_SHA>-<ATTEMPT>` containing `OneLeadQ-production-v6.apk`. Expected certificate: `cc50b5df32eb6387001486e196505caab85e155f0a5c8b2eeb2e5da3e2b14c0d`.

GitHub read-only audit confirms push permission and all four expected secret names in `android-production`; values were not read or changed. The environment permits deployment from `main` only, and main currently pins V5. The owner prohibits protected-branch merges. A workflow-only main update is therefore required before the approved V6 build can run; changing the branch/environment gate would be a security bypass. No deliberately skipped branch build is used as evidence.

Production V6 certificate verification, APK build/download/hash and compiled V6 manifest checks remain BLOCKED until that launcher update and normal environment review. The existing V5 APK backup has valid v2/v3 signatures and the pinned certificate. It contains package code, not private app data.

## Worker rollout and data precautions

An APK-only update is insufficient: deploy the compatible V6 Windows gateway and trusted transport together from this source, using the same owner identity/DPAPI files and existing approved workspace mappings. Do not replace certificates or trust stores. Explicit owner opt-in and a fresh scoped invitation are required where the existing device lacks draft authority; reconnecting alone must not grant it. Configure the existing backend-held Gemini provider for that worker process without placing credentials in Android/public Expo settings. This rollout was prepared, not applied to running services in this task.

Before any phone update, recheck installed V5, its signer, backup and visible original data. Use only the corrected owner-provided installation target `192.168.1.4:39563`. A connection attempt to that endpoint reported offline; the earlier discovered mDNS I2127 alias reported V5, but no different transport was used for installation. No APK exists to install yet. No uninstall, clear, downgrade, record mutation, publishing or paid inference occurred.

After approved CI and APK verification, use one in-place `install -r` and test the harmless SEO prompt, a general prompt, authenticated endpoint receipt, agent identity, history, cancellation and visible original data. Actual Android Generate remains **BLOCKED**, not PASS.

## Recovery

Do not delete worktrees or reset the dirty original tree. Keep V5 installed until the new APK passes signer/package/version checks. Preserve worker identity/history files; if rollback is needed, stop only the identified V6 worker processes and restore their reviewed startup command. Pending uncertain draft identities/history must be reviewed rather than cleared. An APK downgrade or uninstall-first recovery is not authorized. No customer-facing action adapter was enabled.
