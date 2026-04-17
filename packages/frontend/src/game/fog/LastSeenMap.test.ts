import { describe, it, expect } from "vitest";
import { LastSeenMap } from "./LastSeenMap.js";
import type { EntitySnapshot } from "@neither/shared";

function makeSnapshot(id: string): EntitySnapshot {
  return {
    id,
    kind: "unit",
    faction: "wizards",
    typeKey: "evoker",
    position: { x: 0, y: 0 },
    stats: { hp: 100, maxHp: 100, damage: 20, range: 5, speed: 2, charisma: 3, armor: 5, capacity: 10, xp: 0, level: 1 },
    isNamed: false,
    name: null,
  };
}

describe("LastSeenMap", () => {
  it("records and retrieves snapshot", () => {
    const ls = new LastSeenMap();
    const s = makeSnapshot("u1");
    ls.record(s, 42);
    expect(ls.get("u1")?.snapshot.id).toBe("u1");
    expect(ls.get("u1")?.tick).toBe(42);
  });

  it("overwrites previous entry on re-record", () => {
    const ls = new LastSeenMap();
    ls.record(makeSnapshot("u1"), 10);
    ls.record(makeSnapshot("u1"), 20);
    expect(ls.get("u1")?.tick).toBe(20);
  });

  it("recordAll records multiple snapshots", () => {
    const ls = new LastSeenMap();
    ls.recordAll([makeSnapshot("u1"), makeSnapshot("u2")], 5);
    expect(ls.get("u1")).toBeDefined();
    expect(ls.get("u2")).toBeDefined();
  });

  it("remove deletes entry", () => {
    const ls = new LastSeenMap();
    ls.record(makeSnapshot("u1"), 1);
    ls.remove("u1");
    expect(ls.get("u1")).toBeUndefined();
  });

  it("all() returns all entries", () => {
    const ls = new LastSeenMap();
    ls.recordAll([makeSnapshot("u1"), makeSnapshot("u2")], 1);
    expect(ls.all()).toHaveLength(2);
  });

  it("clear() empties map", () => {
    const ls = new LastSeenMap();
    ls.record(makeSnapshot("u1"), 1);
    ls.clear();
    expect(ls.all()).toHaveLength(0);
  });
});
