import { describe, it, expect, vi, beforeEach } from "vitest";

// ── PixiJS mock ───────────────────────────────────────────────────────────────
// PixiJS requires WebGL which jsdom cannot provide. We mock it at module level.

const mockCanvas = document.createElement("canvas");
const mockAppInit = vi.fn().mockResolvedValue(undefined);
const mockAppDestroy = vi.fn();
const mockContainerAddChild = vi.fn();

vi.mock("pixi.js", () => {
  class MockApplication {
    canvas = mockCanvas;
    screen = { width: 800, height: 600 };
    stage = { addChild: vi.fn() };
    init = mockAppInit;
    destroy = mockAppDestroy;
  }

  class MockContainer {
    children: unknown[] = [];
    addChild = mockContainerAddChild;
    removeChildren = vi.fn(() => { this.children = []; });
    scale = { set: vi.fn() };
    x = 0;
    y = 0;
  }

  class MockAssets {
    static load = vi.fn().mockResolvedValue(undefined);
  }

  return {
    Application: MockApplication,
    Container: MockContainer,
    Sprite: { from: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0, tint: 0 })) },
    Assets: MockAssets,
  };
});

// Import after mock is registered
const { GameRenderer } = await import("./GameRenderer.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe("GameRenderer lifecycle", () => {
  it("destroy() before init() does not throw", () => {
    const renderer = new GameRenderer();
    expect(() => renderer.destroy()).not.toThrow();
  });

  it("destroy() before init() leaves app as null (no PixiJS destroy call)", () => {
    const renderer = new GameRenderer();
    renderer.destroy();
    expect(mockAppDestroy).not.toHaveBeenCalled();
  });

  it("init() calls Application.init with the container", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();
    await renderer.init(container);
    expect(mockAppInit).toHaveBeenCalledOnce();
    renderer.destroy();
  });

  it("destroy() after successful init() calls app.destroy", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();
    await renderer.init(container);
    renderer.destroy();
    expect(mockAppDestroy).toHaveBeenCalledOnce();
  });

  it("calling destroy() twice after init() does not throw", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();
    await renderer.init(container);
    renderer.destroy();
    expect(() => renderer.destroy()).not.toThrow();
  });

  it("StrictMode simulation: destroy while init pending does not throw", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();

    // Start init but don't await — simulate StrictMode cleanup firing immediately
    const initPromise = renderer.init(container);
    renderer.destroy(); // called before either await in init() resolves

    // Let init finish — it should detect destroyed=true and abort cleanly
    await expect(initPromise).resolves.toBeUndefined();

    // A second destroy call must also be safe
    expect(() => renderer.destroy()).not.toThrow();
  });
});

// ── Input handlers ────────────────────────────────────────────────────────────

describe("GameRenderer input", () => {
  it("contextmenu event is prevented", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();
    await renderer.init(container);

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    mockCanvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    renderer.destroy();
  });

  it("wheel scrolling up increases zoom index", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();
    await renderer.init(container);

    const zoomBefore = renderer.currentZoom;
    const wheelUp = new WheelEvent("wheel", { deltaY: -100, cancelable: true });
    mockCanvas.dispatchEvent(wheelUp);

    expect(renderer.currentZoom).toBeGreaterThan(zoomBefore);
    renderer.destroy();
  });

  it("wheel scrolling down decreases zoom index", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();
    await renderer.init(container);

    // Start at max zoom first
    const { ZOOM_LEVELS } = await import("./GameRenderer.js");
    renderer.setZoom(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!);

    const zoomBefore = renderer.currentZoom;
    const wheelDown = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
    mockCanvas.dispatchEvent(wheelDown);

    expect(renderer.currentZoom).toBeLessThan(zoomBefore);
    renderer.destroy();
  });

  it("zoom cannot go below minimum zoom level", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();
    await renderer.init(container);

    const { ZOOM_LEVELS } = await import("./GameRenderer.js");
    renderer.setZoom(ZOOM_LEVELS[0]!);

    for (let i = 0; i < 10; i++) {
      mockCanvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true }));
    }

    expect(renderer.currentZoom).toBe(ZOOM_LEVELS[0]);
    renderer.destroy();
  });

  it("zoom cannot exceed maximum zoom level", async () => {
    const renderer = new GameRenderer();
    const container = makeContainer();
    await renderer.init(container);

    const { ZOOM_LEVELS } = await import("./GameRenderer.js");
    renderer.setZoom(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!);

    for (let i = 0; i < 10; i++) {
      mockCanvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    }

    expect(renderer.currentZoom).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    renderer.destroy();
  });
});
