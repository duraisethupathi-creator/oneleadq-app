# Floating Assistant QA — 2026-10-16 IST

Sprint 1 is PARTIALLY VERIFIED. Original anime walk assets are retained at 100x122dp. Roaming is touch-transparent; the explicit Move control enables drag capture only until release. Walk resumes autonomous motion. Only walk artwork exists; running reuses those frames faster, and unavailable facial/talking artwork is not fabricated.

| Test ID | Feature | Expected result | Actual result | Test method | Status | Evidence | Fix commit |
|---|---|---|---|---|---|---|---|
| FA-U01 | Touch-through | Normal movement never consumes page taps | pointerEvents none asserted | Component harness | PASS | scripts/test-roaming-assistant.cjs | Sprint 1 |
| FA-U02 | Center route | Route includes screen center with native driver | Center target coordinates and native driver asserted | Component harness | PASS | Same script | Sprint 1 |
| FA-U03 | Run | Faster supported animation phase | 2600ms phase asserted | Component harness | PASS | Same script | Sprint 1 |
| FA-U04 | Drag | Explicit drag clamped to viewport; release drops capture | Gesture callbacks and clamping asserted | Component harness | PASS | Same script | Sprint 1 |
| FA-U05 | Resume | Walking restarts after manual anchoring | New animation created | Component harness | PASS | Same script | Sprint 1 |
| FA-U06 | Wake | Move/Walk wake an idle session | Callback count asserted | Component harness | PASS | Same script | Sprint 1 |
| FA-U07 | Keyboard | Hide roaming while keyboard visible | Character absent and animation stopped | Component harness | PASS | Same script | Sprint 1 |
| FA-U08 | Background | Hide inactive character | Character absent in inactive state | Component harness | PASS | Same script | Sprint 1 |
| FA-U09 | Cleanup | Remove subscriptions and stop loops | Two listeners removed and animation stopped | Component harness | PASS | Same script | Sprint 1 |
| FA-N01 | Visible motion | Real screenshots show displacement | Initial samples remained Resting; wake correction added. Reload stalls and stale bundle prevent final acceptance so far | ADB XML/screenshots | BLOCKED | reports/android/precision-motion-1..3.xml; local Metro restart | Sprint 1 |
| FA-N02 | Center movement | Character passes through center third | Initial resting position outside center; fresh-bundle retest pending | ADB | BLOCKED | Local motion evidence | Sprint 1 |
| FA-N03 | Drag | Character moves by real swipe | Bounds-derived swipe moved character | ADB | PASS | reports/android/precision-drag-start/end.xml and PNG | Sprint 1 |
| FA-N04 | Underlying control | Covered task tile remains clickable | Work + approval center appeared after tap | ADB | PASS | reports/android/precision-underlying-tap.xml | Sprint 1 |
| FA-N05 | Navigation | Character remains available after navigation | Available after tab navigation; continuing displacement not yet confirmed | ADB | PASS | reports/android/precision-after-navigation.xml | Sprint 1 |

TypeScript and existing microphone component tests pass. Actual repeating motion, center-screen movement, keyboard acceptance and crash review must be completed on the fresh bundle before claiming Sprint 1 complete. Native evidence is ignored by Git because it may include client details. No client records were edited.
