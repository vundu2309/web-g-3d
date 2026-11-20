---
title: Fishing depends on time, weather, depth and fish schools
state: proposed
opened: 2026-11-19
owner: main session
agents: sea-visual-builder, sea-visual-reviewer
decision: none yet
---

# Fishing depends on time, weather, depth and fish schools

## Feedback and goal

Not discussed in detail with the user yet. The lead's finding: the day and night, the weather, the real sea floor and the fish schools exist, but fishing only looks at the distance to the beach (`zoneAt`: near an island, open water, more than 128 m from every beach). The lead has not checked whether casting near a school makes a bite likelier. Goal: make those systems matter to the player, with no server change.

## Brief

Ideas to discuss before any code (the user has not chosen any):

1. Night: other species (the shark, odd fish).
2. Rain: more bites.
3. Depth: use `seabedDepth` in the zone rule instead of only the distance to the beach.
4. Casting at a school raises the chance of a bite.

Limits: the day and the weather are shared by every player through UTC time, so any rule must read them from `atmosphere.ts`; `waves.ts` untouched; the server economy and price table unchanged unless a species is added (that needs a migration, which only the user may apply).

## Plan and owners

| Step                                    | Agent        | Files owned | State   |
| --------------------------------------- | ------------ | ----------- | ------- |
| Discuss with the user which ideas to do | main session | none        | pending |

## Evidence

None.

## Review

None.

## Approval and publication

Not started.

## Follow-ups

Depends on the species table; check [the upgrade shop](2026-11-19-upgrade-shop.md) for how bait multiplies rarity so the two rules compose.
