# Stage 17 command-centre foundation — 2026-10-16 IST

Status: PARTIAL. This sprint implements reusable local contracts and request policy, not a laptop app, server task queue or cross-device synchronization. Existing AgencyTask remains the task model. Backend Website sessions and approvals remain authoritative; none of the new client metadata grants authority.

Implemented files: src/agents/registry.ts, src/agents/execution.ts, src/types/agencyExecution.ts, src/services/agencyDraft.ts, src/storage/agentActivity.ts and src/components/RecentAgentActivity.tsx. Both AI entry points use the draft wrapper. A compound request requires clarification; a planned agent never calls the provider. A mismatched specialist or foreign-client handoff is rejected. Histories are client-filtered and bounded. Local activity saves allowlisted metadata and event states, never raw prompts, replies, business facts or credentials. Storage failure is exposed on successful replies. Corrupt history is preserved rather than reset.

| Service | Current status | Actual capability |
|---|---|---|
| Website Development | PARTIAL | Authenticated draft/design workflow, previews, separate gates; live final generation pending human approval |
| Mobile Application Development | PLANNED | No executor; preflight explains availability |
| SEO & Local SEO | PARTIAL | Draft advice and existing Website static-audit workflow; no external ranking update |
| Meta Ads Management | PARTIAL | Draft advice; no ad launch or account management API |
| Google Ads Management | PARTIAL | Draft advice; no ad launch or account management API |
| Social Media Content Creation | PARTIAL | Draft copy; no automatic social publishing |
| Business Automation | PLANNED | No executor |
| YouTube Growth & Channel Management | PLANNED | No executor |

No service is newly claimed IMPLEMENTED end-to-end. Existing backend routes were inspected and 59 baseline backend tests passed; actual paid draft generation was not invoked in this sprint.

| Test ID | Feature | Expected result | Actual result | Method | Status | Evidence | Fix commit |
|---|---|---|---|---|---|---|---|
| AF-01 | Registry | Eight honest statuses | Five PARTIAL, three PLANNED | Unit | PASS | test-agency-foundation.cjs | Sprint 4 |
| AF-02 | Routing | Explicit requests preserve service | Known drafts/local SEO/descriptive business text classified | Unit | PASS | Same script | Sprint 4 |
| AF-03 | Ambiguity | No silent service choice | Generic ads and multiple services clarify | Unit | PASS | Same script | Sprint 4 |
| AF-04 | Planned agents | No fake work/API call | All three avoid backend | Mock boundary | PASS | Same script | Sprint 4 |
| AF-05 | Context | Same client, bounded client-only history | Request ID and audit sequence asserted | Mock boundary | PASS | Same script | Sprint 4 |
| AF-06 | Wrong agent | Reject response | Failed routing audit stored | Mock boundary | PASS | Same script | Sprint 4 |
| AF-07 | Wrong client | Reject handoff | Foreign handoff rejected | Mock boundary | PASS | Same script | Sprint 4 |
| AF-08 | Lifecycle/retry | No false completion; bounded retries | Invalid transition and attempt four rejected | Unit | PASS | Same script | Sprint 4 |
| AF-09 | Approval request | Bind exact client/task/artifact/version/hash | Failed validation/mismatch rejected; changed version invalidates request match | Unit | PASS | Same script | Sprint 4 |
| AF-10 | Snapshot contract | Reject cross-client/stale snapshot | Identity rejected and stale revision ignored | Unit | PASS | Same script | Sprint 4 |
| AF-11 | Audit storage | Concurrent, bounded, no credentials | 60 concurrent writes yield 50 unique metadata records, isolated by client | Fake AsyncStorage | PASS | Same script | Sprint 4 |
| AF-12 | Corruption | Do not reset history | Bad JSON retained; reads/writes fail clearly | Fake AsyncStorage | PASS | Same script | Sprint 4 |
| AF-13 | Storage error | Do not claim history saved | Successful draft returns historySaved false | Mock boundary | PASS | Same script | Sprint 4 |
| AF-14 | Timeout | Failure remains failure | TIMEOUT event retained, no success | Mock boundary | PASS | Same script | Sprint 4 |
| S17-N01 | Two-device sync | Android/laptop share authoritative revisions | No sync API or laptop UI built | Not executed | NOT RUN | Contract only | — |
| S17-N02 | Generic backend task execution | Authenticated task jobs, recovery and idempotency | Existing Website backend only; generic service not implemented | Inspection | BLOCKED | Existing backend inspected | — |

Next implementation sequence:
1. Add an authenticated task API to the existing backend with explicit client authorization and service capability scopes. Reuse AgencyTask IDs. Do not reuse a Website-only session as authority for other services.
2. Persist server revisions, request idempotency keys, actor-bound approval decisions, artifact hash/version and append-only audit events. Reject stale expectedServerRevision and wrong-client requests on the server.
3. Use backend-owned execution/outbox state for retryable jobs, rate limits and uncertain external outcomes. Local cancellation must not imply a completed external rollback. Retry only idempotent work.
4. Android and a future laptop dashboard consume authenticated snapshots. source:server is a shape marker, not proof of authorization. Client-side revision checks are not an access-control mechanism.
5. Prove conflict, retry, approval invalidation and reconnect behavior using both actual devices before claiming synchronization.

Remaining integration: generic API, durable server jobs, authorization, automatic progress stream, rate-limit-specific user messaging and actual cross-device tests. No fake routes or inactive service executors were added. No desktop app, deployment, publication or spending occurred.
