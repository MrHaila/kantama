# Kantama

An interactive map of temporal distances between places in the Helsinki metropolitan area using public transit.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Kantama                             │
├──────────────┬──────────────────────┬───────────────────────┤
│     otp/     │      varikko/        │        opas/          │
│   (Routing   │   (Data Pipeline)    │    (Visualisation)    │
│    Engine)   │                      │                       │
├──────────────┼──────────────────────┼───────────────────────┤
│ Runs local   │ Pre-calculates       │ Interactive Vue 3     │
│ OTP instance │ routes & zones →     │ frontend reading      │
│ via Docker   │ JSON + MessagePack   │ opas/public/data/     │
└──────────────┴──────────────────────┴───────────────────────┘
        ↑                 ↓                      ↑
   [HSL Graph]    [opas/public/data/]    [opas/public/data/]
                  ├─ zones.json
                  ├─ pipeline.json
                  ├─ manifest.json
                  └─ routes/*.msgpack
```

**Typical workflow**: OTP powers Varikko → Varikko pre-computes data → Opas visualises it.

**Data flow**: Varikko writes directly to `opas/public/data/` as single source of truth. No export step needed.

Most development work happens in **Opas** – improving the visualisation without touching the data pipeline.

## Sub-Projects

| Directory  | Purpose                  | Details                                                                 |
| ---------- | ------------------------ | ----------------------------------------------------------------------- |
| `otp/`     | OpenTripPlanner instance | Fetches HSL routing data, runs local Docker OTP server                  |
| `varikko/` | Data pipeline            | Calculates transit times between administrative zones, writes to `opas/public/data/` |
| `opas/`    | Web frontend             | Vue 3 + D3.js interactive chrono-map visualisation                      |

See each sub-project's `AGENTS.md` for specific implementation details.

## Global Rules

1. **Package Manager**: Always use `pnpm`, never `npm` or `yarn`.
2. **Code Quality**: Run `prettier` and `eslint` before committing. All code must be TypeScript.
3. **Validation**: Use `pnpm lint` and `pnpm format` at the repo root to check all sub-projects.

## Quick Start

```bash
# Install all dependencies
pnpm install

# Common development (Opas only)
pnpm opas:dev
```

## Testing

```bash
# Run all tests (currently varikko only)
pnpm test

# Run varikko tests with UI
pnpm varikko:test

# Lint all sub-projects
pnpm lint

# Format all files
pnpm format

# Build all sub-projects
pnpm build
```
