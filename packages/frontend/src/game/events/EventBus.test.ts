import { describe, it, expect, vi } from "vitest";
import { EventBus } from "./EventBus.js";

describe("EventBus", () => {
  it("dispatch() fires registered handler immediately", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("UnitDied", handler);
    bus.dispatch("UnitDied", { unitId: "u1", killedById: "u2", position: { x: 0, y: 0 } });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("dispatch() does not fire handler for different event", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("LevelUp", handler);
    bus.dispatch("UnitDied", { unitId: "u1", killedById: "u2", position: { x: 0, y: 0 } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribe function stops future calls", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on("LevelUp", handler);
    unsub();
    bus.dispatch("LevelUp", { entityId: "u1", newLevel: 2 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("multiple handlers on same event all fire", () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("XpGained", h1);
    bus.on("XpGained", h2);
    bus.dispatch("XpGained", { entityId: "u1", amount: 10, source: "kill" });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("queue() does not fire handler until flushDeferred()", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("ResourceLow", handler);
    bus.queue("ResourceLow", { faction: "wizards", resourceType: "wood", current: 5 });
    expect(handler).not.toHaveBeenCalled();
    bus.flushDeferred();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("flushDeferred() clears the queue", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("ResourceLow", handler);
    bus.queue("ResourceLow", { faction: "wizards", resourceType: "wood", current: 5 });
    bus.flushDeferred();
    bus.flushDeferred();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("handler queuing more events during flushDeferred() does not cause infinite loop", () => {
    const bus = new EventBus();
    let count = 0;
    bus.on("LevelUp", () => {
      count++;
      if (count < 5) {
        bus.queue("LevelUp", { entityId: "u1", newLevel: count + 1 });
      }
    });
    bus.queue("LevelUp", { entityId: "u1", newLevel: 1 });
    bus.flushDeferred(); // should process only the first one
    expect(count).toBe(1);
  });

  it("clear() removes all handlers", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("BuildingDestroyed", handler);
    bus.clear();
    bus.dispatch("BuildingDestroyed", { buildingId: "b1", destroyedById: "u1" });
    expect(handler).not.toHaveBeenCalled();
  });
});
