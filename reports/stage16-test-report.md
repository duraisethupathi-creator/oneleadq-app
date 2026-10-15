# Stage 16 verification

Updated 2026-10-16 IST. Continued the existing qa/stage16-20261015 branch from baseline 679161f (prior continuation of af682b7); requested a/stage16-20261015 was absent. Functional source verified through ab74a20. Earlier dirty frontend prerequisites were audited and integrated; unrelated artifacts were preserved. Backend pre-existing dirty work was not edited. No publication, deployment, merge, push, paid inference, real-customer mutation or human approval occurred.

PARTIALLY VERIFIED; NOT READY FOR COMPLETION. Three design variants and preview/selection safeguards pass on the fictional fixture. Final live generation awaits explicit human approval of the exact version, then separate file approval.

| Test ID | Feature | Expected | Actual | Method | Status | Evidence | Fix commit |
|---|---|---|---|---|---|---|---|
| S16-01 | Wireless discovery | Discover active authorized connect port | I2127 rediscovered at 192.168.1.4:39669; simulated discovery cases pass | ADB mDNS and unit | PASS | scripts/test-android-device-discovery.ps1; final-discovery.log | 333651a |
| S16-02 | Development connection | Existing app receives fresh Expo bundle | com.oneleadq.app launches; Metro8081/backend3001/Bridge3010 HTTP200 | Actual local services/phone | PASS | D:/Android/precision-stage16/metro.stdout.log; fresh native captures | � |
| S16-N01 | Navigation/Tamil Generate | Home/client/workspace/AI/Tamil visible; no crash signatures | 17 observed rows: 15 PASS, 0 FAIL, 2 BLOCKED | Actual phone; bounded AndroidRuntime scan | PASS | Fresh reports/android captures and observed runner transcript; current results.json overwritten by optional probe | 333651a |
| S16-03 | Client context | Exact client and verified catalogue/contact; reject changed ID | Catalogue omission reproduced then fixed; identity and failure paths pass | Component boundary | PASS | scripts/test-stage16-ai-tab.cjs; final-test-stage16-ai-tab.cjs.log | ab74a20 |
| S16-04 | Website dispatch | Exact fixture routed without inference | webDevelopment and exact clientId returned | Actual local API | PASS | reports/android/precision-live-routing.json | 18a0b06 |
| S16-05 | Three variants/previews/selection | Distinct specs, desktop/mobile preview, choose second | 10 preapproval checks pass; 6 measured previews inspected | Actual paired local backend + browser | PASS | scripts/test-stage16-live-fixture.cjs; reports/android/live-website-results.json | 18a0b06 |
| S16-06 | Approval safeguards | Unauthorized/preapproval writes rejected | Unauthenticated rejected; architecture/plan409; approvals0/filesChanged0 | Actual backend negative tests | PASS | reports/android/live-website-results.json | 18a0b06 |
| S16-07 | Approved output validator | 4 pages responsive/navigable/accessible | 8 focused checks plus 8 page/width browser runtime checks pass | Isolated fictional approved fixture; browser1280/390 | PASS | scripts/test-stage16-output.cjs; reports/android/precision-generated-site-runtime.json; precision-generated-site-{1280,390}.png | 3e365cd / ec148fb |
| S16-N02 | Optional native routing probe | Exact fixture prompt/client confirmed before submission | Fresh hierarchy idle capture blocked; submission not attempted | Actual Android runner | BLOCKED | reports/android/results.json; scripts/android-ui-test.ps1 -WebsiteRoutingProbe -Stage16Fixture | ab74a20 |
| S16-08 | Live final generation | Reviewed version approved before generating | No human design approval; no live final-site claim | Approval gate | BLOCKED | reports/stage16-approval-handoff.md | � |
| S16-09 | Paid Gemini | Bounded actual provider response | No spending permission; no paid call made | Not executed | NOT RUN | Mocks and health are not provider acceptance | � |

Synthetic approval inside isolated tests grants no authority over the live workflow. No generated site was published. Native 15/0/2 is a transcript summary, not a preserved raw results.json; do not conflate the latest one-row BLOCKED probe with that earlier run.
