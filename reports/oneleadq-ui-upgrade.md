# Beginner UI upgrade

> Current update — 2026-10-16: Design3 (design-r1-3, revision1) is explicitly human-approved; exact spec/lock validated. Actual existing-pipeline generation produced10 source files at D:/Android/stage16-generated/d48c7136-2066-42e3-9465-317162e0520e-design-r1-3-r1/source. Build/typecheck and7 validation groups PASS, including8 browser page/width checks. Workflow WAITING_FOR_FILE_APPROVAL, granted0/applied0. Local preview http://127.0.0.1:4173/. See [current generation review](stage16-generation-review.md). Earlier entries about missing design approval/live generation are historical and superseded; Stage16 remains PARTIAL pending file review and other acceptance.

Updated 2026-10-16 IST. Continued the existing qa/stage16-20261015 branch from baseline 679161f (prior continuation of af682b7); requested a/stage16-20261015 was absent. Functional source verified through ab74a20. Earlier dirty frontend prerequisites were audited and integrated; unrelated artifacts were preserved. Backend pre-existing dirty work was not edited. No publication, deployment, merge, push, paid inference, real-customer mutation or human approval occurred.

PARTIAL: Dashboard command input and quick actions reuse existing routes. Current-client commands transfer once and wait for Generate. AI explanation separates draft, clarification and approval. Advanced website options are collapsed; raw project configuration and secure setup still require knowledge.

| Test ID | Feature | Expected | Actual | Method | Status | Evidence | Fix commit |
|---|---|---|---|---|---|---|---|
| UI-01 | Dashboard | Correct counts, client and useful retry | 8 checks pass; unavailable counts never fabricated | Component simulation | PASS | scripts/test-dashboard-command.cjs | 80f5bc7 |
| UI-02 | Client refresh | Selected client refreshes on focus | Current/other/missing client paths pass | Component simulation | PASS | scripts/test-stage16-dashboard.cjs | 18a0b06 |
| UI-N01 | Command handoff | Transfer without submission | Review SEO appears in AI prompt | Actual phone fresh XML | PASS | reports/android/precision-command-fresh.xml/png | 80f5bc7 |
| UI-N02 | Approvals tile | Open approval filter | Approval view selected | Actual phone screenshot | PASS | D:/Android/precision-stage16/approvals.png | 80f5bc7 |
| UI-03 | Clarification | Choose Meta/Google draft explicitly | Choices prefill only; no request until Generate | Component simulation | PASS | scripts/test-stage16-ai-tab.cjs | 6859c20 |
| UI-N03 | Clarification native | Validate choice interaction on phone | Idle capture blocked before trustworthy submission | Actual phone attempt | BLOCKED | reports/android/precision-clarification.xml/png is not acceptance evidence | � |
| UI-04 | Calendar dates | Today/default due dates use device calendar | 4 timezone boundary/padding/invalid-date checks; affected UI passes | Unit and component | PASS | scripts/test-local-date.cjs; final-affected-results.json | ab74a20 |
| UI-05 | Complete beginner setup | No raw project configuration required | Advanced options simplified; project picker not implemented | Source review | BLOCKED | src/components/WebDevelopmentPanel.tsx | � |

Audit createdAt/updatedAt remain UTC timestamps. Existing stored task dates were not migrated. No local counts are presented as authoritative server analytics.
