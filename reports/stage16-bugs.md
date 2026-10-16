# Stage 16 reproducible bugs and retests

> Current update — 2026-10-16: Design3 (design-r1-3, revision1) is explicitly human-approved; exact spec/lock validated. Actual existing-pipeline generation produced10 source files at D:/Android/stage16-generated/d48c7136-2066-42e3-9465-317162e0520e-design-r1-3-r1/source. Build/typecheck and7 validation groups PASS, including8 browser page/width checks. Workflow WAITING_FOR_FILE_APPROVAL, granted0/applied0. Local preview http://127.0.0.1:4173/. See [current generation review](stage16-generation-review.md). Earlier entries about missing design approval/live generation are historical and superseded; Stage16 remains PARTIAL pending file review and other acceptance.

Updated 2026-10-16 IST. Continued the existing qa/stage16-20261015 branch from baseline 679161f (prior continuation of af682b7); requested a/stage16-20261015 was absent. Functional source verified through ab74a20. Earlier dirty frontend prerequisites were audited and integrated; unrelated artifacts were preserved. Backend pre-existing dirty work was not edited. No publication, deployment, merge, push, paid inference, real-customer mutation or human approval occurred.

Fixed failures are recorded as PASS only after the stated retest. No known reproduced failure remains in the affected checks; unexecuted acceptance work remains open.

| Test ID | Feature | Expected | Actual | Method | Status | Evidence | Fix commit |
|---|---|---|---|---|---|---|---|
| BUG-01 | Character intercepts controls | Preserve roaming with usable underlying UI | Pass-through character plus explicit Move mode | 11 component checks + native drag/tap/keyboard | PASS | floating-assistant-qa.md | 91026d2 |
| BUG-02 | Dashboard approvals | Tile selects correct filtered view | Query consumed on focus; native filter visible | 8 Dashboard checks + native | PASS | oneleadq-ui-upgrade.md | 80f5bc7 |
| BUG-03 | Committed prerequisites/syntax | Committed source compiles independently | Caught omitted JSX closure and missing dirty prerequisites; repaired/integrated | Clean detached checkout TypeScript and staged/HEAD syntax | PASS | clean-results.json; final-affected-results.json | ec148fb / 18a0b06 / 333651a |
| BUG-04 | Stale UIAutomator XML | Idle error cannot masquerade as fresh evidence | Exit-zero ERROR now BLOCKED before cat; old apparent failures invalid | 3 fresh-screen tests + native fresh captures | PASS | scripts/test-android-screen.ps1 | 333651a |
| BUG-05 | Unusable clarification | Actionable choices with no automatic execution | Precise command prefills only | AI component checks | PASS | scripts/test-stage16-ai-tab.cjs | 6859c20 |
| BUG-06 | Missing catalogue/contact | Both assistants forward verified saved fields | AI tab initially undefined; now forwards productsServices/phone/email | Reproduced failing assertion then passing boundary test | PASS | scripts/test-stage16-ai-tab.cjs | ab74a20 |
| BUG-07 | UTC calendar Today | Local midnight uses local date | Old UTC slice returns15 while device calendar16; helper fixes Today/default dueDate | 4 boundary checks + affected UI checks | PASS | scripts/test-local-date.cjs | ab74a20 |
| QA-01 | CSS test assumption | Test behavior, not arbitrary breakpoint | 760px assumption corrected to existing720; browser responsive checks pass | Validator and real browser | PASS | scripts/test-stage16-output.cjs | � |
| QA-02 | Latest Android probe | Fresh reliable hierarchy | Intermittent idle error safely blocks; not a website product FAIL | Actual device | BLOCKED | reports/android/results.json | � |

The committed JSX omission was introduced during this work and repaired. Backend dirty state predated this work and remains outside the clean frontend claim. An incorrect discovery-suite filename invocation was corrected to test-android-device-discovery.ps1, which passed.
