---
title: A tap on the gear opens Settings, not the fish store
state: user-approved
opened: 2026-11-26
owner: session "Kéo main mới và làm tiếp task cải thiện workflow"
agents: reviewer
decision: none
---

# A tap on the gear opens Settings, not the fish store

## Feedback and goal

Found while investigating the failing `ocean-input` test (step 1 of
the agentic workflow record). The user said, 2026-11-26: "sửa lỗi nút bánh răng đi" (fix the gear button).
A touch on the gear opened Settings on `pointerup`; the browser then fired its own click at the same point,
which landed on the "Kho cá" tab of the hub rail that had just appeared there.

## Brief

1. A touch on a drawn button of the sea screen does that button's action and nothing else.
2. Keyboard and mouse behaviour stay as they are. Files: `src/ocean/input-layer.ts`,
   `tests/ocean-input-browser.mjs`, `docs/ocean.md`.

## Evidence

- Before the fix: `ocean-input` failed with "a touch on the gear: Settings", actual `stock`.
- A trace on the unfixed code showed the order `pointerup` (hub opens), `touchend`, `click` on the "Kho cá" tab.
- After the fix, one run each: `ocean-input` and `ocean-stick` pass; `ocean-map` passes (run with an earlier
  version of the input test change, same source). `ocean-steer` fails with a 30 s timeout waiting for the boat
  to settle, the same way on a checkout with `src/` unchanged (machine load about 11).
- Mouse clicks on the gear behaved the same before and after.
- format, `tsc`, lint clean; 685 unit tests pass.
- Not verified: real phone, Safari (including that the sound still starts on the first touch on an iPhone),
  the market and fish store buttons beyond the shared code path.

## Review

The `reviewer` agent (read-only, 2026-11-26): ok, with notes. Nothing found that relied on the cancelled
click; mouse and keyboard unchanged. One low, unverified point: sound unlock by touch on iOS Safari after
`touchend` is cancelled, which no test covers. Not changed; to be checked on an iPhone.

## Approval and publication

- User approval: to fix (quoted above). Then, after the review result, "Deploy đi" (deploy it), 2026-11-26.

## Follow-ups
