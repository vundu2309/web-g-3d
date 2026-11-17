# Ra khơi — approved visual direction

The primary audience plays on phones. Design for **landscape mobile first**, especially 844×390 and 932×430; also check 667×375. Desktop is an expansion, not the source layout. Portrait must remain usable without forcing orientation or fullscreen APIs. Account for safe-area insets and the on-screen keyboard; allow vertical scrolling when necessary instead of clipping form controls.

## Theme tokens

Edit shared tokens in `src/style.css` (and `src/ocean/style.css`) rather than introducing local palettes per screen.

| Role                      | Value     |
| ------------------------- | --------- |
| Paper sky background      | `#DCEEFF` |
| Cobalt ink / outlines     | `#153B80` |
| Main action yellow        | `#FFD35A` |
| Input / secondary surface | `#FFFFFF` |
| Small roof accent         | `#E97760` |
| Supporting text           | `#385B8D` |

Use Baloo 2 800 for the brand and headings, Be Vietnam Pro 400/600/700 for controls and body text. Latin and Vietnamese subsets are self-hosted through Fontsource, never a runtime Google Fonts request. Controls have a moderate rounded shape and a short cobalt lower edge. Player slots have a different radius from buttons. Keep paper grain subtle and pointer-transparent.

## Interaction and scope

- One task per screen: the harbor (one “Ra khơi” button), the full-screen sign-in, the loading screen, the sea. No rooms, lobby or readiness.
- Use visible labels, keyboard focus, readable Vietnamese text and touch targets at least 44 CSS px. Do not rely on hover, tiny icons or color alone.
- Do not shrink inputs below 16px (iOS zoom); the on-screen keyboard can require scrolling.
- A missing account configuration, a lost connection or a refused sign-in is shown as a message, never replaced by sample players or a different service.

## Review before release

Inspect real rendered harbor, sign-in, loading and sea screens at mobile landscape sizes first (844×390, 932×430, compact 667×375). Test portrait fallback, text escaping, long names and errors. A generated concept or passing build is not visual verification. Save temporary browser screenshots under ignored `test-results/`.

New visual directions still need concept review before implementation unless the user explicitly skips it.

## Approved shared-sea direction (2026-11-05)

The user approved a fishing-boat concept with one separate boat per player, then selected one common channel/map and direct entry after login. Reuse the sky/cobalt/yellow palette, fonts and mobile-first touch controls. The active hub offers “Vào game”; no create/join/ready flow is shown. The main view is an elevated follow camera over the player's boat, other actual players' boat labels, minimal channel/status HUD, steering pad, “Thả câu” and “Kho cá”. See [shared sea contract](../ocean.md).

The implementation uses procedural low-poly boats, shader waves and simple islands, rather than claiming the generated concept's detailed wooden textures/lighting are implemented. Actual browser captures are required for visual acceptance.
