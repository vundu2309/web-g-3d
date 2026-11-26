---
title: NPC patrol ships sailing round the islands
state: published
opened: 2026-11-25
owner: main session (web-g-3d-cf)
agents: none (built by the lead alone, the model in Blender through the MCP)
decision: docs/decisions/0019-patrol-ships.md
---

# NPC patrol ships sailing round the islands

> Written afterwards, on 2026-11-26, from the git history and the session. It was not opened at the start of the change. No agent took part: the Blender model was built by the lead through the Blender MCP, not by `blender-structure` or `blender-refine`, so there is no agent report for it.

## Feedback and goal

"Thêm npc tàu tuần tra di chuyển quanh các đảo", built in Blender and reviewed in the app. After the first review: "tôi chưa review ánh sáng phát ra từ thuyền" and "làm cơ chế va chạm đi".

## Brief

1. Patrol ships follow routes round the islands as a deterministic function of the shared server clock (no server state).
2. The ship is a boat of its own, built in Blender (`tools/blender/patrol_boat.py`, `public/models/boat-patrol.glb`).
3. Navigation lights shine at night; the ships are hard obstacles for the player's boat.
4. Patrol ships and cat boats do not appear on the minimap (see the minimap record).

## Plan and owners

| Step | Agent | Files owned | State |
| ---- | ----- | ----------- | ----- |
| Routes by the shared clock | lead | `src/ocean/patrol-routes.ts` | published |
| Model | lead (Blender MCP) | `tools/blender/patrol_boat.py`, `public/models/boat-patrol.glb`, `src/ocean/boat-tier.ts` (`PATROL_MODEL`) | published |
| Lights and collision | lead | `src/ocean/patrol-lights.ts`, `patrol-light-plan.ts`, `boat-physics.ts` (`setShips`) | published |

## Evidence

- Checks and tests are recorded in the commit messages below; they were not re-run when this record was written.
- A browser test `ocean-patrol` passed on the minimap branch after the merge with main (2026-11-26).
- Not verified: real phone, frame cost of the lights on a phone.

## Review

None by an agent. The user reviewed the model in the app before the lights and the collision were added.

## Approval and publication

- User approval: "oke rồi, deploy đi" after the lights and collision were shown.
- Commits: `222eb08` work in progress; `abf6402` the patrol ship is a boat of its own, built in Blender; `bd70f27` the patrol ships shine at night and are hard obstacles. A later commit by another session, `1d3666a`, makes the lights of the patrol ships and the rowing cats thin out with distance.
- Deploys checked: not recorded here; the deployed bundle was not re-checked when this record was written.

## Follow-ups

- None open for this change.
