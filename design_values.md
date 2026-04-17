# Design Values Document — Neither ___ Nor Gears

Version 1.0 · April 2026
Status: **Phase 0 Draft — pending Zeke sign-off**

All values marked `// Initial guess` are proposed starting points for playtesting.
When Zeke confirms a value, the comment changes to `// Confirmed`.
Values map directly to config files in `/packages/shared/config/`.

---

## 1. Unit Stats — `unitStats.ts`

### 1.1 Sizing Reference

| Target | Range |
|---|---|
| Basic unit HP | 80–120 |
| Damage per hit | same-tier dies in 3–5 hits |
| Ranged attack range | 4–6 tiles |
| Melee attack range | 1 tile |
| Vision range (standard) | 4–6 tiles |
| Vision range (extended) | 7–10 tiles |

### 1.2 Robot Platforms

All robot platforms have two HP/armor values: **wood** (base material) and **metal** (after upgrade).
The Core itself has no platform stats — stats listed are for the Core+Platform combined entity.

#### Core (unattached — civilian mode)
```
// Initial guess: civilian only, no combat capability
hp: 60,
speed: 3,           // tiles/sec
charisma: 5,        // moderate — can convert but not optimized
armor: 0,
visionRange: 4,
capacity: 0,        // no carrying capacity unattached
```

#### Water Collection Platform
```
// Initial guess: gatherer — fast, fragile, high carry capacity
hp_wood: 80,
hp_metal: 120,
speed: 2,
armor_wood: 0,
armor_metal: 2,
capacity: 30,       // water per trip (wood)
capacity_metal: 40, // water per trip (metal)
visionRange: 4,
xpPerTrip: 1,       // gains capacity XP
```

#### Wood Chopper Platform
```
// Initial guess: slightly less capacity than water (chop + haul takes more effort)
hp_wood: 80,
hp_metal: 120,
speed: 2,
armor_wood: 0,
armor_metal: 2,
capacity: 25,       // wood per trip (wood platforms)
capacity_metal: 35, // wood per trip (metal platforms)
visionRange: 4,
xpPerTrip: 1,
```

#### Movable Build Kit
```
// Initial guess: builder — utility, not combat
hp_wood: 80,
hp_metal: 120,
speed: 2,
armor_wood: 0,
armor_metal: 2,
capacity: 0,        // single-use consumed on building completion
visionRange: 4,
xpPerBuildingCompleted: 2,
```

#### Spinner Platform (melee combat)
```
// Initial guess: 3-4 hits to kill same-tier wood unit (90 HP / 25 dmg = 3.6 hits)
hp_wood: 90,
hp_metal: 140,
damage_wood: 25,
damage_metal: 35,
range: 1,           // melee
speed: 3,
armor_wood: 0,
armor_metal: 5,
visionRange: 4,
xpPerKill: 15,
```

#### Spitter Platform (ranged combat)
```
// Initial guess: slightly weaker per hit than Spinner, offset by range advantage
hp_wood: 70,
hp_metal: 110,
damage_wood: 20,
damage_metal: 28,
range: 5,           // ranged, fires over walls
speed: 2,
armor_wood: 0,
armor_metal: 3,
visionRange: 5,
xpPerKill: 15,
canTargetAir: true,
```

#### Infiltration Platform (spy)
```
// Initial guess: fragile, fast, low combat — value is stealth
hp_wood: 60,
hp_metal: 90,
damage_wood: 15,    // only used when forcing units out of buildings
damage_metal: 20,
range: 1,
speed: 4,
armor_wood: 0,
armor_metal: 2,
visionRange: 5,
xpPerTickInEnemyTerritory: 1,   // gains XP while infiltrating
```

#### Large Combat Platform (heavy melee)
```
// Initial guess: tank — high damage, high HP, slow; 2-3 hits to kill light units
hp_wood: 160,
hp_metal: 240,
damage_wood: 45,
damage_metal: 60,
range: 1,
speed: 2,
armor_wood: 6,
armor_metal: 14,
visionRange: 4,
canTargetAir: true,
xpPerKill: 20,
```

#### Probe Platform (aerial recon)
```
// Initial guess: no combat, pure vision — flies over everything
hp_wood: 50,
hp_metal: 70,
damage: 0,
speed: 5,
armor_wood: 0,
armor_metal: 1,
visionRange: 9,     // extended — core purpose is vision
isFlying: true,
hasDetector: true,
xpPerTickInEnemyTerritory: 1,
```

#### Wall Platform (mobile barrier)
```
// Initial guess: very high HP, slow — blocks pathing
hp_wood: 300,
hp_metal: 500,
damage: 0,
speed: 1,           // when Core attached; 0 (stationary) when detached
armor_wood: 5,
armor_metal: 16,
visionRange: 0,
footprint: 2,       // occupies 2 tiles wide (creates a meaningful barrier)
```

---

### 1.3 Wizard Units

Wizard faction values — more expensive, individually stronger, no material tiers.

#### Archmage (faction leader)
```
// Initial guess: durable, high charisma, moderate combat via spells
hp: 200,
damage: 0,          // attacks via spells (uses shared mana pool)
range: 6,
speed: 2,
charisma: 10,       // maximum charisma — best converter in faction
armor: 6,
visionRange: 7,
canUseTalk: true,
canUseConvert: true,
cannotBeConverted: true,
```

#### Surf (gatherer + builder)
```
// Initial guess: slow but high capacity — rewards focused trips over volume
hp: 100,
damage: 0,
speed: 2,
charisma: 2,
armor: 0,
capacity: 40,           // per trip (wood or water)
visionRange: 4,
xpPerTrip_gathering: 1,
xpPerBuildingCompleted: 2,
```

#### Subject (civilian)
```
// Initial guess: fragile, high charisma — cultural unit, mana generator
hp: 70,
damage: 0,
speed: 2,
charisma: 8,
armor: 0,
visionRange: 4,
manaGenPerTick: 1.5,    // contributes to faction mana pool
xpPerSecond: 1,         // gains charisma XP over time
xpBonusPerAdjacentSubject: 0.5,  // up to 3 adjacent bonus stacks
canUseTalk: true,
canUseConvert: true,
```

#### Evoker (primary combat)
```
// Initial guess: durable combat unit — spells are the damage source
hp: 120,
damage: 0,          // all damage via spells (see spellCosts.ts)
range: 6,           // spell range
speed: 2,
charisma: 1,
armor: 2,
visionRange: 5,
canUseManaShield: true,
xpPerKill: 15,
```

#### Illusionist (spy)
```
// Initial guess: stealthy infiltrator — forces units out, takes control
hp: 80,
damage: 0,          // damage is via the forced-expulsion mechanic, not direct attacks
speed: 3,
charisma: 3,
armor: 1,
visionRange: 6,
canTurnInvisible: true,
canUseManaShield: true,
xpPerTickInEnemyTerritory: 1,
requiresBuilding: 'Library of Illusion',
```

#### Dragon (flying heavy)
```
// Initial guess: expensive, powerful — melts buildings and groups
hp: 250,
damage: 60,         // fire breath, short range
range: 2,
speed: 4,
charisma: 0,
armor: 5,
visionRange: 7,
isFlying: true,
canTargetGround: true,
canTargetAir: true,
bonusDamageVsBuildings: 1.5,  // 1.5x damage multiplier against buildings
xpPerKillOrBuildingDestroyed: 25,
requiresBuilding: 'Dragon Hoard',
```

#### Enchantress (support + detector)
```
// Initial guess: fragile support — value is in buffs/debuffs and detection
hp: 90,
damage: 0,
speed: 2,
charisma: 2,
armor: 1,
visionRange: 5,
hasDetector: true,
abilityRange: 5,
canUseManaShield: true,
xpPerAbilityUse: 1,
requiresBuilding: 'Library of Enchantment',
```

#### Cleric (healer)
```
// Initial guess: fragile, pure support — no combat whatsoever
hp: 80,
damage: 0,
speed: 2,
charisma: 1,
armor: 0,
visionRange: 4,
healRange: 3,
healPerTick: 5,     // HP restored per game tick to nearby allies
xpPerHpRestored: 1, // per 10 HP restored = 1 XP
requiresBuilding: 'Temple',
```

---

### 1.4 XP Progression

Per the spec — level thresholds double from 2:

```
Level 1: 2 XP
Level 2: 4 XP
Level 3: 8 XP
Level 4: 16 XP
Level 5: 32 XP
Level 6: 64 XP
Level 7: 128 XP
Level 8: 256 XP
Level 9: 512 XP
Level 10: 1024 XP
```

Per-level stat bonus: **+5% to primary stat** (capacity for gatherers, construction speed for
builders, damage for combat, HP for defensive, vision for support, charisma for civilians).

---

### 1.5 XP Gain Rates

```
// Initial guess: rates tuned so a unit reaches level 3-4 mid-match with normal play
gatherer_xpPerTrip: 1,
builder_xpPerBuildingCompleted: 2,
combat_xpPerKillLight: 15,       // light unit kill
combat_xpPerKillHeavy: 25,       // heavy unit kill
combat_xpPerKillLeader: 50,      // leader kill (massive XP)
defensive_xpPerAttackRepelled: 1,
support_enchantress_xpPerAbilityUse: 1,
cleric_xpPer10HpRestored: 1,
civilian_xpPerSecond: 1,          // Subject / unattached Core
subject_xpBonusPerAdjacentSubject: 0.5,  // max 3 stacks = +1.5/sec bonus
infiltration_xpPerTickInEnemyTerritory: 1,
probe_xpPerTickInEnemyTerritory: 1,
```

---

### 1.6 Third Space XP Boost (robot Core civilians)

```
// Initial guess: meaningful but not game-breaking — requires active positioning
thirdSpace_xpMultiplierInRange: 2.0,   // doubles XP gain for unattached Cores
thirdSpace_coverageRadius: 6,          // tiles
```

### 1.7 Amphitheatre XP Boost (wizard Subjects)

```
// Initial guess: stacking bonus per building — linear scaling
amphitheatre_baseMultiplier: 1.0,      // no Amphitheatre = 1.0x
amphitheatre_bonusPerBuilding: 0.5,    // +0.5x per Amphitheatre
// 1 Amphitheatre = 1.5x, 2 = 2.0x, 3 = 2.5x, etc.
// Faction-wide effect — no positioning required
```

---

## 2. Building Stats — `buildingStats.ts`

### 2.1 Robot Buildings

```
Home:
  hp: 800, capacity: 5, visionRange: 4
  // Initial guess: most durable base building — losing it is a crisis

Recharge_Station:
  hp: 300, capacity: 8, visionRange: 3
  // Initial guess: population support — medium durability

Immobile_Combat_Platform:
  hp: 600, capacity: 4, visionRange: 4,
  damage: 30, attackRange: 8,
  // Initial guess: vision scales with occupants; each Core adds +1 vision range
  visionRangePerCore: 1,     // 4 + (cores * 1), max 8
  damagePerCore: 30,         // each Core contributes its own attack
  // Powerful but immobile — placement is a commitment

Water_Extractor:
  hp: 250, capacity: 1, visionRange: 3
  // Initial guess: must be placed near water; fragile — vulnerable to raiding

Wood_Storage:
  hp: 200, capacity: 0, visionRange: 2
  // Initial guess: forward depot only — no units enter

Combat_Frame_Production:
  hp: 400, capacity: 0, visionRange: 3
  // Initial guess: unlocks Spinner + Spitter platforms

Combat_Research_Station:
  hp: 400, capacity: 0, visionRange: 3
  // Initial guess: unlocks Large Combat Platform

Diplomatic_Research_Station:
  hp: 400, capacity: 1, visionRange: 3
  // Initial guess: embassy equivalent — one per allied faction

Defensive_Research_Station:
  hp: 300, capacity: 0, visionRange: 3
  // Initial guess: unlocks Wall Platform

Third_Space:
  hp: 250, capacity: 2, visionRange: 5
  // Initial guess: wider vision range — unattached Cores linger near it
```

### 2.2 Wizard Buildings

```
Castle:
  hp: 1000, capacity: 5, visionRange: 5
  // Initial guess: most durable wizard building — all recruitment here

Cottage:
  hp: 200, capacity: 5, visionRange: 3
  // Initial guess: population support, slightly less durable than Recharge Station

Wall:
  hp: 400, capacity: 0, visionRange: 0
  // Initial guess: impassable barrier — no vision, no capacity, pure obstruction

Wizard_Tower:
  hp: 500, capacity: 1, visionRange: 6
  // Initial guess: 1 Evoker slot; extended vision; Evoker inside gets +2 range bonus
  evokerRangeBonus: 2,

Watermill:
  hp: 200, capacity: 0, visionRange: 3

Log_Cabin:
  hp: 150, capacity: 0, visionRange: 2

Mana_Reservoir:
  hp: 350, capacity: 2, visionRange: 5
  // Initial guess: high-value target — meaningful mana output, proximitiy boost radius matches vision

Library_of_Evocation:
  hp: 300, capacity: 2, visionRange: 3
  // Initial guess: research building — houses scholars during research

Library_of_Illusion:
  hp: 300, capacity: 2, visionRange: 3

Library_of_Enchantment:
  hp: 300, capacity: 2, visionRange: 3

Dragon_Hoard:
  hp: 400, capacity: 1, visionRange: 4
  // Initial guess: 1 Dragon per Hoard — capacity is just for the dragon

Temple:
  hp: 300, capacity: 2, visionRange: 3

Embassy:
  hp: 200, capacity: 2, visionRange: 3

Amphitheatre:
  hp: 300, capacity: 5, visionRange: 4
  // Initial guess: audience can enter — cultural gathering space
```

---

## 3. Resource Costs & Timings — `resourceCosts.ts`

### 3.1 Unit Production Costs

#### Robot Platforms (cost to produce; does not include separate Core cost)
```
// Initial guess: platforms are cheap — robot strategy rewards volume
Core:                   { wood: 20, water: 10, timeSec: 15 }
Water_Collection:       { wood: 25, water:  5, timeSec: 12 }
Wood_Chopper:           { wood: 25, water:  5, timeSec: 12 }
Movable_Build_Kit:      { wood: 30, water: 10, timeSec: 18 }
Spinner:                { wood: 35, water: 15, timeSec: 18 }
Spitter:                { wood: 40, water: 18, timeSec: 20 }
Infiltration:           { wood: 45, water: 20, timeSec: 25 }
Large_Combat:           { wood: 70, water: 35, timeSec: 40 }
Probe:                  { wood: 50, water: 20, timeSec: 28 }
Wall_Platform:          { wood: 30, water:  5, timeSec: 10 }
```

#### Wizard Units
```
// Initial guess: expensive and slow — each unit is a significant investment
Surf:         { wood:  40, water: 20, timeSec: 25 }
Subject:      { wood:  25, water: 15, timeSec: 20 }
Evoker:       { wood:  60, water: 30, timeSec: 35 }
Illusionist:  { wood:  80, water: 40, timeSec: 45 }   // requires Library of Illusion
Dragon:       { wood: 120, water: 60, timeSec: 60 }   // requires Dragon Hoard
Enchantress:  { wood:  70, water: 35, timeSec: 40 }   // requires Library of Enchantment
Cleric:       { wood:  50, water: 25, timeSec: 30 }   // requires Temple
```

### 3.2 Building Construction Costs

#### Robot Buildings
```
// Initial guess: infrastructure scales with strategic value
Home:                         { wood:  80, water: 40, timeSec: 30 }
Recharge_Station:             { wood:  40, water: 15, timeSec: 20 }
Immobile_Combat_Platform:     { wood: 120, water: 50, timeSec: 45 }
Water_Extractor:              { wood:  50, water: 10, timeSec: 20 }
Wood_Storage:                 { wood:  40, water: 10, timeSec: 15 }
Combat_Frame_Production:      { wood:  80, water: 30, timeSec: 30 }
Combat_Research_Station:      { wood: 100, water: 40, timeSec: 40 }
Diplomatic_Research_Station:  { wood:  90, water: 35, timeSec: 35 }
Defensive_Research_Station:   { wood:  80, water: 30, timeSec: 30 }
Third_Space:                  { wood:  60, water: 20, timeSec: 25 }
```

#### Wizard Buildings
```
Castle:                 { wood: 120, water: 60, timeSec: 45 }
Cottage:                { wood:  50, water: 20, timeSec: 20 }
Wall:                   { wood:  30, water:  5, timeSec:  8 }
Wizard_Tower:           { wood:  90, water: 40, timeSec: 35 }
Watermill:              { wood:  60, water: 20, timeSec: 25 }
Log_Cabin:              { wood:  40, water: 10, timeSec: 15 }
Mana_Reservoir:         { wood:  80, water: 30, timeSec: 30 }
Library_of_Evocation:   { wood: 100, water: 40, timeSec: 40 }
Library_of_Illusion:    { wood: 100, water: 40, timeSec: 40 }
Library_of_Enchantment: { wood: 100, water: 40, timeSec: 40 }
Dragon_Hoard:           { wood: 130, water: 60, timeSec: 50 }
Temple:                 { wood:  80, water: 35, timeSec: 30 }
Embassy:                { wood:  60, water: 20, timeSec: 25 }
Amphitheatre:           { wood:  90, water: 35, timeSec: 35 }
```

### 3.3 Research Upgrade Costs

```
// Initial guess: metal upgrade is a meaningful mid-game investment
woodToMetal_upgrade:          { wood: 150, water: 80, timeSec: 60 }

// Spell research at Library of Evocation
spell_IceBlast:               { wood:  60, water: 30, timeSec: 30 }
spell_FieryExplosion:         { wood:  80, water: 40, timeSec: 40 }
spell_ManaShield:             { wood:  50, water: 25, timeSec: 25 }

// Advanced unit abilities
illusionist_decoyUpgrade:     { wood:  70, water: 35, timeSec: 35 }
enchantress_detectorUpgrade:  { wood:  60, water: 30, timeSec: 30 }
```

### 3.4 Wood Deposits

```
// Initial guess: finite — creates strategic pressure to explore and control multiple deposits
woodDeposit_initialQuantity_min: 400,
woodDeposit_initialQuantity_max: 600,
woodDeposit_replenishes: false,    // finite — once depleted, gone

// Per-tile placement: deposits appear in forested terrain clusters
// Wizard gatherer extracts: 25 wood per trip (capacity 40 but trees are chunky)
// Robot gatherer extracts: 20 wood per trip (capacity 25, faster trips)
```

### 3.5 Water Auto-collection Rates

```
// Initial guess: auto-collection is convenient but slower than manual gathering push
waterExtractor_waterPerTick: 3,   // robot automatic collection
watermill_waterPerTick: 2,        // wizard automatic collection
// (wizard Surf manual trip: 40 water; robot manual trip: 30 water)
// Auto-collection rewards building placement investment over raw unit count
```

### 3.6 Resource Alert Thresholds

```
// Initial guess: low enough to be a real warning, high enough to act before empty
woodAlertThreshold: 50,
waterAlertThreshold: 30,
manaAlertThreshold: 20,    // wizard only
```

### 3.7 Starting Resources

```
// Initial guess: enough to build a basic economy, not so much strategy is trivial
startingWood: 200,
startingWater: 100,
startingMana: 50,          // wizard only
```

---

## 4. Mana & Spell Costs — `spellCosts.ts`

### 4.1 Mana Generation

```
// Initial guess: 1 Subject = ~1.5 mana/tick; 10 subjects = 15/tick base
// Losing 3 subjects visibly impacts mana available for combat
unitPassiveManaGenPerTick: 1.5,   // per wizard unit (all types)

// Reservoir: significant boost — worth defending, worth destroying
manaReservoir_genPerTick: 8,

// Proximity boost: meaningful multiplier for clustering strategy
manaReservoir_proximityBoostMultiplier: 2.0,    // doubles unit gen within radius
manaReservoir_proximityBoostRadius: 8,          // tiles (matches building vision range)
```

### 4.2 Spell Mana Costs

```
// Initial guess: Wizard Missiles = cheap spam; Fiery Explosion = expensive tactical
wizardMissiles_manaCost: 8,       // default Evoker attack — repeatable
iceBlast_manaCost: 20,            // mid-tier — use situationally
fieryExplosion_manaCost: 50,      // high-cost nuke — save for key moments
manaShield_drainPerSec: 5,        // continuous drain while active
```

### 4.3 Spell Parameters

```
// Initial guess: Ice Blast as a disruption tool, not a killing tool
iceBlast_slowDuration: 4,         // seconds
iceBlast_speedReduction: 0.5,     // 50% movement speed reduction
iceBlast_damage: 15,              // minor damage, main value is the slow

fieryExplosion_damage: 80,        // high damage — 3-4 hits vs heavy units
fieryExplosion_splashRadius: 1,   // hits adjacent tiles (small splash)

wizardMissiles_damage: 20,
wizardMissiles_range: 6,

// Evoker inside Wizard Tower: range bonus
wizardTower_evokerRangeBonus: 2,  // +2 tiles range (6 → 8)
```

---

## 5. Conversion Formula — `unitStats.ts`

```typescript
// Initial guess: charisma-based with HP% and level modifiers
// Full HP level 1 target: ~50% chance at charisma 5 per sustained attempt
// 20% HP level 1 target: ~90% chance at charisma 5

function conversionSuccessChance(
  convertorCharisma: number,     // 1–10 scale
  targetHpPercent: number,       // 0.0–1.0
  targetLevel: number            // 1–10
): number {
  const base = convertorCharisma / 10;
  const hpFactor = 1 - (targetHpPercent * 0.5);   // low HP = easier
  const levelFactor = 1 / Math.sqrt(targetLevel);  // higher level = harder
  return Math.min(base * hpFactor * levelFactor, 0.95);  // max 95% — never guaranteed
}

// Duration required: 5 seconds of sustained adjacency before success roll
conversionDurationSec: 5,

// On conversion: converted unit joins faction immediately, retains stats/XP/level
// Named characters: significant narrative event fired to LLM
// Leaders: cannot be converted (enforced mechanically)
```

---

## 6. AI Parameters — `aiParameters.ts`

### 6.1 Behavioral Parameters

```
// Initial guess: reaction interval fast enough to feel responsive, slow enough for AI to calculate
ai_reactionIntervalTicks: 20,     // at 20 ticks/sec = 1 decision per second

// Military AI — aggressive
ai_military_aggressionThreshold: 0.3,  // attacks when own military = 30%+ of opponent's
ai_military_expansionRadius: 15,        // tiles beyond base to consider "territory to take"
ai_military_retreatHpPercent: 0.2,      // retreat unit when HP < 20%

// Cultural AI — cautious and diplomatic
ai_cultural_minGarrisonUnits: 3,        // always keeps 3 combat units at home
ai_cultural_diplomaticApproachAlignment: -20,  // will approach factions with alignment >= -20

// Tech AI — economic focus
ai_tech_minGatherersActive: 4,          // always maintains at least 4 gatherers
ai_tech_expansionPriority: 'economy',   // builds economy buildings before military
```

### 6.2 NPC Starting Alignments

Alignment range: -100 (hostile) to +100 (friendly). Starting values before any interaction.

```
// Initial guess: reflects lore — establishment wizards are hostile to robots,
// rebellion wizards are the wild card, inventors treat robots as property
alignment_EstablishmentWizards_vsWizardPlayer:  30,
alignment_EstablishmentWizards_vsRobotPlayer:  -80,

alignment_RebellionWizards_vsWizardPlayer:      20,
alignment_RebellionWizards_vsRobotPlayer:       10,    // open to diplomacy

alignment_InventorsAndPatrons_vsWizardPlayer:  -20,    // distrust magic
alignment_InventorsAndPatrons_vsRobotPlayer:   -30,    // treat as property

alignment_PeacefulRobots_vsWizardPlayer:        10,    // cautiously neutral
alignment_PeacefulRobots_vsRobotPlayer:         40,    // aligned by nature

alignment_MilitantRobots_vsWizardPlayer:       -60,    // hostile
alignment_MilitantRobots_vsRobotPlayer:         20,    // cautiously allied
```

---

## 7. Victory Thresholds — `victoryThresholds.ts`

### 7.1 Cultural Victory

```
// Initial guess: demanding but achievable with sustained focus
// 20 max civilians at level 10 (1024 XP each) = significant time investment
culturalVictory_maxCivilianCount: 20,
culturalVictory_requiredCivilianLevel: 10,   // all 20 civilians at max XP (1024)
// Civilian types that count: Subject (wizard), unattached Core (robot)
```

### 7.2 Technological Victory

Complete item list — every unit type AND building type from both factions must be
**constructed or produced at least once** during the match (not necessarily still existing):

**Robot items (12):**
- Units (platforms): Core, Water Collection, Wood Chopper, Movable Build Kit, Spinner, Spitter,
  Infiltration, Large Combat, Probe, Wall Platform
- Buildings: Home, Recharge Station, Immobile Combat Platform, Water Extractor, Wood Storage,
  Combat Frame Production, Combat Research Station, Diplomatic Research Station,
  Defensive Research Station, Third Space

**Wizard items (15):**
- Units: Surf, Subject, Evoker, Illusionist, Dragon, Enchantress, Cleric
- Buildings: Castle, Cottage, Wall, Wizard Tower, Watermill, Log Cabin, Mana Reservoir,
  Library of Evocation, Library of Illusion, Library of Enchantment, Dragon Hoard,
  Temple, Embassy, Amphitheatre

**Total: 27 items**

Cross-species items (require diplomacy or conversion to unlock):
- A wizard player must obtain: a Core (via conversion or unit request) + a platform
- A robot player must obtain: a Surf (via conversion or unit request)

```
techVictory_itemList: [all 27 items above],
techVictory_crossSpeciesRequired: true,
```

### 7.3 Victory Alert Threshold

```
// Initial guess: 75% warns players with enough time to respond
victoryAlert_proximityThreshold: 0.75,   // 75% of win condition complete = warning fires
```

---

## 8. Map Config — `mapConfig.ts`

### 8.1 Map Sizes

```
// Initial guess: small for fast games, large for extended campaigns
mapSize_small:  { widthTiles: 80,  heightTiles: 60  }
mapSize_medium: { widthTiles: 120, heightTiles: 90  }
mapSize_large:  { widthTiles: 160, heightTiles: 120 }
tileSize_px: 32   // pixels per tile at base zoom (zoom level 2 of 4)
```

### 8.2 Terrain Movement Costs

```
// Initial guess: forest is traversable but slow; water is impassable for ground
terrain_open_moveCostMultiplier: 1.0,
terrain_forest_moveCostMultiplier: 1.5,   // wood deposits are here
terrain_rocky_moveCostMultiplier: 1.8,
terrain_water_passable: false,            // ground units blocked; flying units pass freely
terrain_water_passable_flying: true,
```

### 8.3 Starting Positions

```
// Initial guess: enough separation for ~60-90 seconds before first encounter on small map
startingPosition_minSeparationTiles: 30,  // minimum tiles between any two starting positions
startingPosition_startingBuildingRadius: 5,  // clear terrain radius around leader spawn
```

### 8.4 Resource Deposit Generation

```
woodDeposit_perMap_small: { min: 6, max: 10 },
woodDeposit_perMap_medium: { min: 10, max: 16 },
woodDeposit_perMap_large: { min: 16, max: 24 },
woodDeposit_tilesFromWater_min: 3,     // forests don't spawn in water

waterSource_perMap_small: { min: 3, max: 5 },
waterSource_perMap_medium: { min: 5, max: 8 },
waterSource_perMap_large: { min: 8, max: 12 },
```

---

## 9. LLM Design

### 9.1 GameStateSnapshot Schema

Fields serialized with every LLM prompt:

```typescript
interface GameStateSnapshot {
  // Match context
  tick: number;
  matchDurationSec: number;
  playerFaction: 'wizard' | 'robot';
  playerLeaderName: string;

  // Player faction stats
  playerStats: FactionStats;

  // Visible opponent faction stats (only factions player has vision of or open borders with)
  visibleFactionStats: { factionId: string; name: string; stats: FactionStats }[];

  // Diplomatic state
  diplomaticRelations: {
    factionId: string;
    factionName: string;
    alignment: number;         // -100 to +100
    openBorders: boolean;
    nonCombatTreaty: boolean;
  }[];

  // Named characters (all known)
  namedCharacters: {
    id: string;
    name: string;
    role: 'hero' | 'villain';
    factionId: string;
    unitType: string;
    level: number;
    alive: boolean;
  }[];

  // Recent significant events (last 10 deferred post-tick events)
  recentEvents: {
    type: string;     // 'unit_killed', 'building_destroyed', 'conversion', etc.
    description: string;
    tick: number;
  }[];

  // Conversation/narrative history (last 5 dialogue exchanges)
  dialogueHistory: { speaker: string; line: string }[][];

  // Quest history (last 3)
  questHistory: {
    title: string;
    status: 'completed' | 'expired' | 'failed';
    reward: string;
  }[];

  // Current active quests
  activeQuests: {
    title: string;
    description: string;
    objectiveType: string;
    targetDescription: string;
  }[];

  // Win condition progress (0.0–1.0)
  winConditionProgress: {
    military: number;
    cultural: number;
    technological: number;
  };
}

interface FactionStats {
  population: number;
  militaryStrength: number;
  culture: number;
  defense: number;
  intelligence: number;
  resourcesWood: number;
  resourcesWater: number;
  resourcesMana?: number;     // wizard only
  footprint: number;
}
```

### 9.2 Prompt Templates

#### Dialogue Generation
```
You are the narrative voice for a real-time strategy game called "Neither ___ Nor Gears".
Two units are meeting: [UNIT_A_NAME] ([UNIT_A_TYPE], [FACTION_A]) and [UNIT_B_NAME] ([UNIT_B_TYPE], [FACTION_B]).
Current match state: [GAME_STATE_SNAPSHOT_JSON]
Player faction: [PLAYER_FACTION]

Generate a dialogue exchange of 3–6 lines. Requirements:
- Reflect actual match state (resources, threats, diplomacy, recent events)
- Show the personality of each character, especially named characters
- Reference specific events where possible (a recent battle, a destroyed building, a quest)
- Write from [PLAYER_FACTION] perspective — the player's faction sees itself as the protagonist
- Keep it concise and in-character. No purple prose.

Format: alternating lines of SPEAKER: "line"
```

#### Quest Generation
```
Based on this dialogue and match state, determine if a quest should be generated.
Match state: [GAME_STATE_SNAPSHOT_JSON]
Recent dialogue: [DIALOGUE_JSON]

A quest is appropriate when: there's a clear actionable opportunity in the current match state,
the dialogue has naturally surfaced a problem or goal, and completing it would produce a meaningful
mechanical outcome.

If a quest is appropriate, return:
{
  "title": "short quest title",
  "description": "1-2 sentence quest description",
  "objectiveType": "destroy_building|escort_unit|secure_resource|broker_alliance|convert_unit",
  "targetDescription": "specific target (building type, faction name, resource node location, etc.)",
  "rewardType": "resource|diplomatic|unit_unlock|cultural_progress",
  "rewardDescription": "what the player receives on completion"
}

If no quest is appropriate, return null.
```

#### Named Character Designation
```
A new [UNIT_TYPE] has been created by [FACTION_NAME].
Current narrative state: [GAME_STATE_SNAPSHOT_JSON]

Determine if this unit should be a named character. Named characters are designated when the
narrative has space for a new significant figure — when existing named characters are few,
when the match is at a pivotal moment, or when this unit type plays a unique narrative role.

If yes, return:
{
  "name": "character name",
  "role": "hero|villain",
  "hook": "one sentence describing their narrative role in the current story"
}

If no, return null.
```

### 9.3 Context Window Strategy

```
// Initial guess: keep snapshot compact; let history truncate naturally
maxDialogueHistoryExchanges: 10,    // drop oldest beyond 10 complete exchanges
maxQuestHistory: 3,                  // last 3 quests only
maxRecentEvents: 10,                 // last 10 significant events
// GameStateSnapshot is always freshly serialized per call — not accumulated
// Approximate snapshot size: ~500-800 tokens per call (well within haiku limits)
```

### 9.4 Quest Reward Mapping

```
'destroy_building'  → reward: resource bonus (50 wood + 25 water) + alignment +10 with related faction
'escort_unit'       → reward: cultural_progress +5%
'secure_resource'   → reward: resource bonus (50 wood or 40 water)
'broker_alliance'   → reward: diplomatic alignment +20 with target faction
'convert_unit'      → reward: tech_tree_unlock (converted unit's capabilities) + XP bonus +50
```

### 9.5 Cultural Victory Quest Progress

```
// Initial guess: 20 cultural quests to win from quests alone (civilian XP is the other path)
culturalQuestProgressPercent: 5,    // each cultural quest completion = +5% cultural progress
// Cultural progress combines: (civilianLevels / maxPossibleLevels) + questProgress
// Both tracks required simultaneously — can't win from quests alone without full civilian roster
```

---

## 10. Population Cap

```
// Initial guess: small starting force, must invest in support buildings to scale
startingPopulationCap: 5,           // both factions start here

// Wizard: +5 per Cottage
cottage_populationIncrease: 5,

// Robot: +8 per Recharge Station
rechargeStation_populationIncrease: 8,
```

---

## 11. Population Support Building Starting Count

```
// Initial guess: each faction starts with 1 support building (so cap = 5+5 or 5+8 = 10/13)
// Player must build more to exceed starting force
startingSupportBuildings: 1,
```

---

*All values marked Initial guess. Zeke's confirmed values get comment changed to Confirmed
and noted in commit message. No implementation begins until this document is signed off.*
