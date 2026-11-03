# Architecture and context map

This is a single Vite/Babylon browser application with an optional Havok demo. Keep the architecture proportional to that scope. The current experience is an orbit camera over a procedurally built ocean and sailboat; missions, steering and physical buoyancy are not implemented.

| Layer | Ownership | Allowed dependencies |
| --- | --- | --- |
| `src/main.ts` | DOM loading/error state and HMR | app |
| `src/app/` | Engine, browser listeners, render loop, teardown | game, platform |
| `src/game/ocean/scene.ts` | Scene composition, camera, animation, boat sampling | ocean modules, Babylon |
| `src/game/ocean/waves.ts` | Shared deterministic wave parameters and CPU sampling | none |
| `src/game/ocean/materials.ts` | GPU displacement, analytic normals, wavelets, water/sky shading | waves, Babylon |
| `src/game/ocean/boat.ts`, `surface.ts` | Procedural geometry with scene-owned resources | Babylon |
| `src/platform/physics.ts` | Havok loading and Vite WASM URL | Havok, Babylon |
| `src/game/playground.ts` | Separate collision validation scene | Babylon physics |

Lint prevents game/platform imports from app/main and imports into the pure wave field. These are narrow enforceable checks, not a complete dependency proof. DOM and ownership boundaries still require review.

## Rendering and simulation contracts

The Gerstner spectrum is shared between CPU and generated GLSL. Wave packets vary in space/time. CPU buoyancy inverts horizontal displacement before sampling height. The unit test checks round trips at several positions/times and calm/rough strengths. It does not execute GLSL; browser and visual checks are also required when shader math changes.

Fine ripples affect normals only. The boat follows height and neighboring samples; it is not a Havok rigid body in the ocean. Hull foam should only be added with a credible contact or wake model: a stationary ellipse produced a visible white stain and was removed. Crest foam normalizes compression by local spectral steepness and combines it with the normalized height of long waves, so absolute thresholds do not suppress whitecaps. Advected noise breaks the crest coverage into patches; this remains a shading approximation rather than a fluid/foam simulation.

Scene teardown removes its observer and disposes scene-owned meshes/materials. App teardown stops rendering, removes DOM listeners, disposes scene, then engine. Keep the order explicit when adding resources. Avoid abstractions that obscure ownership.

## Context sources

`AGENTS.md` is the agent entrypoint. This file records stable boundaries; [workflow](workflow.md) describes executable checks. [Decisions](decisions/0001-context-and-validation.md) explain material tradeoffs. OpenWiki is a generated retrieval index backed by source evidence; it complements these authored contracts. Its skill is loaded only for wiki work. Do not duplicate the same instructions across agent-specific prompt files.

Add a module when a real responsibility or independently testable boundary emerges. Do not introduce ECS, generic event buses, service locators or a backend solely to make the repository look more sophisticated.
