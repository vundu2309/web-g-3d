# Art direction for the sea game: soft cartoon

Status: **proposal for review.** It writes down what the sea already does and sets the rules the next changes follow. Nothing here replaces the approved sky/cobalt/yellow UI in [theme.md](theme.md). The current state is in [art-current.png](art-current.png) (844×390, software-rendered Chromium, not a phone capture).

## The look in one line

Rounded low-poly shapes, saturated but friendly colours, flat soft light, a thin warm highlight on edges, no realistic textures. Think a cheerful mobile fishing game, not a simulation.

## Rules

1. **Shape**: every object is built from a few big, rounded forms (hull curve, sphere head, cylinder body). No sharp thin parts except lines (rod, fishing line, mast). Edges of boxes are only for crates, houses and docks.
2. **Size on a phone**: the boat is the hero. Anything the player must read in a 844×390 landscape view (boat, fisherman, lure, fish, buoys) is at least 8 px tall at the normal chase camera, and the fishing camera makes the line and fish at least 20 px.
3. **Colour**: each object uses at most 3 body colours plus one accent from the palette below. Water, sky and fog stay in the blue family so warm accents (yellow, coral, orange) always stand out against them.
4. **Light**: one warm sun from the front-left, a soft sky fill, no hard black shadows; shading is vertex colour plus gentle lighting. Fog tints distance toward the horizon colour.
5. **Detail budget**: one merged mesh per boat, one per island, instances for repeated props. An island stays under about 26,000 triangles (tests enforce it); the whole scene stays near 90,000 triangles.
6. **Motion**: soft and eased (springs, damping). Nothing snaps; heading and position of fish and boats are low-pass filtered.
7. **UI over 3D**: glass controls, cobalt outline `#153B80`, yellow `#FFD35A` for the main action, coral `#E97760` for danger or biting. No text for fish states, only signals.

## Palette (objects)

| Role       | Values in use                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Water      | deep `#0A4766`, shallow `#1A8FA8` (shader), horizon `#CCE3F0`, zenith `#478CD6`                             |
| Boat hulls | blue `#2A6FB8`, coral `#E0654F`, teal `#2F9A8A`, violet `#7A5BB5`; trim yellow `#FFD35A` or cream `#FFF1C9` |
| Wood       | deck `#B98757` / `#A57647`, rail and trim `#C98A4B`, mast `#9B6B3F`                                         |
| House      | wall `#FFF7E0`, roof `#EF866A`, window `#1D4E73`, funnel `#B23A32`                                          |
| Fisherman  | coat `#FFC83D`, trousers `#2F5D8A`, skin `#F2B98F`, hat `#E9C46A`                                           |
| Islands    | sand `#F2DCA2`, wet sand `#C9B27B`, grass `#7BBF6E` / `#4B9A5A`, dry grass `#B3BF67`, rock `#8D9298`        |
| Accents    | lighthouse red `#E0554B` and white `#FFF7E6`, lure `#FF7333`, life ring `#E5534B`                           |

## Known gaps (to do, in this order)

1. Boat details: window frames, rails, net, floats; the cabin wall is plain grey on screen.
2. Island variety: more tree kinds, rocks, clouds and birds; same silhouette on every island is too uniform.
3. Light: soft shadows and a warmer sun, with a light post effect, only if the cost on phones is acceptable.
4. Sharpness on phones: check how often the render scale drops, with a real phone capture.

Each step is shown as an image first and merged only after approval.
