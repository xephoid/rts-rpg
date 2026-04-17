# Architecture Decision Record — Neither ___ Nor Gears

Version 1.0 · April 2026
Status: **Phase 0 Draft — pending Zeke sign-off**

All decisions in this document are binding once signed off. Changes require explicit discussion
and a new ADR entry. This document takes precedence over dev_plan.docx on architectural matters;
CLAUDE.md takes precedence over this document on working conventions.

---

## ADR-001 — Frontend Framework

**Decision:** TypeScript + React + Vite

**Rationale:** Standard modern browser stack. Vite dev server is fast; React component model
maps cleanly to the layered UI. TypeScript enforced across all packages for shared type safety
between frontend and backend.

---

## ADR-002 — Game Renderer

**Decision:** PixiJS (WebGL canvas)

**Boundary:** PixiJS renders the game world only — map tiles, terrain, units, buildings, fog of
war, territory boundary lines, selection rings, projectiles, visual effects. No UI elements are
drawn in PixiJS.

**Rationale:** WebGL performance for real-time unit counts. Mature API with good TypeScript
support. Hard boundary with React layer keeps rendering and UI concerns fully separated.

---

## ADR-003 — UI Rendering

**Decision:** React + HTML/CSS for all UI elements

**Scope:** HUD, resource display, minimap wrapper, info panel, action buttons, diplomacy panel,
dialogue panel, alert log, active objectives, portraits, zoom controls — every user-facing element.

**Layer stacking:** PixiJS canvas is `position: absolute` filling the viewport. React UI layer
sits on top with `pointer-events` managed per element (none on transparent areas, auto on panels).

**Rationale:** CSS handles animations natively. HTML layout is declarative. Accessibility applies
naturally. Swapping visual design of any UI component is a CSS change, not a game engine change.

---

## ADR-004 — UI Styling

**Decision:** CSS Modules exclusively. No Tailwind. No inline styles.

**Enforcement:** ESLint rule `react/forbid-component-props` bans the `style` prop on all React
components. This is intentional and must never be disabled. One `.module.css` file per component.

**Rationale:** Prevents style drift during rapid development. All visual design stays in one
place. Scoped class names prevent cross-component collisions.

---

## ADR-005 — Minimap Rendering

**Decision:** PixiJS RenderTexture (secondary scaled-down render of the game world)

**Rationale:** Consistent with the main renderer. Fog-of-war state and unit positions update
through the same PixiJS pipeline as the main canvas. Avoids maintaining a separate rendering
path with separate fog logic. The minimap texture is composited as a React UI element wrapping
a secondary PixiJS view.

---

## ADR-006 — State Management

**Decision:** Zustand — two stores

1. **UI Store** — selected unit/building, open panels, camera position, active alerts, dialog state.
2. **Game State Mirror** — read-only snapshot of simulation state. React components read from
   this store. Updated by the game loop via a bridge function after each tick.

**The simulation itself does not use Zustand.** It runs as a pure TypeScript engine and pushes
state into the mirror store.

**Rationale:** Keeps game simulation logic testable in isolation. React components only read
from Zustand — they never reach into the simulation directly. Bridge function is the single
update path.

---

## ADR-007 — Import Boundaries

**Decision:** Enforced via `eslint-plugin-boundaries`. Violations are build errors, not warnings.

| Package | May import from |
|---|---|
| `/game` | Nothing outside `/game` |
| `/renderer` | `/game` (read-only), `/store` |
| `/ui` | `/store` only |
| `/store` | `/game` types only (via `/shared`) |

**Rationale:** Prevents accidental coupling between simulation logic and rendering/UI code.
Keeps the game engine independently testable and portable.

---

## ADR-008 — Event System

**Decision:** Two-tier event system

1. **Synchronous within-tick events** — dispatched and resolved in the same game loop tick
   (combat resolution, movement, resource collection, building construction progress).
2. **Deferred post-tick queue** — queued during the tick, processed after the tick completes:
   narrative triggers, alerts, diplomacy notifications, UI state updates, LLM calls.

**Rationale:** Keeps the game loop deterministic. Deferred events can be inspected, replayed,
and logged without affecting simulation state mid-tick.

---

## ADR-009 — Game Loop Authority

**Decision:** Client simulation + server sync

The game loop runs in the browser (requestAnimationFrame). The server receives player inputs,
validates them, and broadcasts authoritative state on significant events. Clients reconcile
on mismatch. Single-player sessions run without a server connection.

**Rationale:** Lower latency for player actions. Local simulation feels immediate. Offline/solo
play works without a server. Reconciliation logic is bounded — the server is the authority on
AI decisions, diplomacy, and LLM outputs; client handles rendering and local player actions.

---

## ADR-010 — Real-time Protocol

**Decision:** WebSocket with delta/event messages

The server sends only what changed: `UNIT_MOVED`, `BUILDING_DESTROYED`, `RESOURCE_UPDATE`,
`DIPLOMACY_CHANGED`, etc. Clients maintain local state and apply incoming deltas. Full state
sync is sent once on session join and on reconnect.

**Message shape (draft):**
```typescript
type GameEvent =
  | { type: 'UNIT_MOVED'; unitId: string; x: number; y: number; tick: number }
  | { type: 'UNIT_DESTROYED'; unitId: string; tick: number }
  | { type: 'BUILDING_CONSTRUCTED'; building: BuildingSnapshot; tick: number }
  | { type: 'RESOURCE_UPDATE'; factionId: string; wood: number; water: number; mana?: number; tick: number }
  | { type: 'DIPLOMACY_CHANGED'; factionA: string; factionB: string; change: DiplomacyDelta; tick: number }
  | { type: 'NARRATIVE_EVENT'; payload: NarrativePayload; tick: number }
  | { type: 'FULL_STATE_SYNC'; state: GameStateSnapshot }
```

**Rationale:** Minimal bandwidth. Scales to large unit counts. State is always local on the client;
network delivers patches. Consistent with client simulation authority model (ADR-009).

---

## ADR-011 — Backend Framework

**Decision:** Node.js + TypeScript + Fastify

REST API for session management, player config, and LLM proxy. WebSocket for real-time game events.

---

## ADR-012 — Database

**Decision:** PostgreSQL via Heroku Postgres + Drizzle ORM

Stores match history, player config, and persistent state. Drizzle provides type-safe schema
with TypeScript. Schema migrations tracked in version control.

---

## ADR-013 — Monorepo

**Decision:** pnpm workspaces + Turborepo

```
packages/
  shared/     — shared TypeScript types + all config files
  frontend/   — React + Vite app
  backend/    — Fastify server
```

Turborepo handles build orchestration and caching. pnpm workspaces manage cross-package
dependencies. `packages/shared` is the single source of truth for all types and config values.

---

## ADR-014 — LLM Integration

**Decision:** INarrativeService abstraction layer; provider selected via `LLM_PROVIDER` env var

- `LLM_PROVIDER=ollama` → `OllamaProvider` (calls `http://localhost:11434`)
- `LLM_PROVIDER=claude` → `ClaudeAPIProvider` (calls Anthropic API, model: `claude-haiku-4-5`)

All LLM calls are async, run from the worker dyno (production) or a background process (local),
and never block the game loop. The game loop queues narrative triggers as deferred post-tick
events (ADR-008); the narrative service processes them off the hot path.

**Rationale:** Zero game code changes when switching environments. Local dev uses free Ollama.
Production uses pay-per-token Anthropic API. Token costs are low because GameStateSnapshot
payloads are small.

---

## ADR-015 — Audio

**Decision:** IAudioService abstraction; HowlerProvider as initial implementation

Methods: `play(event: AudioEvent)`, `stop()`, `setMusicState(state: MusicState)`.

Start with Howler.js. Interface is designed to swap to FMOD if adaptive music is added later —
no game code changes required at that point.

Placeholder audio: Kenney CC0 packs (Impact Sounds, Sci-Fi Sounds, Interface Sounds).

---

## ADR-016 — Testing

**Decision:** Vitest (unit/integration) + Playwright (E2E)

- Vitest for all game simulation logic, engine, and backend unit tests.
- Playwright for user-facing browser flows.
- Coverage target: 85%+ for `/game` package before Phase 15 (AI opponents).
- Tests written alongside features in the same phase — never deferred.

---

## ADR-017 — Hosting & Deployment

**Decision:** Local development only until Zeke explicitly triggers deployment setup.

When deployment is needed: Heroku Standard-1X web dyno + worker dyno. GitHub Actions CI/CD
on merge to main. Dev/staging/prod environments configured at that time.

No Heroku-specific config, environment variables, or CI/CD deploy steps until explicitly requested.

---

## ADR-018 — Robot Core/Platform Component Model

**Decision:** Core is a unit entity with an optional `AttachedPlatform` component.

- **Detached Core** — civilian mode: can Talk, Convert, or attach to a nearby platform.
- **Attached Core** — combined entity uses platform stats + Core's accumulated stat XP.
- Core retains all stat XP/levels across platform switches.
- Platform without Core: non-functional, remains on map.

XP is tracked per-stat on the Core (capacity, damage, speed, etc.) based on actions performed
across its lifetime. No stat is inherently harder to level — they reflect usage history only.

---

## ADR-019 — Armor Model

**Decision:** Flat damage reduction

Each armor point absorbs 1 damage. Minimum 1 damage always gets through — no full immunity
possible. Simple, predictable, and approachable for the target audience.

---

*Locked on Phase 0 sign-off. Any change requires explicit decision and a new ADR entry.*
