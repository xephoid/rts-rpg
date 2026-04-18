import { useState } from "react";
import { uiText, namedLeaders, mapSizes } from "@neither/shared";
import styles from "./StartScreen.module.css";

type MapSizeKey = "small" | "medium" | "large";

type Props = {
  onStart: (faction: "wizards" | "robots", mapSize: MapSizeKey) => void;
};

const MAP_SIZE_LABELS: Record<MapSizeKey, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export function StartScreen({ onStart }: Props) {
  const [mapSize, setMapSize] = useState<MapSizeKey>("small");

  return (
    <div className={styles.screen}>
      <div className={styles.title}>Neither ___ Nor Gears</div>
      <div className={styles.subtitle}>Choose your faction</div>

      <div className={styles.cards}>
        {(["wizards", "robots"] as const).map((faction) => (
          <button
            key={faction}
            className={`${styles.card} ${faction === "wizards" ? styles.cardWizards : styles.cardRobots}`}
            onClick={() => onStart(faction, mapSize)}
          >
            <div className={styles.factionName}>{uiText.factions[faction]}</div>
            <div className={styles.leaderName}>{namedLeaders[faction].name}</div>
            <div className={styles.tagline}>{uiText.factionTaglines[faction]}</div>
            <div className={styles.startHint}>Click to play</div>
          </button>
        ))}
      </div>

      <div className={styles.mapSection}>
        <div className={styles.mapLabel}>Map Size</div>
        <div className={styles.mapRow}>
          {(["small", "medium", "large"] as const).map((size) => {
            const dims = mapSizes[size];
            return (
              <button
                key={size}
                className={`${styles.mapBtn}${mapSize === size ? ` ${styles.mapBtnActive}` : ""}`}
                onClick={() => setMapSize(size)}
              >
                {MAP_SIZE_LABELS[size]}
                <div className={styles.mapDims}>{dims.widthTiles} × {dims.heightTiles}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
