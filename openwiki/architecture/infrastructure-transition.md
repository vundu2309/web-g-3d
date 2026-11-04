---
type: "Tham khảo"
title: "Target infrastructure transition"
openwiki_generated: true
verified:
  - by: openwiki/0.7.3
    at: 2026-11-04T07:39:13.991Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-115b2dad781e2a2c5b5a980d
    resource: repo://docs/architecture.md
  - id: openwiki-source-96aca2295370362abfc54588
    resource: repo://docs/decisions/0006-infrastructure-transition.md
  - id: openwiki-source-22c382245dd906dd1c064e27
    resource: repo://src/hub/store.ts
generated: { by: "codex", at: "2026-11-04T07:39:13.991Z" }
---

# Target infrastructure transition

## Selected target, current production unchanged

The selected migration target is Vercel frontend/PWA, Render API, Supabase Auth/PostgreSQL. It is not implemented or deployed; Pages/Firebase remain current production. Decision0006 records adapter, data-preservation, authorization, concurrency and cross-origin PWA cutover requirements. Provider access/project identity is still required.
