**Neither \_\_\_ Nor Gears**

Project Development Plan

Version 1.0 · April 2026

*Based on Functional Specification Rev. 1*

**Table of Contents**

**1. Project Overview**

Neither \_\_\_ Nor Gears is a browser-based real-time strategy game with
RPG progression and grand strategy diplomacy elements. All players and
AI factions act simultaneously and continuously throughout the match.
Each match is uniquely generated with randomized terrain, resources, and
starting positions.

The game features two asymmetric factions (Wizards and Robots), five
non-playable factions, a local LLM-powered narrative layer, three
distinct win conditions, and a full diplomacy system. This document
defines the phased development plan from initial architecture through
production deployment on Heroku.

**1.1 Scope Summary**

  ------------------- -----------------------------------------------------------
  **Area**            **Description**
  Playable factions   2 playable (Wizards, Robots) + 5 NPC factions
  Win conditions      Military, Cultural, Technological
  Map                 Procedurally generated, fog of war, 4 zoom levels
  Units               20+ unit types across both factions plus named characters
  Buildings           20+ building types across both factions
  Narrative           Local LLM: dialogue, quests, named characters
  Diplomacy           Open borders, treaties, resource/unit requests, embassies
  AI opponents        3 archetypes + 5 NPC behavioral profiles
  ------------------- -----------------------------------------------------------

**2. Technology Stack & Architecture**

**2.1 Core Stack**

  ------------------ ---------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Layer**          **Technology**                     **Notes**
  Frontend           TypeScript + React + Vite          All UI components (HUD, panels, alerts, diplomacy, dialogue) are standard HTML/CSS React components --- not drawn in PixiJS
  Game Renderer      PixiJS (TypeScript)                Renders the game world only: map tiles, units, buildings, fog of war, territory lines, selection highlights, visual effects. The PixiJS canvas sits behind the React UI layer
  UI Styling         CSS Modules                        Scoped CSS per component; no Tailwind runtime needed; supports CSS animations for alert flashes, panel transitions, and portrait effects
  State Management   Zustand                            Two separate stores: game UI state (selected unit, open panels, camera) and a read-only mirror of game simulation state for React to consume. The simulation itself is not Zustand
  Backend            Node.js + TypeScript (Fastify)     REST + WebSocket API; hosts game session state, LLM proxy, persistence
  Database           PostgreSQL (Heroku Postgres)       Match history, player config, persistent state
  Hosting            Local for now; Heroku when ready   Run locally through all development phases. Add Heroku (Standard-1X web dyno + worker dyno) when deployment is needed.
  Monorepo           pnpm workspaces + Turborepo        Shared types package between frontend and backend; coordinated builds
  Testing            Vitest + Playwright                Vitest for TS-native unit tests; Playwright for browser E2E
  CI/CD              GitHub Actions + Heroku            Lint + test + build on PR; deploy to Heroku on merge to main
  ------------------ ---------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**2.2 LLM Integration Strategy**

> **RISK:** Ollama runs a model process locally on a machine with
> GPU/RAM headroom. Heroku dynos are ephemeral, memory-constrained
> containers with no GPU. Running Ollama directly on Heroku is not
> feasible.

The recommended approach is an LLM Abstraction Layer in the backend ---
a single INarrativeService interface that can swap providers via
environment variable without touching any game logic:

-   Local development: route calls to Ollama on your dev machine
    (http://localhost:11434). Any Ollama-supported model works ---
    llama3, mistral, phi-3-mini, etc.

-   Production on Heroku: route calls to a hosted API. The Anthropic
    Claude API (claude-haiku-4-5 for cost efficiency) is a strong fit.
    Game context payloads are small, so token costs are low.

-   Alternative: run Ollama on a separate always-on VPS (Railway,
    Fly.io, or a small DigitalOcean droplet) as a microservice called
    from Heroku. Preserves a self-hosted model in production but adds
    infrastructure overhead.

  ---------------------------------------------- --------------- --------------------- ----------------- ----------------
  **Option**                                     **Local Dev**   **Production**        **Cost**          **Complexity**
  Abstraction layer: Ollama local / hosted API   Ollama          Claude / OpenAI API   Pay-per-token     Low
  Self-hosted Ollama microservice (VPS)          Ollama          Ollama on VPS         \~\$5-12/mo VPS   Medium
  Hosted API only (no Ollama)                    API calls       API calls             Pay-per-token     Lowest
  ---------------------------------------------- --------------- --------------------- ----------------- ----------------

> **NOTE:** Build the INarrativeService abstraction in Phase 1 so all
> later LLM work is provider-agnostic. The provider is a config-level
> swap --- no game code changes required when switching environments.

**2.3 Rendering Architecture: Two-Layer UI**

All UI elements --- HUD, resource display, minimap, info panel,
diplomacy panel, dialogue panel, alerts, active objectives --- are
standard HTML/CSS React components. PixiJS renders the game world only.
The two layers are stacked using CSS positioning: the PixiJS canvas is
position: absolute filling the viewport, and the React UI layer sits on
top with pointer-events managed per element.

  ------------ ----------------------- ------------------------------------------------------------------------------------------------------------------------------------------------
  **Layer**    **Rendered By**         **Contents**
  Game world   PixiJS (WebGL canvas)   Map tiles, terrain, units, buildings, fog of war overlay, territory boundary lines, selection rings, projectiles, visual effects
  UI overlay   React + HTML/CSS        Resource display, minimap, info panel, action buttons, diplomacy panel, dialogue panel, alert log, active objectives, portraits, zoom controls
  ------------ ----------------------- ------------------------------------------------------------------------------------------------------------------------------------------------

This separation has several practical advantages. CSS handles animations
natively --- alert flashes, panel slide-ins, portrait transitions, and
tooltip fades are all CSS keyframes with no PixiJS animation code. UI
layout is declarative HTML rather than manual coordinate calculations.
Accessibility features (keyboard navigation, screen reader labels) apply
naturally to HTML elements. And swapping the visual design of any UI
component is a CSS change, not a game engine change.

The minimap is the one exception worth flagging: it may render as a
small secondary PixiJS RenderTexture (or an HTML canvas element) rather
than a static image, since it needs to reflect live unit positions and
fog state. Either approach is valid; the implementation decision can be
deferred to Phase 5.

> **NOTE:** Enforce the layer boundary: no game simulation logic in
> React components, no HTML rendering in PixiJS. The bridge is Zustand
> --- game events update Zustand stores, React components read from
> them.
>
> **NOTE:** No inline styles. All styling goes through CSS Modules.
> Inline style attributes on React components are banned via ESLint
> (react/forbid-component-props). This prevents style drift during rapid
> development and ensures the visual design remains in one place.

**2.4 Audio Architecture**

The game will eventually have both music and sound effects. The audio
architecture decision should be made in Phase 0 because it affects how
the audio system integrates with game state.

  ---------------------- -------------------------------------------------------------------------------------------------------------- --------------------------------------------------------------------------------- ----------------
  **Option**             **How It Works**                                                                                               **Best For**                                                                      **Complexity**
  Howler.js (simple)     Play/stop named audio files on game events. Track swapping on game state change.                               Projects where music doesn't need to react granularly to game state               Low
  FMOD (adaptive)        Pass game state parameters to the audio engine. Music layers, transitions, and intensity adapt in real time.   Games with dynamic music that reflects tension, faction, win condition progress   Medium-High
  Web Audio API direct   Build custom audio graph for precise control. Maximum flexibility, most work.                                  Rarely worth it unless Howler.js is insufficient                                  High
  ---------------------- -------------------------------------------------------------------------------------------------------------- --------------------------------------------------------------------------------- ----------------

Given the game's distinct states --- exploration, active combat,
diplomacy, cultural victory buildup, approaching-win-condition tension
--- adaptive music would meaningfully improve the experience. FMOD has a
free tier and exports to Web Audio. However, it adds integration
complexity and requires audio design decisions early. The recommendation
is to start with Howler.js for placeholder audio and design the audio
system interface to be swappable, similar to the LLM abstraction layer.
If adaptive music is desired before launch, migrate to FMOD at that
point without touching game code.

> **NOTE:** Placeholder audio: Kenney's free CC0 audio packs (Impact
> Sounds, Sci-Fi Sounds, Interface Sounds) cover combat, UI, and ambient
> SFX. OpenGameArt.org has strategy-appropriate music tracks for
> placeholder use. For AI-generated music, Suno and Udio can produce
> game-appropriate tracks from text prompts.

**3. Development Phases**

The project is organized into 19 phases. Phases 0--1 establish design
and infrastructure. Phases 2--4 build the engine and map. Phases 5--14
implement all game systems. Phases 15--18 add AI, narrative, and win
conditions. Each phase includes a milestone deliverable and any open
design tasks that must be resolved before that phase can be fully
implemented.

  ---------------------- --------------------------------------------------------------------------------------
  **Indicator**          **Meaning**
  Blue phase header      Phase name and number
  Green milestone cell   Concrete deliverable that signals phase completion
  Amber TBD row          Design value or decision that must be finalized before this phase can be fully coded
  Red RISK callout       Architectural constraint requiring attention
  ---------------------- --------------------------------------------------------------------------------------

+----------------+----------------+----------------+----------------+
| **Phase 0:**   |                |                |                |
| Design         |                |                |                |
| Finalization & |                |                |                |
| Architecture   |                |                |                |
| Decisions      |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Resolve all    |                |                |                |
| open spec      |                |                |                |
| values and     |                |                |                |
| make binding   |                |                |                |
| technology     |                |                |                |
| decisions      |                |                |                |
| before any     |                |                |                |
| implementation |                |                |                |
| begins. This   |                |                |                |
| phase produces |                |                |                |
| no code ---    |                |                |                |
| only a         |                |                |                |
| finalized      |                |                |                |
| Design Values  |                |                |                |
| Document and   |                |                |                |
| an             |                |                |                |
| Architecture   |                |                |                |
| Decision       |                |                |                |
| Record (ADR).  |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Unit &       | -   Define all | Design Values  |
|                | Building       |     unit       | Document and   |
|                | Stats**        |     stats: HP, | Architecture   |
|                |                |     damage,    | Decision       |
|                |                |     range,     | Record         |
|                |                |     speed,     | completed and  |
|                |                |     charisma,  | signed off.    |
|                |                |     armor,     | All TBD values |
|                |                |     capacity   | populated. UI  |
|                |                |     for every  | mockups        |
|                |                |     robot      | approved. No   |
|                |                |     platform   | open unknowns  |
|                |                |     and wizard | blocking Phase |
|                |                |     unit       | 1.             |
|                |                |                |                |
|                |                | -   Define all |                |
|                |                |     building   |                |
|                |                |     stats: HP, |                |
|                |                |     occupant   |                |
|                |                |     capacity,  |                |
|                |                |     vision     |                |
|                |                |     range for  |                |
|                |                |     every      |                |
|                |                |     building   |                |
|                |                |     in both    |                |
|                |                |     factions   |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     material   |                |
|                |                |                |                |
|                |                | differentials: |                |
|                |                |     wood vs.   |                |
|                |                |     metal HP   |                |
|                |                |     and armor  |                |
|                |                |     values for |                |
|                |                |     each robot |                |
|                |                |     platform   |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Resource     | -   Define all |                |
|                | Costs &        |     unit       |                |
|                | Timings**      |     production |                |
|                |                |     costs      |                |
|                |                |     (wood +    |                |
|                |                |     water) and |                |
|                |                |     production |                |
|                |                |     times      |                |
|                |                |                |                |
|                |                | -   Define all |                |
|                |                |     building   |                |
|                |                |                |                |
|                |                |   construction |                |
|                |                |     costs and  |                |
|                |                |                |                |
|                |                |   construction |                |
|                |                |     durations  |                |
|                |                |                |                |
|                |                | -   Define all |                |
|                |                |     research   |                |
|                |                |     upgrade    |                |
|                |                |     costs and  |                |
|                |                |     research   |                |
|                |                |     durations  |                |
|                |                |     (including |                |
|                |                |     wood →     |                |
|                |                |     metal      |                |
|                |                |     upgrade)   |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     wood       |                |
|                |                |     deposit    |                |
|                |                |     initial    |                |
|                |                |     quantity   |                |
|                |                |     and        |                |
|                |                |                |                |
|                |                |  replenishment |                |
|                |                |     policy     |                |
|                |                |     (finite    |                |
|                |                |     vs.        |                |
|                |                |                |                |
|                |                |  regenerating) |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     water      |                |
|                |                |     a          |                |
|                |                | uto-collection |                |
|                |                |     rates for  |                |
|                |                |     Water      |                |
|                |                |     Extractor  |                |
|                |                |     and        |                |
|                |                |     Watermill  |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     resource   |                |
|                |                |     alert      |                |
|                |                |     thresholds |                |
|                |                |     (low-stock |                |
|                |                |     warning    |                |
|                |                |     levels for |                |
|                |                |     wood and   |                |
|                |                |     water)     |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Mana &       | -   Define     |                |
|                | Spells**       |     passive    |                |
|                |                |     mana       |                |
|                |                |     generation |                |
|                |                |     rate per   |                |
|                |                |     wizard     |                |
|                |                |     unit per   |                |
|                |                |     tick       |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     Mana       |                |
|                |                |     Reservoir  |                |
|                |                |     generation |                |
|                |                |     rate and   |                |
|                |                |     proximity  |                |
|                |                |     boost      |                |
|                |                |     mul        |                |
|                |                | tiplier/radius |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     mana cost  |                |
|                |                |     for every  |                |
|                |                |     spell and  |                |
|                |                |     ability    |                |
|                |                |     (including |                |
|                |                |     Mana       |                |
|                |                |     Shield     |                |
|                |                |     per-second |                |
|                |                |     drain)     |                |
|                |                |                |                |
|                |                | -   Define Ice |                |
|                |                |     Blast slow |                |
|                |                |     duration   |                |
|                |                |     and speed  |                |
|                |                |     reduction  |                |
|                |                |     percentage |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Formulas &   | -   Define     |                |
|                | Parameters**   |     conversion |                |
|                |                |     formula:   |                |
|                |                |     precise    |                |
|                |                |                |                |
|                |                |   relationship |                |
|                |                |     between    |                |
|                |                |     charisma,  |                |
|                |                |     target     |                |
|                |                |     HP%, and   |                |
|                |                |     target     |                |
|                |                |     level      |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     conversion |                |
|                |                |     duration:  |                |
|                |                |     ticks of   |                |
|                |                |     sustained  |                |
|                |                |     adjacency  |                |
|                |                |     required   |                |
|                |                |     for        |                |
|                |                |     attempt    |                |
|                |                |                |                |
|                |                | -   Decide     |                |
|                |                |     armor      |                |
|                |                |     model:     |                |
|                |                |     flat       |                |
|                |                |     reduction  |                |
|                |                |     vs.        |                |
|                |                |     percentage |                |
|                |                |     (spec      |                |
|                |                |     leaves     |                |
|                |                |     this open) |                |
|                |                |                |                |
|                |                | -   Define XP  |                |
|                |                |     gain rates |                |
|                |                |     per action |                |
|                |                |     for all    |                |
|                |                |     unit types |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     Third      |                |
|                |                |     Space XP   |                |
|                |                |     boost      |                |
|                |                |     multiplier |                |
|                |                |     and        |                |
|                |                |     coverage   |                |
|                |                |     radius for |                |
|                |                |     unattached |                |
|                |                |     Cores      |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |                |                |
|                |                |   Amphitheatre |                |
|                |                |     XP boost   |                |
|                |                |     per        |                |
|                |                |     building   |                |
|                |                |     and        |                |
|                |                |     stacking   |                |
|                |                |     formula    |                |
|                |                |     for        |                |
|                |                |     Subjects   |                |
|                |                |                |                |
|                |                | -   Define AI  |                |
|                |                |     reaction   |                |
|                |                |     interval,  |                |
|                |                |     aggression |                |
|                |                |                |                |
|                |                |    thresholds, |                |
|                |                |     and NPC    |                |
|                |                |     starting   |                |
|                |                |     alignment  |                |
|                |                |     values     |                |
+----------------+----------------+----------------+----------------+
| **5**          | **Victory &    | -   Define     |                |
|                | Alerts**       |     cultural   |                |
|                |                |     victory    |                |
|                |                |     threshold: |                |
|                |                |     max        |                |
|                |                |     civilian   |                |
|                |                |     population |                |
|                |                |     count +    |                |
|                |                |     max XP for |                |
|                |                |     all        |                |
|                |                |     civilians  |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |                |                |
|                |                |  technological |                |
|                |                |     victory    |                |
|                |                |     item list: |                |
|                |                |     exact      |                |
|                |                |                |                |
|                |                |    enumeration |                |
|                |                |     of all     |                |
|                |                |     units and  |                |
|                |                |     buildings  |                |
|                |                |     required   |                |
|                |                |     from both  |                |
|                |                |     species    |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     victory    |                |
|                |                |     alert      |                |
|                |                |     proximity  |                |
|                |                |     threshold: |                |
|                |                |     % of win   |                |
|                |                |     condition  |                |
|                |                |     completion |                |
|                |                |     that       |                |
|                |                |     triggers   |                |
|                |                |     the        |                |
|                |                |     warning    |                |
+----------------+----------------+----------------+----------------+
| **6**          | **LLM Design** | -   Define LLM |                |
|                |                |     context    |                |
|                |                |     schema:    |                |
|                |                |     full field |                |
|                |                |     list for   |                |
|                |                |     Gam        |                |
|                |                | eStateSnapshot |                |
|                |                |     serialized |                |
|                |                |     with each  |                |
|                |                |     prompt     |                |
|                |                |                |                |
|                |                | -   Write      |                |
|                |                |     prompt     |                |
|                |                |     templates  |                |
|                |                |     for        |                |
|                |                |     dialogue   |                |
|                |                |                |                |
|                |                |    generation, |                |
|                |                |     quest      |                |
|                |                |                |                |
|                |                |    generation, |                |
|                |                |     and named  |                |
|                |                |     character  |                |
|                |                |                |                |
|                |                |    designation |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     narrative  |                |
|                |                |                |                |
|                |                |    perspective |                |
|                |                |     rules: how |                |
|                |                |     wizard vs. |                |
|                |                |     robot POV  |                |
|                |                |     shapes LLM |                |
|                |                |     output     |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     context    |                |
|                |                |     window     |                |
|                |                |     strategy:  |                |
|                |                |     max        |                |
|                |                |     history    |                |
|                |                |     turns      |                |
|                |                |     before     |                |
|                |                |     truncation |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     quest      |                |
|                |                |     reward     |                |
|                |                |     mapping:   |                |
|                |                |     quest type |                |
|                |                |     →          |                |
|                |                |     mechanical |                |
|                |                |     outcome    |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     cultural   |                |
|                |                |     victory    |                |
|                |                |     progress   |                |
|                |                |     increment  |                |
|                |                |     per quest  |                |
|                |                |     completion |                |
|                |                |                |                |
|                |                | -   Make final |                |
|                |                |     LLM        |                |
|                |                |     provider   |                |
|                |                |     decision   |                |
|                |                |     for        |                |
|                |                |     production |                |
|                |                |                |                |
|                |                |    environment |                |
+----------------+----------------+----------------+----------------+
| **7**          | **             | -   Confirm    |                |
|                | Architecture** |     rendering  |                |
|                |                |     library    |                |
|                |                |     (PixiJS    |                |
|                |                |                |                |
|                |                |    recommended |                |
|                |                |     ---        |                |
|                |                |     evaluate   |                |
|                |                |     and sign   |                |
|                |                |     off)       |                |
|                |                |                |                |
|                |                | -   Confirm UI |                |
|                |                |     rendering  |                |
|                |                |     approach:  |                |
|                |                |     HTML/CSS   |                |
|                |                |     React      |                |
|                |                |     overlay    |                |
|                |                |     for all    |                |
|                |                |     UI, PixiJS |                |
|                |                |     canvas for |                |
|                |                |     game world |                |
|                |                |     only (see  |                |
|                |                |     Section    |                |
|                |                |     2.3)       |                |
|                |                |                |                |
|                |                | -   Decide     |                |
|                |                |     minimap    |                |
|                |                |     rendering: |                |
|                |                |     secondary  |                |
|                |                |     PixiJS     |                |
|                |                |                |                |
|                |                |  RenderTexture |                |
|                |                |     vs. HTML   |                |
|                |                |     canvas     |                |
|                |                |     element    |                |
|                |                |                |                |
|                |                | -   Decide     |                |
|                |                |     state      |                |
|                |                |     management |                |
|                |                |     approach   |                |
|                |                |     (Zustand   |                |
|                |                |                |                |
|                |                |    recommended |                |
|                |                |     --- two    |                |
|                |                |     stores: UI |                |
|                |                |     state +    |                |
|                |                |     game state |                |
|                |                |     mirror)    |                |
|                |                |                |                |
|                |                | -   Decide     |                |
|                |                |     game loop  |                |
|                |                |     authority  |                |
|                |                |     model:     |                |
|                |                |     server     |                |
|                |                | -authoritative |                |
|                |                |     vs. client |                |
|                |                |                |                |
|                |                |   simulation + |                |
|                |                |     server     |                |
|                |                |     sync       |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     WebSocket  |                |
|                |                |     message    |                |
|                |                |     protocol   |                |
|                |                |     for        |                |
|                |                |     real-time  |                |
|                |                |     state      |                |
|                |                |     updates    |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     import     |                |
|                |                |     boundary   |                |
|                |                |     rules      |                |
|                |                |                |                |
|                |                |  (eslint-plugi |                |
|                |                | n-boundaries): |                |
|                |                |     /game must |                |
|                |                |     not import |                |
|                |                |     from       |                |
|                |                |     /renderer, |                |
|                |                |     /ui, or    |                |
|                |                |     /store     |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     inline     |                |
|                |                |     style ban: |                |
|                |                |     configure  |                |
|                |                |     ESLint     |                |
|                |                |                |                |
|                |                | react/forbid-c |                |
|                |                | omponent-props |                |
|                |                |     to         |                |
|                |                |     disallow   |                |
|                |                |     the style  |                |
|                |                |     prop on    |                |
|                |                |     all React  |                |
|                |                |                |                |
|                |                |    components; |                |
|                |                |     document   |                |
|                |                |     this rule  |                |
|                |                |     in the ADR |                |
|                |                |     so it is   |                |
|                |                |     understood |                |
|                |                |     as         |                |
|                |                |                |                |
|                |                |    intentional |                |
|                |                |                |                |
|                |                | -   Set up     |                |
|                |                |     Heroku     |                |
|                |                |     project,   |                |
|                |                |                |                |
|                |                |   environments |                |
|                |                |     (dev/      |                |
|                |                | staging/prod), |                |
|                |                |     and GitHub |                |
|                |                |     Actions    |                |
|                |                |     pipeline   |                |
|                |                |     skeleton   |                |
+----------------+----------------+----------------+----------------+
| **8**          | **UI Design**  | -   Define     |                |
|                |                |     visual     |                |
|                |                |     design     |                |
|                |                |     language:  |                |
|                |                |     overall    |                |
|                |                |     look and   |                |
|                |                |     feel, tone |                |
|                |                |     (e.g. dark |                |
|                |                |     strategic  |                |
|                |                |     UI vs.     |                |
|                |                |                |                |
|                |                |    illustrated |                |
|                |                |     fantasy    |                |
|                |                |     vs. clean  |                |
|                |                |     minimal)   |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     color      |                |
|                |                |     palette:   |                |
|                |                |     primary,   |                |
|                |                |     secondary, |                |
|                |                |     accent     |                |
|                |                |     colors for |                |
|                |                |     each       |                |
|                |                |     faction    |                |
|                |                |     (wizard    |                |
|                |                |     and robot) |                |
|                |                |     plus       |                |
|                |                |     neutral UI |                |
|                |                |     chrome     |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |                |                |
|                |                |    typography: |                |
|                |                |     heading    |                |
|                |                |     font, body |                |
|                |                |     font,      |                |
|                |                |     monospace  |                |
|                |                |     font for   |                |
|                |                |     stats and  |                |
|                |                |     numbers    |                |
|                |                |                |                |
|                |                | -   Define UI  |                |
|                |                |     chrome     |                |
|                |                |     style:     |                |
|                |                |     panel      |                |
|                |                |     borders,   |                |
|                |                |                |                |
|                |                |   backgrounds, |                |
|                |                |     button     |                |
|                |                |     styles,    |                |
|                |                |     icon       |                |
|                |                |     treatment  |                |
|                |                |                |                |
|                |                | -   Produce    |                |
|                |                |     wireframes |                |
|                |                |     or mockups |                |
|                |                |     for each   |                |
|                |                |     major UI   |                |
|                |                |     surface:   |                |
|                |                |     main HUD,  |                |
|                |                |     info       |                |
|                |                |     panel,     |                |
|                |                |     diplomacy  |                |
|                |                |     panel,     |                |
|                |                |     dialogue   |                |
|                |                |     panel,     |                |
|                |                |     alert log  |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     portrait   |                |
|                |                |     style and  |                |
|                |                |     dimensions |                |
|                |                |     for units  |                |
|                |                |     and named  |                |
|                |                |     characters |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     minimap    |                |
|                |                |     visual     |                |
|                |                |     treatment: |                |
|                |                |     border,    |                |
|                |                |     scale      |                |
|                |                |     indicator, |                |
|                |                |     faction    |                |
|                |                |     color      |                |
|                |                |     coding     |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     territory  |                |
|                |                |     boundary   |                |
|                |                |     line       |                |
|                |                |     visual     |                |
|                |                |     style:     |                |
|                |                |     color      |                |
|                |                |     coding per |                |
|                |                |     faction,   |                |
|                |                |     line       |                |
|                |                |     weight,    |                |
|                |                |     opacity    |                |
|                |                |                |                |
|                |                | -   Confirm    |                |
|                |                |     the        |                |
|                |                |     Star       |                |
|                |                | Craft-inspired |                |
|                |                |     UI         |                |
|                |                |     direction  |                |
|                |                |     from the   |                |
|                |                |     functional |                |
|                |                |     spec and   |                |
|                |                |     document   |                |
|                |                |     specific   |                |
|                |                |     elements   |                |
|                |                |     being      |                |
|                |                |     adopted    |                |
|                |                |     vs.        |                |
|                |                |     departed   |                |
|                |                |     from       |                |
+----------------+----------------+----------------+----------------+
| **9**          | **Audio        | -   Decide     |                |
|                | Architecture** |     audio      |                |
|                |                |     system     |                |
|                |                |     approach:  |                |
|                |                |     Howler.js  |                |
|                |                |     simple     |                |
|                |                |     track      |                |
|                |                |     swapping   |                |
|                |                |     vs. FMOD   |                |
|                |                |     adaptive   |                |
|                |                |     music      |                |
|                |                |     engine     |                |
|                |                |     (see       |                |
|                |                |     Section    |                |
|                |                |     2.4)       |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     audio      |                |
|                |                |     event      |                |
|                |                |     categories |                |
|                |                |     and their  |                |
|                |                |     trigger    |                |
|                |                |     conditions |                |
|                |                |     (combat,   |                |
|                |                |                |                |
|                |                |    conversion, |                |
|                |                |     resources, |                |
|                |                |     narrative, |                |
|                |                |     diplomacy, |                |
|                |                |     victory)   |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     distinct   |                |
|                |                |     audio cue  |                |
|                |                |                |                |
|                |                |  requirements: |                |
|                |                |     which      |                |
|                |                |     events     |                |
|                |                |     need       |                |
|                |                |     unique     |                |
|                |                |     audio      |                |
|                |                |     signatures |                |
|                |                |     vs. shared |                |
|                |                |     cues       |                |
|                |                |                |                |
|                |                | -   Identify   |                |
|                |                |                |                |
|                |                |    placeholder |                |
|                |                |     audio      |                |
|                |                |     sources:   |                |
|                |                |     Kenney     |                |
|                |                |     audio      |                |
|                |                |     packs for  |                |
|                |                |     SFX,       |                |
|                |                |                |                |
|                |                |    OpenGameArt |                |
|                |                |     / Suno /   |                |
|                |                |     Udio for   |                |
|                |                |     music      |                |
|                |                |                |                |
|                |                |   placeholders |                |
|                |                |                |                |
|                |                | -   Decide     |                |
|                |                |     music zone |                |
|                |                |     model:     |                |
|                |                |     will music |                |
|                |                |     change     |                |
|                |                |     based on   |                |
|                |                |     current    |                |
|                |                |     game state |                |
|                |                |                |                |
|                |                |  (exploration, |                |
|                |                |     combat,    |                |
|                |                |     diplomacy) |                |
|                |                |     or run as  |                |
|                |                |     continuous |                |
|                |                |     ambient    |                |
|                |                |     tracks     |                |
|                |                |                |                |
|                |                | -   Document   |                |
|                |                |     audio      |                |
|                |                |     interface  |                |
|                |                |     contract:  |                |
|                |                |                |                |
|                |                |  IAudioService |                |
|                |                |     with       |                |
|                |                |                |                |
|                |                |   play(event), |                |
|                |                |     stop(),    |                |
|                |                |     setMus     |                |
|                |                | icState(state) |                |
|                |                |     so the     |                |
|                |                |                |                |
|                |                | implementation |                |
|                |                |     is         |                |
|                |                |     swappable  |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   All unit   | Resolve before |
|                | Tasks**        |     stat       | coding         |
|                |                |     values     |                |
|                |                |     (HP,       |                |
|                |                |     damage,    |                |
|                |                |     range,     |                |
|                |                |     speed,     |                |
|                |                |     charisma,  |                |
|                |                |     armor,     |                |
|                |                |     capacity)  |                |
|                |                |                |                |
|                |                | -   All        |                |
|                |                |     building   |                |
|                |                |     stat       |                |
|                |                |     values     |                |
|                |                |     (HP,       |                |
|                |                |     capacity,  |                |
|                |                |     vision     |                |
|                |                |     range)     |                |
|                |                |                |                |
|                |                | -   All        |                |
|                |                |     resource   |                |
|                |                |     costs,     |                |
|                |                |     production |                |
|                |                |     times, and |                |
|                |                |                |                |
|                |                |   construction |                |
|                |                |     durations  |                |
|                |                |                |                |
|                |                | -   Mana       |                |
|                |                |     generation |                |
|                |                |     rates and  |                |
|                |                |     all spell  |                |
|                |                |     costs      |                |
|                |                |                |                |
|                |                | -   Victory    |                |
|                |                |     condition  |                |
|                |                |     thresholds |                |
|                |                |     and tech   |                |
|                |                |     tree item  |                |
|                |                |     list       |                |
|                |                |                |                |
|                |                | -   Alert      |                |
|                |                |     trigger    |                |
|                |                |     threshold  |                |
|                |                |     percentage |                |
|                |                |                |                |
|                |                | -   Conversion |                |
|                |                |     formula,   |                |
|                |                |     duration,  |                |
|                |                |     and armor  |                |
|                |                |     model      |                |
|                |                |     decision   |                |
|                |                |                |                |
|                |                | -   LLM        |                |
|                |                |     context    |                |
|                |                |     schema and |                |
|                |                |     all prompt |                |
|                |                |     templates  |                |
|                |                |                |                |
|                |                | -   LLM        |                |
|                |                |     provider   |                |
|                |                |     decision   |                |
|                |                |     for        |                |
|                |                |     production |                |
|                |                |                |                |
|                |                | -   UI visual  |                |
|                |                |     design:    |                |
|                |                |     look and   |                |
|                |                |     feel,      |                |
|                |                |     color      |                |
|                |                |     palette,   |                |
|                |                |                |                |
|                |                |    typography, |                |
|                |                |     component  |                |
|                |                |     mockups    |                |
|                |                |     for all    |                |
|                |                |     major      |                |
|                |                |     surfaces   |                |
|                |                |                |                |
|                |                | -   Audio      |                |
|                |                |                |                |
|                |                |   architecture |                |
|                |                |     decision:  |                |
|                |                |     Howler.js  |                |
|                |                |     vs. FMOD   |                |
|                |                |     adaptive   |                |
|                |                |                |                |
|                |                | -   Music zone |                |
|                |                |     model:     |                |
|                |                |                |                |
|                |                | state-reactive |                |
|                |                |     music vs.  |                |
|                |                |     ambient    |                |
|                |                |     tracks     |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Functional     |                |                |                |
| Specification  |                |                |                |
| Rev. 1         |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+--------------+----------------+----------------+
| **Phase 1:**   |              |                |                |
| Project        |              |                |                |
| Foundation &   |              |                |                |
| Infrastructure |              |                |                |
+----------------+--------------+----------------+----------------+
| **Objective:** |              |                |                |
| Stand up the   |              |                |                |
| monorepo,      |              |                |                |
| frontend,      |              |                |                |
| backend, and   |              |                |                |
| the LLM        |              |                |                |
| abstraction    |              |                |                |
| layer.         |              |                |                |
| Everything     |              |                |                |
| runs locally.  |              |                |                |
| Heroku         |              |                |                |
| deployment is  |              |                |                |
| deferred until |              |                |                |
| there is a     |              |                |                |
| reason to      |              |                |                |
| deploy.        |              |                |                |
+----------------+--------------+----------------+----------------+
| **\#**         | **Category** | **Tasks**      | **Milestone**  |
+----------------+--------------+----------------+----------------+
| **1**          | **Monorepo** | -   Initialize | Monorepo       |
|                |              |     pnpm       | running        |
|                |              |     workspace  | locally with   |
|                |              |     with       | passing lint   |
|                |              |     packages:  | and tests.     |
|                |              |     /frontend, | Empty React +  |
|                |              |     /backend,  | PixiJS shell   |
|                |              |     /shared    | launches in    |
|                |              |                | the browser.   |
|                |              | -   Set up     | Backend starts |
|                |              |     Turborepo  | and connects   |
|                |              |     for        | to local       |
|                |              |                | Postgres. LLM  |
|                |              |    coordinated | abstraction    |
|                |              |     builds and | layer          |
|                |              |     caching    | unit-tested    |
|                |              |                | with both      |
|                |              | -   Configure  | providers.     |
|                |              |     TypeScript |                |
|                |              |     strict     |                |
|                |              |     mode       |                |
|                |              |     across all |                |
|                |              |     packages   |                |
|                |              |                |                |
|                |              | -   Define     |                |
|                |              |     shared     |                |
|                |              |     types      |                |
|                |              |     package:   |                |
|                |              |     GameState, |                |
|                |              |     Unit,      |                |
|                |              |     Building,  |                |
|                |              |     Faction,   |                |
|                |              |     Event      |                |
|                |              |     interfaces |                |
|                |              |                |                |
|                |              | -   Configure  |                |
|                |              |     ESLint +   |                |
|                |              |     Prettier   |                |
|                |              |     across all |                |
|                |              |     packages   |                |
+----------------+--------------+----------------+----------------+
| **2**          | **Frontend** | -   Initialize |                |
|                |              |     React +    |                |
|                |              |     Vite app   |                |
|                |              |     in         |                |
|                |              |     /frontend  |                |
|                |              |     with       |                |
|                |              |     TypeScript |                |
|                |              |                |                |
|                |              | -   Install    |                |
|                |              |     and wire   |                |
|                |              |     PixiJS to  |                |
|                |              |     React      |                |
|                |              |     (mount     |                |
|                |              |     canvas,    |                |
|                |              |     basic      |                |
|                |              |     render     |                |
|                |              |     loop)      |                |
|                |              |                |                |
|                |              | -   Scaffold   |                |
|                |              |     top-level  |                |
|                |              |     component  |                |
|                |              |     structure: |                |
|                |              |                |                |
|                |              |    GameCanvas, |                |
|                |              |     HUD,       |                |
|                |              |     Panels     |                |
|                |              |                |                |
|                |              | -   Configure  |                |
|                |              |     Zustand    |                |
|                |              |     store      |                |
|                |              |     skeleton   |                |
|                |              |     with       |                |
|                |              |     GameState  |                |
|                |              |     slice      |                |
|                |              |                |                |
|                |              | -   Set up     |                |
|                |              |     Vitest for |                |
|                |              |     unit tests |                |
+----------------+--------------+----------------+----------------+
| **3**          | **Backend**  | -   Initialize |                |
|                |              |     Fastify +  |                |
|                |              |     TypeScript |                |
|                |              |     server in  |                |
|                |              |     /backend   |                |
|                |              |                |                |
|                |              | -   Set up     |                |
|                |              |     WebSocket  |                |
|                |              |     handler    |                |
|                |              |     (ws        |                |
|                |              |     library or |                |
|                |              |     socket.io) |                |
|                |              |                |                |
|                |              | -   Configure  |                |
|                |              |     local      |                |
|                |              |     PostgreSQL |                |
|                |              |     connection |                |
|                |              |     via        |                |
|                |              |     Drizzle    |                |
|                |              |     ORM        |                |
|                |              |                |                |
|                |              | (DATABASE\_URL |                |
|                |              |     points to  |                |
|                |              |     local      |                |
|                |              |     Postgres)  |                |
|                |              |                |                |
|                |              | -   Implement  |                |
|                |              |     INa        |                |
|                |              | rrativeService |                |
|                |              |     interface  |                |
|                |              |     with       |                |
|                |              |                |                |
|                |              | OllamaProvider |                |
|                |              |     and        |                |
|                |              |     Cla        |                |
|                |              | udeAPIProvider |                |
|                |              |                |                |
|                |              | -   Provider   |                |
|                |              |     selection  |                |
|                |              |     via        |                |
|                |              |                |                |
|                |              |  LLM\_PROVIDER |                |
|                |              |                |                |
|                |              |    environment |                |
|                |              |     variable   |                |
|                |              |                |                |
|                |              | -   Add health |                |
|                |              |     check      |                |
|                |              |     endpoint   |                |
|                |              |     and        |                |
|                |              |     structured |                |
|                |              |     logging    |                |
+----------------+--------------+----------------+----------------+
| **4**          | **CI/CD**    | -   Configure  |                |
|                |              |     GitHub     |                |
|                |              |     Actions:   |                |
|                |              |     lint →     |                |
|                |              |     test →     |                |
|                |              |     build on   |                |
|                |              |     push to    |                |
|                |              |     main       |                |
|                |              |                |                |
|                |              | -   Store      |                |
|                |              |                |                |
|                |              |  LLM\_PROVIDER |                |
|                |              |     and any    |                |
|                |              |     API keys   |                |
|                |              |     in local   |                |
|                |              |     .env file  |                |
|                |              |                |                |
|                |              |   (gitignored) |                |
|                |              |                |                |
|                |              | -   Heroku     |                |
|                |              |     deploy     |                |
|                |              |     pipeline   |                |
|                |              |     deferred   |                |
|                |              |     --- add    |                |
|                |              |     when       |                |
|                |              |     deployment |                |
|                |              |     is needed  |                |
+----------------+--------------+----------------+----------------+
| **D            |              |                |                |
| ependencies:** |              |                |                |
| Phase 0        |              |                |                |
| complete       |              |                |                |
+----------------+--------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 2:**   |                |                |                |
| Game Loop &    |                |                |                |
| Core Engine    |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement the  |                |                |                |
| fundamental    |                |                |                |
| fixed-timestep |                |                |                |
| game loop,     |                |                |                |
| entity         |                |                |                |
| management,    |                |                |                |
| event bus, and |                |                |                |
| spatial        |                |                |                |
| indexing       |                |                |                |
| system that    |                |                |                |
| all other game |                |                |                |
| systems will   |                |                |                |
| build on.      |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Game Loop**  | -   Implement  | Game loop      |
|                |                |                | running at     |
|                |                | fixed-timestep | stable tick    |
|                |                |     game loop  | rate. Entities |
|                |                |     at 60      | created,       |
|                |                |     ticks/sec  | queried,       |
|                |                |     (logic     | destroyed. A\* |
|                |                |     decoupled  | pathfinding    |
|                |                |     from       | tested on a    |
|                |                |     render     | sample grid.   |
|                |                |     frame      |                |
|                |                |     rate)      |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     match      |                |
|                |                |     clock and  |                |
|                |                |     elapsed    |                |
|                |                |     time       |                |
|                |                |     tracking   |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |                |                |
|                |                |   pause/resume |                |
|                |                |     for        |                |
|                |                |     dialogue   |                |
|                |                |     panel and  |                |
|                |                |     menu       |                |
|                |                |     states     |                |
|                |                |                |                |
|                |                | -   Define     |                |
|                |                |     tick       |                |
|                |                |     processing |                |
|                |                |     order:     |                |
|                |                |     input → AI |                |
|                |                |     → movement |                |
|                |                |     → combat → |                |
|                |                |     resources  |                |
|                |                |     →          |                |
|                |                |     narrative  |                |
|                |                |     events →   |                |
|                |                |     render     |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Entity       | -   Implement  |                |
|                | System**       |     Entity     |                |
|                |                |     base class |                |
|                |                |     with       |                |
|                |                |     unique ID  |                |
|                |                |     generation |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     UnitEntity |                |
|                |                |     and        |                |
|                |                |                |                |
|                |                | BuildingEntity |                |
|                |                |     subtypes   |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |                |                |
|                |                | EntityManager: |                |
|                |                |     add,       |                |
|                |                |     remove,    |                |
|                |                |     query by   |                |
|                |                |     f          |                |
|                |                | action/type/ID |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     StatBlock  |                |
|                |                |     component  |                |
|                |                |     (HP,       |                |
|                |                |     damage,    |                |
|                |                |     range,     |                |
|                |                |     speed,     |                |
|                |                |     charisma,  |                |
|                |                |     armor,     |                |
|                |                |     capacity,  |                |
|                |                |     XP, level) |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     typed      |                |
|                |                |     event bus: |                |
|                |                |                |                |
|                |                |  UnitAttacked, |                |
|                |                |     Buil       |                |
|                |                | dingDestroyed, |                |
|                |                |     Reso       |                |
|                |                | urceCollected, |                |
|                |                |     LevelUp,   |                |
|                |                |     etc.       |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Spatial      | -   Implement  |                |
|                | System**       |     2D grid    |                |
|                |                |     coordinate |                |
|                |                |     system     |                |
|                |                |     with       |                |
|                |                |                |                |
|                |                |   configurable |                |
|                |                |     map        |                |
|                |                |     dimensions |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     spatial    |                |
|                |                |     index      |                |
|                |                |     (quadtree  |                |
|                |                |     or grid    |                |
|                |                |     bucket)    |                |
|                |                |     for        |                |
|                |                |     O(log n)   |                |
|                |                |     proximity  |                |
|                |                |     queries    |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     A\*        |                |
|                |                |                |                |
|                |                |    pathfinding |                |
|                |                |     on terrain |                |
|                |                |     grid with  |                |
|                |                |     movement   |                |
|                |                |     cost       |                |
|                |                |     modifiers  |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     terrain    |                |
|                |                |     blocking   |                |
|                |                |     for path   |                |
|                |                |                |                |
|                |                |    calculation |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 1        |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 3:**   |                |                |                |
| Map & World    |                |                |                |
| Generation     |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement      |                |                |                |
| procedural map |                |                |                |
| generation     |                |                |                |
| producing      |                |                |                |
| unique         |                |                |                |
| playable maps  |                |                |                |
| with terrain,  |                |                |                |
| resource       |                |                |                |
| deposits, and  |                |                |                |
| faction        |                |                |                |
| starting       |                |                |                |
| positions.     |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Terrain**    | -   Implement  | Full           |
|                |                |                | procedural map |
|                |                |    noise-based | generates at   |
|                |                |     terrain    | match start    |
|                |                |     generator  | with terrain,  |
|                |                |     (Simplex   | deposits, and  |
|                |                |     or Perlin  | faction        |
|                |                |     noise)     | starting       |
|                |                |                | positions. All |
|                |                | -   Define     | 4 zoom levels  |
|                |                |     terrain    | and pan/scroll |
|                |                |     types:     | functional.    |
|                |                |     open       |                |
|                |                |     ground,    |                |
|                |                |     forest     |                |
|                |                |     (wood      |                |
|                |                |     source),   |                |
|                |                |     water      |                |
|                |                |     body,      |                |
|                |                |     impassable |                |
|                |                |                |                |
|                |                | -   Assign     |                |
|                |                |     movement   |                |
|                |                |     cost       |                |
|                |                |     modifiers  |                |
|                |                |     per        |                |
|                |                |     terrain    |                |
|                |                |     type       |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     PixiJS     |                |
|                |                |     tile       |                |
|                |                |     rendering  |                |
|                |                |     for        |                |
|                |                |     terrain    |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Resources &  | -   Implement  |                |
|                | Positions**    |     wood       |                |
|                |                |     deposit    |                |
|                |                |     placement  |                |
|                |                |     in         |                |
|                |                |     forested   |                |
|                |                |     regions    |                |
|                |                |     with       |                |
|                |                |                |                |
|                |                |   configurable |                |
|                |                |     initial    |                |
|                |                |     quantity   |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     water body |                |
|                |                |     placement  |                |
|                |                |     with       |                |
|                |                |     walkable   |                |
|                |                |     shore      |                |
|                |                |     access     |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     faction    |                |
|                |                |     starting   |                |
|                |                |     position   |                |
|                |                |     algorithm  |                |
|                |                |     (minimum   |                |
|                |                |     spacing    |                |
|                |                |     enforced   |                |
|                |                |     between    |                |
|                |                |     factions)  |                |
|                |                |                |                |
|                |                | -   Seed       |                |
|                |                |     resource   |                |
|                |                |     deposits   |                |
|                |                |     near       |                |
|                |                |     starting   |                |
|                |                |     areas      |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     map size   |                |
|                |                |     c          |                |
|                |                | onfigurations: |                |
|                |                |     small,     |                |
|                |                |     medium,    |                |
|                |                |     large      |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Navigation** | -   Implement  |                |
|                |                |     4 preset   |                |
|                |                |     zoom       |                |
|                |                |     levels in  |                |
|                |                |     PixiJS     |                |
|                |                |     camera     |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     smooth     |                |
|                |                |     zoom       |                |
|                |                |                |                |
|                |                |    transitions |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |                |                |
|                |                |    edge-scroll |                |
|                |                |     and        |                |
|                |                |     click-drag |                |
|                |                |     map pan    |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     minimap    |                |
|                |                |     with       |                |
|                |                |     scaled     |                |
|                |                |                |                |
|                |                | representation |                |
|                |                |     of full    |                |
|                |                |     map        |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   Map size   | Resolve before |
|                | Tasks**        |                | coding         |
|                |                |   definitions: |                |
|                |                |     exact tile |                |
|                |                |     dimensions |                |
|                |                |     for small  |                |
|                |                |     / medium / |                |
|                |                |     large      |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 2        |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 4:**   |                |                |                |
| Fog of War     |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement      |                |                |                |
| three-state    |                |                |                |
| tile           |                |                |                |
| visibility     |                |                |                |
| (unexplored /  |                |                |                |
| explored /     |                |                |                |
| currently      |                |                |                |
| visible) and   |                |                |                |
| connect it to  |                |                |                |
| unit and       |                |                |                |
| building       |                |                |                |
| vision ranges, |                |                |                |
| including spy  |                |                |                |
| concealment    |                |                |                |
| and detection. |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Visibility** | -   Implement  | Fog of war     |
|                |                |     per-tile   | fully          |
|                |                |     visibility | functional:    |
|                |                |     enum:      | three          |
|                |                |                | visibility     |
|                |                |    UNEXPLORED, | states render  |
|                |                |     EXPLORED,  | correctly and  |
|                |                |     VISIBLE    | update in real |
|                |                |                | time. Spy      |
|                |                | -   Maintain   | concealment    |
|                |                |     vision map | and detector   |
|                |                |     as 2D      | mechanics      |
|                |                |     typed      | working.       |
|                |                |     array,     |                |
|                |                |     updated    |                |
|                |                |     each tick  |                |
|                |                |                |                |
|                |                | -   Compute    |                |
|                |                |     vision     |                |
|                |                |                |                |
|                |                |  contributions |                |
|                |                |     from all   |                |
|                |                |     friendly   |                |
|                |                |     units and  |                |
|                |                |     buildings  |                |
|                |                |     (circular  |                |
|                |                |     range)     |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     last-seen  |                |
|                |                |     snapshot   |                |
|                |                |     for        |                |
|                |                |     EXPLORED   |                |
|                |                |     tiles      |                |
|                |                |     (static    |                |
|                |                |                |                |
|                |                | representation |                |
|                |                |     of last    |                |
|                |                |     known      |                |
|                |                |     state)     |                |
|                |                |                |                |
|                |                | -   Preserve   |                |
|                |                |     last-seen  |                |
|                |                |     building   |                |
|                |                |     state in   |                |
|                |                |     EXPLORED   |                |
|                |                |     areas      |                |
|                |                |     until      |                |
|                |                |     vision     |                |
|                |                |     returns    |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Rendering**  | -   Render     |                |
|                |                |     UNEXPLORED |                |
|                |                |     tiles      |                |
|                |                |     fully      |                |
|                |                |     black      |                |
|                |                |                |                |
|                |                | -   Render     |                |
|                |                |     EXPLORED   |                |
|                |                |     tiles      |                |
|                |                |     darken     |                |
|                |                | ed/desaturated |                |
|                |                |     at         |                |
|                |                |     last-known |                |
|                |                |     state      |                |
|                |                |                |                |
|                |                | -   Render     |                |
|                |                |     VISIBLE    |                |
|                |                |     tiles at   |                |
|                |                |     full       |                |
|                |                |     clarity    |                |
|                |                |     with live  |                |
|                |                |     positions  |                |
|                |                |                |                |
|                |                | -   Apply fog  |                |
|                |                |     to minimap |                |
|                |                |                |                |
|                |                | -   Use PixiJS |                |
|                |                |                |                |
|                |                |  RenderTexture |                |
|                |                |     for baked  |                |
|                |                |     fog mask   |                |
|                |                |     (update on |                |
|                |                |     change,    |                |
|                |                |     not every  |                |
|                |                |     frame)     |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Spy &        | -   Implement  |                |
|                | Detection**    |     CONCEALED  |                |
|                |                |     flag on    |                |
|                |                |                |                |
|                |                |   Infiltration |                |
|                |                |     Platform   |                |
|                |                |     and        |                |
|                |                |                |                |
|                |                |    Illusionist |                |
|                |                |     units      |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     DETECTOR   |                |
|                |                |     flag on    |                |
|                |                |     Probe      |                |
|                |                |     Platform   |                |
|                |                |     and        |                |
|                |                |                |                |
|                |                |    Enchantress |                |
|                |                |                |                |
|                |                | -   Concealed  |                |
|                |                |     units      |                |
|                |                |     invisible  |                |
|                |                |     to         |                |
|                |                |     standard   |                |
|                |                |     enemy      |                |
|                |                |     vision;    |                |
|                |                |     revealed   |                |
|                |                |     only by    |                |
|                |                |     detector   |                |
|                |                |     units in   |                |
|                |                |     range      |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |   Infiltration |                |
|                |                |     Platform   |                |
|                |                |     disguise:  |                |
|                |                |     renders as |                |
|                |                |     target     |                |
|                |                |     faction    |                |
|                |                |     unit type  |                |
|                |                |     to         |                |
|                |                |     opponents  |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 3        |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 5:**   |                |                |                |
| Core UI        |                |                |                |
| Framework      |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Build all HUD  |                |                |                |
| elements and   |                |                |                |
| panels as      |                |                |                |
| HTML/CSS React |                |                |                |
| components     |                |                |                |
| overlaid on    |                |                |                |
| the PixiJS     |                |                |                |
| canvas. All UI |                |                |                |
| is wired to    |                |                |                |
| Zustand with   |                |                |                |
| placeholder    |                |                |                |
| data where     |                |                |                |
| underlying     |                |                |                |
| game systems   |                |                |                |
| are not yet    |                |                |                |
| implemented.   |                |                |                |
| PixiJS handles |                |                |                |
| selection      |                |                |                |
| rendering      |                |                |                |
| only.          |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Layout &     | -   Implement  | Full HTML/CSS  |
|                | Layering**     |     two-layer  | UI renders     |
|                |                |     layout:    | correctly over |
|                |                |     PixiJS     | PixiJS canvas  |
|                |                |     canvas     | with mock      |
|                |                |     pos        | data. All      |
|                |                | ition:absolute | panels         |
|                |                |     filling    | open/close     |
|                |                |     viewport,  | with CSS       |
|                |                |     React UI   | animations.    |
|                |                |     overlay on | Unit selection |
|                |                |     top with   | updates info   |
|                |                |                | panel via      |
|                |                | pointer-events | Zustand. No    |
|                |                |     managed    | PixiJS used    |
|                |                |     per        | for any HUD    |
|                |                |     element    | element.       |
|                |                |                |                |
|                |                | -   Establish  |                |
|                |                |     CSS design |                |
|                |                |     tokens:    |                |
|                |                |     faction    |                |
|                |                |     colors, UI |                |
|                |                |     chrome     |                |
|                |                |     colors,    |                |
|                |                |     typography |                |
|                |                |     scale,     |                |
|                |                |     spacing    |                |
|                |                |     units,     |                |
|                |                |     border     |                |
|                |                |     radius,    |                |
|                |                |     shadow     |                |
|                |                |     styles --- |                |
|                |                |     matching   |                |
|                |                |     approved   |                |
|                |                |     visual     |                |
|                |                |     design     |                |
|                |                |     from Phase |                |
|                |                |     0          |                |
|                |                |                |                |
|                |                | -   Scaffold   |                |
|                |                |     all major  |                |
|                |                |     UI         |                |
|                |                |     regions:   |                |
|                |                |     top bar    |                |
|                |                |                |                |
|                |                |   (resources), |                |
|                |                |     bottom bar |                |
|                |                |     (info      |                |
|                |                |     panel +    |                |
|                |                |     actions),  |                |
|                |                |     corner     |                |
|                |                |     (minimap), |                |
|                |                |     side panel |                |
|                |                |     (aler      |                |
|                |                | ts/objectives) |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     CSS        |                |
|                |                |     Modules    |                |
|                |                |     file       |                |
|                |                |     structure: |                |
|                |                |     one module |                |
|                |                |     per        |                |
|                |                |     component  |                |
|                |                |                |                |
|                |                | -   Verify     |                |
|                |                |     ESLint     |                |
|                |                |     inline     |                |
|                |                |     style ban  |                |
|                |                |     is active  |                |
|                |                |     (r         |                |
|                |                | eact/forbid-co |                |
|                |                | mponent-props) |                |
|                |                |     before any |                |
|                |                |     UI         |                |
|                |                |     component  |                |
|                |                |     is written |                |
|                |                |     --- this   |                |
|                |                |     must be    |                |
|                |                |     enforced   |                |
|                |                |     from the   |                |
|                |                |     first line |                |
|                |                |     of Phase   |                |
|                |                |     5, not     |                |
|                |                |                |                |
|                |                |    retrofitted |                |
|                |                |     later      |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Main HUD**   | -   Resource   |                |
|                |                |     display    |                |
|                |                |     React      |                |
|                |                |     component: |                |
|                |                |     wood,      |                |
|                |                |     water,     |                |
|                |                |     mana       |                |
|                |                |     (wizard    |                |
|                |                |     only);     |                |
|                |                |     reads from |                |
|                |                |     Zustand    |                |
|                |                |                |                |
|                |                | -   Active     |                |
|                |                |     objectives |                |
|                |                |     panel: 3   |                |
|                |                |     objective  |                |
|                |                |     slots, one |                |
|                |                |     per win    |                |
|                |                |     condition, |                |
|                |                |     updates    |                |
|                |                |                |                |
|                |                |    dynamically |                |
|                |                |     from       |                |
|                |                |     Zustand    |                |
|                |                |                |                |
|                |                | -   Alert log  |                |
|                |                |     panel:     |                |
|                |                |     scrollable |                |
|                |                |     feed of    |                |
|                |                |     recent     |                |
|                |                |     events,    |                |
|                |                |                |                |
|                |                |  click-to-jump |                |
|                |                |     behavior   |                |
|                |                |     (camera    |                |
|                |                |     control    |                |
|                |                |     via        |                |
|                |                |     Zustand)   |                |
|                |                |                |                |
|                |                | -   Zoom level |                |
|                |                |     controls:  |                |
|                |                |     4 preset   |                |
|                |                |     buttons    |                |
|                |                |     wired to   |                |
|                |                |     PixiJS     |                |
|                |                |     camera     |                |
|                |                |     state via  |                |
|                |                |     Zustand    |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Info &       | -              |                |
|                | Action Panel** |    Single-unit |                |
|                |                |     info       |                |
|                |                |     panel:     |                |
|                |                |     portrait   |                |
|                |                |     image,     |                |
|                |                |     stat       |                |
|                |                |     display,   |                |
|                |                |     available  |                |
|                |                |     action     |                |
|                |                |     buttons    |                |
|                |                |     --- all    |                |
|                |                |     HTML/CSS   |                |
|                |                |                |                |
|                |                | -   Multi-unit |                |
|                |                |     selection  |                |
|                |                |     summary:   |                |
|                |                |     group      |                |
|                |                |     count,     |                |
|                |                |     unit type  |                |
|                |                |     breakdown, |                |
|                |                |     aggregate  |                |
|                |                |     stat bars  |                |
|                |                |                |                |
|                |                | -   Building   |                |
|                |                |     info       |                |
|                |                |     panel:     |                |
|                |                |     stats,     |                |
|                |                |     production |                |
|                |                |     queue with |                |
|                |                |     progress   |                |
|                |                |     bar,       |                |
|                |                |     occupant   |                |
|                |                |     count      |                |
|                |                |                |                |
|                |                | -   Action     |                |
|                |                |     buttons    |                |
|                |                |     component: |                |
|                |                |     renders    |                |
|                |                |     buttons    |                |
|                |                |     from       |                |
|                |                |     unit's     |                |
|                |                |     available  |                |
|                |                |     action     |                |
|                |                |     set;       |                |
|                |                |     dispatches |                |
|                |                |     commands   |                |
|                |                |     to game    |                |
|                |                |     engine via |                |
|                |                |     command    |                |
|                |                |     queue      |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Diplomacy    | -   Diplomacy  |                |
|                | Panel**        |     panel      |                |
|                |                |     slide-in   |                |
|                |                |     overlay    |                |
|                |                |     (CSS       |                |
|                |                |     animation  |                |
|                |                |     on         |                |
|                |                |                |                |
|                |                |    open/close) |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Per-faction |                |
|                |                |     row:       |                |
|                |                |     faction    |                |
|                |                |     name,      |                |
|                |                |     alignment  |                |
|                |                |     bar,       |                |
|                |                |                |                |
|                |                |   relationship |                |
|                |                |     status     |                |
|                |                |     badge,     |                |
|                |                |     open       |                |
|                |                |     borders    |                |
|                |                |     indicator  |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Placeholder |                |
|                |                |     action     |                |
|                |                |     buttons:   |                |
|                |                |     Resource   |                |
|                |                |     Request,   |                |
|                |                |     Unit       |                |
|                |                |     Request,   |                |
|                |                |     Non-Combat |                |
|                |                |     Treaty,    |                |
|                |                |     Open       |                |
|                |                |     Borders,   |                |
|                |                |     Embassy    |                |
|                |                |     Request    |                |
+----------------+----------------+----------------+----------------+
| **5**          | **Dialogue     | -   Dialogue   |                |
|                | Panel**        |     panel      |                |
|                |                |     overlay    |                |
|                |                |     with CSS   |                |
|                |                |     fade-in    |                |
|                |                |     animation  |                |
|                |                |                |                |
|                |                | -   Speaker    |                |
|                |                |     portrait + |                |
|                |                |     generated  |                |
|                |                |     text       |                |
|                |                |     display    |                |
|                |                |     with       |                |
|                |                |     typ        |                |
|                |                | ewriter-effect |                |
|                |                |     CSS        |                |
|                |                |     animation  |                |
|                |                |                |                |
|                |                | -   Quest      |                |
|                |                |     prompt     |                |
|                |                |     with       |                |
|                |                |     accept /   |                |
|                |                |     ignore     |                |
|                |                |     buttons    |                |
|                |                |                |                |
|                |                | -   Dismiss    |                |
|                |                |     button     |                |
|                |                |     always     |                |
|                |                |                |                |
|                |                |    accessible; |                |
|                |                |     panel      |                |
|                |                |     never      |                |
|                |                |     blocks     |                |
|                |                |     game       |                |
|                |                |                |                |
|                |                |    interaction |                |
|                |                |     when       |                |
|                |                |     dismissed  |                |
+----------------+----------------+----------------+----------------+
| **6**          | **Selection    | -              |                |
|                | System         |   Single-click |                |
|                | (PixiJS)**     |     unit or    |                |
|                |                |     building   |                |
|                |                |     selection  |                |
|                |                |     --- PixiJS |                |
|                |                |     hit        |                |
|                |                |     detection, |                |
|                |                |     result     |                |
|                |                |     written to |                |
|                |                |     Zustand    |                |
|                |                |                |                |
|                |                | -   Click-drag |                |
|                |                |                |                |
|                |                |    rubber-band |                |
|                |                |                |                |
|                |                |   multi-select |                |
|                |                |     ---        |                |
|                |                |     rendered   |                |
|                |                |     in PixiJS  |                |
|                |                |     canvas as  |                |
|                |                |     selection  |                |
|                |                |     rectangle  |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Right-click |                |
|                |                |     contextual |                |
|                |                |     command    |                |
|                |                |     (move,     |                |
|                |                |     attack,    |                |
|                |                |     gather     |                |
|                |                |     based on   |                |
|                |                |     target)    |                |
|                |                |                |                |
|                |                | -   Selection  |                |
|                |                |     highlight  |                |
|                |                |     ring       |                |
|                |                |     rendered   |                |
|                |                |     in PixiJS  |                |
|                |                |     around     |                |
|                |                |     selected   |                |
|                |                |     entities   |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   Approved   | Resolve before |
|                | Tasks**        |     UI visual  | coding         |
|                |                |     design     |                |
|                |                |     (color     |                |
|                |                |     palette,   |                |
|                |                |                |                |
|                |                |    typography, |                |
|                |                |     component  |                |
|                |                |     mockups)   |                |
|                |                |     from Phase |                |
|                |                |     0 required |                |
|                |                |     before     |                |
|                |                |     this phase |                |
|                |                |     can be     |                |
|                |                |     styled     |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 2, Phase |                |                |                |
| 3              |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 6:**   |                |                |                |
| Unit Systems   |                |                |                |
| --- Foundation |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement      |                |                |                |
| shared unit    |                |                |                |
| behavior:      |                |                |                |
| stats, XP and  |                |                |                |
| leveling,      |                |                |                |
| named          |                |                |                |
| characters,    |                |                |                |
| population     |                |                |                |
| cap, and all   |                |                |                |
| basic commands |                |                |                |
| applicable to  |                |                |                |
| all unit       |                |                |                |
| types.         |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Stats & XP** | -   Implement  | Units gain XP, |
|                |                |     XP         | level up with  |
|                |                |                | correct        |
|                |                |   accumulation | bonuses, and   |
|                |                |     and        | execute all    |
|                |                |     level-up   | basic          |
|                |                |     trigger    | commands.      |
|                |                |     (threshold | Named          |
|                |                |     doubles    | character      |
|                |                |     each       | portraits      |
|                |                |     level: 2,  | display.       |
|                |                |     4, 8       | Population cap |
|                |                |     ... 1024)  | enforced.      |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     per-role   |                |
|                |                |     5% stat    |                |
|                |                |     bonus on   |                |
|                |                |     level-up   |                |
|                |                |     (gatherer  |                |
|                |                |     →          |                |
|                |                |     capacity,  |                |
|                |                |     builder →  |                |
|                |                |     build      |                |
|                |                |     speed,     |                |
|                |                |     combat →   |                |
|                |                |     damage,    |                |
|                |                |     etc.)      |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     Surf       |                |
|                |                |     dual-XP    |                |
|                |                |     tracking:  |                |
|                |                |     gathering  |                |
|                |                |     XP and     |                |
|                |                |     building   |                |
|                |                |     XP         |                |
|                |                |                |                |
|                |                |    accumulated |                |
|                |                |                |                |
|                |                |  independently |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     Core       |                |
|                |                |     multi-stat |                |
|                |                |     XP:        |                |
|                |                |     separate   |                |
|                |                |     XP tracked |                |
|                |                |     per stat   |                |
|                |                |     based on   |                |
|                |                |     action     |                |
|                |                |     history;   |                |
|                |                |     all        |                |
|                |                |     retained   |                |
|                |                |     on         |                |
|                |                |     platform   |                |
|                |                |     switch     |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Named        | -   Implement  |                |
|                | Characters**   |     named      |                |
|                |                |     character  |                |
|                |                |     flag,      |                |
|                |                |     name, and  |                |
|                |                |     role       |                |
|                |                |     assignment |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     distinct   |                |
|                |                |     portrait   |                |
|                |                |     rendering  |                |
|                |                |     for named  |                |
|                |                |     characters |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     leader     |                |
|                |                |     unit       |                |
|                |                |                |                |
|                |                |    designation |                |
|                |                |                |                |
|                |                |  (Motherboard, |                |
|                |                |     Archmage)  |                |
|                |                |     as         |                |
|                |                |                |                |
|                |                |   always-named |                |
|                |                |                |                |
|                |                | -   Wire named |                |
|                |                |     character  |                |
|                |                |     death and  |                |
|                |                |     conversion |                |
|                |                |     to         |                |
|                |                |     narrative  |                |
|                |                |     event      |                |
|                |                |     trigger    |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Population** | -   Implement  |                |
|                |                |                |                |
|                |                |    per-faction |                |
|                |                |     population |                |
|                |                |     cap        |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     population |                |
|                |                |     support    |                |
|                |                |                |                |
|                |                | contributions: |                |
|                |                |     Cottage    |                |
|                |                |     (+5),      |                |
|                |                |     Recharge   |                |
|                |                |     Station    |                |
|                |                |     (+8)       |                |
|                |                |                |                |
|                |                | -   Enforce    |                |
|                |                |     cap on     |                |
|                |                |     unit       |                |
|                |                |     production |                |
|                |                |     (grey out  |                |
|                |                |     production |                |
|                |                |     button at  |                |
|                |                |     cap)       |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Basic        | -   Move:      |                |
|                | Commands**     |     pathfind   |                |
|                |                |     to target  |                |
|                |                |     location   |                |
|                |                |     without    |                |
|                |                |     engaging   |                |
|                |                |     enemies    |                |
|                |                |                |                |
|                |                | -   Stop:      |                |
|                |                |     cancel     |                |
|                |                |     current    |                |
|                |                |     action,    |                |
|                |                |     halt in    |                |
|                |                |     place      |                |
|                |                |                |                |
|                |                | -   Attack:    |                |
|                |                |     engage     |                |
|                |                |     target;    |                |
|                |                |     auto-aggro |                |
|                |                |     enemies    |                |
|                |                |     entering   |                |
|                |                |     range when |                |
|                |                |     on attack  |                |
|                |                |     stance     |                |
|                |                |                |                |
|                |                | -   Defend:    |                |
|                |                |     hold       |                |
|                |                |     position,  |                |
|                |                |     engage     |                |
|                |                |     within     |                |
|                |                |     radius, do |                |
|                |                |     not pursue |                |
|                |                |     beyond it  |                |
|                |                |                |                |
|                |                | -   Patrol:    |                |
|                |                |                |                |
|                |                | back-and-forth |                |
|                |                |     between    |                |
|                |                |     two        |                |
|                |                |     waypoints, |                |
|                |                |     engage on  |                |
|                |                |     contact    |                |
|                |                |                |                |
|                |                | -   Enter/exit |                |
|                |                |     building:  |                |
|                |                |     unit moves |                |
|                |                |     into       |                |
|                |                |     building,  |                |
|                |                |     becomes    |                |
|                |                |     hidden     |                |
|                |                |     from       |                |
|                |                |     opponents  |                |
|                |                |                |                |
|                |                | -   Remove     |                |
|                |                |     unit:      |                |
|                |                |     destroy    |                |
|                |                |     with no    |                |
|                |                |     resource   |                |
|                |                |     refund     |                |
|                |                |                |                |
|                |                |  (confirmation |                |
|                |                |     prompt)    |                |
|                |                |                |                |
|                |                | -   Remove     |                |
|                |                |     building:  |                |
|                |                |     destroy    |                |
|                |                |     with no    |                |
|                |                |     refund,    |                |
|                |                |     update     |                |
|                |                |     territory  |                |
|                |                |     lines      |                |
|                |                |                |                |
|                |                |    immediately |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   All unit   | Resolve before |
|                | Tasks**        |     stat       | coding         |
|                |                |     values     |                |
|                |                |     (HP,       |                |
|                |                |     damage,    |                |
|                |                |     range,     |                |
|                |                |     speed,     |                |
|                |                |     charisma,  |                |
|                |                |     armor,     |                |
|                |                |     capacity)  |                |
|                |                |     --- from   |                |
|                |                |     Phase 0    |                |
|                |                |                |                |
|                |                | -   XP gain    |                |
|                |                |     rates per  |                |
|                |                |     action for |                |
|                |                |     each unit  |                |
|                |                |     type       |                |
|                |                |                |                |
|                |                | -   Surf       |                |
|                |                |     dual-XP    |                |
|                |                |     gain rates |                |
|                |                |     for        |                |
|                |                |     gathering  |                |
|                |                |     vs.        |                |
|                |                |     building   |                |
|                |                |                |                |
|                |                | -   Core       |                |
|                |                |     per-stat   |                |
|                |                |     XP gain    |                |
|                |                |     rates for  |                |
|                |                |     each       |                |
|                |                |     activity   |                |
|                |                |     type       |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 2, Phase |                |                |                |
| 5              |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 7:**   |                |                |                |
| Robot Faction  |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement the  |                |                |                |
| complete Robot |                |                |                |
| faction: Core  |                |                |                |
| attach/detach  |                |                |                |
| system, all 11 |                |                |                |
| unit           |                |                |                |
| ty             |                |                |                |
| pes/platforms, |                |                |                |
| material       |                |                |                |
| upgrade        |                |                |                |
| system, and    |                |                |                |
| robot          |                |                |                |
| gathering      |                |                |                |
| economics.     |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Core         | -   Implement  | Full robot     |
|                | System**       |     Core as    | faction        |
|                |                |     detachable | playable: Core |
|                |                |     entity:    | attach/detach  |
|                |                |     civilian   | working across |
|                |                |     mode       | all platforms, |
|                |                |                | material       |
|                |                |   (unattached) | upgrade        |
|                |                |     and        | functional,    |
|                |                |     platform   | all platforms  |
|                |                |     mode       | execute        |
|                |                |     (attached) | specialized    |
|                |                |                | behaviors.     |
|                |                | -   Attach     |                |
|                |                |     command:   |                |
|                |                |     Core       |                |
|                |                |     selects    |                |
|                |                |     nearby     |                |
|                |                |     compatible |                |
|                |                |     platform   |                |
|                |                |     to attach  |                |
|                |                |     to         |                |
|                |                |                |                |
|                |                | -   Detach     |                |
|                |                |     command:   |                |
|                |                |     Core       |                |
|                |                |     detaches,  |                |
|                |                |     platform   |                |
|                |                |     remains    |                |
|                |                |     stationary |                |
|                |                |     and        |                |
|                |                |                |                |
|                |                | non-functional |                |
|                |                |                |                |
|                |                | -   Core       |                |
|                |                |     retains    |                |
|                |                |     all        |                |
|                |                |                |                |
|                |                |    accumulated |                |
|                |                |     stat       |                |
|                |                |     XP/levels  |                |
|                |                |     when       |                |
|                |                |     switching  |                |
|                |                |     platforms  |                |
|                |                |                |                |
|                |                | -   Civilian   |                |
|                |                |     mode: Core |                |
|                |                |     can only   |                |
|                |                |     Talk,      |                |
|                |                |     Convert,   |                |
|                |                |     or attach  |                |
+----------------+----------------+----------------+----------------+
| **2**          | **All          | -              |                |
|                | Platforms &    |   Motherboard: |                |
|                | Units**        |     leader,    |                |
|                |                |     all        |                |
|                |                |     actions,   |                |
|                |                |     cannot be  |                |
|                |                |     converted  |                |
|                |                |                |                |
|                |                | -   Water      |                |
|                |                |     Collection |                |
|                |                |     Platform:  |                |
|                |                |     gatherer,  |                |
|                |                |     collects   |                |
|                |                |     water,     |                |
|                |                |     returns to |                |
|                |                |                |                |
|                |                |   Home/storage |                |
|                |                |                |                |
|                |                | -   Wood       |                |
|                |                |     Chopper    |                |
|                |                |     Platform:  |                |
|                |                |     gatherer,  |                |
|                |                |     collects   |                |
|                |                |     wood       |                |
|                |                |     deposits,  |                |
|                |                |     returns to |                |
|                |                |                |                |
|                |                |   Home/storage |                |
|                |                |                |                |
|                |                | -   Movable    |                |
|                |                |     Build Kit: |                |
|                |                |     builder,   |                |
|                |                |     constructs |                |
|                |                |     buildings  |                |
|                |                |     (consumed  |                |
|                |                |     on         |                |
|                |                |                |                |
|                |                |   completion), |                |
|                |                |     repairs    |                |
|                |                |     buildings  |                |
|                |                |                |                |
|                |                | -   Spinner    |                |
|                |                |     Platform:  |                |
|                |                |     melee      |                |
|                |                |     combat,    |                |
|                |                |     spinning   |                |
|                |                |     blade,     |                |
|                |                |     ground     |                |
|                |                |     only, XP   |                |
|                |                |     per kill   |                |
|                |                |                |                |
|                |                | -   Spitter    |                |
|                |                |     Platform:  |                |
|                |                |     ranged,    |                |
|                |                |     fires over |                |
|                |                |     walls,     |                |
|                |                |     attacks    |                |
|                |                |     ground +   |                |
|                |                |     air, XP    |                |
|                |                |     per kill   |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |   Infiltration |                |
|                |                |     Platform:  |                |
|                |                |     spy,       |                |
|                |                |     disguise   |                |
|                |                |     as enemy   |                |
|                |                |     unit,      |                |
|                |                |     enter      |                |
|                |                |     buildings, |                |
|                |                |     attack to  |                |
|                |                |     expel;     |                |
|                |                |     detector   |                |
|                |                |     required   |                |
|                |                |     to reveal; |                |
|                |                |     XP in      |                |
|                |                |     enemy      |                |
|                |                |     territory  |                |
|                |                |                |                |
|                |                | -   Large      |                |
|                |                |     Combat     |                |
|                |                |     Platform:  |                |
|                |                |     heavy      |                |
|                |                |     melee,     |                |
|                |                |     ground +   |                |
|                |                |     air, XP    |                |
|                |                |     per kill   |                |
|                |                |                |                |
|                |                | -   Probe      |                |
|                |                |     Platform:  |                |
|                |                |     flying, no |                |
|                |                |     attack,    |                |
|                |                |     extended   |                |
|                |                |     vision,    |                |
|                |                |     detector   |                |
|                |                |     ability,   |                |
|                |                |     XP in      |                |
|                |                |     enemy      |                |
|                |                |     territory  |                |
|                |                |                |                |
|                |                | -   Wall       |                |
|                |                |     Platform:  |                |
|                |                |     high HP,   |                |
|                |                |     large      |                |
|                |                |     footprint, |                |
|                |                |     mobile     |                |
|                |                |     with Core  |                |
|                |                |     attached,  |                |
|                |                |     stationary |                |
|                |                |     barrier    |                |
|                |                |     when       |                |
|                |                |     detached   |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Material     | -   Implement  |                |
|                | Upgrades**     |     WOOD /     |                |
|                |                |     METAL      |                |
|                |                |     material   |                |
|                |                |     flag on    |                |
|                |                |     platforms  |                |
|                |                |                |                |
|                |                | -   Material   |                |
|                |                |     upgrade    |                |
|                |                |     research   |                |
|                |                |     at Home    |                |
|                |                |     building   |                |
|                |                |     (wood →    |                |
|                |                |     metal)     |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |   Post-upgrade |                |
|                |                |     platforms  |                |
|                |                |     use METAL  |                |
|                |                |     stats;     |                |
|                |                |                |                |
|                |                |    pre-upgrade |                |
|                |                |     platforms  |                |
|                |                |     retain     |                |
|                |                |     WOOD stats |                |
|                |                |                |                |
|                |                | -   Core       |                |
|                |                |     attaching  |                |
|                |                |     to METAL   |                |
|                |                |     platform   |                |
|                |                |                |                |
|                |                |    immediately |                |
|                |                |     benefits   |                |
|                |                |     from METAL |                |
|                |                |     stats      |                |
|                |                |                |                |
|                |                | -   Display    |                |
|                |                |     material   |                |
|                |                |     type in    |                |
|                |                |     unit info  |                |
|                |                |     panel      |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Robot        | -              |                |
|                | Economy**      |    Fast-gather |                |
|                |                |     /          |                |
|                |                |                |                |
|                |                |   low-capacity |                |
|                |                |     model for  |                |
|                |                |     robot      |                |
|                |                |     gatherers  |                |
|                |                |     (reward    |                |
|                |                |     large      |                |
|                |                |                |                |
|                |                |   simultaneous |                |
|                |                |     fleets)    |                |
|                |                |                |                |
|                |                | -   Home       |                |
|                |                |     building   |                |
|                |                |     as         |                |
|                |                |     resource   |                |
|                |                |     return     |                |
|                |                |     point and  |                |
|                |                |     all        |                |
|                |                |     production |                |
|                |                |     queues     |                |
|                |                |                |                |
|                |                | -   Water      |                |
|                |                |     Extractor: |                |
|                |                |                |                |
|                |                |  auto-collects |                |
|                |                |     water per  |                |
|                |                |     tick when  |                |
|                |                |     Core       |                |
|                |                |     attached;  |                |
|                |                |     must be    |                |
|                |                |     near water |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   Wood vs.   | Resolve before |
|                | Tasks**        |     metal stat | coding         |
|                |                |                |                |
|                |                |  differentials |                |
|                |                |     (HP and    |                |
|                |                |     armor      |                |
|                |                |     values per |                |
|                |                |     platform   |                |
|                |                |     per        |                |
|                |                |     material)  |                |
|                |                |                |                |
|                |                | -   Material   |                |
|                |                |     upgrade    |                |
|                |                |     research   |                |
|                |                |     cost and   |                |
|                |                |     duration   |                |
|                |                |                |                |
|                |                | -   All        |                |
|                |                |     platform   |                |
|                |                |     stat       |                |
|                |                |     values     |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   Water      |                |
|                |                |     Extractor  |                |
|                |                |     a          |                |
|                |                | uto-collection |                |
|                |                |     rate per   |                |
|                |                |     tick       |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 6        |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 8:**   |                |                |                |
| Robot          |                |                |                |
| Buildings      |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement all  |                |                |                |
| robot faction  |                |                |                |
| buildings      |                |                |                |
| including      |                |                |                |
| production     |                |                |                |
| queues,        |                |                |                |
| C              |                |                |                |
| ore-attachment |                |                |                |
| mechanics, and |                |                |                |
| special        |                |                |                |
| support        |                |                |                |
| structures.    |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Core         | -   Home: main | All robot      |
|                | Buildings**    |     building,  | buildings      |
|                |                |     resource   | constructable. |
|                |                |     return,    | Production     |
|                |                |     produces   | queues         |
|                |                |     Cores +    | functional.    |
|                |                |     all        | Third Space XP |
|                |                |                | boost,         |
|                |                |    platforms + | Immobile       |
|                |                |     Movable    | Combat         |
|                |                |     Build      | Platform       |
|                |                |     Kits,      | scaling, and   |
|                |                |     hosts      | Water          |
|                |                |     material   | Extractor      |
|                |                |     upgrade    | a              |
|                |                |     research   | uto-collection |
|                |                |                | working.       |
|                |                | -   Recharge   |                |
|                |                |     Station:   |                |
|                |                |     population |                |
|                |                |     support    |                |
|                |                |     +8, units  |                |
|                |                |     can enter  |                |
|                |                |                |                |
|                |                | -   Wood       |                |
|                |                |     Storage:   |                |
|                |                |     secondary  |                |
|                |                |     resource   |                |
|                |                |     deposit    |                |
|                |                |     point,     |                |
|                |                |     placed     |                |
|                |                |     near wood  |                |
|                |                |     deposits   |                |
|                |                |                |                |
|                |                | -   Water      |                |
|                |                |     Extractor: |                |
|                |                |                |                |
|                |                |  auto-collects |                |
|                |                |     water      |                |
|                |                |     (requires  |                |
|                |                |     Core       |                |
|                |                |     attached), |                |
|                |                |     must be    |                |
|                |                |     placed     |                |
|                |                |     adjacent   |                |
|                |                |     to water   |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Production   | -   Combat     |                |
|                | Buildings**    |     Frame      |                |
|                |                |                |                |
|                |                |    Production: |                |
|                |                |     unlocks    |                |
|                |                |     and        |                |
|                |                |     produces   |                |
|                |                |     Spinner +  |                |
|                |                |     Spitter    |                |
|                |                |     Platforms  |                |
|                |                |                |                |
|                |                | -   Combat     |                |
|                |                |     Research   |                |
|                |                |     Station:   |                |
|                |                |     unlocks    |                |
|                |                |     and        |                |
|                |                |     produces   |                |
|                |                |     Large      |                |
|                |                |     Combat     |                |
|                |                |     Platforms  |                |
|                |                |                |                |
|                |                | -   Defensive  |                |
|                |                |     Research   |                |
|                |                |     Station:   |                |
|                |                |     unlocks    |                |
|                |                |     and        |                |
|                |                |     produces   |                |
|                |                |     Wall       |                |
|                |                |     Platforms  |                |
|                |                |                |                |
|                |                | -   Diplomatic |                |
|                |                |     Research   |                |
|                |                |     Station:   |                |
|                |                |     robot      |                |
|                |                |     embassy    |                |
|                |                |     (one per   |                |
|                |                |     allied     |                |
|                |                |     faction);  |                |
|                |                |     unlocks    |                |
|                |                |                |                |
|                |                | Infiltration + |                |
|                |                |     Probe      |                |
|                |                |     Platforms  |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Special      | -   Immobile   |                |
|                | Buildings**    |     Combat     |                |
|                |                |     Platform:  |                |
|                |                |     defensive  |                |
|                |                |     turret;    |                |
|                |                |     each Core  |                |
|                |                |     entered    |                |
|                |                |     increases  |                |
|                |                |     combat     |                |
|                |                |     damage and |                |
|                |                |     vision     |                |
|                |                |     range;     |                |
|                |                |     vision     |                |
|                |                |     capped     |                |
|                |                |     below      |                |
|                |                |     dedicated  |                |
|                |                |     Watch      |                |
|                |                |     Tower      |                |
|                |                |     equivalent |                |
|                |                |                |                |
|                |                | -   Third      |                |
|                |                |     Space:     |                |
|                |                |                |                |
|                |                |    accelerates |                |
|                |                |     XP for     |                |
|                |                |     unattached |                |
|                |                |     Cores      |                |
|                |                |     within     |                |
|                |                |     vision     |                |
|                |                |     range;     |                |
|                |                |     base rate  |                |
|                |                |     outside    |                |
|                |                |     any Third  |                |
|                |                |     Space      |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Territory**  | -   All        |                |
|                |                |     buildings  |                |
|                |                |     contribute |                |
|                |                |     vision     |                |
|                |                |     range to   |                |
|                |                |     faction    |                |
|                |                |     map        |                |
|                |                |     visibility |                |
|                |                |                |                |
|                |                | -   Territory  |                |
|                |                |     boundary   |                |
|                |                |     lines      |                |
|                |                |     update in  |                |
|                |                |     real time  |                |
|                |                |     on         |                |
|                |                |     constructi |                |
|                |                | on/destruction |                |
|                |                |                |                |
|                |                | -   Terrain    |                |
|                |                |     placement  |                |
|                |                |     validation |                |
|                |                |     (Water     |                |
|                |                |     Extractor  |                |
|                |                |     must be    |                |
|                |                |     adjacent   |                |
|                |                |     to water   |                |
|                |                |     body)      |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   All        | Resolve before |
|                | Tasks**        |     building   | coding         |
|                |                |     HP,        |                |
|                |                |     capacity,  |                |
|                |                |     and vision |                |
|                |                |     range      |                |
|                |                |     values     |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   All        |                |
|                |                |     building   |                |
|                |                |     resource   |                |
|                |                |     costs and  |                |
|                |                |                |                |
|                |                |   construction |                |
|                |                |     times      |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   Immobile   |                |
|                |                |     Combat     |                |
|                |                |     Platform:  |                |
|                |                |     combat     |                |
|                |                |     stat       |                |
|                |                |     increment  |                |
|                |                |     per Core   |                |
|                |                |     and max    |                |
|                |                |     vision     |                |
|                |                |     range cap  |                |
|                |                |                |                |
|                |                | -   Third      |                |
|                |                |     Space: XP  |                |
|                |                |     boost      |                |
|                |                |     multiplier |                |
|                |                |     and area   |                |
|                |                |     radius     |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 7        |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 9:**   |                |                |                |
| Wizard Faction |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement the  |                |                |                |
| complete       |                |                |                |
| Wizard         |                |                |                |
| faction: all 8 |                |                |                |
| unit types,    |                |                |                |
| the            |                |                |                |
| faction-wide   |                |                |                |
| mana system,   |                |                |                |
| spell library, |                |                |                |
| and wizard     |                |                |                |
| gathering      |                |                |                |
| economics.     |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Mana         | -   Implement  | Full wizard    |
|                | System**       |                | faction        |
|                |                |   faction-wide | playable: mana |
|                |                |     shared     | pool           |
|                |                |     mana pool  | generates,     |
|                |                |     (single    | spells cast    |
|                |                |     float, all | and consume    |
|                |                |     spells     | mana, Mana     |
|                |                |     deduct     | Shield drains  |
|                |                |     from it)   | pool, all      |
|                |                |                | research       |
|                |                | -   Passive    | unlocks work,  |
|                |                |     mana       | all units      |
|                |                |     generation | recruit        |
|                |                |     per wizard | correctly.     |
|                |                |     unit per   |                |
|                |                |     tick       |                |
|                |                |                |                |
|                |                | -   Mana       |                |
|                |                |     Reservoir  |                |
|                |                |     building:  |                |
|                |                |     fixed mana |                |
|                |                |     generation |                |
|                |                |     per tick   |                |
|                |                |                |                |
|                |                | -   Proximity  |                |
|                |                |     boost:     |                |
|                |                |     units      |                |
|                |                |     within     |                |
|                |                |     vision     |                |
|                |                |     range of   |                |
|                |                |     any        |                |
|                |                |     Reservoir  |                |
|                |                |     get        |                |
|                |                |     multiplied |                |
|                |                |     generation |                |
|                |                |     rate       |                |
|                |                |                |                |
|                |                | -   Mana       |                |
|                |                |                |                |
|                |                |   consumption: |                |
|                |                |     deduct on  |                |
|                |                |     spell      |                |
|                |                |     cast;      |                |
|                |                |     block      |                |
|                |                |     spell if   |                |
|                |                |     pool       |                |
|                |                |                |                |
|                |                |   insufficient |                |
|                |                |                |                |
|                |                | -   Mana       |                |
|                |                |     Shield:    |                |
|                |                |     per-tick   |                |
|                |                |     mana drain |                |
|                |                |     while      |                |
|                |                |     active;    |                |
|                |                |     a          |                |
|                |                | uto-deactivate |                |
|                |                |     when pool  |                |
|                |                |     reaches    |                |
|                |                |     zero       |                |
|                |                |                |                |
|                |                | -   Mana pool  |                |
|                |                |     displayed  |                |
|                |                |     in         |                |
|                |                |     resource   |                |
|                |                |     HUD        |                |
|                |                |     (wizard    |                |
|                |                |     faction    |                |
|                |                |     only)      |                |
+----------------+----------------+----------------+----------------+
| **2**          | **All Units**  | -   Archmage:  |                |
|                |                |     leader,    |                |
|                |                |     all        |                |
|                |                |     actions,   |                |
|                |                |     cannot be  |                |
|                |                |     converted  |                |
|                |                |                |                |
|                |                | -   Surf:      |                |
|                |                |     gatherer + |                |
|                |                |     builder,   |                |
|                |                |     slow but   |                |
|                |                |     high       |                |
|                |                |     capacity;  |                |
|                |                |     dual XP    |                |
|                |                |     (gathering |                |
|                |                |     /          |                |
|                |                |     building)  |                |
|                |                |                |                |
|                |                | -   Subject:   |                |
|                |                |     civilian,  |                |
|                |                |     passive    |                |
|                |                |     mana gen,  |                |
|                |                |     Talk +     |                |
|                |                |     Convert,   |                |
|                |                |     gains XP   |                |
|                |                |     faster     |                |
|                |                |     near other |                |
|                |                |     Subjects   |                |
|                |                |                |                |
|                |                | -   Evoker:    |                |
|                |                |     Wizard     |                |
|                |                |     Missiles   |                |
|                |                |     (default), |                |
|                |                |     Ice Blast  |                |
|                |                |                |                |
|                |                |  (researchable |                |
|                |                |     slow),     |                |
|                |                |     Fiery      |                |
|                |                |     Explosion  |                |
|                |                |                |                |
|                |                |  (researchable |                |
|                |                |     high       |                |
|                |                |     damage),   |                |
|                |                |     Mana       |                |
|                |                |     Shield     |                |
|                |                |                |                |
|                |                | (researchable) |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |   Illusionist: |                |
|                |                |     invisible  |                |
|                |                |     to         |                |
|                |                |     standard   |                |
|                |                |     vision,    |                |
|                |                |     summons    |                |
|                |                |     decoys,    |                |
|                |                |     enters     |                |
|                |                |                |                |
|                |                |    buildings + |                |
|                |                |     expels +   |                |
|                |                |     controls   |                |
|                |                |     target     |                |
|                |                |     unit, Mana |                |
|                |                |     Shield;    |                |
|                |                |     requires   |                |
|                |                |     Library of |                |
|                |                |     Illusion;  |                |
|                |                |     XP in      |                |
|                |                |     enemy      |                |
|                |                |     territory  |                |
|                |                |                |                |
|                |                | -   Dragon:    |                |
|                |                |     flying,    |                |
|                |                |     fire       |                |
|                |                |     breath,    |                |
|                |                |     bonus vs.  |                |
|                |                |     buildings, |                |
|                |                |     attacks    |                |
|                |                |     ground +   |                |
|                |                |     air, one   |                |
|                |                |     Dragon per |                |
|                |                |     Dragon     |                |
|                |                |     Hoard; XP  |                |
|                |                |     per        |                |
|                |                |                |                |
|                |                |  kill/building |                |
|                |                |     destroyed  |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |   Enchantress: |                |
|                |                |     Enlarge    |                |
|                |                |     (ally      |                |
|                |                |     damage     |                |
|                |                |     buff),     |                |
|                |                |     Reduce     |                |
|                |                |     (enemy     |                |
|                |                |     damage     |                |
|                |                |     debuff),   |                |
|                |                |     detector   |                |
|                |                |     ability,   |                |
|                |                |     Mana       |                |
|                |                |     Shield;    |                |
|                |                |     requires   |                |
|                |                |     Library of |                |
|                |                |                |                |
|                |                |   Enchantment; |                |
|                |                |     XP per     |                |
|                |                |     ability    |                |
|                |                |     use        |                |
|                |                |                |                |
|                |                | -   Cleric:    |                |
|                |                |     heals      |                |
|                |                |     nearby     |                |
|                |                |     allies per |                |
|                |                |     tick, no   |                |
|                |                |     attack;    |                |
|                |                |     requires   |                |
|                |                |     Temple; XP |                |
|                |                |     per HP     |                |
|                |                |     restored   |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Library      | -   Library of |                |
|                | Research**     |     Evocation: |                |
|                |                |     individual |                |
|                |                |     research   |                |
|                |                |     for Ice    |                |
|                |                |     Blast,     |                |
|                |                |     Fiery      |                |
|                |                |     Explosion, |                |
|                |                |     Mana       |                |
|                |                |     Shield     |                |
|                |                |                |                |
|                |                | -   Library of |                |
|                |                |     Illusion:  |                |
|                |                |     unlocks    |                |
|                |                |                |                |
|                |                |    Illusionist |                |
|                |                |                |                |
|                |                |    recruitment |                |
|                |                |                |                |
|                |                | -   Library of |                |
|                |                |                |                |
|                |                |   Enchantment: |                |
|                |                |     unlocks    |                |
|                |                |                |                |
|                |                |  Enchantress + |                |
|                |                |     detector   |                |
|                |                |     ability    |                |
|                |                |     research   |                |
|                |                |                |                |
|                |                | -   Research   |                |
|                |                |     deducted   |                |
|                |                |     on queue;  |                |
|                |                |     ability    |                |
|                |                |     available  |                |
|                |                |     on         |                |
|                |                |     completion |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Wizard       | -              |                |
|                | Economy**      |    Slow-gather |                |
|                |                |     /          |                |
|                |                |                |                |
|                |                |  high-capacity |                |
|                |                |     Surf model |                |
|                |                |                |                |
|                |                | -   Castle as  |                |
|                |                |     resource   |                |
|                |                |     return and |                |
|                |                |     all unit   |                |
|                |                |                |                |
|                |                |    recruitment |                |
|                |                |                |                |
|                |                | -   Watermill: |                |
|                |                |                |                |
|                |                |  auto-collects |                |
|                |                |     water per  |                |
|                |                |     tick, no   |                |
|                |                |     unit       |                |
|                |                |     needed,    |                |
|                |                |     must be    |                |
|                |                |     near water |                |
|                |                |                |                |
|                |                | -   Log Cabin: |                |
|                |                |     wood       |                |
|                |                |     storage    |                |
|                |                |     closer to  |                |
|                |                |     wood       |                |
|                |                |     deposits   |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   All wizard | Resolve before |
|                | Tasks**        |     unit stat  | coding         |
|                |                |     values     |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   Mana       |                |
|                |                |     generation |                |
|                |                |     rates: per |                |
|                |                |     unit per   |                |
|                |                |     tick, Mana |                |
|                |                |     Reservoir  |                |
|                |                |     per tick,  |                |
|                |                |     proximity  |                |
|                |                |     boost      |                |
|                |                |     multiplier |                |
|                |                |                |                |
|                |                | -   Mana costs |                |
|                |                |     for all    |                |
|                |                |     spells;    |                |
|                |                |     Mana       |                |
|                |                |     Shield     |                |
|                |                |     per-second |                |
|                |                |     drain rate |                |
|                |                |                |                |
|                |                | -   Ice Blast  |                |
|                |                |     slow       |                |
|                |                |     duration   |                |
|                |                |     and speed  |                |
|                |                |     reduction  |                |
|                |                |     percentage |                |
|                |                |                |                |
|                |                | -   Library    |                |
|                |                |     research   |                |
|                |                |     costs and  |                |
|                |                |     durations  |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 6        |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 10:**  |                |                |                |
| Wizard         |                |                |                |
| Buildings      |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement all  |                |                |                |
| wizard faction |                |                |                |
| buildings      |                |                |                |
| including      |                |                |                |
| culture/mana   |                |                |                |
| support        |                |                |                |
| structures and |                |                |                |
| unit unlock    |                |                |                |
| buildings.     |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Core         | -   Castle:    | All wizard     |
|                | Buildings**    |     main       | buildings      |
|                |                |     building,  | constructable. |
|                |                |     all wizard | Dragon Hoard   |
|                |                |     units      | correctly      |
|                |                |     recruited  | limits Dragon  |
|                |                |     here,      | count.         |
|                |                |     resource   | Amphitheatre   |
|                |                |     return     | stacking boost |
|                |                |     point      | functional.    |
|                |                |                | Mana Reservoir |
|                |                | -   Cottage:   | proximity      |
|                |                |     population | boost working. |
|                |                |     support    |                |
|                |                |     +5, units  |                |
|                |                |     can enter  |                |
|                |                |                |                |
|                |                | -   Wall:      |                |
|                |                |     impassable |                |
|                |                |     barrier,   |                |
|                |                |     no vision, |                |
|                |                |     no         |                |
|                |                |                |                |
|                |                |    production, |                |
|                |                |     high HP    |                |
|                |                |                |                |
|                |                | -   Wizard     |                |
|                |                |     Tower:     |                |
|                |                |     Evoker     |                |
|                |                |     enters for |                |
|                |                |     extended   |                |
|                |                |     attack     |                |
|                |                |     range;     |                |
|                |                |     tower      |                |
|                |                |                |                |
|                |                |    contributes |                |
|                |                |     vision     |                |
|                |                |                |                |
|                |                | -   Watermill: |                |
|                |                |                |                |
|                |                |  auto-collects |                |
|                |                |     water near |                |
|                |                |     source per |                |
|                |                |     tick       |                |
|                |                |                |                |
|                |                | -   Log Cabin: |                |
|                |                |     wood       |                |
|                |                |     storage    |                |
|                |                |     for Surf   |                |
|                |                |     deposits   |                |
|                |                |     near wood  |                |
|                |                |     sources    |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Unit Unlock  | -   Library of |                |
|                | Buildings**    |     Evocation: |                |
|                |                |     spell      |                |
|                |                |     research   |                |
|                |                |     hub        |                |
|                |                |                |                |
|                |                | -   Library of |                |
|                |                |     Illusion:  |                |
|                |                |     unlocks    |                |
|                |                |                |                |
|                |                |    Illusionist |                |
|                |                |                |                |
|                |                | -   Library of |                |
|                |                |                |                |
|                |                |   Enchantment: |                |
|                |                |     unlocks    |                |
|                |                |                |                |
|                |                |    Enchantress |                |
|                |                |                |                |
|                |                | -   Dragon     |                |
|                |                |     Hoard:     |                |
|                |                |     each       |                |
|                |                |                |                |
|                |                |    constructed |                |
|                |                |     Hoard      |                |
|                |                |     unlocks +  |                |
|                |                |     supports   |                |
|                |                |     one Dragon |                |
|                |                |                |                |
|                |                | -   Temple:    |                |
|                |                |     unlocks    |                |
|                |                |     Cleric     |                |
|                |                |                |                |
|                |                | -   Embassy:   |                |
|                |                |     diplomatic |                |
|                |                |     building,  |                |
|                |                |     one per    |                |
|                |                |     allied     |                |
|                |                |     faction    |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Support      | -   Mana       |                |
|                | Buildings**    |     Reservoir: |                |
|                |                |     generates  |                |
|                |                |     mana per   |                |
|                |                |     tick;      |                |
|                |                |     proximity  |                |
|                |                |     boost for  |                |
|                |                |     nearby     |                |
|                |                |     wizard     |                |
|                |                |     units;     |                |
|                |                |     high-value |                |
|                |                |     target     |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |  Amphitheatre: |                |
|                |                |                |                |
|                |                |   faction-wide |                |
|                |                |     Subject XP |                |
|                |                |     boost;     |                |
|                |                |     stacks     |                |
|                |                |     with each  |                |
|                |                |     additional |                |
|                |                |                |                |
|                |                |   Amphitheatre |                |
|                |                |     built      |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   All wizard | Resolve before |
|                | Tasks**        |     building   | coding         |
|                |                |     HP,        |                |
|                |                |     capacity,  |                |
|                |                |     vision     |                |
|                |                |     range      |                |
|                |                |     values     |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   All wizard |                |
|                |                |     building   |                |
|                |                |     resource   |                |
|                |                |     costs and  |                |
|                |                |                |                |
|                |                |   construction |                |
|                |                |     times      |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   Mana       |                |
|                |                |     Reservoir: |                |
|                |                |     per-tick   |                |
|                |                |                |                |
|                |                |    generation, |                |
|                |                |     proximity  |                |
|                |                |     boost      |                |
|                |                |     radius     |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |  Amphitheatre: |                |
|                |                |     base boost |                |
|                |                |     per        |                |
|                |                |     building,  |                |
|                |                |     stacking   |                |
|                |                |     formula    |                |
|                |                |                |                |
|                |                | -   Wizard     |                |
|                |                |     Tower:     |                |
|                |                |     attack     |                |
|                |                |     range      |                |
|                |                |     extension  |                |
|                |                |     amount for |                |
|                |                |     housed     |                |
|                |                |     Evoker     |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 9        |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 11:**  |                |                |                |
| Resource &     |                |                |                |
| Economy        |                |                |                |
| Systems        |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement the  |                |                |                |
| complete       |                |                |                |
| resource       |                |                |                |
| gathering,     |                |                |                |
| storage        |                |                |                |
| routing,       |                |                |                |
| au             |                |                |                |
| to-collection, |                |                |                |
| and            |                |                |                |
| consumption    |                |                |                |
| loop for both  |                |                |                |
| factions.      |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Gathering    | -   Gather     | Full           |
|                | Loop**         |     command:   | gathering,     |
|                |                |     unit       | carry,         |
|                |                |     pathfinds  | deposit, and   |
|                |                |     to nearest | a              |
|                |                |     deposit of | uto-collection |
|                |                |     target     | loop           |
|                |                |     type       | functional for |
|                |                |                | both factions. |
|                |                | -   Carry      | Resource       |
|                |                |     capacity   | alerts firing  |
|                |                |     limit      | correctly.     |
|                |                |     enforced:  |                |
|                |                |     unit       |                |
|                |                |     returns to |                |
|                |                |     storage    |                |
|                |                |     when full  |                |
|                |                |                |                |
|                |                | -   Return     |                |
|                |                |     routing:   |                |
|                |                |     pathfind   |                |
|                |                |     to nearest |                |
|                |                |     valid      |                |
|                |                |     storage    |                |
|                |                |     point      |                |
|                |                |                |                |
|                |                |   (Home/Castle |                |
|                |                |     or branch  |                |
|                |                |     storage)   |                |
|                |                |                |                |
|                |                | -   Faction    |                |
|                |                |     resource   |                |
|                |                |     pool:      |                |
|                |                |     single     |                |
|                |                |     shared     |                |
|                |                |     float per  |                |
|                |                |     resource   |                |
|                |                |     type;      |                |
|                |                |     deducted   |                |
|                |                |     on         |                |
|                |                |     productio  |                |
|                |                | n/construction |                |
|                |                |                |                |
|                |                | -   Wood       |                |
|                |                |     deposit    |                |
|                |                |     depletion: |                |
|                |                |     deposits   |                |
|                |                |     have       |                |
|                |                |     finite     |                |
|                |                |     quantity;  |                |
|                |                |     exhausted  |                |
|                |                |     deposits   |                |
|                |                |     removed    |                |
|                |                |     from map   |                |
|                |                |                |                |
|                |                | -   Water:     |                |
|                |                |                |                |
|                |                |  non-depleting |                |
|                |                |     (infinite  |                |
|                |                |     supply at  |                |
|                |                |     water      |                |
|                |                |     bodies)    |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Aut          | -   Water      |                |
|                | o-Collection** |     Extractor  |                |
|                |                |     (robot)    |                |
|                |                |     tick-based |                |
|                |                |     a          |                |
|                |                | uto-collection |                |
|                |                |                |                |
|                |                | -   Watermill  |                |
|                |                |     (wizard)   |                |
|                |                |     tick-based |                |
|                |                |     a          |                |
|                |                | uto-collection |                |
|                |                |                |                |
|                |                | -   Both       |                |
|                |                |     require    |                |
|                |                |     placement  |                |
|                |                |                |                |
|                |                |    validation: |                |
|                |                |     adjacent   |                |
|                |                |     to water   |                |
|                |                |     body       |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Storage &    | -   N          |                |
|                | Alerts**       | earest-storage |                |
|                |                |     routing:   |                |
|                |                |     gatherers  |                |
|                |                |     find       |                |
|                |                |     closest    |                |
|                |                |     Wood       |                |
|                |                |     Storage /  |                |
|                |                |     Home /     |                |
|                |                |     Castle     |                |
|                |                |                |                |
|                |                | -   Resource   |                |
|                |                |     alert:     |                |
|                |                |     fire       |                |
|                |                |                |                |
|                |                |   notification |                |
|                |                |     when wood  |                |
|                |                |     or water   |                |
|                |                |     falls      |                |
|                |                |     below      |                |
|                |                |     threshold  |                |
|                |                |                |                |
|                |                | -   Block      |                |
|                |                |     action     |                |
|                |                |     with       |                |
|                |                |                |                |
|                |                |   notification |                |
|                |                |     if         |                |
|                |                |                |                |
|                |                |   insufficient |                |
|                |                |     resources  |                |
|                |                |     for        |                |
|                |                |     productio  |                |
|                |                | n/construction |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Faction      | -   Verify     |                |
|                | Asymmetry      |     robot      |                |
|                | Tests**        |                |                |
|                |                | multi-gatherer |                |
|                |                |     throughput |                |
|                |                |     vs. wizard |                |
|                |                |                |                |
|                |                |  high-capacity |                |
|                |                |     Surf       |                |
|                |                |     throughput |                |
|                |                |                |                |
|                |                | -   Unit test: |                |
|                |                |     simulate N |                |
|                |                |     robot      |                |
|                |                |     gatherers  |                |
|                |                |     vs. N/3    |                |
|                |                |     Surfs over |                |
|                |                |     M ticks;   |                |
|                |                |     output     |                |
|                |                |     should     |                |
|                |                |     differ as  |                |
|                |                |     designed   |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   Robot      | Resolve before |
|                | Tasks**        |     gatherer   | coding         |
|                |                |     capacity   |                |
|                |                |     and speed  |                |
|                |                |     vs. Surf   |                |
|                |                |     capacity   |                |
|                |                |     and speed  |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   Wood       |                |
|                |                |     deposit    |                |
|                |                |     initial    |                |
|                |                |     quantity;  |                |
|                |                |                |                |
|                |                |  replenishment |                |
|                |                |     policy     |                |
|                |                |     decision   |                |
|                |                |     (finite    |                |
|                |                |     vs.        |                |
|                |                |                |                |
|                |                |  regenerating) |                |
|                |                |                |                |
|                |                | -   Water      |                |
|                |                |     Extractor  |                |
|                |                |     and        |                |
|                |                |     Watermill  |                |
|                |                |     a          |                |
|                |                | uto-collection |                |
|                |                |     rate per   |                |
|                |                |     tick       |                |
|                |                |                |                |
|                |                | -   Resource   |                |
|                |                |     alert      |                |
|                |                |     thresholds |                |
|                |                |     for wood   |                |
|                |                |     and water  |                |
|                |                |     low-stock  |                |
|                |                |     warning    |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 7, Phase |                |                |                |
| 9              |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 12:**  |                |                |                |
| Combat System  |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement the  |                |                |                |
| full combat    |                |                |                |
| model: melee,  |                |                |                |
| ranged,        |                |                |                |
| aerial,        |                |                |                |
| building       |                |                |                |
| combat,        |                |                |                |
| buff/debuff    |                |                |                |
| system, and    |                |                |                |
| the Convert    |                |                |                |
| action.        |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Core         | -   Attack     | Full combat    |
|                | Combat**       |     targeting: | functional for |
|                |                |     ground vs. | all unit       |
|                |                |     air        | types.         |
|                |                |     targeting  | Conversion     |
|                |                |     flags per  | formula        |
|                |                |     unit       | working and    |
|                |                |                | correctly      |
|                |                | -   Attack     | interruptible. |
|                |                |     range      | Named          |
|                |                |     check:     | character      |
|                |                |     melee (1   | conversion     |
|                |                |     tile) vs.  | triggers       |
|                |                |     ranged     | narrative      |
|                |                |     (range     | event.         |
|                |                |     stat)      |                |
|                |                |                |                |
|                |                | -   Damage     |                |
|                |                |                |                |
|                |                |   application: |                |
|                |                |     damage −   |                |
|                |                |     armor = HP |                |
|                |                |     reduction; |                |
|                |                |     clamp to 0 |                |
|                |                |                |                |
|                |                | -   Unit       |                |
|                |                |     death:     |                |
|                |                |     remove     |                |
|                |                |     entity     |                |
|                |                |     when HP    |                |
|                |                |     reaches 0; |                |
|                |                |     trigger    |                |
|                |                |     death      |                |
|                |                |     event      |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Auto-aggro: |                |
|                |                |     units on   |                |
|                |                |     attack     |                |
|                |                |     stance     |                |
|                |                |                |                |
|                |                |    auto-engage |                |
|                |                |     enemies    |                |
|                |                |     entering   |                |
|                |                |     their      |                |
|                |                |     range      |                |
|                |                |                |                |
|                |                | -   Building   |                |
|                |                |     combat:    |                |
|                |                |     buildings  |                |
|                |                |                |                |
|                |                |    targetable, |                |
|                |                |     lose HP,   |                |
|                |                |     destroyed  |                |
|                |                |     at 0       |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Special      | -   \'Fires    |                |
|                | Combat**       |     over       |                |
|                |                |     walls\'    |                |
|                |                |     flag:      |                |
|                |                |     Spitter    |                |
|                |                |     Platform,  |                |
|                |                |     all Evoker |                |
|                |                |     spells     |                |
|                |                |                |                |
|                |                | -   Air unit   |                |
|                |                |     movement:  |                |
|                |                |     ignores    |                |
|                |                |     ground     |                |
|                |                |     terrain    |                |
|                |                |     and wall   |                |
|                |                |     blocking   |                |
|                |                |                |                |
|                |                | -   Dragon     |                |
|                |                |     fire       |                |
|                |                |     breath:    |                |
|                |                |     bonus      |                |
|                |                |     damage     |                |
|                |                |     multiplier |                |
|                |                |     vs.        |                |
|                |                |     buildings  |                |
|                |                |                |                |
|                |                | -   Wizard     |                |
|                |                |     Tower:     |                |
|                |                |     Evoker     |                |
|                |                |     inside     |                |
|                |                |     gains      |                |
|                |                |     extended   |                |
|                |                |     spell      |                |
|                |                |     range      |                |
|                |                |                |                |
|                |                | -   Immobile   |                |
|                |                |     Combat     |                |
|                |                |     Platform:  |                |
|                |                |     damage     |                |
|                |                |     scales     |                |
|                |                |     with Core  |                |
|                |                |     count      |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Enchantress |                |
|                |                |     E          |                |
|                |                | nlarge/Reduce: |                |
|                |                |     temporary  |                |
|                |                |     stat       |                |
|                |                |     modifier   |                |
|                |                |     system     |                |
|                |                |     (timed     |                |
|                |                |                |                |
|                |                |   buff/debuff) |                |
|                |                |                |                |
|                |                | -   Cleric     |                |
|                |                |     heal:      |                |
|                |                |     passive    |                |
|                |                |     AoE HP     |                |
|                |                |                |                |
|                |                |    restoration |                |
|                |                |     per tick   |                |
|                |                |     to nearby  |                |
|                |                |     allies     |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Convert      | -   Convert    |                |
|                | Action**       |     command:   |                |
|                |                |     converter  |                |
|                |                |     must       |                |
|                |                |     maintain   |                |
|                |                |     adjacency  |                |
|                |                |     for        |                |
|                |                |     defined    |                |
|                |                |     duration   |                |
|                |                |     (ticks)    |                |
|                |                |                |                |
|                |                | -   Success    |                |
|                |                |     formula:   |                |
|                |                |     charisma   |                |
|                |                |     vs. target |                |
|                |                |     HP% and    |                |
|                |                |     target     |                |
|                |                |     level      |                |
|                |                |                |                |
|                |                | -   Cancel on: |                |
|                |                |     converter  |                |
|                |                |     moves, is  |                |
|                |                |     attacked,  |                |
|                |                |     or         |                |
|                |                |     receives   |                |
|                |                |     new        |                |
|                |                |     command    |                |
|                |                |                |                |
|                |                | -   Leaders    |                |
|                |                |                |                |
|                |                |   hard-blocked |                |
|                |                |     from       |                |
|                |                |     conversion |                |
|                |                |                |                |
|                |                | -   Successful |                |
|                |                |                |                |
|                |                |    conversion: |                |
|                |                |     unit joins |                |
|                |                |     faction,   |                |
|                |                |     retains    |                |
|                |                |     all        |                |
|                |                |                |                |
|                |                | stats/XP/level |                |
|                |                |                |                |
|                |                | -   Named      |                |
|                |                |     character  |                |
|                |                |                |                |
|                |                |    conversion: |                |
|                |                |     triggers   |                |
|                |                |     narrative  |                |
|                |                |     event to   |                |
|                |                |     LLM        |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |  Cross-species |                |
|                |                |                |                |
|                |                |    conversion: |                |
|                |                |     grants     |                |
|                |                |     converting |                |
|                |                |     faction    |                |
|                |                |                |                |
|                |                |  cross-species |                |
|                |                |     capability |                |
|                |                |     flag (tech |                |
|                |                |     victory)   |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   Armor      | Resolve before |
|                | Tasks**        |     model      | coding         |
|                |                |     decision:  |                |
|                |                |     flat       |                |
|                |                |     reduction  |                |
|                |                |     vs.        |                |
|                |                |     percentage |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   Conversion |                |
|                |                |     duration   |                |
|                |                |     in ticks   |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   Conversion |                |
|                |                |     success    |                |
|                |                |     formula    |                |
|                |                |     exact      |                |
|                |                |     definition |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 6, Phase |                |                |                |
| 7, Phase 9     |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 13:**  |                |                |                |
| Territory &    |                |                |                |
| Faction Stats  |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement all  |                |                |                |
| tracked        |                |                |                |
| faction stats  |                |                |                |
| and the        |                |                |                |
| real-time      |                |                |                |
| territory      |                |                |                |
| boundary line  |                |                |                |
| system.        |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Faction      | -              | All faction    |
|                | Stats**        |    Population: | stats computed |
|                |                |     current    | and live.      |
|                |                |     unit count | Territory      |
|                |                |     vs. cap    | boundary lines |
|                |                |                | render         |
|                |                | -   Military   | correctly and  |
|                |                |     Strength:  | update         |
|                |                |     sum of     | dynamically on |
|                |                |     damage     | building       |
|                |                |     stats of   | changes.       |
|                |                |     all        |                |
|                |                |     military   |                |
|                |                |     units      |                |
|                |                |                |                |
|                |                | -   Culture:   |                |
|                |                |     civilian   |                |
|                |                |     count      |                |
|                |                |     multiplied |                |
|                |                |     by         |                |
|                |                |                |                |
|                |                |    accumulated |                |
|                |                |     civilian   |                |
|                |                |     XP total   |                |
|                |                |                |                |
|                |                | -   Defense:   |                |
|                |                |     count and  |                |
|                |                |     HP sum of  |                |
|                |                |     walls and  |                |
|                |                |     defensive  |                |
|                |                |     buildings  |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |  Intelligence: |                |
|                |                |     total XP   |                |
|                |                |     of all     |                |
|                |                |     fielded    |                |
|                |                |     units      |                |
|                |                |     across all |                |
|                |                |     types      |                |
|                |                |                |                |
|                |                | -   Resources: |                |
|                |                |     current    |                |
|                |                |     wood +     |                |
|                |                |     water (+   |                |
|                |                |     mana for   |                |
|                |                |     wizard     |                |
|                |                |     faction)   |                |
|                |                |                |                |
|                |                | -   Footprint: |                |
|                |                |     total tile |                |
|                |                |     area       |                |
|                |                |     covered by |                |
|                |                |     faction    |                |
|                |                |     buildings  |                |
|                |                |                |                |
|                |                | -   Faction    |                |
|                |                |     Alignment: |                |
|                |                |     per-op     |                |
|                |                | posing-faction |                |
|                |                |     alignment  |                |
|                |                |     value      |                |
|                |                |     (updated   |                |
|                |                |     by         |                |
|                |                |     diplomacy, |                |
|                |                |     combat,    |                |
|                |                |     quests)    |                |
|                |                |                |                |
|                |                | -   Open       |                |
|                |                |     Borders    |                |
|                |                |     Status:    |                |
|                |                |                |                |
|                |                |    per-faction |                |
|                |                |     active     |                |
|                |                |     agreement  |                |
|                |                |     indicator  |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Territory    | -   Implement  |                |
|                | Rendering**    |     building   |                |
|                |                |     cluster    |                |
|                |                |     boundary   |                |
|                |                |                |                |
|                |                |    calculation |                |
|                |                |     (convex    |                |
|                |                |     hull or    |                |
|                |                |     alpha      |                |
|                |                |     shape)     |                |
|                |                |                |                |
|                |                | -   Render     |                |
|                |                |     boundary   |                |
|                |                |     lines on   |                |
|                |                |     main play  |                |
|                |                |     area in    |                |
|                |                |     faction    |                |
|                |                |     color      |                |
|                |                |                |                |
|                |                | -   Update     |                |
|                |                |     boundaries |                |
|                |                |     in real    |                |
|                |                |     time on    |                |
|                |                |     any        |                |
|                |                |     building   |                |
|                |                |                |                |
|                |                |   construction |                |
|                |                |     or         |                |
|                |                |                |                |
|                |                |    destruction |                |
|                |                |                |                |
|                |                | -   Render     |                |
|                |                |     territory  |                |
|                |                |     lines on   |                |
|                |                |     minimap    |                |
|                |                |                |                |
|                |                | -   Show       |                |
|                |                |     boundaries |                |
|                |                |     in         |                |
|                |                |     explored   |                |
|                |                |     and        |                |
|                |                |     visible    |                |
|                |                |     areas; not |                |
|                |                |     in         |                |
|                |                |     unexplored |                |
|                |                |     areas      |                |
|                |                |                |                |
|                |                | -   Cache      |                |
|                |                |     computed   |                |
|                |                |     boundary   |                |
|                |                |     geometry;  |                |
|                |                |     recompute  |                |
|                |                |     only when  |                |
|                |                |     building   |                |
|                |                |     set        |                |
|                |                |     changes    |                |
|                |                |                |                |
|                |                | (event-driven) |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 6, Phase |                |                |                |
| 8, Phase 10    |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 14:**  |                |                |                |
| Diplomacy      |                |                |                |
| System         |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement the  |                |                |                |
| full diplomacy |                |                |                |
| system:        |                |                |                |
| alignment      |                |                |                |
| tracking, all  |                |                |                |
| five           |                |                |                |
| diplomatic     |                |                |                |
| action types,  |                |                |                |
| and mechanical |                |                |                |
| enforcement of |                |                |                |
| treaties.      |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Alignment    | -              | Full diplomacy |
|                | System**       |    Per-faction | system         |
|                |                |     alignment  | functional.    |
|                |                |     float      | All five       |
|                |                |     (pos       | action types   |
|                |                | itive/negative | working.       |
|                |                |     scale)     | Non-combat     |
|                |                |     stored in  | treaty         |
|                |                |     GameState  | mechanically   |
|                |                |                | blocks attack  |
|                |                | -   Alignment  | commands. Open |
|                |                |     modified   | borders        |
|                |                |     by:        | reveals full   |
|                |                |     diplomatic | map and        |
|                |                |                | faction stats  |
|                |                |  interactions, | for both       |
|                |                |     combat     | parties.       |
|                |                |     against    |                |
|                |                |     that       |                |
|                |                |     faction,   |                |
|                |                |     quest      |                |
|                |                |     outcomes,  |                |
|                |                |     narrative  |                |
|                |                |     events     |                |
|                |                |                |                |
|                |                | -   Alignment  |                |
|                |                |     visible    |                |
|                |                |     for own    |                |
|                |                |     faction;   |                |
|                |                |     opposing   |                |
|                |                |     values     |                |
|                |                |     visible    |                |
|                |                |     only via   |                |
|                |                |     open       |                |
|                |                |     borders or |                |
|                |                |     dialogue   |                |
|                |                |                |                |
|                |                | -   Fire       |                |
|                |                |     diplomacy  |                |
|                |                |     alert on   |                |
|                |                |                |                |
|                |                |    significant |                |
|                |                |     alignment  |                |
|                |                |     shift      |                |
|                |                |     (threshold |                |
|                |                |     TBD in     |                |
|                |                |     Phase 0)   |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Diplomatic   | -   Open       |                |
|                | Actions**      |     Borders:   |                |
|                |                |     mutual     |                |
|                |                |     agreement, |                |
|                |                |     both       |                |
|                |                |     factions   |                |
|                |                |     see each   |                |
|                |                |     other      |                |
|                |                |     fully      |                |
|                |                |     regardless |                |
|                |                |     of fog;    |                |
|                |                |     bilateral  |                |
|                |                |     revocation |                |
|                |                |     only       |                |
|                |                |                |                |
|                |                | -   Resource   |                |
|                |                |     Request:   |                |
|                |                |     specify    |                |
|                |                |     type +     |                |
|                |                |     quantity;  |                |
|                |                |     receiver   |                |
|                |                |     acc        |                |
|                |                | epts/declines; |                |
|                |                |     immediate  |                |
|                |                |     transfer   |                |
|                |                |     on accept  |                |
|                |                |                |                |
|                |                | -   Unit       |                |
|                |                |     Request:   |                |
|                |                |     specify    |                |
|                |                |     unit       |                |
|                |                |     (named     |                |
|                |                |     characters |                |
|                |                |                |                |
|                |                |   includable); |                |
|                |                |     permanent  |                |
|                |                |     transfer   |                |
|                |                |     on accept  |                |
|                |                |                |                |
|                |                | -   Non-Combat |                |
|                |                |     Treaty:    |                |
|                |                |     mutual;    |                |
|                |                |                |                |
|                |                |   mechanically |                |
|                |                |     blocks     |                |
|                |                |     attack     |                |
|                |                |     commands   |                |
|                |                |     against    |                |
|                |                |     partner    |                |
|                |                |     while      |                |
|                |                |     active;    |                |
|                |                |     bilateral  |                |
|                |                |     revocation |                |
|                |                |     only       |                |
|                |                |                |                |
|                |                | -   Embassy    |                |
|                |                |     Request:   |                |
|                |                |     receiver   |                |
|                |                |     constructs |                |
|                |                |     Embassy    |                |
|                |                |     (wizard)   |                |
|                |                |     or         |                |
|                |                |     Diplomatic |                |
|                |                |     Research   |                |
|                |                |     Station    |                |
|                |                |     (robot)    |                |
|                |                |     for        |                |
|                |                |     requesting |                |
|                |                |     faction    |                |
+----------------+----------------+----------------+----------------+
| **3**          | **AI Diplomacy | -   Military   |                |
|                | Response**     |     victory    |                |
|                |                |     AI:        |                |
|                |                |     rejects    |                |
|                |                |     most       |                |
|                |                |     treaties;  |                |
|                |                |     more       |                |
|                |                |     likely to  |                |
|                |                |     attack     |                |
|                |                |     without    |                |
|                |                |                |                |
|                |                |    provocation |                |
|                |                |                |                |
|                |                | -   Cultural   |                |
|                |                |     victory    |                |
|                |                |     AI:        |                |
|                |                |     accepts    |                |
|                |                |     non-combat |                |
|                |                |     treaties   |                |
|                |                |     early;     |                |
|                |                |     seeks      |                |
|                |                |     alliances  |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |  Technological |                |
|                |                |     victory    |                |
|                |                |     AI:        |                |
|                |                |     accepts    |                |
|                |                |     where      |                |
|                |                |                |                |
|                |                |   economically |                |
|                |                |                |                |
|                |                |    beneficial; |                |
|                |                |     avoids     |                |
|                |                |     military   |                |
|                |                |     engagement |                |
|                |                |                |                |
|                |                | -   NPC        |                |
|                |                |     faction    |                |
|                |                |     responses  |                |
|                |                |     modulated  |                |
|                |                |     by         |                |
|                |                |     alignment  |                |
|                |                |     value      |                |
|                |                |     toward     |                |
|                |                |     requesting |                |
|                |                |     faction    |                |
+----------------+----------------+----------------+----------------+
| **4**          | **UI Wiring**  | -   Wire all   |                |
|                |                |     diplomacy  |                |
|                |                |     panel      |                |
|                |                |     buttons to |                |
|                |                |     handlers   |                |
|                |                |                |                |
|                |                | -   Show       |                |
|                |                |     incoming   |                |
|                |                |     requests   |                |
|                |                |     in         |                |
|                |                |     diplomacy  |                |
|                |                |     panel with |                |
|                |                |                |                |
|                |                | accept/decline |                |
|                |                |     UI         |                |
|                |                |                |                |
|                |                | -   Show       |                |
|                |                |     active     |                |
|                |                |     agreements |                |
|                |                |     with       |                |
|                |                |     status     |                |
|                |                |     indicators |                |
|                |                |                |                |
|                |                | -   Enforce    |                |
|                |                |     attack     |                |
|                |                |     button     |                |
|                |                |     greyed-out |                |
|                |                |     for units  |                |
|                |                |     targeting  |                |
|                |                |     non-combat |                |
|                |                |     treaty     |                |
|                |                |     partners   |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 5, Phase |                |                |                |
| 6              |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 15:**  |                |                |                |
| AI Opponents   |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement AI   |                |                |                |
| d              |                |                |                |
| ecision-making |                |                |                |
| for all        |                |                |                |
| opponent       |                |                |                |
| factions:      |                |                |                |
| three strategy |                |                |                |
| archetypes     |                |                |                |
| (military,     |                |                |                |
| cultural,      |                |                |                |
| technological) |                |                |                |
| and five NPC   |                |                |                |
| behavioral     |                |                |                |
| profiles.      |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **AI           | -   AI         | All three AI   |
|                | Framework**    |     controller | archetypes     |
|                |                |     per        | actively       |
|                |                |     faction,   | pursuing their |
|                |                |     running on | win            |
|                |                |     game loop  | conditions.    |
|                |                |     tick at    | Five NPC       |
|                |                |     configured | factions       |
|                |                |     reaction   | active with    |
|                |                |     interval   | distinct       |
|                |                |                | diplomatic     |
|                |                | -   Win        | personalities  |
|                |                |     condition  | and behaviors. |
|                |                |     assignment |                |
|                |                |     at match   |                |
|                |                |     start (one |                |
|                |                |     per AI     |                |
|                |                |     faction,   |                |
|                |                |     randomized |                |
|                |                |     or         |                |
|                |                |                |                |
|                |                |    configured) |                |
|                |                |                |                |
|                |                | -   Priority / |                |
|                |                |     utility    |                |
|                |                |     scoring    |                |
|                |                |     system for |                |
|                |                |     decision   |                |
|                |                |     selection  |                |
|                |                |                |                |
|                |                | -   AI         |                |
|                |                |     resource   |                |
|                |                |                |                |
|                |                |    management: |                |
|                |                |     queue      |                |
|                |                |                |                |
|                |                |   construction |                |
|                |                |     and        |                |
|                |                |     production |                |
|                |                |     to         |                |
|                |                |     maintain   |                |
|                |                |     throughput |                |
|                |                |                |                |
|                |                | -   AI         |                |
|                |                |                |                |
|                |                |    pathfinding |                |
|                |                |                |                |
|                |                |    integration |                |
|                |                |     for all    |                |
|                |                |     unit       |                |
|                |                |     commands   |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Military     | -   Prioritize |                |
|                | Archetype**    |     combat     |                |
|                |                |     unit       |                |
|                |                |     production |                |
|                |                |     above all  |                |
|                |                |     else       |                |
|                |                |                |                |
|                |                | -   Aggressive |                |
|                |                |     expansion  |                |
|                |                |     toward     |                |
|                |                |     nearest    |                |
|                |                |     enemy      |                |
|                |                |     territory  |                |
|                |                |                |                |
|                |                | -   Scout and  |                |
|                |                |     target     |                |
|                |                |     enemy      |                |
|                |                |     leaders    |                |
|                |                |                |                |
|                |                |   specifically |                |
|                |                |                |                |
|                |                | -   Minimal    |                |
|                |                |     diplomatic |                |
|                |                |                |                |
|                |                |    engagement; |                |
|                |                |     attacks    |                |
|                |                |     without    |                |
|                |                |                |                |
|                |                |    provocation |                |
|                |                |                |                |
|                |                | -   Escalate   |                |
|                |                |     aggression |                |
|                |                |     as any     |                |
|                |                |     other      |                |
|                |                |     faction    |                |
|                |                |     approaches |                |
|                |                |     a win      |                |
|                |                |     condition  |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Cultural     | -   Prioritize |                |
|                | Archetype**    |     civilian   |                |
|                |                |     population |                |
|                |                |     growth and |                |
|                |                |     protection |                |
|                |                |                |                |
|                |                | -   Seek       |                |
|                |                |     non-combat |                |
|                |                |     treaties   |                |
|                |                |     and        |                |
|                |                |     alliances  |                |
|                |                |     in early   |                |
|                |                |     match      |                |
|                |                |                |                |
|                |                | -   Trigger    |                |
|                |                |                |                |
|                |                |   Talk/Convert |                |
|                |                |     actions    |                |
|                |                |     frequently |                |
|                |                |                |                |
|                |                | -   Cautious   |                |
|                |                |     military   |                |
|                |                |     posture:   |                |
|                |                |     defend     |                |
|                |                |     only, do   |                |
|                |                |     not        |                |
|                |                |     initiate   |                |
|                |                |     combat     |                |
|                |                |                |                |
|                |                | -   Engage     |                |
|                |                |     narrative  |                |
|                |                |     layer;     |                |
|                |                |     quests     |                |
|                |                |     drive      |                |
|                |                |     cultural   |                |
|                |                |     victory    |                |
|                |                |     progress   |                |
+----------------+----------------+----------------+----------------+
| **4**          | *              | -   Prioritize |                |
|                | *Technological |     resource   |                |
|                | Archetype**    |     gathering  |                |
|                |                |     and base   |                |
|                |                |     expansion  |                |
|                |                |                |                |
|                |                | -   Optimize   |                |
|                |                |                |                |
|                |                |   construction |                |
|                |                |     queue to   |                |
|                |                |     build      |                |
|                |                |     through    |                |
|                |                |     tech tree  |                |
|                |                |                |                |
|                |                |    efficiently |                |
|                |                |                |                |
|                |                | -   Pursue     |                |
|                |                |                |                |
|                |                |  cross-species |                |
|                |                |     unit       |                |
|                |                |                |                |
|                |                |    acquisition |                |
|                |                |                |                |
|                |                |    (conversion |                |
|                |                |     or unit    |                |
|                |                |     request)   |                |
|                |                |     for tech   |                |
|                |                |     victory    |                |
|                |                |     completion |                |
|                |                |                |                |
|                |                | -   Accept     |                |
|                |                |     diplomatic |                |
|                |                |                |                |
|                |                |  relationships |                |
|                |                |     where      |                |
|                |                |                |                |
|                |                |   economically |                |
|                |                |     beneficial |                |
|                |                |                |                |
|                |                | -   Avoid      |                |
|                |                |     prolonged  |                |
|                |                |     military   |                |
|                |                |                |                |
|                |                |   engagements; |                |
|                |                |     redirect   |                |
|                |                |     resources  |                |
|                |                |     to         |                |
|                |                |     production |                |
+----------------+----------------+----------------+----------------+
| **5**          | **NPC          | -              |                |
|                | Factions**     |  Establishment |                |
|                |                |     Wizards:   |                |
|                |                |     hostile to |                |
|                |                |     robots by  |                |
|                |                |     default;   |                |
|                |                |     low robot  |                |
|                |                |     diplomacy  |                |
|                |                |                |                |
|                |                |  receptiveness |                |
|                |                |                |                |
|                |                | -   Rebellion  |                |
|                |                |     Wizards:   |                |
|                |                |     open to    |                |
|                |                |     both       |                |
|                |                |     species;   |                |
|                |                |     moderate   |                |
|                |                |     alignment; |                |
|                |                |     seeks      |                |
|                |                |     dialogue   |                |
|                |                |                |                |
|                |                | -   Inventors  |                |
|                |                |     and        |                |
|                |                |     Patrons:   |                |
|                |                |     treats     |                |
|                |                |     robots as  |                |
|                |                |     property;  |                |
|                |                |     se         |                |
|                |                | lf-interested; |                |
|                |                |     neutral to |                |
|                |                |     wizards    |                |
|                |                |                |                |
|                |                | -   Peaceful   |                |
|                |                |     Robots:    |                |
|                |                |     seeks      |                |
|                |                |                |                |
|                |                |   coexistence; |                |
|                |                |     high       |                |
|                |                |     treaty     |                |
|                |                |                |                |
|                |                | receptiveness; |                |
|                |                |     avoids     |                |
|                |                |     combat     |                |
|                |                |                |                |
|                |                | -   Militant   |                |
|                |                |     Robots:    |                |
|                |                |     aggressive |                |
|                |                |     posture;   |                |
|                |                |     low        |                |
|                |                |     diplomacy  |                |
|                |                |                |                |
|                |                | receptiveness; |                |
|                |                |     attacks    |                |
|                |                |     opp        |                |
|                |                | ortunistically |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   AI         | Resolve before |
|                | Tasks**        |     reaction   | coding         |
|                |                |     interval   |                |
|                |                |     in ticks   |                |
|                |                |     (how       |                |
|                |                |     frequently |                |
|                |                |     does each  |                |
|                |                |     AI         |                |
|                |                |     evaluate?) |                |
|                |                |                |                |
|                |                | -   AI         |                |
|                |                |     gathering  |                |
|                |                |     efficiency |                |
|                |                |     baseline   |                |
|                |                |     (% of      |                |
|                |                |                |                |
|                |                |    theoretical |                |
|                |                |     optimal)   |                |
|                |                |                |                |
|                |                | -   Military   |                |
|                |                |     AI         |                |
|                |                |     aggression |                |
|                |                |     threshold: |                |
|                |                |     alignment  |                |
|                |                |     value at   |                |
|                |                |     which      |                |
|                |                |     unprovoked |                |
|                |                |     attack     |                |
|                |                |     initiates  |                |
|                |                |                |                |
|                |                | -   NPC        |                |
|                |                |     faction    |                |
|                |                |     starting   |                |
|                |                |     alignment  |                |
|                |                |     values     |                |
|                |                |     toward     |                |
|                |                |     player and |                |
|                |                |     each other |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 11,      |                |                |                |
| Phase 12,      |                |                |                |
| Phase 14       |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 16:**  |                |                |                |
| Narrative      |                |                |                |
| Layer & LLM    |                |                |                |
| Integration    |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Wire the LLM   |                |                |                |
| abstraction    |                |                |                |
| layer to game  |                |                |                |
| events.        |                |                |                |
| Implement      |                |                |                |
| dialogue       |                |                |                |
| generation,    |                |                |                |
| quest          |                |                |                |
| generation,    |                |                |                |
| named          |                |                |                |
| character      |                |                |                |
| designation,   |                |                |                |
| and cultural   |                |                |                |
| victory        |                |                |                |
| integration.   |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Context      | -   Implement  | End-to-end LLM |
|                | S              |     Game       | flow: Talk     |
|                | erialization** | StateSnapshot: | action         |
|                |                |     serializes | generates      |
|                |                |     relevant   | contextual     |
|                |                |     game state | dialogue,      |
|                |                |     fields     | quests created |
|                |                |     into LLM   | and            |
|                |                |     prompt     | completable    |
|                |                |     context    | with           |
|                |                |                | mechanical     |
|                |                | -   Include:   | rewards, named |
|                |                |     faction    | characters     |
|                |                |     power      | designated.    |
|                |                |     balance,   | Both Ollama    |
|                |                |     diplomatic | and hosted API |
|                |                |                | providers      |
|                |                | relationships, | verified.      |
|                |                |     win        |                |
|                |                |     condition  |                |
|                |                |     progress,  |                |
|                |                |     named      |                |
|                |                |     character  |                |
|                |                |     roster,    |                |
|                |                |     last N     |                |
|                |                |     dialogue   |                |
|                |                |     exchanges, |                |
|                |                |     active     |                |
|                |                |     quests     |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     faction    |                |
|                |                |     POV        |                |
|                |                |     filter:    |                |
|                |                |     snapshot   |                |
|                |                |     is framed  |                |
|                |                |     from       |                |
|                |                |     wizard or  |                |
|                |                |     robot      |                |
|                |                |                |                |
|                |                |    perspective |                |
|                |                |     based on   |                |
|                |                |     player     |                |
|                |                |     faction    |                |
|                |                |                |                |
|                |                | -   Keep       |                |
|                |                |     payload    |                |
|                |                |     to         |                |
|                |                | ken-efficient: |                |
|                |                |     summarize  |                |
|                |                |     large      |                |
|                |                |                |                |
|                |                |    collections |                |
|                |                |     rather     |                |
|                |                |     than       |                |
|                |                |                |                |
|                |                |    enumerating |                |
|                |                |     every      |                |
|                |                |     entity     |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Dialogue**   | -   Trigger on |                |
|                |                |     Talk       |                |
|                |                |     action     |                |
|                |                |     between    |                |
|                |                |     eligible   |                |
|                |                |     units      |                |
|                |                |                |                |
|                |                | -   Build      |                |
|                |                |     context    |                |
|                |                |     snapshot + |                |
|                |                |     speaker    |                |
|                |                |                |                |
|                |                |   identities + |                |
|                |                |                |                |
|                |                |   relationship |                |
|                |                |     context    |                |
|                |                |                |                |
|                |                | -   Send async |                |
|                |                |     to         |                |
|                |                |     INar       |                |
|                |                | rativeService; |                |
|                |                |     display    |                |
|                |                |     loading    |                |
|                |                |     state in   |                |
|                |                |     dialogue   |                |
|                |                |     panel      |                |
|                |                |     while      |                |
|                |                |     awaiting   |                |
|                |                |                |                |
|                |                | -   Receive    |                |
|                |                |     and        |                |
|                |                |     display    |                |
|                |                |     dialogue   |                |
|                |                |     with       |                |
|                |                |     speaker    |                |
|                |                |     portraits  |                |
|                |                |                |                |
|                |                | -   Store      |                |
|                |                |     named      |                |
|                |                |     character  |                |
|                |                |     dialogue   |                |
|                |                |     in history |                |
|                |                |     for        |                |
|                |                |     continuity |                |
|                |                |                |                |
|                |                | -   Dialogue   |                |
|                |                |     between    |                |
|                |                |     op         |                |
|                |                | posing/neutral |                |
|                |                |     factions   |                |
|                |                |     may        |                |
|                |                |     surface    |                |
|                |                |                |                |
|                |                |    information |                |
|                |                |     about      |                |
|                |                |     their      |                |
|                |                |     state      |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Quest        | -   After      |                |
|                | System**       |     dialogue,  |                |
|                |                |     LLM        |                |
|                |                |     evaluates  |                |
|                |                |     whether to |                |
|                |                |     generate a |                |
|                |                |     quest      |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     quest      |                |
|                |                |     types:     |                |
|                |                |     destroy    |                |
|                |                |     building,  |                |
|                |                |     escort     |                |
|                |                |     unit,      |                |
|                |                |     secure     |                |
|                |                |     resource,  |                |
|                |                |     broker     |                |
|                |                |     alliance   |                |
|                |                |                |                |
|                |                | -   Each quest |                |
|                |                |     type maps  |                |
|                |                |     to a       |                |
|                |                |     concrete   |                |
|                |                |     mechanical |                |
|                |                |     reward     |                |
|                |                |                |                |
|                |                | -   Display    |                |
|                |                |     quest in   |                |
|                |                |     dialogue   |                |
|                |                |     panel; add |                |
|                |                |     to active  |                |
|                |                |     objectives |                |
|                |                |                |                |
|                |                | -   Implement  |                |
|                |                |     quest      |                |
|                |                |     completion |                |
|                |                |     detection  |                |
|                |                |     and reward |                |
|                |                |     execution  |                |
|                |                |                |                |
|                |                | -   Stale      |                |
|                |                |     quests     |                |
|                |                |     replaced   |                |
|                |                |     by more    |                |
|                |                |     relevant   |                |
|                |                |     ones when  |                |
|                |                |     match      |                |
|                |                |     state      |                |
|                |                |     changes    |                |
|                |                |                |                |
|                |                |  significantly |                |
|                |                |                |                |
|                |                | -   Cultural   |                |
|                |                |     path       |                |
|                |                |     quests     |                |
|                |                |     award      |                |
|                |                |     culture    |                |
|                |                |     progress   |                |
|                |                |     toward     |                |
|                |                |     cultural   |                |
|                |                |     victory    |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Named        | -   On unit    |                |
|                | Characters**   |     creation:  |                |
|                |                |     send       |                |
|                |                |     context to |                |
|                |                |     LLM;       |                |
|                |                |     receive    |                |
|                |                |     named      |                |
|                |                |     character  |                |
|                |                |     decision   |                |
|                |                |                |                |
|                |                | -   Assign     |                |
|                |                |     name +     |                |
|                |                |     narrative  |                |
|                |                |     role       |                |
|                |                |                |                |
|                |                | (hero/villain) |                |
|                |                |     from LLM   |                |
|                |                |     response   |                |
|                |                |                |                |
|                |                | -   Update     |                |
|                |                |     portrait   |                |
|                |                |     system     |                |
|                |                |     with named |                |
|                |                |     character  |                |
|                |                |                |                |
|                |                |    designation |                |
|                |                |                |                |
|                |                | -   Named      |                |
|                |                |     character  |                |
|                |                |     dea        |                |
|                |                | th/conversion: |                |
|                |                |     send event |                |
|                |                |     to LLM for |                |
|                |                |     narrative  |                |
|                |                |                |                |
|                |                | acknowledgment |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   Finalized  | Resolve before |
|                | Tasks**        |     LLM        | coding         |
|                |                |     context    |                |
|                |                |     schema     |                |
|                |                |     (field     |                |
|                |                |     list and   |                |
|                |                |                |                |
|                |                |  serialization |                |
|                |                |     format)    |                |
|                |                |                |                |
|                |                | -   Prompt     |                |
|                |                |     templates  |                |
|                |                |     for        |                |
|                |                |     dialogue,  |                |
|                |                |     quest, and |                |
|                |                |     named      |                |
|                |                |     character  |                |
|                |                |                |                |
|                |                |    designation |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
|                |                |                |                |
|                |                | -   Max        |                |
|                |                |     context    |                |
|                |                |     history    |                |
|                |                |     turns      |                |
|                |                |     before     |                |
|                |                |     truncation |                |
|                |                |                |                |
|                |                | -   Quest      |                |
|                |                |     reward     |                |
|                |                |     mapping:   |                |
|                |                |     quest type |                |
|                |                |     →          |                |
|                |                |     mechanical |                |
|                |                |     outcome    |                |
|                |                |                |                |
|                |                | -   Cultural   |                |
|                |                |     victory    |                |
|                |                |     progress   |                |
|                |                |     increment  |                |
|                |                |     per quest  |                |
|                |                |     completion |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 1        |                |                |                |
| (abstraction   |                |                |                |
| layer), Phase  |                |                |                |
| 6, Phase 12    |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 17:**  |                |                |                |
| Win Conditions |                |                |                |
| & Match End    |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement      |                |                |                |
| detection      |                |                |                |
| logic for all  |                |                |                |
| three win      |                |                |                |
| conditions,    |                |                |                |
| faction        |                |                |                |
| elimination,   |                |                |                |
| match end      |                |                |                |
| handling, and  |                |                |                |
| the            |                |                |                |
| appro          |                |                |                |
| aching-victory |                |                |                |
| alert.         |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **Military     | -   Track      | All three win  |
|                | Victory**      |     living     | conditions     |
|                |                |     leader per | detectable and |
|                |                |     faction    | correctly      |
|                |                |                | triggered.     |
|                |                | -   Faction    | Match end      |
|                |                |     eliminated | screen         |
|                |                |     when       | displays.      |
|                |                |     leader HP  | Appro          |
|                |                |     reaches 0  | aching-victory |
|                |                |                | alert fires at |
|                |                | -   Military   | configured     |
|                |                |     victory:   | threshold.     |
|                |                |     only one   |                |
|                |                |     faction    |                |
|                |                |     has a      |                |
|                |                |     living     |                |
|                |                |     leader     |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |   Spy-expelled |                |
|                |                |     leaders    |                |
|                |                |     exposed to |                |
|                |                |     attack     |                |
|                |                |     (building  |                |
|                |                |     exit event |                |
|                |                |     triggers   |                |
|                |                |     after      |                |
|                |                |     expulsion) |                |
+----------------+----------------+----------------+----------------+
| **2**          | **Cultural     | -   Track      |                |
|                | Victory**      |     civilian   |                |
|                |                |     population |                |
|                |                |     count at   |                |
|                |                |     max XP     |                |
|                |                |                |                |
|                |                | -   Cultural   |                |
|                |                |     victory:   |                |
|                |                |     all        |                |
|                |                |     civilians  |                |
|                |                |     at maximum |                |
|                |                |     population |                |
|                |                |     and all at |                |
|                |                |     max XP     |                |
|                |                |     level      |                |
|                |                |                |                |
|                |                | -   LLM quest  |                |
|                |                |                |                |
|                |                |    completions |                |
|                |                |     contribute |                |
|                |                |     culture    |                |
|                |                |     progress   |                |
+----------------+----------------+----------------+----------------+
| **3**          | *              | -   Maintain   |                |
|                | *Technological |     tech tree  |                |
|                | Victory**      |     completion |                |
|                |                |     tracker:   |                |
|                |                |     set of all |                |
|                |                |     unit types |                |
|                |                |     and        |                |
|                |                |     building   |                |
|                |                |     types,     |                |
|                |                |     both       |                |
|                |                |     species    |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |  Cross-species |                |
|                |                |     items      |                |
|                |                |     require:   |                |
|                |                |     converted  |                |
|                |                |     opposing   |                |
|                |                |     unit OR    |                |
|                |                |     received   |                |
|                |                |     allied     |                |
|                |                |     unit of    |                |
|                |                |     opposing   |                |
|                |                |     species    |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |  Technological |                |
|                |                |     victory:   |                |
|                |                |     all items  |                |
|                |                |     in         |                |
|                |                |     completion |                |
|                |                |     set        |                |
|                |                |                |                |
|                |                |    constructed |                |
|                |                |     at least   |                |
|                |                |     once       |                |
+----------------+----------------+----------------+----------------+
| **4**          | **Match End**  | -   Detect win |                |
|                |                |     condition  |                |
|                |                |                |                |
|                |                |    achievement |                |
|                |                |     each tick  |                |
|                |                |     for all    |                |
|                |                |     factions   |                |
|                |                |     (first to  |                |
|                |                |     complete   |                |
|                |                |     wins)      |                |
|                |                |                |                |
|                |                | -   Display    |                |
|                |                |     victory /  |                |
|                |                |     defeat     |                |
|                |                |     screen:    |                |
|                |                |     winning    |                |
|                |                |     faction,   |                |
|                |                |     win        |                |
|                |                |     condition  |                |
|                |                |     achieved   |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Approaching |                |
|                |                |     victory    |                |
|                |                |     alert:     |                |
|                |                |     fire when  |                |
|                |                |     any        |                |
|                |                |     faction    |                |
|                |                |     reaches    |                |
|                |                |     threshold  |                |
|                |                |     % of any   |                |
|                |                |     win        |                |
|                |                |     condition  |                |
|                |                |                |                |
|                |                | -   Record     |                |
|                |                |     match      |                |
|                |                |     result to  |                |
|                |                |     Postgres   |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   Cultural   | Resolve before |
|                | Tasks**        |     victory    | coding         |
|                |                |     threshold: |                |
|                |                |     max        |                |
|                |                |     civilian   |                |
|                |                |     population |                |
|                |                |     target and |                |
|                |                |     max XP     |                |
|                |                |     value      |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |  Technological |                |
|                |                |     victory    |                |
|                |                |     item list: |                |
|                |                |     full       |                |
|                |                |                |                |
|                |                |    enumeration |                |
|                |                |     of         |                |
|                |                |     required   |                |
|                |                |     units +    |                |
|                |                |     buildings  |                |
|                |                |     including  |                |
|                |                |                |                |
|                |                |  cross-species |                |
|                |                |                |                |
|                |                | -   Victory    |                |
|                |                |     alert      |                |
|                |                |     proximity  |                |
|                |                |     threshold  |                |
|                |                |     percentage |                |
|                |                |     (from      |                |
|                |                |     Phase 0)   |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 12,      |                |                |                |
| Phase 13,      |                |                |                |
| Phase 16       |                |                |                |
+----------------+----------------+----------------+----------------+

+----------------+----------------+----------------+----------------+
| **Phase 18:**  |                |                |                |
| Alert &        |                |                |                |
| Notification   |                |                |                |
| System         |                |                |                |
+----------------+----------------+----------------+----------------+
| **Objective:** |                |                |                |
| Implement the  |                |                |                |
| complete alert |                |                |                |
| system across  |                |                |                |
| all categories |                |                |                |
| with audio     |                |                |                |
| cues, minimap  |                |                |                |
| flashing, and  |                |                |                |
| camera-jump    |                |                |                |
| navigation.    |                |                |                |
+----------------+----------------+----------------+----------------+
| **\#**         | **Category**   | **Tasks**      | **Milestone**  |
+----------------+----------------+----------------+----------------+
| **1**          | **In           | -   Typed      | All alert      |
|                | frastructure** |     alert      | categories     |
|                |                |     event      | firing with    |
|                |                |     queue with | log entries,   |
|                |                |     category,  | minimap        |
|                |                |     timestamp, | flashes, and   |
|                |                |     and        | audio cues.    |
|                |                |     associated | Camera-jump    |
|                |                |     e          | working for    |
|                |                | ntity/location | all types.     |
|                |                |                |                |
|                |                | -   Persistent |                |
|                |                |     alert log  |                |
|                |                |     in HUD     |                |
|                |                |     with       |                |
|                |                |                |                |
|                |                |   newest-first |                |
|                |                |     ordering   |                |
|                |                |                |                |
|                |                | -              |                |
|                |                | Click-to-jump: |                |
|                |                |     clicking   |                |
|                |                |     alert      |                |
|                |                |     centers    |                |
|                |                |     camera on  |                |
|                |                |     related    |                |
|                |                |     entity     |                |
|                |                |                |                |
|                |                | -   Minimap    |                |
|                |                |     flash for  |                |
|                |                |                |                |
|                |                |  high-priority |                |
|                |                |     alerts     |                |
|                |                |     (combat,   |                |
|                |                |                |                |
|                |                |    conversion) |                |
+----------------+----------------+----------------+----------------+
| **2**          | **All Alert    | -   Combat:    |                |
|                | Categories**   |     friendly   |                |
|                |                |                |                |
|                |                |  unit/building |                |
|                |                |     under      |                |
|                |                |     attack;    |                |
|                |                |     friendly   |                |
|                |                |                |                |
|                |                |  unit/building |                |
|                |                |     destroyed  |                |
|                |                |     ---        |                |
|                |                |     audio +    |                |
|                |                |     minimap    |                |
|                |                |     flash      |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Conversion: |                |
|                |                |     friendly   |                |
|                |                |     unit       |                |
|                |                |     targeted   |                |
|                |                |     by         |                |
|                |                |     Convert;   |                |
|                |                |     friendly   |                |
|                |                |     unit       |                |
|                |                |                |                |
|                |                |   successfully |                |
|                |                |     converted  |                |
|                |                |     ---        |                |
|                |                |     audio +    |                |
|                |                |     minimap    |                |
|                |                |     flash      |                |
|                |                |                |                |
|                |                | -   Resources: |                |
|                |                |     wood/water |                |
|                |                |     below      |                |
|                |                |     threshold; |                |
|                |                |     action     |                |
|                |                |     failed due |                |
|                |                |     to         |                |
|                |                |                |                |
|                |                |   insufficient |                |
|                |                |     resources; |                |
|                |                |     mana       |                |
|                |                |     critically |                |
|                |                |     low        |                |
|                |                |     (wizard    |                |
|                |                |     only)      |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Production: |                |
|                |                |     unit       |                |
|                |                |     production |                |
|                |                |     complete;  |                |
|                |                |     research   |                |
|                |                |     upgrade    |                |
|                |                |     complete   |                |
|                |                |                |                |
|                |                | -   Narrative: |                |
|                |                |     quest      |                |
|                |                |     generated; |                |
|                |                |     named      |                |
|                |                |     character  |                |
|                |                |                |                |
|                |                |    designated; |                |
|                |                |     named      |                |
|                |                |     character  |                |
|                |                |     killed or  |                |
|                |                |     converted  |                |
|                |                |                |                |
|                |                | -   Diplomacy: |                |
|                |                |     request    |                |
|                |                |     received;  |                |
|                |                |                |                |
|                |                |    treaty/open |                |
|                |                |     borders    |                |
|                |                |                |                |
|                |                |    terminated; |                |
|                |                |     alignment  |                |
|                |                |     changed    |                |
|                |                |                |                |
|                |                |  significantly |                |
|                |                |                |                |
|                |                | -   Victory:   |                |
|                |                |     any        |                |
|                |                |     faction    |                |
|                |                |                |                |
|                |                |    approaching |                |
|                |                |     win        |                |
|                |                |     condition  |                |
|                |                |     at         |                |
|                |                |     configured |                |
|                |                |     threshold  |                |
+----------------+----------------+----------------+----------------+
| **3**          | **Audio**      | -   Integrate  |                |
|                |                |     Howler.js  |                |
|                |                |     for Web    |                |
|                |                |     Audio API  |                |
|                |                |     management |                |
|                |                |                |                |
|                |                | -   Distinct   |                |
|                |                |     audio cue  |                |
|                |                |     for combat |                |
|                |                |     alert and  |                |
|                |                |     conversion |                |
|                |                |     alert      |                |
|                |                |                |                |
|                |                | -              |                |
|                |                |    Placeholder |                |
|                |                |     cues for   |                |
|                |                |     remaining  |                |
|                |                |     categories |                |
|                |                |                |                |
|                |                |   (replaceable |                |
|                |                |     in final   |                |
|                |                |     polish)    |                |
+----------------+----------------+----------------+----------------+
| **TBD**        | **Open Design  | -   Victory    | Resolve before |
|                | Tasks**        |     alert      | coding         |
|                |                |     proximity  |                |
|                |                |     threshold  |                |
|                |                |     (shared    |                |
|                |                |     with       |                |
|                |                |     Phase 17)  |                |
+----------------+----------------+----------------+----------------+
| **D            |                |                |                |
| ependencies:** |                |                |                |
| Phase 5, Phase |                |                |                |
| 12, Phase 14,  |                |                |                |
| Phase 16,      |                |                |                |
| Phase 17       |                |                |                |
+----------------+----------------+----------------+----------------+

**4. Open Design Tasks --- Complete TBD Register**

All items below must be resolved before the blocking phase can be fully
coded. Phase 0 is the gating phase for all of them.

**4.1 Unit Stats**

  ----------------------------------- --------------------------------------------- --------------------
  **Stat**                            **Applies To**                                **Blocking Phase**
  Base HP                             All robot platforms; all wizard units         7, 9
  Damage per attack                   All combat units; all Evoker spells           12
  Attack range                        All ranged and spell-based units              12
  Vision range                        All units and buildings                       4
  Speed (movement)                    All units                                     7, 9
  Capacity (carry / occupant)         All gatherers; all buildings                  11
  Armor value                         All units; armor model (flat vs %) also TBD   12
  Charisma                            Civilians and leaders                         12
  Wood vs. metal stat differentials   All robot platforms in both material states   7
  ----------------------------------- --------------------------------------------- --------------------

**4.2 Resource Costs & Timings**

  ----------------------------------------------------------------- --------------------
  **Item**                                                          **Blocking Phase**
  All unit production costs (wood + water per unit type)            7, 9
  All building construction costs (wood + water per building)       8, 10
  All research upgrade costs and durations                          7, 9, 10
  Wood deposit initial quantity and replenishment policy            11
  Water Extractor and Watermill auto-collection rate per tick       11
  Resource alert thresholds (low-stock levels for wood and water)   18
  ----------------------------------------------------------------- --------------------

**4.3 Mana System**

  ------------------------------------------------------------------- --------------------
  **Item**                                                            **Blocking Phase**
  Passive mana generation rate per wizard unit per tick               9
  Mana Reservoir generation rate per tick                             10
  Mana Reservoir proximity boost multiplier and radius                10
  Mana cost: Wizard Missiles, Ice Blast, Fiery Explosion (per cast)   9
  Mana cost: Mana Shield (per tick while active)                      9
  Ice Blast: slow duration and speed reduction percentage             9
  ------------------------------------------------------------------- --------------------

**4.4 Formulas & Mechanics**

  -------------------------------------------------------------- --------------------
  **Item**                                                       **Blocking Phase**
  Conversion formula: charisma vs. target HP% and target level   12
  Conversion duration: ticks of sustained adjacency required     12
  Armor model decision: flat reduction vs. percentage            12
  XP gain rate per action for each unit type                     6
  Surf dual-XP gain rates (gathering vs. building separately)    7, 9
  Core per-stat XP gain rates for each activity type             7
  Third Space: XP boost multiplier and area-of-effect radius     8
  Amphitheatre: base boost per building and stacking formula     10
  -------------------------------------------------------------- --------------------

**4.5 AI Parameters**

  ------------------------------------------------------------------------- --------------------
  **Item**                                                                  **Blocking Phase**
  AI reaction interval: ticks between decision evaluations per faction      15
  AI gathering efficiency baseline                                          15
  Military AI aggression threshold: alignment value for unprovoked attack   15
  NPC faction starting alignment values toward player and each other        15
  ------------------------------------------------------------------------- --------------------

**4.6 Victory Conditions**

  ------------------------------------------------------------------- --------------------
  **Item**                                                            **Blocking Phase**
  Cultural victory: max civilian population target                    17
  Cultural victory: max XP threshold for all civilians                17
  Technological victory: full item list for both species              17
  Victory alert proximity threshold (% of win condition completion)   17, 18
  ------------------------------------------------------------------- --------------------

**4.7 LLM Design**

  -------------------------------------------------------------- --------------------
  **Item**                                                       **Blocking Phase**
  GameStateSnapshot: full field list for LLM context             16
  Prompt template: dialogue generation                           16
  Prompt template: quest generation                              16
  Prompt template: named character designation                   16
  Context window strategy: max history turns before truncation   16
  Quest reward mapping: quest type to mechanical outcome         16
  Cultural victory progress increment per quest                  16, 17
  Narrative perspective rules: wizard vs. robot POV framing      16
  LLM provider decision for production environment               1
  -------------------------------------------------------------- --------------------

**5. Technical Risks & Notes**

**5.1 LLM Call Latency**

> **RISK:** LLM calls during gameplay must never block the game loop.
> Run all INarrativeService calls asynchronously from a worker dyno.
> Show a brief loading state in the dialogue panel while awaiting. Quest
> generation should be queued and delivered after the loop has continued
> without interruption.

**5.2 Robot Faction Scale Performance**

> **RISK:** The robot faction is designed for large simultaneous unit
> counts. The spatial index from Phase 2 is critical. Profile the game
> loop under 100+ robot units before Phase 15 adds AI opponents that
> multiply unit counts further. Target: game loop tick completes in
> under 8ms at maximum realistic unit count.

**5.3 Heroku Dyno Tier**

> **RISK:** Heroku deployment is deferred --- run locally through all
> development phases. When deployment is eventually needed: Eco and
> Basic dynos sleep after inactivity, which is unacceptable for a
> real-time game. Use Standard-1X minimum for the web process dyno.
> Budget approximately \$7/month per dyno.

**5.4 Territory Boundary Computation**

Recomputing building cluster boundaries every tick will be expensive at
scale. Compute boundaries event-driven: only when the set of buildings
changes (construction, destruction). Cache the resulting boundary
polygon and invalidate on change events only.

**5.5 Fog of War Rendering**

Updating the fog mask every frame on a large map is costly. Use a PixiJS
RenderTexture as an offscreen fog buffer. Re-bake the fog texture only
when visibility state changes rather than every frame. Composite it over
the game view as a post-process overlay.

**5.6 Single-Player vs. Future Multiplayer**

The spec describes a single-player game. If multiplayer is ever added,
the architecture choice between client-authoritative (simpler now,
harder to retrofit) and server-authoritative (harder now,
multipayer-ready) must be made in Phase 0. Server-authoritative is
recommended for long-term flexibility.

**6. Phase Dependency Summary**

  ----------- ---------------------------------------------- -------------------------------------------------
  **Phase**   **Name**                                       **Depends On**
  Phase 0     Design Finalization & Architecture Decisions   Functional Specification Rev. 1
  Phase 1     Project Foundation & Infrastructure            Phase 0 complete
  Phase 2     Game Loop & Core Engine                        Phase 1
  Phase 3     Map & World Generation                         Phase 2
  Phase 4     Fog of War                                     Phase 3
  Phase 5     Core UI Framework                              Phase 2, Phase 3
  Phase 6     Unit Systems --- Foundation                    Phase 2, Phase 5
  Phase 7     Robot Faction                                  Phase 6
  Phase 8     Robot Buildings                                Phase 7
  Phase 9     Wizard Faction                                 Phase 6
  Phase 10    Wizard Buildings                               Phase 9
  Phase 11    Resource & Economy Systems                     Phase 7, Phase 9
  Phase 12    Combat System                                  Phase 6, Phase 7, Phase 9
  Phase 13    Territory & Faction Stats                      Phase 6, Phase 8, Phase 10
  Phase 14    Diplomacy System                               Phase 5, Phase 6
  Phase 15    AI Opponents                                   Phase 11, Phase 12, Phase 14
  Phase 16    Narrative Layer & LLM Integration              Phase 1 (abstraction layer), Phase 6, Phase 12
  Phase 17    Win Conditions & Match End                     Phase 12, Phase 13, Phase 16
  Phase 18    Alert & Notification System                    Phase 5, Phase 12, Phase 14, Phase 16, Phase 17
  ----------- ---------------------------------------------- -------------------------------------------------

**7. Working with Claude Code**

This plan is intended to be implemented primarily by Claude Code. This
section defines the collaboration model: what Claude Code handles
autonomously, what requires your input or decision, and the working
conventions that Claude Code must follow consistently throughout
implementation.

**7.1 Responsibility Matrix**

Use this table to quickly identify who owns each area of the project.

  ------------------------ ---------------------------------------------------------------------------------------------- ----------------------------------------------------------------------------------
  **Area**                 **Claude Code Handles**                                                                        **Requires Your Input**
  Monorepo & CI/CD         Initialize pnpm workspace, Turborepo, GitHub Actions pipeline, Heroku deploy pipeline          Heroku account credentials, GitHub repo name, production app names
  Game engine & systems    Game loop, entity system, A\* pathfinding, event bus, fog of war, all core game logic          Architecture decisions documented in Phase 0 ADR
  Faction implementation   All robot and wizard units, buildings, abilities, spells, Core system, mana system             Stat values from the Phase 0 Design Values Document
  UI components            All HTML/CSS React components, Zustand wiring, CSS Modules, animations, panel transitions      Visual design: color palette, typography, component mockups from Phase 0
  AI opponents             AI controller, all three archetypes, all five NPC faction behavioral profiles                  Aggression thresholds, reaction intervals, starting alignment values (Phase 0)
  LLM integration          INarrativeService abstraction, provider implementations, context serialization, quest system   Prompt templates, production LLM provider choice, context schema (Phase 0)
  Balance values           Make sensible initial guesses; place every value in typed config files                         Override values that don't feel right during playtesting; no code changes needed
  Art assets               Kenney CC0 placeholder sprites wired to typed asset manifest                                   Final art assets when ready; swapping sprites requires no code changes
  Audio                    Howler.js integration, audio event wiring, placeholder Kenney audio files                      Final SFX and music files; audio architecture decision (Phase 0)
  Testing                  Write tests alongside each feature; Vitest unit tests; Playwright E2E                          None --- tests are written automatically as part of every phase
  Version control          Commit and push directly to main after each completed phase milestone                          Review the completed milestone; request changes if needed
  ------------------------ ---------------------------------------------------------------------------------------------- ----------------------------------------------------------------------------------

**7.2 Config-Over-Code Policy**

Every numeric value, balance parameter, and piece of UI text that a
human might want to change must live in a typed config file in
/packages/shared/config/. Nothing is hardcoded in game logic. This is a
core architectural constraint enforced from Phase 1 forward.

  ---------------------- ---------------------------------------------------------------------------------------------------------------
  **Config File**        **Contains**
  buildingStats.ts       HP, capacity, vision range for every building type
  resourceCosts.ts       All unit production costs (wood + water), all building construction costs, all research costs and durations
  spellCosts.ts          Mana cost per spell, Mana Shield drain rate, mana generation rates, proximity boost multiplier and radius
  aiParameters.ts        Reaction interval (ticks), aggression threshold, gathering efficiency baseline, NPC starting alignment values
  victoryThresholds.ts   Cultural victory population target, max XP threshold, victory alert proximity %, tech victory item list
  uiText.ts              All displayed strings: button labels, panel titles, alert messages, tooltip text, victory/defeat screen copy
  mapConfig.ts           Map size tile dimensions, terrain movement costs, resource deposit quantities, auto-collection rates
  ---------------------- ---------------------------------------------------------------------------------------------------------------

> **NOTE:** All config objects must be typed with TypeScript interfaces
> defined in /packages/shared/types/. If a value is used in both
> frontend and backend, it lives in /packages/shared/config/ and is
> imported by both packages. Never duplicate a constant.

**7.3 Sensible Defaults for TBD Values**

Claude Code does not block on TBD values. It makes reasonable
gameplay-informed initial guesses and places them directly in the config
files with a short comment explaining the rationale. Values are chosen
to produce roughly balanced, playable gameplay using standard RTS
conventions.

-   Basic combat unit HP: 80--120. Damage: 3--5 hits to kill a same-tier
    unit. Ranged attack range: 4--6 tiles. Melee: 1 tile.

-   Resource costs: light units 20--40 wood + 10--20 water. Heavy units
    60--80 wood + 30--40 water. Buildings scale proportionally.

-   Production times: light units 15--20 seconds at 60 ticks/sec. Heavy
    units 30--45 seconds. Buildings 20--60 seconds.

-   Mana: passive generation 1--2 per tick per wizard unit. Mana
    Reservoir 5--10 per tick. Spell costs 20--60 mana.

-   Conversion: 5--10 seconds of sustained adjacency. Success:
    charisma \> target\_level + (target\_hp\_pct × 10).

-   XP per kill: 10--25 depending on target strength. Level thresholds
    double: 2, 4, 8, 16 ... 1024.

> **NOTE:** Every initial guess must include a brief comment in the
> config file: // Initial guess: adjust after playtesting. This signals
> the value is intentional and tunable, not an oversight.

**7.4 Version Control Workflow**

Claude Code pushes directly to main after completing each phase
milestone. No pull requests are required. Commit messages describe what
was implemented, not which files changed.

-   Commit once per completed phase milestone, not per file edit.
    Intermediate commits are allowed but every commit must leave the
    codebase in a runnable, passing-tests state.

-   Commit message format: feat(phase-N): \[milestone description\].
    Example: feat(phase-2): game loop and entity system with A\*
    pathfinding

-   Never commit with failing tests. Fix failures before pushing.

**7.5 Test-as-You-Go Policy**

Tests are written alongside each feature as part of the same phase ---
not in a separate testing pass after implementation. Each phase
milestone must be verifiable by the test suite before the phase is
considered complete.

-   Unit tests (Vitest): game logic, entity systems, pathfinding, combat
    formulas, mana calculations, config value validation, LLM
    abstraction layer.

-   Integration tests (Vitest): game loop tick correctness, full
    gathering loop, win condition detection, diplomacy state
    transitions.

-   E2E tests (Playwright): unit selection and command dispatch,
    diplomacy panel flow, dialogue panel, match start and end screens.

-   Coverage target: 85%+ on the /game directory before proceeding to
    Phase 15 (AI) where unit counts multiply.

**7.6 Phase 0: Collaboration Session**

Phase 0 is a joint working session between Claude Code and Zeke. No
implementation code is written during Phase 0. Its sole output is the
two documents that gate all subsequent phases.

-   Design Values Document: all stat values, resource costs, spell
    costs, mana rates, formulas, and victory thresholds fully filled in.
    This becomes the source for initial config file values in Phase 1.

-   Architecture Decision Record (ADR): binding answers to every open
    architecture question in Section 2 of this plan. Documents the
    reasoning so future sessions have context.

Claude Code's role in Phase 0: review the functional spec and this
development plan, surface any remaining ambiguities or questions, and
help think through design decisions. Zeke makes all final calls. No
implementation phase begins until Phase 0 is explicitly signed off.

**7.7 Session Boundary Guidance**

Each Claude Code session should begin by reading CLAUDE.md, which is the
source of truth for all confirmed architectural decisions. Sessions that
resume mid-phase should also re-read the relevant phase section of this
plan.

-   At the start of each session: read CLAUDE.md, check git status,
    identify the target phase milestone for this session.

-   At the end of each session: commit completed work. If mid-phase,
    leave a brief TODO comment in the active file noting the next step
    so the next session can orient quickly.

-   If a decision seems to conflict with CLAUDE.md or the ADR: stop and
    flag it rather than silently diverging from the architectural
    record.

-   When a TBD value is provided (via CLAUDE.md update or direct
    instruction): update the relevant config file, update the comment
    from \'Initial guess\' to \'Confirmed\', and note the change in the
    commit message.
