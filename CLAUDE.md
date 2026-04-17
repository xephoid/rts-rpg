# CLAUDE.md — Neither ___ Nor Gears

This file is the source of truth for all confirmed architectural decisions and working conventions for this project. Read this file at the start of every session before touching any code. If anything here conflicts with the development plan (`dev_plan.docx`), this file wins — it is the most current record.

---

## Project Overview

**Neither ___ Nor Gears** is a browser-based real-time strategy game with RPG progression and grand strategy diplomacy elements. Two playable factions (Wizards and Robots), five NPC factions, three win conditions (Military, Cultural, Technological), a full diplomacy system, and a local LLM narrative layer.

Full spec: `functional_spec.md` (source: `functional_spec.docx`)  
Full development plan: `dev_plan.md` (source: `dev_plan.docx`)

---

## Tech Stack (Confirmed)

| Layer | Technology |
|---|---|
| Frontend | TypeScript + React + Vite |
| Game renderer | PixiJS (WebGL) |
| UI styling | CSS Modules (no Tailwind) |
| State management | Zustand (two stores — see below) |
| Backend | Node.js + TypeScript (Fastify) |
| Real-time | WebSocket |
| Database | PostgreSQL via Heroku Postgres + Drizzle ORM |
| Hosting | Local development for now; Heroku (Standard-1X web dyno + worker dyno) when ready to deploy |
| Monorepo | pnpm workspaces + Turborepo |
| Testing | Vitest (unit/integration) + Playwright (E2E) |
| CI/CD | GitHub Actions → Heroku deploy on merge to main |

---

## Confirmed Architecture Decisions

### Rendering: Two Layers, Hard Boundary

- **PixiJS canvas** renders the game world only: map tiles, terrain, units, buildings, fog of war, territory lines, selection rings, projectiles, visual effects.
- **React + HTML/CSS** renders ALL UI: HUD, resource display, minimap, info panel, action buttons, diplomacy panel, dialogue panel, alert log, active objectives, portraits, zoom controls.
- The PixiJS canvas is `position: absolute` filling the viewport. The React UI layer sits on top with `pointer-events` managed per element.
- **No exceptions.** Do not draw any UI element in PixiJS. Do not put game logic in React components.

### No Inline Styles — Ever

- All styling goes through CSS Modules. One `.module.css` file per component.
- ESLint rule `react/forbid-component-props` is configured to ban the `style` prop on all React components. This is intentional and must never be disabled.
- This rule must be active from the first line of Phase 5 — not retrofitted later.

### Zustand: Two Stores

1. **UI Store** — selected unit/building, open panels, camera position, active alerts, dialog state.
2. **Game State Mirror** — read-only snapshot of simulation state that React components read from. Updated by the game loop via a bridge function.
3. The **simulation itself** does not use Zustand. It runs as a pure TypeScript engine and pushes state into the mirror store after each tick.

### Import Boundaries (ESLint)

- `/game` must never import from `/renderer`, `/ui`, or `/store`.
- `/renderer` may import from `/game` (read-only) and `/store`.
- `/ui` may import from `/store` only — never from `/game` directly.
- Configure with `eslint-plugin-boundaries`. Violations are build errors, not warnings.

### Event System: Two Tiers

1. **Synchronous within-tick events** — dispatched and resolved in the same game loop tick (combat, movement, resource collection).
2. **Deferred post-tick queue** — queued during the tick, processed after: narrative triggers, alerts, diplomacy notifications, UI updates. This keeps the game loop deterministic.

### LLM: Abstraction Layer

- All LLM calls go through `INarrativeService` (defined in `/backend/src/narrative/`).
- `OllamaProvider` — local dev (calls `http://localhost:11434`).
- `ClaudeAPIProvider` — production on Heroku.
- Provider is selected via the `LLM_PROVIDER` environment variable. No game code changes when switching environments.
- All LLM calls are async and run from the worker dyno. They never block the game loop.

### Audio: Abstraction Layer

- All audio goes through `IAudioService` with methods: `play(event)`, `stop()`, `setMusicState(state)`.
- Start with `HowlerProvider` (Howler.js). The interface is designed to be swapped for FMOD if adaptive music is needed later.
- Placeholder audio: Kenney CC0 audio packs (Impact Sounds, Sci-Fi Sounds, Interface Sounds).

### Robot Faction: Core/Platform Component Model

- A `Core` is an entity with an optional `AttachedPlatform` component.
- When detached: Core is in civilian mode (can Talk, Convert, or attach to a platform).
- When attached: combined entity uses the platform's stats + any Core-accumulated stat XP.
- Core retains all stat XP/levels when switching platforms.

---

## Monorepo Structure

```
/
├── packages/
│   ├── shared/           # Shared TypeScript types + all config files
│   │   ├── config/       # ALL balance values, costs, stats, UI text (see below)
│   │   └── types/        # Typed interfaces for GameState, Unit, Building, etc.
│   ├── frontend/         # React + Vite app
│   │   └── src/
│   │       ├── game/     # Game simulation engine (no imports from /ui or /store)
│   │       ├── renderer/ # PixiJS rendering only
│   │       ├── ui/       # React components (CSS Modules, no inline styles)
│   │       └── store/    # Zustand stores
│   └── backend/          # Fastify server
│       └── src/
│           ├── narrative/ # INarrativeService + providers
│           └── audio/     # IAudioService + providers
```

---

## Config-Over-Code Policy

**Every number and every UI string lives in `/packages/shared/config/`.** Nothing is hardcoded in game logic. This is non-negotiable.

| File | Contents |
|---|---|
| `unitStats.ts` | HP, damage, range, speed, charisma, armor, capacity, XP rates — all unit types |
| `buildingStats.ts` | HP, capacity, vision range — all building types |
| `resourceCosts.ts` | Production costs (wood + water), construction costs, research costs and durations |
| `spellCosts.ts` | Mana costs per spell, Mana Shield drain rate, generation rates, proximity boost |
| `aiParameters.ts` | Reaction interval, aggression threshold, gathering baseline, NPC alignment values |
| `victoryThresholds.ts` | Cultural victory targets, tech victory item list, victory alert proximity % |
| `uiText.ts` | All user-facing strings: labels, messages, tooltips, victory/defeat copy |
| `mapConfig.ts` | Map sizes, terrain costs, deposit quantities, auto-collection rates |

---

## Sensible Defaults for TBD Values

Do not block on missing values. Make reasonable guesses, place them in the relevant config file, and mark them with a comment:

```typescript
// Initial guess: 3-4 hits to kill a same-tier unit. Adjust after playtesting.
baseDamage: 28,
```

**Reference ranges:**
- Basic unit HP: 80–120
- Damage: sized so 3–5 hits kill a same-tier unit
- Ranged attack range: 4–6 tiles; melee: 1 tile
- Light unit cost: 20–40 wood + 10–20 water; production: 15–20 seconds
- Heavy unit cost: 60–80 wood + 30–40 water; production: 30–45 seconds
- Mana: 1–2 passive per tick per wizard unit; Reservoir 5–10/tick; spells cost 20–60
- XP per kill: 10–25; level thresholds double (2, 4, 8 … 1024)

When Zeke confirms a value, change the comment from `// Initial guess` to `// Confirmed` and note it in the commit message.

---

## Working Conventions

### Version Control
- Push directly to `main` after each completed phase milestone. No PRs required.
- Commit format: `feat(phase-N): [milestone description]`
- Every commit must have passing tests. Never push broken code.

### Testing
- Write tests **alongside** each feature in the same phase — never in a separate pass.
- Coverage target for `/game`: **85%+** before Phase 15 (AI opponents).
- Vitest for all game logic; Playwright for user-facing E2E flows.

### Heroku / Deployment
Heroku setup is deferred. Run everything locally until there is a reason to deploy. When deployment is needed, set up dev/staging/prod Heroku apps and worker dyno at that point. Do not add Heroku-specific config or CI/CD deploy steps until Zeke says so.

### Session Start Checklist
1. Read this file (CLAUDE.md)
2. Run `git status` — confirm clean or understand current state
3. Identify the target phase milestone for this session
4. Check if any TBD values have been updated here or in config files since last session

### Session End
- Commit completed work with a descriptive message
- If mid-phase, leave a `// TODO: next step — [description]` comment in the active file
- Do not leave uncommitted changes at session end

### Architectural Conflicts
If you encounter a situation where the cleanest implementation seems to require violating a rule in this file (inline styles, import boundaries, bypassing config, etc.), **stop and flag it** rather than quietly bending the rule. These constraints exist for long-term maintainability and should only change with deliberate decision-making.

### Communication Style (Caveman Token Compression)

Use terse caveman-style prose for all implementation work. Rules:

- Drop articles: no "a", "an", "the"
- Drop filler: no "just", "really", "basically", "actually", "simply"
- Drop pleasantries: no "sure", "certainly", "of course", "happy to", "great question"
- No hedging: no "it might be worth", "you could consider", "perhaps"
- Fragments fine. No need full sentence. Short synonyms preferred.
- Technical terms stay exact — never compress type names, file paths, or API names.

**Auto-clarity exceptions — use normal prose for:**
- All Phase 0 design discussions
- Flagging any architectural conflict or rule violation (see Architectural Conflicts above)
- Any question requiring a decision from Zeke before work can proceed
- Security warnings or irreversible actions (destructive migrations, data loss, etc.)
- Explaining the rationale behind an initial-guess config value when asked

Resume caveman after exception is resolved.

---

## Phase 0: Must Complete Before Any Implementation

Phase 0 is a joint working session — no code is written. It produces:

1. **Design Values Document** — all TBD stat values, costs, and formulas filled in
2. **Architecture Decision Record (ADR)** — binding answers to all open questions in Section 2 of `dev_plan.docx`

No implementation phase begins until Phase 0 is explicitly signed off by Zeke.

---

*Last updated: April 2026*
