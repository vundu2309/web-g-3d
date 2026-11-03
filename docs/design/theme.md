# Phố Tỷ Phú — approved hub direction

The primary audience plays on phones. Design for **landscape mobile first**, especially 844×390 and 932×430; also check 667×375. Desktop is an expansion, not the source layout. Portrait must remain usable without forcing orientation or fullscreen APIs. Account for safe-area insets and the on-screen keyboard; allow vertical scrolling when necessary instead of clipping form controls.

## Visual source of truth

The user approved these separate landscape concepts before implementation:

- [Main menu](hub-reference.png): identity/house-and-dice emblem on the left, two primary choices on the right.
- [Create room](create-reference.png): display name and maximum room size only.
- [Join room](join-reference.png): display name and six-character code only.
- [Waiting room](lobby-reference.png): invitation code, player slots and readiness.

These are layout/art targets, not screenshots or evidence of implemented behavior. Actual screens use native HTML controls and an authored SVG emblem rather than flattened screenshots as UI. Simplified vector shading replaces the concept's paper-cut lighting. The local/online selector is an intentional addition so preview is never presented as cross-device multiplayer.

## Theme tokens

Edit shared tokens in `src/style.css` rather than introducing local palettes per screen.

| Role | Value |
| --- | --- |
| Paper sky background | `#DCEEFF` |
| Cobalt ink / outlines | `#153B80` |
| Main action yellow | `#FFD35A` |
| Input / secondary surface | `#FFFFFF` |
| Small roof accent | `#E97760` |
| Supporting text | `#385B8D` |

Use Baloo 2 800 for the brand and headings, Be Vietnam Pro 400/600/700 for controls and body text. Latin and Vietnamese subsets are self-hosted through Fontsource, never a runtime Google Fonts request. Controls have a moderate rounded shape and a short cobalt lower edge. Player slots have a different radius from buttons. Keep paper grain subtle and pointer-transparent.

## Interaction and scope

- One task per screen. Home has “Tạo phòng”, “Tham gia phòng” and secondary “Cách chơi”. Do not combine creation/join forms or a waiting-room dashboard into home.
- Name is requested in the selected form and remembered on this browser. Room capacity is a maximum, not a requirement to fill every seat.
- The host is ready by default. Guests can toggle their own readiness. Starting requires at least two present players and all ready. Only the host starts; departure by the host closes the room, after an explicit in-app confirmation.
- “Bắt đầu” currently changes the room to the completed-hub state. Explain that the board is not built yet. Do not invent dice rolls, property economy, 3D gameplay, shops or progression.
- Online mode is the default. The optional device preview must always be labeled “Bản thử”; it only synchronizes tabs in the same browser origin. Never silently fall back from online to preview.
- Use visible labels, keyboard focus, readable Vietnamese text and touch targets at least 44 CSS px. Do not rely on hover, tiny icons or color alone. Disabled start has a textual explanation.
- Prefer modest input padding and adaptive heading size on horizontal phones. Primary room actions and waiting status must fit the normal 844×390 viewport. The keyboard can require scrolling; do not shrink inputs below 16px and trigger iOS zoom.

## Review before release

Inspect real rendered home, create, join and lobby at mobile landscape sizes first. Test portrait fallback, text escaping, long names, errors, readiness updates and reload. A generated concept or passing build is not visual verification. Save temporary browser screenshots under ignored `test-results/`.

Design skills used: `ui-ux-pro-max` and `frontend-design`; optional `board-game-design` applies when designing actual rules/economy. Skills are aids, not permission to change an approved direction. Do not require globally installed skills for CI. New visual directions still need concept review before implementation unless the user explicitly skips it.
