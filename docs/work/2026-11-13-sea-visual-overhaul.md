---
title: Sea visual overhaul (water, islands, shore, props, reflections, people, camera)
state: published
opened: 2026-11-13
owner: the main session
agents: sea-visual-builder, blender-structure, blender-refine (the first agents of the work were created later from these briefs)
decision: docs/decisions/0011-sea-visual-overhaul.md
---

# Sea visual overhaul

## Feedback and goal

The sea looked flat and repetitive, the islands too pointy and fake, the market people ugly, the camera too low, the beach too short and steep for the surf to look real. The owner's rules: beauty first, performance later, images approved before every push. The full record and the numbers are in [decision 0011](../decisions/0011-sea-visual-overhaul.md) and [agent-briefs.md](../agent-briefs.md).

## Plan and owners

| Step                                                     | Commit                    | State     |
| -------------------------------------------------------- | ------------------------- | --------- |
| Waves and ripples                                        | `331ec8f`                 | published |
| Islands, style A                                         | `a202a42`                 | published |
| Shore field, surf, swash, turquoise water                | `88fe8a3`                 | published |
| Blender palms, rocks, hut                                | `0a730a9`                 | published |
| Water reaches past the fog                               | `01aa89b`                 | published |
| Blender bushes                                           | `f5d9b29`                 | published |
| Full reflections                                         | `a98b5be`                 | published |
| Long gentle beaches                                      | `d6118f8`                 | published |
| Chase camera, chibi NPCs, icon, update check, economy on | earlier commits on `main` | published |

## Evidence

Checks and browser tests were run by the agents and rerun by the lead before each push (212 unit tests at the last one); images were software-rendered before/after sets approved by the owner. **Not verified:** a real phone, any frame rate. `ocean-fishing-browser` failed on a timing assertion several times under software WebGL and passed on rerun (once the cause was found and fixed in the beach change).

## Follow-ups (in the owner's order)

1. Fix the flat grey patches on grassy slopes, the sand edge that can show beside boats in deep wave troughs, patchy outer surf lines, blocky bushes up close.
2. Refresh OpenWiki, which is stale against this overhaul.
3. The performance pass (measure on a real phone first): the scene is about 420,000 triangles in the browser test (the mirror pass draws it twice) and the water shader is heavy.
4. Living-sea ideas already listed as debt: NPC boats, NPC quests (need server-authoritative fishing), schools of fish.
