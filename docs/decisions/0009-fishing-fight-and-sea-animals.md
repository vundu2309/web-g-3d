# 0009: Fishing as a tug of war, with our own sea animals

Status: accepted (user-directed, 2026-11-06).

## Context

A fishing game where a bite plus one pull always lands the fish has nothing to play. The user asked for: a fight after the hook (hold to reel, release to give line; fish moods; every state shown as motion, not text), the caught fish hanging on the rod with icon buttons to keep or put back, a full-screen fish store showing only caught species, more species, and animal models built by us in code. Controls must not be HTML buttons that the browser can long-press into a menu.

## Decision

- Controls are only drawn; one input layer takes touches (`src/ocean/input-layer.ts`).
- The fight is pure rules (`src/ocean/fight.ts`): moods surge / strong / tired, six styles, tension that snaps the line when the player reels against a surge. A fish is landed only by winning it.
- The fight, the hanging catch and the store are drawn as motion and icons; the only text is names and weights in the store.
- Twenty species, each naming one of sixteen code-built 3D models and one fight style. Store pictures are drawn from those models on a 2D canvas (no second WebGL context).
- A landed fish is stored only when kept; throwing again, opening the store or leaving keeps it.

## Consequences

- All numbers (tension, speeds, species balance) are first guesses: they need tuning by play on real phones.
- Everything stays client-side and per device; there is no economy or server authority (unchanged from decision 0007).
- Verified so far only with software-rendered Chromium and a bot, not on a real phone or in Safari.
