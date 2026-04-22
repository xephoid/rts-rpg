export type MapSize = {
    widthTiles: number;
    heightTiles: number;
};
export declare const mapSizes: {
    small: {
        widthTiles: number;
        heightTiles: number;
    };
    medium: {
        widthTiles: number;
        heightTiles: number;
    };
    large: {
        widthTiles: number;
        heightTiles: number;
    };
};
export declare const terrainMovementCosts: {
    open: number;
    forest: number;
    water: number;
};
export declare const woodDepositQuantity: {
    min: number;
    max: number;
};
export declare const startingResources: {
    wood: number;
    water: number;
    mana: number;
};
/**
 * Floor on how much wood every spawn must have within easy reach. Map generation
 * first prefers spawn candidates whose surroundings already satisfy the floor
 * (a soft bias) and then plants a small forest cluster on any spawn still short
 * after the 6-tile clear radius wipes its immediate neighbourhood (a hard
 * guarantee). Without this, noise-driven forest placement can leave a player
 * with zero accessible wood while their opponent has a grove next door.
 */
export declare const spawnWoodGuarantee: {
    radiusTiles: number;
    minDeposits: number;
};
//# sourceMappingURL=mapConfig.d.ts.map