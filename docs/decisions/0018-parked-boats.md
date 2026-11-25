# 0018. Boats of players who are not online stay where they were left

Date: 2026-11-20. Status: built and tested; the migration and the API are deployed together with the
client (see docs/ocean.md, "Parked boats"). The user chose every point below.

## Context

A boat left the sea with its player, so the sea looked empty when few were online, and a player who
only had the market open for 30 seconds vanished for the others (fixed separately: the boat now keeps
announcing itself while a hub is open). The user asked that a boat whose player is not online stays
at its last position.

## Decision

- **Kept in Supabase** (not only in the API's memory, which a Render restart or sleep clears). The
  profile already holds where the boat was last saved (`economy_private.profiles`, decision 0016).
  A new read, `economy_parked_boats()` (migration `20261121130000_parked_boats.sql`), returns the
  other accounts seen in the past **7 days** (at most 100, newest first) with their chosen name,
  boat and rod tiers and the position. Additive; no table changes.
- **The API reads it with a player's own token** (no admin key), when a player enters and at most once
  a minute (`parkedOf`, `server/ocean.mjs`), and keeps what it knows: a boat that has just left is
  parked at its LAST LIVE pose (newer than the saved one, which is at most about 5 s old); the database
  fills in the others. A boat that comes back online is no longer parked; one the database no longer
  lists is removed. Entries have `off: 1`; older clients ignore it (and hide the old samples).
- **Look**: the ordinary model and tier, standing on the waves, a dimmer name with "ngoại tuyến",
  never fishing (no line). They are not counted among the players online (the count and the crew list).
- **Hard obstacles**: each parked boat within 150 m of the player's own boat is a fixed Havok box of
  its tier's size (`BoatPhysics.setParked`); the boat is stopped or pushed round it. This was the
  user's choice over passing through.

## Consequences

- Up to 100 more boats in the sea; the client's cap on boats is 200. The cost of the extra instances
  and of up to a few boxes is NOT measured on a phone.
- A player's name and last position are visible to every signed-in player for 7 days after they leave,
  as they were while online.
- A parked boat in the way of a market pier or of the harbour can block others; there is no
  salvage or timeout other than the 7 days.
- Needs the migration applied to the live project BEFORE the API that reads it is deployed; without
  it the read fails and the sea behaves as before (no parked boats), asked again with the next player.
