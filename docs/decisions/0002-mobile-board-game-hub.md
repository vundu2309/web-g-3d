# 0002 — Mobile landscape board-game hub

Status: accepted by the user for implementation.

The product changes from a procedural ocean experience to a multiplayer property-trading board game. Implement the basic hub before the board/game graphics. The user approved separate landscape images for home, create, join and waiting room, then clarified that phone users are the first target.

Use the existing strict TypeScript/Vite application. Remove unused Babylon/Havok code and old ocean tests rather than retaining an unrelated engine behind the hub. Native DOM controls and reusable CSS/SVG are sufficient for this phase and keep the initial bundle small. A future board renderer must not own room state.

Keep room transitions independent of storage. Firebase handles online identity and synchronization; a separately labeled same-browser adapter enables review when backend activation is unavailable. Never silently substitute demo data or claim a successful online connection. ETag conditional writes protect concurrency; emulator rules tests protect ownership/readiness. The frontend cannot configure a Firebase project using public app identifiers.

Retain GitHub Actions/Pages publishing and the user-authorized deployment-after-update rule. Add theme/mobile contracts to authored docs and route future agents through them. Earlier ocean-specific decisions are historical and do not describe the active architecture.
