# 0007 — One shared fishing sea, one boat per player

Date: 2026-11-05. Status: user-approved direction; production rules rollout pending authenticated backend access.

The user changed the active gameplay from Monopoly to fishing-boat roleplay while explicitly preserving Monopoly code/resources, the hub and authenticator. They clarified that each player controls one separate boat, approved the separate-boat visual concept, and selected one shared channel/map with direct entry after clicking the game. Room creation/join/readiness is not part of the active game.

Implement an isolated ocean module using the existing Three.js dependency and the existing provider-selected authenticator. Preserve the old room hub and local Monopoly preview behind explicit legacy routes. The remote main branch's staged Supabase Auth and Render Socket.IO migration was incorporated before publication. Supabase sea sessions use the existing API with a single-process ephemeral world; Firebase builds retain a separate protected boat collection under `monopolyHub/v1`, preserving unrelated Movieapp permissions.

Both adapters enforce one active boat session per account and fail visibly on connection loss. Fishing catches and the last boat position are kept on the device only (localStorage) and have no server-side value; a dropped connection reconnects automatically. The Socket.IO world requires one API instance and resets on deployment; multi-instance authoritative realtime simulation remains separate work. New Firebase rules require authorized rollout; the Render backend must contain the new sea handlers. Local test evidence does not prove production deployment.
