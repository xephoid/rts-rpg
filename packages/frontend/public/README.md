# Placeholder Art Assets

Sourced from free CC0 Kenney packs in the project root. These are **placeholders only** — swap for final art when available.

## Source packs

| Pack | Used for |
|---|---|
| `kenney_medieval-rts` (Retina) | Wizard faction units, buildings, NPC wizard leaders |
| `kenney_sci-fi-rts` (Retina) | Robot faction units, buildings, NPC robot leaders |
| `kenney_toon-characters` | Unit portraits (head.png) |
| `kenney_tiny-town` | A few UI icons (cursor, button, hammer) |

**Important:** Sci-fi Retina and Default-size folders contain **different sprites**, not just different resolutions. All mappings reference Retina. If you need smaller versions, generate them from Retina — do not swap to Default-size by filename.

## Faction color conventions

Kenney RTS packs ship four color variants per unit. Assigned:

| Variant | Faction |
|---|---|
| Medieval blue (units 01-06) | Wizards (player) |
| Medieval red (units 07-12) | Establishment Wizards (NPC) |
| Medieval green (units 13-18) | Rebellion Wizards (NPC) |
| Medieval yellow (units 19-24) | Inventors & Patrons (NPC) |
| Sci-fi blue (units 01-10) | Robots (player) |
| Sci-fi orange (units 11-22) | Militant Robots (NPC) |
| Sci-fi green (units 23-34) | Peaceful Robots (NPC) |
| Sci-fi grey (units 35-46) | Reserved |

## Known gaps (need custom art)

- **Dragon** — no dragon sprite in any pack. Using medieval campfire as stand-in.
- **Robot air unit (Probe Platform)** — no air sprite; using small blue infantry.
- **Material variants (Wood vs Metal)** — sci-fi pack has no construction-material variants; same sprite used for both.
- **HUD, panels, cursors, selection rings, health bars** — mostly TODO. Most will be drawn in-engine anyway.
- **Spell/combat FX** (missiles, ice blast, mana shield, smoke, death effects) — all TODO.

See `_PREVIEW.png` for a visual grid of every placeholder, and `art_asset_tracker.xlsx` for the full per-entity mapping (column "Placeholder Source").
