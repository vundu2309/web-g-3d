---
title: The server decides the catch
state: proposed
opened: 2026-11-19
owner: main session
agents: sea-visual-builder, sea-visual-reviewer
decision: a new decision record (supersedes the "Limits" of 0010 when done)
---

# The server decides the catch

## Feedback and goal

Not discussed in detail with the user yet. [Decision 0010](../decisions/0010-server-economy.md) says a catch is a client report: the database bounds it (one fish per 6 s, species weights, 200 unsold fish) but a patched client can invent catches within those bounds. NPC quests, leaderboards and the effects of the upgrade shop (bait, rod) cannot be trusted until the server runs the fishing rules.

## Brief

Direction named in decision 0010: the server chooses the fish, the bite times and the fight, and the client only plays them back. The pure rules in `src/ocean/fishing.ts` and `fight.ts` could run on the API. Open questions for the user before any plan: where the rules run (the Render API, or a database function), what to do when the network lags during a fight, and how much of the current feel to keep.

Limits: Socket.IO sea state is ephemeral on one API instance (AGENTS.md); do not scale it without shared simulation state. Anything that changes live Supabase or Render needs the user's say.

## Plan and owners

| Step                             | Agent        | Files owned | State   |
| -------------------------------- | ------------ | ----------- | ------- |
| Discuss the design with the user | main session | none        | pending |

## Evidence

None.

## Review

None.

## Approval and publication

Not started.

## Follow-ups

Unblocks NPC quests and leaderboards (deferred in `docs/ocean.md`, "Deferred work") and makes the rod and bait effects of [the upgrade shop](2026-11-19-upgrade-shop.md) enforceable.
