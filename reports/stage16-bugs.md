# Stage 16 bugs — 2026-10-15

| Test | Status | Actual result / root cause | Fix applied | Retest | Remaining work |
|---|---|---|---|---|---|
| AI client context | PASS | AI tab omitted currentClient.id; website handoff may lose identity although catalogue is present | Include selected client ID | Mocked component button invocation asserts ID and fixture services | Native integration acceptance |
| Task action on error | PASS | Error text shares reply state and previously exposed Add to Tasks with any selected client | Require successful agent response before showing action | Mocked render hides action on error, shows on success | Native acceptance |
| Floating overlap clearance | BLOCKED | Global assistant overlays content; insufficient scroll-end padding | Increase AI scroll padding 40 to 190 | TypeScript passes; phone went offline | Visual response/action/keyboard acceptance |
| Coordinate-bound Android runner | PASS | Original script hard-coded phone address and taps, with no evidence output | Authorized-device discovery, bounds-derived selectors, screenshots/XML, JSON results, explicit BLOCKED, safe crash-signature count | Parser executes and offline-device branch returns BLOCKED | Exercise connected-device selectors and scroll coverage |
| Wireless ADB | BLOCKED | Phone transport changed from device to offline during audit | Attempted adb reconnect offline | Still unavailable | Restore network/debug authorization |

Verified fixes refer to mocked component behavior, not completed native acceptance. Existing unrelated local modifications remain uncommitted and unchanged by this work.
