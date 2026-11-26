---
title: Boats of players who are not online stay where they were left
state: published
opened: 2026-11-20
owner: main session (web-g-3d-cf)
agents: none (built by the lead alone)
decision: docs/decisions/0018-parked-boats.md
---

# Boats of players who are not online stay where they were left

> Written afterwards, on 2026-11-26, from the git history and the session. It was not opened at the start of the change, which the [agent workflow](../agent-workflow.md) asks for. No agent took part, so there is no reviewer or QA report for this change.

## Feedback and goal

The user saw other players' boats vanish ("thỉnh thoảng thuyền của player khác biến mất"), then asked: "Không online thì vẫn giữ thuyền ở vị trí đó".

Answers to the design questions: the position comes from Supabase, it is kept for 7 days, a parked boat is an ordinary boat with a dim name and "ngoại tuyến", and it is a hard obstacle.

## Brief

1. The server reads the last position of players who are not online from their profile, with a player's own token (no admin key).
2. Parked boats arrive in the sea state with `off: 1`; they do not move and the physics treats them as static boxes.
3. Do not touch the economy or the fishing rules.

## Plan and owners

| Step                     | Agent | Files owned                                                                                 | State     |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------- | --------- |
| Parked-boats read        | lead  | `supabase/migrations/20261121130000_parked_boats.sql`, `server/ocean.mjs`, `server/app.mjs` | published |
| Client: draw and collide | lead  | `src/ocean/boat-physics.ts` (`setParked`), the boat drawing in `src/ocean/`                 | published |

## Evidence

- Checks and tests are recorded in the commit messages of the two commits below; the numbers were not copied here and were not re-run when this record was written.
- Not verified: real phone, more than a handful of parked boats at once.

## Review

None by an agent. The lead's own checks only.

## Approval and publication

- User approval: not recorded in this file; the exact words and the date were not kept, so they are not claimed here.
- Commits: `a85a7c0` feat(economy): the parked-boats read; `ef74158` feat(ocean): boats of players who are not online stay where they were left.
- Deploys checked: not recorded here. Whether and when the migration was applied to the live Supabase project is not verified by this record.

## Follow-ups

- Parked boats are read from the profile; the position is saved every 5 s while online (see the pose-every-5s migration).
