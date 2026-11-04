---
title: Bàn 3D và camera
description: Shared grid, scene ownership, camera gestures and local preview boundaries
type: architecture
tags: [3d, board, camera, mobile]
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T07:19:37.851Z
sources:
  - id: openwiki-source-49557827443d53e9eeae17f4
    resource: repo://src/board/layout.ts
  - id: openwiki-source-1475654f7d7ee4e91ea6389a
    resource: repo://src/board/scene.ts
  - id: openwiki-source-e10546cfd06c4716552b2c32
    resource: repo://src/board/stage.ts
  - id: openwiki-source-d151d0d577d3bf13071b48d2
    resource: repo://src/game-ui/board-preview.ts
  - id: openwiki-source-956a523ed721749c7e5f092a
    resource: repo://tests/board-browser.mjs
  - id: openwiki-source-df13702d635f30aac30177fb
    resource: repo://tests/board-layout.test.mjs
generated: { by: "codex", at: "2026-11-04T07:11:51.775Z" }
---

# Bàn 3D và camera

The local ?view=game preview uses one Three.js renderer across HUD redraws, a shared40-space grid with2.2-deep tiles, outward-readable labels and buildings on inner property stripes. Focus follows the active fixture token; Overview supports orbit/pan/zoom. WebGL fallback preserves a flat board. No authoritative economy or multiplayer gameplay is added.

Layout/spaces/camera-math are pure modules. Texture draws only perimeter cell seams, leaving mint centre clear. The same texture generator powers flat fallback; generated concept images are not runtime artwork. Labels are rotated physically per edge so an outside observer reads upright. Token outer zone and label/inner building stripe remain separate. Canonical labels follow G0009 source, including Rhode Island Avenue at6.

BoardStage owns canvas, renderer, OrbitControls, observers and on-demand frames. Play owns its lifecycle and moves the same canvas into each newly rendered HUD host. Scene owns reusable model assets, texture and local animation. Reduced motion snaps token movement. Render stops while hidden/offscreen; context loss switches to flat view. Teardown releases listeners/observers/GPU assets. Pixel ratio capped2; texture3072. Shadows use one1024 map; actual phone performance has not been measured.

Overview: one-finger orbit, two-finger pan/pinch zoom, mouse right-pan/wheel, arrows and+/−. Focus stands outside the active token edge; the Overview orbit distance clamp does not constrain Focus. View controls are not game actions and remain available to observers. HUD tasks and safe-area contracts continue unchanged.

Tests cover grid/corner adjacency, label and building zones, camera projection, one WebGL context through redraws, focus/overview, pan/orbit/keyboard, resize, context loss and unavailable WebGL fallback on dev/production. Browser screenshots are visual evidence, not physical-device performance evidence.

See [authored implementation](../../docs/game/ui-implementation.md) and [decision](../../docs/decisions/0005-3d-board-preview.md).
