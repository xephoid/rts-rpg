import { useEffect, useRef, useState } from "react";
import { GameEngine } from "../game/GameEngine.js";
import { GameRenderer } from "../renderer/GameRenderer.js";
import { useGameStore } from "../store/gameStore.js";
import { useUIStore } from "../store/uiStore.js";
import { AlertLog } from "./hud/AlertLog.js";
import { BottomPanel } from "./hud/BottomPanel.js";
import { ResourceBar } from "./hud/ResourceBar.js";
import { StartScreen } from "./screens/StartScreen.js";
import styles from "./App.module.css";

const PAN_STEP = 192; // pixels per WASD keydown

export function App() {
  const [screen, setScreen] = useState<"start" | "playing">("start");
  const mapSizeRef = useRef<"small" | "medium" | "large">("small");
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const pushGameState = useGameStore((s) => s.pushGameState);
  const setActiveFaction = useUIStore((s) => s.setActiveFaction);
  const activeFaction = useUIStore((s) => s.activeFaction);
  const cameraTarget = useUIStore((s) => s.cameraTarget);
  const setCameraTarget = useUIStore((s) => s.setCameraTarget);
  const selection = useUIStore((s) => s.selection);
  const pendingStop = useUIStore((s) => s.pendingStop);
  const clearPendingStop = useUIStore((s) => s.clearPendingStop);
  const pendingProduction = useUIStore((s) => s.pendingProduction);
  const clearPendingProduction = useUIStore((s) => s.clearPendingProduction);
  const pendingCancelProduction = useUIStore((s) => s.pendingCancelProduction);
  const clearPendingCancelProduction = useUIStore((s) => s.clearPendingCancelProduction);
  const buildMode = useUIStore((s) => s.buildMode);
  const pendingBuildOrder = useUIStore((s) => s.pendingBuildOrder);
  const clearPendingBuildOrder = useUIStore((s) => s.clearPendingBuildOrder);
  const pendingDemolish = useUIStore((s) => s.pendingDemolish);
  const clearPendingDemolish = useUIStore((s) => s.clearPendingDemolish);
  const pendingResumeConstruction = useUIStore((s) => s.pendingResumeConstruction);
  const clearPendingResumeConstruction = useUIStore((s) => s.clearPendingResumeConstruction);
  const pendingResearch = useUIStore((s) => s.pendingResearch);
  const clearPendingResearch = useUIStore((s) => s.clearPendingResearch);
  const pendingCancelResearch = useUIStore((s) => s.pendingCancelResearch);
  const clearPendingCancelResearch = useUIStore((s) => s.clearPendingCancelResearch);
  const pendingAttach = useUIStore((s) => s.pendingAttach);
  const clearPendingAttach = useUIStore((s) => s.clearPendingAttach);
  const pendingDetach = useUIStore((s) => s.pendingDetach);
  const clearPendingDetach = useUIStore((s) => s.clearPendingDetach);
  const pendingManaShieldToggle = useUIStore((s) => s.pendingManaShieldToggle);
  const clearPendingManaShieldToggle = useUIStore((s) => s.clearPendingManaShieldToggle);

  // Init renderer + engine — only once faction has been chosen
  useEffect(() => {
    if (screen !== "playing") return;
    if (!canvasRef.current) return;

    let cancelled = false;
    const container = canvasRef.current;
    const renderer = new GameRenderer({
      onCameraChange: (x, y, zoom) =>
        useUIStore.getState().setCameraPosition(x, y, zoom),
      onEntitySelect: (ids, kind) => {
        const store = useUIStore.getState();
        if (ids.length === 0) {
          store.setSelection({ mode: "none" });
        } else if (ids.length === 1) {
          store.setSelection({ mode: "single", id: ids[0]!, kind: kind! });
        } else {
          store.setSelection({ mode: "multi", ids });
        }
      },
      onGatherOrder: (unitIds, depositId) => {
        for (const id of unitIds) engineRef.current?.issueGatherOrder(id, depositId);
      },
      onAttackOrder: (unitIds, targetId) => {
        for (const id of unitIds) engineRef.current?.issueAttackOrder(id, targetId);
      },
      onTalkOrder: (unitIds, targetId) => {
        for (const id of unitIds) engineRef.current?.issueTalkOrder(id, targetId);
      },
      onResumeConstructionOrder: (unitIds, buildingId) => {
        for (const id of unitIds) {
          useUIStore.getState().issueResumeConstruction(id, buildingId);
        }
      },
      onAttachOrder: (coreId, platformId) => {
        useUIStore.getState().issueAttach(coreId, platformId);
      },
      onBuildOrder: (tileX, tileY) => {
        const bm = useUIStore.getState().buildMode;
        if (!bm) return;
        useUIStore.getState().issueBuildOrder(bm.unitId, bm.buildingTypeKey, { x: tileX, y: tileY });
        useUIStore.getState().setBuildMode(null);
      },
      onMoveOrder: (entityIds, target) => {
        const { pendingPatrolIds, setPendingPatrolIds } = useUIStore.getState();
        if (pendingPatrolIds && pendingPatrolIds.length > 0) {
          // Issue patrol from each unit's current position to the right-clicked target
          for (const id of pendingPatrolIds) {
            const unit = engineRef.current?.entities.get(id);
            if (unit && unit.kind === "unit") {
              engineRef.current?.issuePatrolOrder(id, { ...unit.position }, target);
            }
          }
          setPendingPatrolIds(null);
        } else {
          for (const id of entityIds) engineRef.current?.issueMoveOrder(id, target);
        }
      },
    });
    rendererRef.current = renderer;
    // Set immediately — the sync effect only fires on changes, so if the user picked
    // the store's default faction ("robots") it would never run and the renderer
    // would stay on its own default ("wizards").
    renderer.setActiveFaction(useUIStore.getState().activeFaction);

    const engine = new GameEngine({
      mapSize: mapSizeRef.current,
      seed: 42,
      onTick: (state) => {
        pushGameState(state);
        renderer.render(state);
      },
      onAlert: (message) => useUIStore.getState().pushAlert(message),
    });
    engineRef.current = engine;

    renderer.init(container).then(() => {
      if (cancelled) {
        renderer.destroy();
        return;
      }
      engine.start();
    });

    return () => {
      cancelled = true;
      rendererRef.current = null;
      engineRef.current = null;
      engine.stop();
      renderer.destroy();
    };
  }, [pushGameState, screen]);

  // Sync active faction to renderer
  useEffect(() => {
    rendererRef.current?.setActiveFaction(activeFaction);
  }, [activeFaction]);

  // Forward minimap camera requests to renderer
  useEffect(() => {
    if (!cameraTarget) return;
    rendererRef.current?.setCameraPosition(cameraTarget.x, cameraTarget.y);
    setCameraTarget(null);
  }, [cameraTarget, setCameraTarget]);

  // Sync selection from store to renderer (handles programmatic deselection)
  useEffect(() => {
    const ids =
      selection.mode === "none"
        ? []
        : selection.mode === "single"
          ? [selection.id]
          : selection.ids;
    rendererRef.current?.setSelectedIds(ids);
  }, [selection]);

  // Consume pending stop orders
  useEffect(() => {
    if (!pendingStop) return;
    for (const id of pendingStop) engineRef.current?.issueStopOrder(id);
    clearPendingStop();
  }, [pendingStop, clearPendingStop]);

  // Consume pending production orders
  useEffect(() => {
    if (!pendingProduction) return;
    engineRef.current?.issueProductionOrder(pendingProduction.buildingId, pendingProduction.unitTypeKey);
    clearPendingProduction();
  }, [pendingProduction, clearPendingProduction]);

  // Consume pending cancel production orders
  useEffect(() => {
    if (!pendingCancelProduction) return;
    engineRef.current?.issueCancelProduction(pendingCancelProduction.buildingId);
    clearPendingCancelProduction();
  }, [pendingCancelProduction, clearPendingCancelProduction]);

  // Sync build mode to renderer (ghost placement)
  useEffect(() => {
    rendererRef.current?.setBuildMode(
      buildMode
        ? { typeKey: buildMode.buildingTypeKey, footprintTiles: buildMode.footprintTiles, faction: buildMode.faction }
        : null
    );
  }, [buildMode]);

  // Consume pending build orders
  useEffect(() => {
    if (!pendingBuildOrder) return;
    engineRef.current?.issueBuildOrder(
      pendingBuildOrder.unitId,
      pendingBuildOrder.buildingTypeKey,
      pendingBuildOrder.tilePos,
    );
    clearPendingBuildOrder();
  }, [pendingBuildOrder, clearPendingBuildOrder]);

  // Consume pending demolish orders
  useEffect(() => {
    if (!pendingDemolish) return;
    engineRef.current?.issueDemolishOrder(pendingDemolish.buildingId);
    clearPendingDemolish();
  }, [pendingDemolish, clearPendingDemolish]);

  // Consume pending resume construction orders
  useEffect(() => {
    if (!pendingResumeConstruction) return;
    engineRef.current?.issueResumeConstructionOrder(
      pendingResumeConstruction.unitId,
      pendingResumeConstruction.buildingId,
    );
    clearPendingResumeConstruction();
  }, [pendingResumeConstruction, clearPendingResumeConstruction]);

  // Consume pending research orders
  useEffect(() => {
    if (!pendingResearch) return;
    engineRef.current?.issueResearchOrder(pendingResearch.buildingId, pendingResearch.researchKey);
    clearPendingResearch();
  }, [pendingResearch, clearPendingResearch]);

  // Consume pending cancel research orders
  useEffect(() => {
    if (!pendingCancelResearch) return;
    engineRef.current?.issueCancelResearchOrder(pendingCancelResearch.buildingId);
    clearPendingCancelResearch();
  }, [pendingCancelResearch, clearPendingCancelResearch]);

  // Consume pending attach orders
  useEffect(() => {
    if (!pendingAttach) return;
    engineRef.current?.issueAttachOrder(pendingAttach.coreId, pendingAttach.platformId);
    clearPendingAttach();
  }, [pendingAttach, clearPendingAttach]);

  // Consume pending detach orders
  useEffect(() => {
    if (!pendingDetach) return;
    engineRef.current?.issueDetachOrder(pendingDetach.platformId);
    clearPendingDetach();
  }, [pendingDetach, clearPendingDetach]);

  // Consume pending mana shield toggle orders
  useEffect(() => {
    if (!pendingManaShieldToggle) return;
    engineRef.current?.issueManaShieldToggle(pendingManaShieldToggle);
    clearPendingManaShieldToggle();
  }, [pendingManaShieldToggle, clearPendingManaShieldToggle]);

  // WASD panning
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const renderer = rendererRef.current;
      if (!renderer) return;
      // Don't steal keys when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const { cameraX, cameraY } = useUIStore.getState();
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "w":
        case "W":
          dy = -PAN_STEP;
          break;
        case "s":
        case "S":
          dy = PAN_STEP;
          break;
        case "a":
        case "A":
          dx = -PAN_STEP;
          break;
        case "d":
        case "D":
          dx = PAN_STEP;
          break;
        default:
          return;
      }
      e.preventDefault();
      renderer.setCameraPosition(cameraX + dx, cameraY + dy);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (screen === "start") {
    return (
      <StartScreen
        onStart={(faction, mapSize) => {
          mapSizeRef.current = mapSize;
          setActiveFaction(faction);
          setScreen("playing");
        }}
      />
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.canvasContainer} ref={canvasRef} />
      <div className={styles.hud}>
        <ResourceBar />
        <AlertLog />
        <BottomPanel />
      </div>
    </div>
  );
}
