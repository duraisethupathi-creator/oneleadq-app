# V6 compatibility assessment — 25 October 2026

Baseline: cea85d3670098a38bac6cd7a9aa8d3c0f69c54c0; initial V6 status clean. Original V5 and dirty main working trees remain separate.

The prepared V3-derived registry `give` intent and AI-tab health-on-failure behavior apply. Its direct `/ai` client and fetch-mocking tests do not apply to V5 authenticated orchestration and will not replace them. Safe error categories, cancellation and malformed-response assertions will be reimplemented at the pinned trusted transport/orchestrator boundary. Existing V5 assistant tests remain authoritative.

Read-only process evidence: the running trusted-gateway entry point is the main working tree's windows/trusted-gateway.cjs, which loads that tree's device-trust.cjs. Its proxy ends in HTTP 404 ROUTE_UNAVAILABLE for orchestrator routes; its companion gateway has no orchestrator route. V5 candidate transport/gateway do contain these routes, so an APK-only update cannot repair the running legacy worker. V6 must identify protocol mismatch before submission and include a compatible worker deployment plan, preserving identity and explicit per-client draft authorization. No direct HTTP fallback or automatic privilege grant is appropriate.

Device discovery found I2127 on its mDNS alias and installed versionCode 5. Requested installation serial 192.168.1.4:41013 was not connected. This is read-only identity evidence, not approval to install through another alias. V5 APK backup exists; an APK backup contains package code, not private application data.

The production workflow is main-only and uses an exact reviewed source pin plus android-production environment protection. This task permits candidate pushes/builds but explicitly prohibits protected-branch merges. Those protections will remain intact; any required main-only launcher update is a release blocker requiring a maintainer action, not a reason to weaken the gate.
