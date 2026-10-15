# Stage 16 test report — 2026-10-15 IST

Branch: qa/stage16-20261015. Existing dirty files were preserved. No production data reset, approval, publication, deployment, or external message was performed. Proposed services are synthetic fixtures, never verified business facts.

| Test | Status | Actual result / root cause | Fix applied | Retest | Remaining work |
|---|---|---|---|---|---|
| TypeScript | PASS | npm.cmd run typecheck exits 0 | None needed | Passed after AI tab edits | None |
| Existing app regression suites | PASS | Seven scripts: assistant, assistant-mic, conversation, stage16-final, stage16-stabilization, web-development-panel, plus new stage16-ai-tab | Added mocked AI tab behavior test | All passed; assistant and typecheck rerun after edits | Native acceptance |
| Backend regression | PASS | node --test test/*.test.js: 59 passed, 0 failed; isolated mocks/fixtures | No backend edits | Passed | Live fixture acceptance |
| Dependency consistency | PASS | EXPO_OFFLINE=1 expo install --check reports up to date; offline validation reliability warning | No dependency changes | Passed locally | Online compatibility check |
| Metro connectivity | PASS | localhost:8081/health HTTP 200 | None | Host HTTP tested separately | Phone-to-Metro check |
| Backend connectivity | PASS | localhost:3001/health HTTP 200 | None | Host HTTP tested separately | Configured LAN endpoint/provider readiness |
| Android connection | BLOCKED | Initially two aliases of phone connected; UI hierarchy readable. Later address became offline; reconnect offline did not restore it | Runner discovers authorized transports, supports explicit device | Final runner exits 2 with no authorized device | Restore wireless debugging/phone connectivity |
| Android launch/Home/Clients/fixture/workspace/AI navigation | BLOCKED | Full reusable runner cannot run with offline phone; initial hierarchy only proves app/AI tab existed | Replaced fixed taps with text/description and bounds | No native workflow pass claimed | Run runner with device online |
| AI prompt/status/submission/response | BLOCKED | No live provider request made; offline phone prevents acceptance | Accessible prompt and bilingual Generate label | Mocked request test passes | One bounded live fixture prompt |
| Website route/business validation/variants/approval gates | PASS | Backend tests cover routing, grounding, required facts, structural variant differences and separate approval gates | Existing behavior retained | 59-test fixture run passes | Authenticated phone workflow |
| Preview/mobile responsiveness/design selection | BLOCKED | Structural desktop/mobile references and selection gates tested; actual rendered preview not visually inspected | None | Backend-only evidence | Visual acceptance at phone/desktop widths |
| Assistant overlap | BLOCKED | Root overlay uses bottom 82 and 122px mascot; AI content had only 40px bottom padding | AI content bottom padding 190 allows last action to scroll clear | Typecheck passes, native geometry unverified | Capture response at scroll end and keyboard open |
| GitHub Actions | BLOCKED | No .github/workflows directory found; no remote workflow run started | Local checks run | Local only | Add agreed CI workflow or identify remote checks |

Local screenshots/XML/results belong under reports/android/ and are ignored because they may contain client information. The final run saved a BLOCKED results.json; no fabricated screenshot or native PASS is reported. Runner exit codes: 0 all pass, 1 failures, 2 blocked. Use powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/android-ui-test.ps1, optionally -Device SERIAL. It does not approve, publish, submit arbitrary live prompts or change client records.
