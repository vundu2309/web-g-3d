# 0001 — Progressive context and executable verification

Status: accepted

## Context

The project is edited through agents in cloud tasks and deployed as a static game. Previously, only type checking/build ran in CI, while browser checks required a manually running server. Generated wiki prose could describe a different state from executable configuration. Graphics changes also showed that passing tests alone do not establish visual quality.

## Decision

Use one authored `AGENTS.md` entrypoint linked to architecture/workflow docs and a generated, source-grounded OpenWiki. Load relevant context on demand. Preserve OpenWiki-owned blocks and metadata. Keep agent-specific setup limited to the existing project MCP/skill; do not mirror instructions into multiple assistant files.

Make `npm run check` the common local/CI gate. Keep the wave field pure, verify its inversion numerically, exercise browser behavior on dev and production, and require actual render inspection for visual tasks. Use a self-contained test runner with owned ephemeral servers. Keep model generation out of CI by default.

## Consequences

Browser installation adds CI time; AI tooling adds development dependencies but is absent from the game import graph. Tests are evidence for specific invariants, not proof of realism or measured device performance. Maintainers must keep authored contracts and generated wiki aligned. Additional abstractions or automated agent services should be introduced only when a concrete task needs them.
