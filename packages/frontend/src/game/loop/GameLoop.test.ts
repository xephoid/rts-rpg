import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameLoop, TICK_MS } from "./GameLoop.js";

// Stub browser APIs not present in Node/jsdom
const rafCallbacks: Map<number, FrameRequestCallback> = new Map();
let rafId = 0;

beforeEach(() => {
  rafId = 0;
  rafCallbacks.clear();

  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafCallbacks.set(id, cb);
    return id;
  });

  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafCallbacks.delete(id);
  });

  vi.stubGlobal("performance", { now: vi.fn(() => 0) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushFrames(loop: GameLoop, timestamps: number[]): void {
  for (const t of timestamps) {
    vi.mocked(performance.now).mockReturnValue(t);
    const callbacks = [...rafCallbacks.values()];
    rafCallbacks.clear();
    for (const cb of callbacks) cb(t);
  }
}

describe("GameLoop", () => {
  it("calls onTick once per TICK_MS of elapsed time", () => {
    const onTick = vi.fn();
    const loop = new GameLoop(onTick);
    loop.start();

    // Simulate two full ticks worth of time
    flushFrames(loop, [TICK_MS, TICK_MS * 2]);

    expect(onTick).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it("passes incrementing tick number to onTick", () => {
    const ticks: number[] = [];
    const loop = new GameLoop((tick) => ticks.push(tick));
    loop.start();

    // Use 17ms per frame (slightly > TICK_MS) to avoid floating-point accumulator drift
    flushFrames(loop, [17, 34, 51]);

    expect(ticks).toEqual([1, 2, 3]);
    loop.stop();
  });

  it("does not call onTick while paused", () => {
    const onTick = vi.fn();
    const loop = new GameLoop(onTick);
    loop.start();
    loop.pause();

    flushFrames(loop, [TICK_MS, TICK_MS * 2]);

    expect(onTick).not.toHaveBeenCalled();
    loop.stop();
  });

  it("resumes ticking after resume()", () => {
    const onTick = vi.fn();
    const loop = new GameLoop(onTick);
    loop.start();
    loop.pause();

    flushFrames(loop, [TICK_MS]);
    loop.resume();
    // After resume, lastTimestamp is reset — need a new frame with elapsed time
    flushFrames(loop, [TICK_MS + TICK_MS]);

    expect(onTick).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it("caps large dt to prevent spiral of death", () => {
    const onTick = vi.fn();
    const loop = new GameLoop(onTick);
    loop.start();

    // Simulate a 1-second freeze — should cap at 250ms → at most 15 ticks
    flushFrames(loop, [1000]);

    expect(onTick.mock.calls.length).toBeLessThanOrEqual(15);
    loop.stop();
  });

  it("calls onRender with alpha between 0 and 1", () => {
    const alphas: number[] = [];
    const loop = new GameLoop(vi.fn(), (alpha) => alphas.push(alpha));
    loop.start();

    flushFrames(loop, [TICK_MS * 1.5]);

    expect(alphas.length).toBeGreaterThan(0);
    for (const a of alphas) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
    loop.stop();
  });

  it("stop() prevents further ticks", () => {
    const onTick = vi.fn();
    const loop = new GameLoop(onTick);
    loop.start();
    flushFrames(loop, [TICK_MS]);
    loop.stop();

    const callsBefore = onTick.mock.calls.length;
    flushFrames(loop, [TICK_MS * 2]);
    expect(onTick.mock.calls.length).toBe(callsBefore);
  });
});
