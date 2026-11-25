---
title: Tune the tug of war by playing it on a phone
state: proposed
opened: 2026-11-19
owner: main session
agents: none until the user has played
decision: none
---

# Tune the tug of war by playing it on a phone

## Feedback and goal

`docs/ocean.md` says the constants at the top of `src/ocean/fight.ts` are first guesses, never tuned by play. A bot lands every style in about 9 to 22 s. The phone's vibration has never been felt (and iPhone has none). Goal: constants that feel right on a real phone.

## Brief

The user plays on a phone and says what feels wrong (too easy, too hard, the snap, the hold of the button). The lead then changes the numbers in `fight.ts` and the bot test numbers in `tests/fight.test.mjs`. No new feature.

Limits: the rod tier of [the upgrade shop](2026-11-19-upgrade-shop.md) scales the tension gain, so tune the default tier first and keep the other tiers relative to it.

## Plan and owners

| Step                                  | Agent        | Files owned                                  | State               |
| ------------------------------------- | ------------ | -------------------------------------------- | ------------------- |
| User plays and reports                | the user     | none                                         | waiting on the user |
| Change the constants and the bot test | main session | `src/ocean/fight.ts`, `tests/fight.test.mjs` | pending             |

## Evidence

None. Software rendering cannot show how the fight feels.

## Review

None.

## Approval and publication

Not started.

## Follow-ups

Blocked on: the user playing on a phone.
