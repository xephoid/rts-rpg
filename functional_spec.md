**Functional Specification**

*Working Title: Neither \_\_\_ Nor Gears*

**Section 1: Game Overview**

This is a real-time strategy game with RPG progression and grand
strategy diplomacy elements. There are no turns. All players --- human
and AI --- act simultaneously and continuously throughout the match.

Each match is uniquely generated. The terrain, resource locations, and
starting positions of all faction leaders are randomized at the start of
every game.

The player selects a faction at the start of the match. Their faction
determines which units and buildings are available to them and how their
economy functions. From a small starting position the player must gather
resources, grow their faction, explore the map, and pursue one of three
win conditions. The match ends the moment any faction achieves a win
condition.

AI opponents each pursue a single win condition with singular focus. The
player may pursue any win condition and may change their focus over the
course of the match.

The game features a narrative layer powered by a local large language
model. This layer generates dialogue and quests based on the current
state of the match. Engaging with this layer is optional for most play
styles but is required to achieve a cultural victory.

**Starting Inputs**

Before a match begins the player is prompted to configure the following
starting parameters. Map size determines the total area of the generated
map and affects how long it takes factions to encounter one another.
Faction count determines how many factions are present in the match
including the player\'s faction. Player leader name allows the player to
name their faction\'s leader, which is used by the local LLM throughout
the match in generated dialogue and quests.

**Section 2: Map & World Generation**

Each match takes place on a randomly generated two-dimensional map. The
map is generated at the start of each match and is unique to that
playthrough.

The map contains terrain features that affect movement and visibility,
resource deposits of wood and water distributed across the map, and
starting positions for each faction\'s leader. Starting positions are
spaced to give each faction a reasonable amount of time to establish a
base before encountering opponents.

The map is viewed from a top-down two-dimensional perspective. The
player can navigate the map using four preset zoom levels. The widest
zoom level gives the player an overview of the broader world while the
closest zoom level allows for precise unit and building management.

Territory is visually represented on the map by boundary lines drawn
around clusters of buildings belonging to the same faction. These lines
update in real time as buildings are constructed or destroyed, giving
the player and their opponents a clear visual indication of which
faction controls which areas of the map at any given moment.

The full map is not visible to the player at the start of the match.
Areas the player has not yet explored are completely hidden. Areas the
player has previously explored but does not currently have vision of are
visible as last seen but do not reflect current activity. Only areas
currently within the vision range of a friendly unit or building show
live activity. This is described in more detail in the Fog of War
section.

**Section 3: User Interface**

The game interface is modeled closely after the original StarCraft user
interface with several additions specific to this game.

The main play area occupies the majority of the screen and displays the
two-dimensional game map from a top-down perspective. The player
navigates the map by scrolling and by selecting from four preset zoom
levels.

A minimap is displayed in one corner of the screen, giving the player a
condensed overview of the full map. The minimap reflects fog of war,
showing only areas the player has explored or currently has vision of.
Territory boundary lines are visible on the minimap.

A resource display shows the player\'s current stockpiles of wood and
water at all times. Wizard players also see their current mana pool in
this display.

When the player selects a unit or building an information panel displays
the relevant stats and available actions for that selection. When
multiple units are selected a summary of the group is displayed.
Available actions are presented as buttons the player can click to issue
commands.

A portrait or visual representation of the selected unit or building is
displayed alongside its stats. For named characters --- heroes,
villains, and faction leaders --- this portrait is distinct and reflects
their narrative role.

Faction territory lines are drawn around clusters of friendly and enemy
buildings directly on the main play area, making territorial control
immediately readable at a glance.

A diplomacy panel is accessible from the interface and allows the player
to view their current relationship status with each faction, send
diplomatic requests, propose alliances, and initiate trade. This is
described in more detail in the Diplomacy section.

Narrative content generated by the local LLM is surfaced through a
dialogue panel that appears when units use the Talk action or when a
quest is generated. The player can dismiss this panel without engaging
with it.

Active objectives are displayed persistently on screen. There are always
three active objectives, one corresponding to each win condition. These
update as the state of the match changes.

**Section 4: Fog of War**

Fog of war is a core mechanic of the game. The player\'s visibility of
the map is strictly limited to what their units and buildings can
currently see.

The map has three visibility states for any given area.

Unexplored areas are completely hidden. The player has no information
about terrain, resources, or activity in these areas.

Explored but not currently visible areas show the terrain and any static
features as they appeared the last time the player had vision there.
Units and live activity are not shown. Buildings that have been
destroyed since the player last had vision may still appear until the
player regains vision of that area.

Currently visible areas show all terrain, buildings, and unit activity
in real time. An area is currently visible if at least one friendly unit
or building with sufficient range covers it.

Every unit and building has a vision range stat that determines how
large an area around it is currently visible. Units with greater vision
range reveal more of the map. Certain units and buildings are
specifically designed to extend vision range further than standard.

Spy units are a special case. They are concealed from opposing factions
unless an enemy unit or building with the detector ability is within
range of them. A spy moving through an area covered only by standard
enemy vision will not be revealed. Detection is described further in the
Units sections.

Units inside buildings are not visible to opponents by default. An
opponent can only see which units are inside a building if they have a
unit or building with vision range covering that building and they
actively select it.

Territory boundary lines are visible to the player for any area they
currently have vision of or have previously explored.

**Section 5: Resources**

There are two physical resources in the game: wood and water. Both are
required to construct buildings and produce units. Specific costs vary
by faction and are defined in the units and buildings sections.

Wood is found in forested areas of the map. It must be actively
collected by gatherer units. Gatherer units travel to a wood deposit,
collect a quantity of wood, and return it to the faction\'s main
building or nearest wood storage building. The amount of wood a gatherer
can carry at one time is limited by their capacity stat. Wood storage
buildings can be constructed closer to wood deposits to reduce the
travel time for gatherers.

Water is found in bodies of water on the map. It can be collected by
gatherer units in the same manner as wood, or automatically collected
over time by water collection buildings placed near a water source.
Automatic collection does not require unit intervention once the
building is in place.

Resources are stored centrally and drawn from a single shared pool for
the faction. All construction and unit production costs are deducted
from this pool at the time of the action.

The two factions interact with resources in meaningfully different ways.
Wizard gatherers are slow but extract a greater quantity per trip. Robot
gatherers are faster but extract less per trip, rewarding the robot
player for fielding a larger number of gatherers simultaneously.

Wizards have an additional resource called mana. Mana is not gathered
from the map but generated passively by wizard units and certain
buildings over time. It functions as a shared faction-wide pool and is
consumed by spells and special abilities. Mana is described in detail in
the Mana System section.

**Section 6: Factions & Species**

There are two species in the game: wizards and robots. Each species has
its own tech tree, unit roster, building roster, and economic mechanics.
The two species are intentionally asymmetrical --- they are designed to
feel fundamentally different to play rather than being reskinned
versions of the same system.

The player chooses a faction at the start of the match. There are two
playable factions, one for each species. Playable factions are presented
as a blank slate --- the player\'s identity and narrative role emerge
through play rather than being predetermined.

In addition to the two playable factions there are five non-playable
factions that exist in the world and interact with the player throughout
the match.

The establishment wizards are the dominant magical order. They have
declared the sentient robots abominations and are committed to their
destruction.

The rebellion wizards are a dissenting group within the magical order
who question the ethics of destroying sentient beings. They may be more
open to diplomacy than the establishment wizards.

The inventors and patrons are the non-magical humans who created the
robots. They treat the robots as property and a means to power rather
than as sentient beings. They are neither fully aligned with the wizards
nor with the robots.

The peaceful robots are a faction that seeks coexistence with the other
factions rather than conflict.

The militant robots are a faction that believes survival requires active
resistance and combat.

No faction begins the match as a mixture of both species. However over
the course of a match it is possible for factions to incorporate units
or capabilities from the opposing species through conversion or
alliance. Some advanced items in the technological victory path may
require access to both species to unlock.

The narrative of the match differs depending on which species the player
has chosen. A wizard player and a robot player will experience different
dialogue, quests, and story beats generated by the local LLM based on
their faction\'s perspective.

**AI Behavior**

Each AI controlled faction selects a win condition at the start of the
match and pursues it exclusively throughout the game. This win condition
defines the AI faction\'s personality and informs every decision it
makes.

An AI faction pursuing military victory plays aggressively. It
prioritizes producing combat units, expanding its territory, and
engaging enemy factions in direct conflict. It is less likely to seek
diplomatic relationships and more likely to attack without provocation.

An AI faction pursuing cultural victory plays cautiously and
diplomatically. It prioritizes growing its civilian population,
protecting non-combat units, and engaging with the narrative layer. It
is likely to seek alliances and non-combat treaties early in the match
to avoid military confrontation while it builds toward its victory
condition.

An AI faction pursuing technological victory plays expansively and
economically. It prioritizes resource gathering, base construction, and
working through its tech tree as efficiently as possible. It will seek
diplomatic relationships where they serve its economic interests but
will avoid prolonged military engagements that could disrupt its
production.

AI factions do not deviate from their chosen win condition regardless of
match circumstances. Their behavior may intensify or become more urgent
as other factions approach their own win conditions but their
fundamental approach remains consistent throughout the match.

**Section 7: Units --- Shared Behaviors**

**Selection and Commands**

The player can select individual units by clicking on them or select
multiple units by clicking and dragging a selection box over them. Once
selected the player issues commands through the action buttons displayed
in the information panel or by right-clicking a target on the map.

**Basic Actions**

The following actions are available to units that have them. Not every
unit can perform every action. Which actions a unit can perform is
defined in the unit roster sections.

**Talk** --- available to Civilians and Leaders only. When a unit uses
the Talk action near another unit the local LLM generates dialogue
reflecting the current state of the match. This may result in a quest
being generated. Talk can only be used with friendly units or neutral
and allied faction units. Leaders can also perform the Talk action.

**Convert** --- available to Civilians and Leaders only. The unit
attempts to persuade a target opposing unit to switch allegiance and
join the converting faction. Success is determined by the converting
unit\'s charisma stat relative to the target unit\'s current HP and
level. A target at low HP or low level is easier to convert. A target at
full HP and high level resists more effectively. Conversion requires the
converting unit to remain adjacent to the target for a sustained
duration. If the converting unit moves, is attacked, or is issued a new
command during this process the attempt is cancelled. Leaders cannot be
converted under any circumstances. Successfully converted units join the
converting faction immediately and retain their current stats, XP, and
level. Named characters that are converted are treated as a significant
narrative event by the local LLM. A converted unit of the opposing
species grants the converting faction access to that unit\'s
capabilities for the purposes of technological victory progress.

**Build** --- instructs the unit to construct a building at a target
location. Only builder type units can perform this action. Builder units
can also repair damaged friendly buildings by targeting them with the
repair command. The builder travels to the building and restores HP over
time at a resource cost. Repair is interrupted if the builder is
destroyed or issued a new command.

**Gather** --- instructs the unit to collect wood or water from a nearby
deposit and return it to the nearest storage point.

**Attack** --- instructs the unit to attack a target unit, building, or
region. Units will engage enemies within their range automatically if
set to attack.

**Defend** --- instructs the unit to hold a position or protect a target
unit or building. The unit will attack approaching enemies but will not
pursue them beyond a defined radius.

**Patrol** --- instructs the unit to move back and forth between two
points, attacking any enemies encountered along the route.

**Move** --- instructs the unit to move to a target location without
engaging enemies unless attacked.

**Stop** --- cancels the current action and halts the unit in place.

**Removing Units and Buildings**

The player can choose to remove any friendly unit or building at any
time. Removing a unit permanently destroys it with no resource refund.
Removing a building permanently destroys it with no resource refund and
updates territory boundary lines in real time. This action is
irreversible.

**Unit Stats**

Every unit has the following stats that govern their behavior in the
game.

**Base HP** defines how much damage a unit can sustain before being
destroyed. When a unit\'s HP reaches zero it is removed from the game.

**Capacity** defines how much the unit can carry, whether resources or
passengers depending on the unit type.

**Damage** defines how much HP is removed from a target per attack.

**Range** defines how far a unit can attack or see. Some units have
separate vision and attack ranges.

**Speed** defines how quickly a unit moves across the map.

**Charisma** defines how effective a unit is at converting opposing
units. Used primarily by civilian type units and governs the success of
the Convert action.

**Armor** reduces incoming damage by a fixed amount or percentage.

**XP** tracks the unit\'s accumulated experience. Units gain XP through
performing their primary function as described in their individual unit
entries.

Special abilities are unique to specific unit types and are described in
the unit roster sections.

**XP Progression**

Units gain XP by performing their primary function as described in their
individual unit entries. XP requirements double with each level
beginning at 2 XP for level 1 and continuing through level 10 at 1024
XP. The full progression is as follows: level 1 requires 2 XP, level 2
requires 4, level 3 requires 8, level 4 requires 16, level 5 requires
32, level 6 requires 64, level 7 requires 128, level 8 requires 256,
level 9 requires 512, and level 10 requires 1024.

At each level the unit receives a five percent increase to the stat most
relevant to their primary function. Gatherer units increase their
capacity. Builder units increase their construction speed. Combat units
increase their damage output. Defensive units increase their HP. Support
units increase their vision range. Civilian units increase their
charisma.

Most units have a single specialized role and therefore a single stat
that progresses with XP. Two units are exceptions to this rule.

The Core, which is the base unit of the robot faction, tracks XP and
levels independently for each stat based on the actions it has performed
across its lifetime. A Core that has spent time gathering will have a
higher capacity level than damage level. A Core that has spent time in
combat will have a higher damage level than capacity level. All
accumulated stat levels are retained when a Core switches between
platforms. The Core\'s stat progression is purely a reflection of its
history --- no stat is inherently harder to level than another, they
simply reflect how the Core has been used.

The Surf, which is the wizard faction\'s gatherer and builder unit,
similarly tracks XP independently for its gathering role and its
building role. A Surf that has primarily gathered resources will have a
higher capacity level while a Surf that has primarily constructed
buildings will have a higher construction speed level.

Named characters follow the same XP progression system as their unit
type. However their level and veteran status may carry narrative
significance and be reflected in dialogue and quests generated by the
local LLM.

**Named Characters**

Any unit may be designated a named character by the local LLM at the
time of their creation based on the current state of the narrative.
Named characters have a distinct portrait in the interface and may play
a role in quests. The player\'s leader is always a named character.
Other faction leaders may also be named characters. Named characters can
be targeted by opponent quests, making their loss narratively
significant beyond a simple unit death.

**Population**

Each faction has a population cap. Certain buildings are required to
support population growth beyond the starting limit. The player must
construct these buildings to increase the number of units they can field
simultaneously. Population buildings differ between species and are
described in the buildings sections.

**Entering Buildings**

Units can enter compatible buildings. When inside a building a unit is
not visible to opponents unless an enemy unit or building with
sufficient vision range covers that building and the opponent actively
selects it. Leaders and spies in particular may use buildings to conceal
themselves. Specific rules about which units can enter which buildings
are defined in the buildings sections.

**Section 8: Units --- Robots**

The robot faction is built around speed, numbers, and iterative
improvement. Robot units are inexpensive and fast to produce. Individual
robot units are relatively weak but the faction is designed to field
large numbers simultaneously. The robot faction grows stronger over time
as material upgrades are researched.

**Material Upgrades**

All robot units begin constructed from wood. Wood construction is cheap
and fast but results in low durability. The first major upgrade replaces
wood construction with metal, significantly improving the HP and armor
of all platforms produced after the upgrade is researched. Upgrades do
not apply retroactively to existing platforms. Each platform retains the
material it was constructed with regardless of when the upgrade was
researched. The player may choose to retire older wood platforms and
replace them with new metal ones as production capacity allows.

A Core that detaches from a wood platform and attaches to a metal
platform immediately benefits from the metal platform\'s improved stats.
Likewise a Core attached to a wood platform does not benefit from the
metal upgrade until it attaches to a platform built after the upgrade
was researched.

**The Core System**

The robot faction is built around a unique unit called the Core. The
Core is the base unit of the robot faction. All other robot units are
platforms that a Core attaches to, enabling that platform\'s function. A
Core that is not attached to any platform is considered a civilian unit
and can only use the Talk action, the Convert action, or attach to a
nearby platform. A Core can detach from its current platform at any
time, leaving the platform in place on the map.

This system means that the robot player must manage both their pool of
Cores and their pool of platforms separately. A platform without a Core
attached is non-functional. A Core without a platform attached is a
civilian.

**Robot Units**

**Motherboard** --- the robot faction leader. There is only one
Motherboard per faction. The match is lost if the Motherboard is
destroyed. The Motherboard can perform all basic actions including the
Talk and Convert actions. The Motherboard cannot be converted by
opposing factions.

**Core** --- the base unit of the robot faction. Produced at the Home
building. When unattached the Core functions as a civilian and can only
Talk, Convert, or attach to a platform. When attached to a platform the
Core gains that platform\'s capabilities and stats. Cores track XP and
level independently for each stat based on the actions performed across
their lifetime. All accumulated stat levels are retained when a Core
switches between platforms.

**Water Collection Platform** --- when a Core attaches to this platform
it becomes a water gatherer. Collects water from nearby water sources
and returns it to the Home building or nearest storage point.

**Wood Chopper Platform** --- when a Core attaches to this platform it
becomes a wood gatherer. Collects wood from nearby wood deposits and
returns it to the Home building or nearest storage point.

**Movable Build Kit** --- when a Core attaches to this platform it
becomes a builder capable of constructing and repairing buildings.
Constructs buildings at target locations. The Movable Build Kit is
single use and is consumed when a building is completed. Repair actions
do not consume the Movable Build Kit.

**Spinner Platform** --- when a Core attaches to this platform it
becomes a melee combat unit. The Spinner uses a spinning blade attack.
Melee range only. Gains XP per unit killed.

**Spitter Platform** --- when a Core attaches to this platform it
becomes a ranged combat unit. The Spitter shoots ground debris and can
fire over walls. Can also attack air units. Gains XP per unit killed.

**Infiltration Platform** --- when a Core attaches to this platform it
becomes a spy unit. The Infiltration Platform can disguise itself as an
opposing ground unit, making it appear to opponents as a unit belonging
to their faction. It can enter enemy buildings while disguised. While
inside a building it can attack, which forces the attacked unit out of
the building. It can then continue attacking outside. The Infiltration
Platform is only revealed if an enemy unit or building with the detector
ability is within range. Gains XP while in enemy territory.

**Large Combat Platform** --- when a Core attaches to this platform it
becomes a heavy melee combat unit. High damage output. Can attack both
ground and air units. Gains XP per unit killed.

**Probe Platform** --- when a Core attaches to this platform it becomes
an aerial reconnaissance unit. The Probe cannot attack. It flies and has
an extended vision range beyond standard units. The Probe has the
detector ability, revealing concealed spy units within its vision range.
Gains XP over time while in enemy territory.

**Wall Platform** --- when a Core attaches to this platform it becomes a
mobile barrier unit. The Wall Platform has high HP and a large physical
footprint, functioning as a wall whether or not a Core is attached. When
a Core is attached the Wall Platform can reposition. When no Core is
attached it remains stationary as a passive barrier. Cannot attack.

**Section 9: Units --- Wizards**

The wizard faction is built around power, deliberation, and magical
specialization. Wizard units are expensive and slow to produce but
individually powerful and durable. The faction is designed to field
smaller numbers of highly capable units supported by a shared mana pool
that fuels their abilities. Losing wizard units is a significant setback
both militarily and economically as each unit lost reduces the
faction\'s mana generation.

**Wizard Units**

**Archmage** --- the wizard faction leader. There is only one Archmage
per faction. The match is lost if the Archmage is destroyed. The
Archmage can perform all basic actions including the Talk and Convert
actions. The Archmage cannot be converted by opposing factions.

**Surf** --- the wizard faction\'s gatherer and builder unit. The Surf
collects wood and water and constructs and repairs buildings. Slower
than robot gatherers but extracts a greater quantity of resources per
trip. The Surf tracks XP independently for its gathering role and its
building role. A Surf that has primarily gathered resources will have a
higher capacity level while a Surf that has primarily constructed
buildings will have a higher construction speed level.

**Subject** --- the wizard faction\'s civilian unit. Subjects increase
the faction\'s culture stat and generate mana passively over time.
Subjects can use the Talk action and the Convert action. Subjects gain
XP over time and gain XP faster when near other Subjects. Subjects can
attempt to convert opposing units using their charisma stat.

**Evoker** --- the wizard faction\'s primary combat unit. The Evoker
casts spells to attack and defend. The Evoker cannot attack through
walls or buildings. All spells cost mana drawn from the faction\'s
shared pool. The Evoker has access to the following abilities.

Wizard Missiles --- the Evoker\'s default attack. Long range. Low
damage. Low mana cost.

Ice Blast --- mid range attack that slows the movement speed of the
target for a duration. Requires research at the Library of Evocation
before it becomes available.

Fiery Explosion --- mid range attack with high damage output. High mana
cost. Requires research at the Library of Evocation before it becomes
available.

Mana Shield --- a defensive ability that converts incoming damage into
mana cost rather than HP loss. The unit continues to take damage as
normal but the damage is drawn from the mana pool instead of the unit\'s
HP until the mana pool is exhausted or the shield is deactivated.
Available to Evoker, Illusionist, and Enchantress units.

**Illusionist** --- the wizard faction\'s spy unit. The Illusionist can
turn invisible, making it undetectable to standard enemy vision. Only
enemy units or buildings with the detector ability can reveal an
invisible Illusionist. The Illusionist can summon decoy units that
appear as real units to opponents but have no combat capability. The
Illusionist can enter enemy buildings while invisible. While inside a
building it can force units outside and then take control of the
expelled unit. The Illusionist can use the Mana Shield ability. Requires
the Library of Illusion to be constructed before it can be recruited.
Gains XP while in enemy territory.

**Dragon** --- a flying unit that attacks by breathing fire. Especially
effective against buildings. Can attack ground and air units. Expensive
to produce and limited in number by the Dragon Hoard building. Each
Dragon Hoard supports one Dragon. Gains XP per unit and building
destroyed.

**Enchantress** --- a support unit that applies buffs to allied units
and debuffs to enemy units. The Enchantress has the detector ability,
revealing concealed spy units within her range. The Enchantress can use
the Mana Shield ability. Requires the Library of Enchantment to be
constructed before it can be recruited. Gains XP per use of ability. The
Enchantress has access to the following abilities.

Enlarge --- increases the damage output of a target allied unit for a
duration.

Reduce --- decreases the damage output of a target enemy unit for a
duration.

**Cleric** --- a support unit that heals nearby allied units over time.
The Cleric cannot attack. Gains XP per HP restored to allies. Requires
the Temple to be constructed before it can be recruited.

**Section 10: Buildings --- Shared Behaviors**

**Construction**

Buildings are constructed by builder type units at a location selected
by the player. The builder unit must travel to the target location and
remain there for the duration of construction. Construction costs are
deducted from the faction\'s resource pool at the time construction
begins. If construction is interrupted the resources are not
automatically refunded. Specific construction costs are to be defined
during development.

**Placement**

Buildings can only be placed on valid terrain. Certain buildings must be
placed near specific terrain features to function. Water collection
buildings must be placed near a water source. Wood storage buildings are
most effective when placed near wood deposits. Invalid placement
locations are indicated in the interface when the player is selecting a
position.

**Hit Points and Destruction**

Every building has an HP stat. When a building\'s HP reaches zero it is
destroyed and removed from the map. Destroyed buildings must be
reconstructed from scratch. Territory boundary lines update in real time
as buildings are destroyed.

**Repairing Buildings**

Damaged buildings can be repaired by builder type units. The player
issues a repair command by selecting a builder unit and targeting a
damaged friendly building. The builder travels to the building and
restores HP over time at a resource cost. Repair is interrupted if the
builder is destroyed or issued a new command.

**Occupants**

Most buildings can be entered by friendly units. Each building has a
capacity stat that defines the maximum number of units that can occupy
it simultaneously. Units inside a building are not visible to opponents
unless an enemy unit or building with sufficient vision range covers
that building and the opponent actively selects it. Certain buildings
have specific rules about which unit types can enter them.

**Vision Range**

Every building has a vision range stat that determines how large an area
around it is currently visible to the player. Buildings contribute to
the faction\'s overall map vision in the same way units do.

**Production**

Some buildings produce units over time. The player queues unit
production from the information panel when a production building is
selected. Produced units appear at the building when construction is
complete. Production costs are deducted from the resource pool when the
unit enters the queue.

**Territory**

Buildings define territorial control. Boundary lines are drawn around
clusters of buildings belonging to the same faction and update in real
time as buildings are constructed or destroyed. A faction\'s territorial
footprint is one of the tracked faction stats.

**Removing Buildings**

The player can remove any friendly building at any time. Removing a
building permanently destroys it with no resource refund and updates
territory boundary lines in real time. This action is irreversible.

**Building Stats**

Every building has the following stats.

**HP** defines how much damage the building can sustain before being
destroyed.

**Capacity** defines the maximum number of units that can occupy the
building simultaneously.

**Range** defines how far the building can see, contributing to the
faction\'s map vision.

Special abilities are unique to specific building types and are
described in the species specific building sections.

**Section 11: Buildings --- Robots**

The robot faction\'s buildings reflect their philosophy of fast
production and iterative improvement. Robot buildings are focused on
efficient resource processing, rapid unit production, and modular combat
capability.

**Material Upgrade Research**

Material upgrades are researched at the Home building. The first
available upgrade replaces wood construction with metal. Metal platforms
have significantly improved HP and armor compared to their wood
equivalents. The cost and research time for this upgrade are to be
defined during development. Only platforms produced after the upgrade is
researched are built using the new material.

**Robot Buildings**

**Home** --- the robot faction\'s main building. This is the primary
structure of the robot base. Gatherers return collected resources to the
Home building. The Home building produces Core units, Water Collection
Platforms, Wood Chopper Platforms, and Movable Build Kits. Material
upgrades are researched here. If the Home building is destroyed resource
collection is interrupted and upgrade research is unavailable until a
new one is constructed. There is no limit on the number of Home
buildings a faction can construct.

**Recharge Station** --- a population support building with a capacity
of eight units. Robot factions must construct Recharge Stations to
support population growth beyond the starting limit. One Recharge
Station is required for every eight units the player wishes to field
above the base population cap. Units can enter the Recharge Station.

**Immobile Combat Platform** --- a defensive building that functions as
a long range stationary turret. Has a base vision range contribution
that increases as more Cores enter it. Its maximum vision range does not
match that of a dedicated Watch Tower. Multiple Cores can enter the
Immobile Combat Platform to control it. Each Core occupying the platform
increases both its combat effectiveness and its vision range. The
platform cannot move or be repositioned once placed.

**Water Extractor** --- an automatic water collection building. Must be
placed near a water source. Requires a Core to be attached to function.
Collects water automatically over time without requiring gatherer unit
intervention.

**Wood Storage** --- a resource storage building. Constructed closer to
wood deposits to reduce gatherer travel time. Gatherers can deposit wood
here rather than returning to the Home building.

**Combat Frame Production** --- a production building that produces
Spinner Platforms and Spitter Platforms. Must be constructed before
these platforms are available to the player.

**Combat Research Station** --- an advanced production building that
produces Large Combat Platforms. Must be constructed before this
platform is available to the player.

**Diplomatic Research Station** --- functions as the robot faction\'s
embassy. Produces Spy Platforms and Probe Platforms. Must be constructed
before these platforms are available to the player. One Diplomatic
Research Station is required per allied faction. Diplomatic Research
Stations can be constructed without immediately assigning them to an
allied faction.

**Defensive Research Station** --- a production building that produces
Wall Platforms. Must be constructed before this platform is available to
the player.

**Third Space** --- a culture support building that increases the XP
gain rate of Core units operating as civilians. Any unattached Core
within the vision range of a Third Space gains XP at an accelerated
rate. Cores outside the vision range of any Third Space gain XP at the
base rate. Multiple Third Space buildings can be constructed to extend
coverage across a larger area of the base. The player must actively
position unattached Cores near Third Space buildings to benefit from the
boost.

**Section 12: Buildings --- Wizards**

The wizard faction\'s buildings reflect their philosophy of deliberate
advancement and magical specialization. Wizard buildings are focused on
unlocking powerful unit types, researching new spells, and supporting a
smaller but more capable fighting force.

**Wizard Buildings**

**Castle** --- the wizard faction\'s main building. This is the primary
structure of the wizard base. Surfs return collected resources to the
Castle. All wizard units are recruited at the Castle. If the Castle is
destroyed resource collection is interrupted and unit recruitment is
unavailable until a new one is constructed. There is no limit on the
number of Castles a faction can construct.

**Cottage** --- a population support building with a capacity of five
units. Wizard factions must construct Cottages to support population
growth beyond the starting limit. One Cottage is required for every five
units the player wishes to field above the base population cap. Units
can enter the Cottage.

**Wall** --- a simple impassable barrier. Used to control movement
around the base and protect buildings and units. Has no vision range and
cannot produce units. High HP relative to its cost.

**Wizard Tower** --- a defensive building. One Evoker can enter the
Wizard Tower and cast spells from inside. An Evoker inside a Wizard
Tower gains extended attack range compared to operating in the open. The
tower itself contributes vision range to the surrounding area.

**Watermill** --- an automatic water collection building. Must be placed
near a water source. Collects water automatically over time without
requiring Surf unit intervention.

**Log Cabin** --- a wood storage building. Constructed closer to wood
deposits to reduce Surf travel time. Surfs can deposit wood here rather
than returning to the Castle.

**Mana Reservoir** --- a dedicated mana generating building that
contributes a significant amount of mana to the faction\'s shared pool
over time. Multiple Mana Reservoirs can be constructed to increase the
faction\'s overall mana generation rate. Wizard units within the vision
range of a Mana Reservoir receive a boost to their individual passive
mana generation beyond their base rate. The Mana Reservoir is a high
value target for opposing factions as destroying one meaningfully
reduces the wizard faction\'s magical output and removes the generation
boost for units in that area.

**Library of Evocation** --- a research building that unlocks additional
spells for the Evoker unit. The following spells can be researched here
individually: Ice Blast, which allows Evokers to slow enemy units; Fiery
Explosion, which allows Evokers to deal high damage at mid range; and
Mana Shield, which allows Evokers, Illusionists, and Enchantresses to
convert incoming damage into mana cost. Each spell must be researched
separately and has an associated resource cost.

**Library of Illusion** --- unlocks the Illusionist unit. Additional
Illusionist abilities can be researched here. Must be constructed before
the Illusionist can be recruited.

**Library of Enchantment** --- unlocks the Enchantress unit. Additional
Enchantress abilities including the detector ability can be researched
here. Must be constructed before the Enchantress can be recruited.

**Dragon Hoard** --- unlocks one Dragon unit per Hoard constructed. The
player may construct multiple Dragon Hoards to field multiple Dragons.
Each Dragon Hoard supports exactly one Dragon. If the Dragon associated
with a Hoard is destroyed a new one can be produced at that Hoard.

**Temple** --- unlocks the Cleric unit. Must be constructed before the
Cleric can be recruited.

**Embassy** --- allows the wizard faction to establish a formal
diplomatic relationship with an allied faction. One Embassy is
constructed per allied faction. Embassies can be constructed without
immediately assigning them to an allied faction. The Embassy enables the
full range of diplomatic options described in the Diplomacy section.

**Amphitheatre** --- a culture support building that increases the XP
gain rate of all Subject units faction wide regardless of their position
on the map. The boost provided by a single Amphitheatre is modest. Each
additional Amphitheatre constructed increases the effect, stacking with
previous buildings. No unit positioning is required to benefit from the
boost.

**Section 13: The Mana System**

Mana is a resource unique to the wizard faction. It is not gathered from
the map but generated passively by wizard units and certain buildings
over time. All mana generated by individual units and buildings
contributes to a single shared faction-wide pool. Spells and special
abilities draw from this shared pool when cast.

**Mana Generation**

Every wizard unit generates a small amount of mana passively over time
regardless of what action they are currently performing. This means that
a larger wizard population generates mana faster than a smaller one.
Losing units reduces the faction\'s mana generation rate, weakening the
faction\'s magical capacity at the same time it is losing military
strength.

The Mana Reservoir building generates a significant additional amount of
mana over time. Multiple Mana Reservoirs can be constructed to increase
the faction\'s total mana generation rate.

Units that are within the vision range of a Mana Reservoir receive a
boost to their individual mana generation rate. This encourages the
wizard player to keep units clustered near key structures and creates a
spatial dimension to mana management. Units that move outside the vision
range of any Mana Reservoir generate mana at their base rate without the
boost.

**Mana Consumption**

All spells and special abilities available to wizard units cost mana
drawn from the shared pool at the time of casting. If the shared pool
does not contain sufficient mana to cast a spell that spell cannot be
used until enough mana has accumulated.

Different abilities have different mana costs. Basic attacks such as
Wizard Missiles have a low mana cost. Powerful offensive abilities such
as Fiery Explosion have a high mana cost. Defensive abilities such as
Mana Shield consume mana continuously while active rather than in a
single deduction.

**Strategic Implications**

The shared mana pool creates a natural tension between fielding a large
force and maintaining magical capability. A wizard player who loses
units in combat loses mana generation capacity, reducing their ability
to cast spells at the moment they are most likely to need them.
Conversely a wizard player who successfully grows their population and
clusters units near Mana Reservoirs will have access to a powerful and
continuously replenishing magical arsenal.

Mana Reservoirs are high value targets for opposing factions. Destroying
one does not eliminate mana generation entirely but removes the
generation boost for units in that area, meaningfully reducing the
wizard faction\'s magical output.

**Section 14: The Narrative Layer & LLM**

The narrative layer is powered by a local large language model that runs
alongside the game. It is responsible for generating dialogue, quests,
and named characters. It does not control unit behavior, issue
mechanical directives, or function as a strategic advisor. Its sole role
is to generate narrative content that reflects and responds to the
current state of the match.

**Context**

At any point during the match the LLM has access to the current game
state as context. This includes the balance of power between factions,
the diplomatic relationships currently in effect, the progress of each
faction toward their respective win condition, the current roster of
named characters and their narrative roles, and any dialogue or quest
history generated earlier in the match. The LLM uses this context to
ensure that generated content feels responsive to what is actually
happening in the game rather than generic or disconnected from the match
state.

**Dialogue**

When a Leader or Civilian unit uses the Talk action near another unit
the LLM generates a dialogue exchange appropriate to the current match
state. Dialogue may reflect resource shortages, military threats,
diplomatic tensions, the mood of the population, or developments in the
ongoing narrative. Dialogue is the primary way the story of the match
surfaces for the player and the primary way named characters develop a
distinct identity over the course of a playthrough.

Dialogue generated between units of opposing or neutral factions
reflects the perspective of both parties and may reveal information
about the state of those factions that the player could not otherwise
access through standard map vision.

The dialogue panel appears on screen when a Talk action is initiated.
The player can dismiss it at any time without consequence.

**Quests**

Following a dialogue exchange the LLM may generate a quest based on the
current match state and the content of the dialogue. Quests are specific
actionable objectives with direct mechanical consequences. A quest might
require the player to destroy a specific enemy building, escort a named
character to a meeting point, secure a resource node before an opponent
claims it, or broker an alliance with a particular faction.

Completing a quest produces a tangible mechanical result. This might
include weakening an opponent\'s production capability, securing a
diplomatic agreement, unlocking a unit or building, or advancing
progress toward the cultural victory condition. Quests are the primary
mechanical driver of the cultural victory path but may benefit any play
style depending on their content.

Quests are presented to the player through the dialogue panel and
recorded in the active objectives display. The player is never required
to accept or pursue a quest. If the match state changes significantly a
quest may be replaced by a more relevant one before the player completes
it.

**Named Characters**

When a new unit is created the LLM evaluates the current narrative state
and may designate that unit as a named character. Named characters are
assigned a name and a role in the ongoing story, either as a hero or a
villain. This designation is based on the needs of the narrative at that
moment rather than a fixed mechanical rule.

Named characters appear with a distinct portrait in the interface. They
may be called upon to participate in quests or may be targeted by quests
issued to opposing factions. The death or conversion of a named
character is treated as a significant narrative event and may influence
the dialogue and quests generated afterward.

The player\'s Leader is always a named character from the start of the
match. Other faction leaders encountered during the match may also be
designated named characters by the LLM depending on their role in the
developing story.

**Narrative Perspective**

The narrative generated by the LLM reflects the perspective of the
player\'s chosen faction. A wizard player and a robot player will
experience different dialogue and quests based on their faction\'s
relationship to the events of the match. The five non-playable factions
also have narrative perspectives that surface through dialogue when the
player\'s units interact with theirs.

**Section 15: Diplomacy**

The diplomacy system allows factions to establish and manage formal
relationships with one another. Diplomatic actions are initiated through
the diplomacy panel accessible from the main interface. Each faction has
an alignment stat toward every other faction that reflects how
positively or negatively they regard that faction at any given moment.
This stat is influenced by diplomatic interactions, combat actions, and
quest outcomes over the course of the match.

**Open Borders**

Two factions that have agreed to open borders share full visibility of
each other\'s units and buildings regardless of normal fog of war rules.
Open borders must be agreed to by both factions to be enabled and must
be agreed to by both factions to be disabled. Neither faction can
unilaterally revoke the agreement. While open borders are active both
factions have full visibility of each other\'s units, buildings, and
faction stats.

**Resource Request**

A faction may request a specific quantity of a resource from an allied
faction. The receiving faction must formally accept or decline the
request. If accepted the requested resources are immediately transferred
from the offering faction\'s pool to the requesting faction\'s pool. If
declined there is no mechanical consequence, though the requesting
faction may react based on their alignment toward the declining faction.

**Unit Request**

A faction may request a specific unit from an allied faction. The
receiving faction must formally accept or decline the request. If
accepted the unit is permanently transferred to the requesting faction
and is removed from the original faction\'s roster. Named characters can
be requested in this way, making unit requests a potentially significant
narrative decision. If declined there is no mechanical consequence,
though the requesting faction may react based on their alignment toward
the declining faction.

**Non-Combat Treaty**

Two factions may agree to a non-combat treaty. Both factions must
consent to establish the treaty. While the treaty is active neither
faction may issue attack commands against the other. This restriction is
enforced mechanically --- attack commands targeting treaty partners are
unavailable while the treaty is in effect. Disabling the treaty requires
the consent of both factions. Once disabled both factions may resume
combat actions against each other freely.

**Embassy**

A faction may request that an allied faction construct an Embassy
dedicated to them. The receiving faction must accept or decline the
request. If accepted the receiving faction constructs an Embassy
building in their territory. The Embassy formalizes the diplomatic
relationship between the two factions and enables the full range of
diplomatic options described in this section. Embassies can be
constructed without immediately assigning them to an allied faction. The
wizard faction constructs a standard Embassy building. The robot faction
uses the Diplomatic Research Station for this purpose and must construct
one per allied faction.

**Section 16: Faction Stats**

Each faction has a set of stats that reflect their current standing in
the world. These stats are tracked continuously and update in real time
as the match progresses. They are used by the game to inform the LLM\'s
narrative generation, by the diplomacy system to reflect the balance of
power, and by the player to assess their own position relative to
opposing factions.

The player can view their own faction stats at any time through the
interface. The stats of opposing factions are only visible to the extent
that the player has information about them through map vision, dialogue,
or diplomatic relationships. A faction with open borders with another
faction has full visibility of that faction\'s stats.

**Population** --- the total number of units currently fielded by the
faction. Population is capped by the number of population support
buildings the faction has constructed. Increasing population requires
constructing additional Cottages for the wizard faction or Recharge
Stations for the robot faction.

**Military Strength** --- a measure of the faction\'s total offensive
capability. Calculated from the combined damage stats of all military
units currently fielded. This stat gives a broad indication of how
dangerous a faction is in direct combat.

**Culture** --- a measure of the faction\'s civilian presence.
Calculated from the total number of civilian units currently fielded and
their accumulated XP. Culture is the primary stat tracked for progress
toward the cultural victory condition.

**Defense** --- a measure of the faction\'s defensive infrastructure.
Calculated from the total number and HP of walls and defensive buildings
currently constructed. A high defense stat indicates a faction that is
well fortified against attack.

**Intelligence** --- a measure of the faction\'s accumulated experience.
Calculated from the total XP of all units currently fielded across all
unit types. A high intelligence stat reflects a faction with experienced
and capable units.

**Resources** --- the faction\'s current stockpile of physical
resources. Tracks the total quantity of wood and water currently held.
For the wizard faction the current mana pool level is also reflected
here.

**Footprint** --- a measure of the faction\'s territorial presence.
Calculated from the total area occupied by the faction\'s buildings. A
large footprint indicates a faction that has expanded significantly
across the map.

**Faction Alignment** --- a per-faction stat that reflects how
positively or negatively each other faction regards this faction. Each
faction has a separate alignment value toward every other faction in the
match. Alignment is influenced by diplomatic interactions, combat
actions, quest outcomes, and narrative events generated by the LLM.
Alignment affects how non-playable factions respond to diplomatic
requests and how they behave toward the faction on the map.

**Open Borders Status** --- tracks which factions currently have an
active open borders agreement with this faction. Both factions must
agree to enable or disable open borders. This is displayed as a
per-faction indicator in the diplomacy panel.

**Section 17: Win Conditions**

There are three win conditions. The match ends immediately when any
faction achieves any one of them. Only one faction can win the match. AI
opponents each pursue a single win condition from the start of the
match. The player may pursue any win condition and may shift their focus
over the course of the match.

**Military Victory**

A faction achieves military victory when all opposing faction leaders
have been killed or captured. This includes both the leaders of the two
playable factions and the leaders of the five non-playable factions. A
faction whose leader is destroyed is eliminated from the match. The last
faction with a living leader that has eliminated all others wins the
match.

Military victory can be pursued through direct combat using military
units or through espionage using spy units. A spy unit that locates a
leader hiding inside a building and successfully forces them out exposes
them to attack. Leaders can be protected by hiding them inside
buildings, surrounding them with defensive units, and constructing walls
and defensive structures around the base.

**Cultural Victory**

A faction achieves cultural victory when it has reached the maximum
civilian population and all of those civilian units have reached maximum
XP. This is the most time intensive victory condition and requires
sustained engagement with the narrative layer throughout the match.

Progress toward cultural victory is driven primarily by completing
quests generated by the local LLM. Quests that advance the cultural
victory path reward the player with culture progress, named character
development, and narrative advancement in addition to their immediate
mechanical effects. A faction pursuing cultural victory must protect its
civilian population carefully as civilian losses directly set back
progress toward this condition.

**Technological Victory**

A faction achieves technological victory when it has constructed every
unit type and building available in the game. This includes items from
both species. Certain advanced units and buildings require access to the
opposing species to unlock, meaning the player must convert opposing
units or establish alliances and request a unit of the opposing species
--- such as a Surf or a Core with a construction platform --- before
they can complete their tech tree.

The technological victory rewards sustained economic development, map
control, and strategic diplomacy. A faction pursuing this condition must
maintain a stable resource economy long enough to construct everything
available to them while defending against opponents who may be close to
achieving their own victory conditions.

**Section 18: Alerts & Notifications**

The game surfaces time-sensitive events to the player through an alert
system. Alerts appear as a persistent log in the interface and may
optionally flash the relevant area of the minimap to draw the player\'s
attention. The player can click an alert to center the camera on the
relevant unit or building.

Alerts are grouped into the following categories.

**Combat** --- a friendly unit is under attack; a friendly building is
under attack; a friendly unit has been destroyed; a friendly building
has been destroyed. Combat alerts are the most time-critical and are
accompanied by a distinct audio cue in addition to the visual
notification.

**Conversion** --- a friendly unit is currently being targeted by a
Convert action; a friendly unit has been successfully converted by an
opposing faction. Conversion alerts are accompanied by a distinct audio
cue in addition to the visual notification.

**Resources** --- current stockpile of wood or water has fallen below a
defined threshold; an action could not be completed due to insufficient
resources; mana pool is critically low (wizard faction only).

**Production** --- a unit has finished being produced and is ready; a
research upgrade has completed.

**Narrative** --- a quest has been generated and is available; a named
character has been designated; a named character has been killed or
converted by an opposing faction.

**Diplomacy** --- a diplomatic request has been received from another
faction; an existing treaty or open borders agreement has been
terminated; a faction\'s alignment toward the player has changed
significantly.

**Victory** --- any faction is approaching a win condition. The
threshold at which this alert triggers is to be defined during
development.
