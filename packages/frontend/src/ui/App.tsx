import { useEffect, useRef } from "react";
import { GameEngine } from "../game/GameEngine.js";
import { GameRenderer } from "../renderer/GameRenderer.js";
import { useGameStore } from "../store/gameStore.js";
import { useUIStore } from "../store/uiStore.js";
import { AlertLog } from "./hud/AlertLog.js";
import { BottomPanel } from "./hud/BottomPanel.js";
import { ResourceBar } from "./hud/ResourceBar.js";
import styles from "./App.module.css";

const PAN_STEP = 192; // pixels per WASD keydown

export function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const pushGameState = useGameStore((s) => s.pushGameState);
  const activeFaction = useUIStore((s) => s.activeFaction);
  const cameraTarget = useUIStore((s) => s.cameraTarget);
  const setCameraTarget = useUIStore((s) => s.setCameraTarget);
  const selection = useUIStore((s) => s.selection);
  const pendingStop = useUIStore((s) => s.pendingStop);
  const clearPendingStop = useUIStore((s) => s.clearPendingStop);
  const pendingProduction = useUIStore((s) => s.pendingProduction);
  const clearPendingProduction = useUIStore((s) => s.clearPendingProduction);

  // Init renderer + engine
  useEffect(() => {
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

    const engine = new GameEngine({
      mapSize: "small",
      seed: 42,
      onTick: (state) => {
        pushGameState(state);
        renderer.render(state);
      },
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
  }, [pushGameState]);

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
