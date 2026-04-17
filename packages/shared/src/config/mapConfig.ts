// Map sizes, terrain costs, and deposit quantities.
// Values marked "Initial guess" — update to "Confirmed" after playtesting sign-off.

export type MapSize = {
  widthTiles: number;
  heightTiles: number;
};

export const mapSizes = {
  // Initial guess: standard RTS map scale.
  small: { widthTiles: 64, heightTiles: 64 } satisfies MapSize,
  medium: { widthTiles: 128, heightTiles: 128 } satisfies MapSize,
  large: { widthTiles: 256, heightTiles: 256 } satisfies MapSize,
};

export const terrainMovementCosts = {
  // Initial guess: movement cost multipliers (1.0 = normal speed).
  open: 1.0,
  forest: 1.6, // Initial guess: forests slow movement significantly
  water: 9999, // Initial guess: impassable for ground units
};

export const woodDepositQuantity = {
  // Initial guess: per-deposit range. See resourceCosts.ts for finite/regen policy.
  min: 400,
  max: 800,
};

export const startingResources = {
  // Initial guess: enough to build a few units and one expansion.
  wood: 150,
  water: 100,
  mana: 0, // mana generates passively; no starting pool
};
