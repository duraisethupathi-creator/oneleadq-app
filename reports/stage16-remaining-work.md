# Stage 16 remaining work

Updated 2026-10-16 IST. Continued the existing qa/stage16-20261015 branch from baseline 679161f (prior continuation of af682b7); requested a/stage16-20261015 was absent. Functional source verified through ab74a20. Earlier dirty frontend prerequisites were audited and integrated; unrelated artifacts were preserved. Backend pre-existing dirty work was not edited. No publication, deployment, merge, push, paid inference, real-customer mutation or human approval occurred.

Stage 16 cannot be marked complete yet. Keep gates intact. No new permission is needed for ordinary read-only inspection or isolated fictional tests.

| Test ID | Feature | Expected | Actual | Method | Status | Evidence | Fix commit |
|---|---|---|---|---|---|---|---|
| REM-01 | Exact live design approval | Human reviews selected design/version/hash | Workflow remains DESIGN_VARIANTS_READY without designLock | Human decision required | BLOCKED | stage16-approval-handoff.md | � |
| REM-02 | Live final site | After design approval, review architecture/files; separate file approval | Only isolated final output verified; live site not generated | Dependent acceptance | BLOCKED | stage16-test-report.md | � |
| REM-03 | Gemini provider | Explicit bounded spending authorization before actual inference | No paid request | Not executed | NOT RUN | automation-test-summary.md | � |
| REM-04 | Native routing/clarification | Fresh capture through Generate/handoff/choice | Optional routing probe idle-blocked; clarification component only | Device acceptance | BLOCKED | reports/android/results.json | � |
| REM-05 | Other orientations/performance | Check safe areas/landscape/native animation timing | One real I2127 portrait tested | Not executed | NOT RUN | floating-assistant-qa.md | � |
| REM-06 | CI and backend clean source | Known CI validates pushed exact commits and clean backend | New commits local; backend dirty prerequisites remain | Not executed | NOT RUN | automation-test-summary.md | � |
| REM-07 | Beginner setup | Project picker/secure setup guidance | Raw project configuration still needed | Inspection | BLOCKED | oneleadq-ui-upgrade.md | � |
| REM-08 | Stage17 sync | Authenticated authoritative jobs and two-device synchronization | Contracts/local audit only; no server sync | Not executed | NOT RUN | stage17-development-plan.md | � |

Next safe steps: inspect exact previews; stabilize native idle capture without suppressing stale-screen errors; improve beginner project selection. Obtain explicit approval only for the exact design, separate file writes and any actual provider spending. Publication/deployment/merges/real-customer mutations require separate authorization.
