# OneLeadQ UI upgrade — 2026-10-16

Sprint 2 is PARTIALLY VERIFIED. It reuses the existing Dashboard, AI and Tasks screens. Commands are handed off once in memory with their selected client ID and are never automatically submitted. Original routes remain available. Counts use saved records and explicitly warn that sample data may be included.

| Test ID | Feature | Expected result | Actual result | Test method | Status | Evidence | Fix commit |
|---|---|---|---|---|---|---|---|
| UI-U01 | Loading | Clear loading state before counts arrive | Loading indicator asserted | Component | PASS | test-dashboard-command.cjs | Sprint 2 |
| UI-U02 | Command | Preserve client, consume once, no auto submission | Text/ID and one-shot handoff asserted | Component | PASS | Same script | Sprint 2 |
| UI-U03 | Actions | Existing Website/Ads/SEO/Clients/Content destinations | Routes invoked by real handlers | Component | PASS | Same script | Sprint 2 |
| UI-U04 | Approval navigation | Approvals tile opens approval view | Router view parameter asserted; Tasks consumes validated parameter | Component + code inspection | PASS | Same script; tasks.tsx | Sprint 2 |
| UI-U05 | Counts | Counts reflect supplied saved state | Five representative counts asserted | Component | PASS | Same script | Sprint 2 |
| UI-U06 | Validation | Reject empty/oversized commands | Both rejected | Unit | PASS | Same script | Sprint 2 |
| UI-U07 | Failure | Explain loading errors with retry | Error, retry and unavailable counts asserted | Component | PASS | Same script | Sprint 2 |
| UI-U08 | Retry | Recover after storage read failure | Subsequent load restores state | Component | PASS | Same script | Sprint 2 |
| UI-R01 | Existing Dashboard / AI behavior | Preserve earlier fixes | Both regression scripts and TypeScript pass | Automated | PASS | test-stage16-dashboard.cjs; test-stage16-ai-tab.cjs | Sprint 2 |
| UI-N01 | Android UI | Command input and Tamil/English labels visible | Dashboard visible in real screenshot | Screenshot | PASS | D:/Android/precision-stage16/current.png | Sprint 2 |
| UI-N02 | Android interactions | Confirm command prefill, approval filter and each action end-to-end | Native hierarchy automation delayed by active animation; final acceptance pending | ADB | BLOCKED | Local capture/test attempts, no provider submission | Sprint 2 |

A screenshot is not sufficient to mark UI completion. Remaining: native action/filter acceptance, recent activity integration, advanced Website settings and wider text/contrast review. No client records were changed or new dependencies installed.
