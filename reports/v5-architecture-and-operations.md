# V5 draft candidate: architecture and operating boundaries

This candidate extends the existing Expo application, native Keystore/pinned-TLS device transport and scoped Windows gateway. Gemini remains the provider. The existing running AI service and Windows Bridge are not modified or deployed by this change.

## What executes

The assistant and More → Specialist Drafts submit through the selected client's native, certificate-pinned trusted-device session. No command falls back to the former unauthenticated LAN `/ai` endpoint. Public health inspection remains read only. Missing trust, missing native support, client changes, missing owner opt-in or missing Gemini configuration fail closed.

The Windows gateway hosts the new server-side `backend/orchestrator.cjs` domain module. Its Gemini adapter uses the existing backend SDK/model, backend-held `GEMINI_API_KEY`, structured JSON, bounded timeout/retry and AbortSignal. SDK dependencies are locked separately under `backend/`; Android source never imports the backend package or provider credentials. Existing local grounded client replies are retained in a reviewed source copy. General conversation and SEO advice use the conversation contract; provided-HTML SEO audits use Specialist Drafts. No website URL is fetched by these adapters.

Every run has a UUID, exact input fingerprint, server-bound client/project/workspace, state/events, execution mode, attempts, verified artifact hashes and durable history. Exact request-ID replay returns the original run; changed payloads conflict. Restart interrupts unfinished work without replay. A retry after a terminal failure is an explicit new request; inspect history before retrying an uncertain network submission. Only one owner process may open a history directory. Mobile history shows the newest records within a 700,000-byte JSON budget and a 50-record limit; older runs remain durable on disk and individually addressable by scoped run ID. History is private owner-local data and requires the owner's normal backup/access controls.

Provider output is bounded text, never paths, shell commands or executable instructions. Adapters write exclusively created per-run draft directories under the configured history root, with fixed filenames. Generated code is not executed. Human draft approval binds the current plan and SHA-256 hashes; changed files or stale hashes fail. Draft approval never authorizes publication, Git, spending or other external effects. External action endpoints reject every request, including after draft approval. Existing separate website/Git approval gates remain in place.

## Owner provisioning (not performed in this task)

1. Review and install the locked backend dependencies with `npm ci --prefix backend --ignore-scripts --no-audit --no-fund` in the reviewed source checkout. Retain existing Windows gateway dependencies and DPAPI identity; do not regenerate production certificates.
2. In a separately owner-reviewed Windows configuration, retain explicit enabled client/project/workspace/path mappings. Add `orchestratorEnabled: true` only to a mapping authorized for draft requests. Add an `orchestrator` object with an absolute private `historyDirectory`. Keep it outside customer source repositories. No real mappings or identity files are included here.
3. Provide the existing backend-held `GEMINI_API_KEY` to the Windows process using the owner's approved credential configuration. Never put it in app.json, EXPO_PUBLIC variables, source or mobile storage. This task never invokes paid inference.
4. Start the existing loopback gateway with `node windows/gateway.cjs <approved-config.json>`, then the existing DPAPI-backed trusted TLS wrapper with `node windows/trusted-gateway.cjs <approved-transport-config.json>`. No plaintext LAN authority is added. Missing provider configuration stops startup; no alternate provider fallback exists.
5. Explicitly issue a new client/project invitation and re-pair the device to authorize the new draft scope. Existing device records never gain it during reconnect. The gateway rechecks mapping opt-in on every request. Disabling opt-in immediately prevents draft access.

No actual Android pairing, owner configuration, backend deployment or V5 installation is performed by preparing/building this candidate. The installed V4 remains unchanged.

## Eight-service capability matrix

| Service | Deterministic fixture execution | Authenticated loopback TLS sandbox | Real production integration |
|---|---|---|---|
| Website | Escaped static HTML and structure JSON | Verified with simulated device proof | Not verified; no deployment adapter |
| Mobile | Scoped specification and React Native starter | Verified with simulated device proof | Not verified; no app build/store adapter |
| SEO & Local SEO | Provided-HTML title/description/H1 audit and advice | Verified with simulated device proof | Not verified; no crawler or Business Profile adapter |
| Meta Ads | Paused draft campaign/ad sets; no authorized budget | Verified with simulated device proof | Not verified; needs owner-reviewed marketing scopes/account authorization |
| Google Ads | Draft keywords/assets; no authorized budget | Verified with simulated device proof | Not verified; needs customer/OAuth/developer-token authorization |
| Content | Review-required calendar; no schedule submitted | Verified with simulated device proof | Not verified; needs platform/page scopes and publication adapter |
| Automation | Disabled manual definition; review-note steps only | Verified with simulated device proof | Not verified; no external trigger/credential adapter |
| YouTube | Draft strategy and metadata; uploaded=false | Verified with simulated device proof | Not verified; needs channel OAuth scopes and upload adapter |

Fixture execution writes actual disposable output files and history. The TLS tests use a temporary test-only certificate and Node-generated device proof, not an Android phone. These results do not certify live Gemini, real platform credentials, platform compliance or production execution. All live platforms need separately reviewed adapters, scopes, compliance, client-bound approval and a new authorization before external effects. The candidate is a draft-only release candidate, not full production acceptance of eight live services.

## Verification and release

Run `node scripts/test-v5-release.cjs` on Windows for the complete source, React Native harness, storage, backend fixture, DPAPI and TLS suites. On other operating systems the Windows DPAPI test explicitly skips; that is not a DPAPI PASS. `node scripts/verify-v5-source.cjs` verifies versionCode 5, package and unchanged single-IP network policy. Source scripts never install an APK.

The V4-P01 fix constrains the panel to the keyboard-resized viewport and safe insets. Tap/drag/open/close/Back behavior has focused source tests. V5 native layout and physical interaction remain BLOCKED until a separately approved installation. No physical PASS is inferred from these tests.

Only a workflow-only branch from current main may register an exact reviewed V5 source commit for protected signing. Application source remains on the dedicated candidate branch. A signed APK does not remove the live-integration and physical-validation limits above. Never install V5 under the build-only approval.
