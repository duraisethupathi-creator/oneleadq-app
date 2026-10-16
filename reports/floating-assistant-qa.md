# Floating Assistant QA

> Current update — 2026-10-16: Design3 (design-r1-3, revision1) is explicitly human-approved; exact spec/lock validated. Actual existing-pipeline generation produced10 source files at D:/Android/stage16-generated/d48c7136-2066-42e3-9465-317162e0520e-design-r1-3-r1/source. Build/typecheck and7 validation groups PASS, including8 browser page/width checks. Workflow WAITING_FOR_FILE_APPROVAL, granted0/applied0. Local preview http://127.0.0.1:4173/. See [current generation review](stage16-generation-review.md). Earlier entries about missing design approval/live generation are historical and superseded; Stage16 remains PARTIAL pending file review and other acceptance.

Updated 2026-10-16 IST. Continued the existing qa/stage16-20261015 branch from baseline 679161f (prior continuation of af682b7); requested a/stage16-20261015 was absent. Functional source verified through ab74a20. Earlier dirty frontend prerequisites were audited and integrated; unrelated artifacts were preserved. Backend pre-existing dirty work was not edited. No publication, deployment, merge, push, paid inference, real-customer mutation or human approval occurred.

PARTIALLY VERIFIED. Original anime artwork restored as a roaming, pass-through character. Talk/Move/Resume controls occupy a reserved footer; Move alone enables drag. Keyboard and inactive-app states stop/hide the character. Running reuses existing frames at faster timing; no new facial artwork was invented.

| Test ID | Feature | Expected | Actual | Method | Status | Evidence | Fix commit |
|---|---|---|---|---|---|---|---|
| FA-U01 | Roaming/state/cleanup | Animation and event cleanup; safe bounds | 11 focused checks pass | Component simulation | PASS | scripts/test-roaming-assistant.cjs | 91026d2 / 333651a |
| FA-N01 | Native walking | Visible autonomous displacement including centre | Three uninterrupted unpaused screenshots show displacement | Actual I2127 screenshots | PASS | reports/android/precision-unpaused-motion-{1,2,3}.png | 91026d2 |
| FA-N03 | Drag | Move mode relocates character within bounds | Fresh XML confirms displacement after measured swipe | Actual phone | PASS | reports/android/precision-fresh-native-results.json; precision-fresh-drag-start/end.xml/png | 91026d2 |
| FA-N04 | Touch-through | Covered tile still activates | Today Tasks opens Tasks below anchored character | Actual phone | PASS | reports/android/precision-fresh-touch-through.xml/png | 91026d2 |
| FA-N06 | Keyboard | Character clears typing controls | Character absent with native keyboard open | Actual phone | PASS | reports/android/precision-fresh-keyboard.xml/png | 91026d2 |
| FA-N07 | Control overlap | Launcher clears visible Generate/navigation | Zero intersections in navigation run | Measured accessible bounds | PASS | Fresh AI capture; observed 15/0/2 navigation transcript | 91026d2 |
| FA-N08 | Running performance/orientation | Measured frame timing and all orientations | Timing asserted in component; native profiling/other devices not run | Not executed | NOT RUN | No native performance trace | � |
| FA-Q01 | Fresh automation hierarchy | Reject stale cache even exit-zero idle failure | 3 guard checks pass; stale earlier apparent failures invalidated | PowerShell mocked ADB | PASS | scripts/test-android-screen.ps1 | 333651a |

The development-only pause is guarded by __DEV__; intermittent native idle capture still blocks the optional routing probe safely. Earlier precision-motion/drag captures are superseded by the fresh/native evidence above. No claim of exhaustive button coverage or animation profiling.
