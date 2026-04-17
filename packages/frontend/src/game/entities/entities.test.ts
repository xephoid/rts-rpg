import { describe, it, expect, beforeEach } from "vitest";
import { _resetEntityIdCounter } from "./Entity.js";
import { UnitEntity } from "./UnitEntity.js";
import { BuildingEntity } from "./BuildingEntity.js";
import { EntityManager } from "./EntityManager.js";
import { StatBlock } from "./StatBlock.js";

const baseStats = {
  maxHp: 100,
  damage: 20,
  range: 5,
  speed: 2,
  charisma: 3,
  armor: 5,
  capacity: 10,
};

beforeEach(() => {
  _resetEntityIdCounter();
});

// ── StatBlock ────────────────────────────────────────────────────────────────

describe("StatBlock", () => {
  it("initialises at full HP", () => {
    const s = new StatBlock(baseStats);
    expect(s.hp).toBe(100);
    expect(s.isDead).toBe(false);
  });

  it("applyDamage reduces HP by rawDamage minus armor", () => {
    const s = new StatBlock(baseStats); // armor 5
    const dealt = s.applyDamage(20);
    expect(dealt).toBe(15); // 20 - 5
    expect(s.hp).toBe(85);
  });

  it("applyDamage floors damage at 1", () => {
    const s = new StatBlock({ ...baseStats, armor: 50 });
    const dealt = s.applyDamage(10);
    expect(dealt).toBe(1);
    expect(s.hp).toBe(99);
  });

  it("isDead when HP reaches 0", () => {
    const s = new StatBlock({ ...baseStats, maxHp: 10 });
    s.applyDamage(9999);
    expect(s.hp).toBe(0);
    expect(s.isDead).toBe(true);
  });

  it("heal caps at maxHp", () => {
    const s = new StatBlock(baseStats);
    s.applyDamage(30);
    s.heal(9999);
    expect(s.hp).toBe(100);
  });

  it("addXp triggers level-up at correct threshold", () => {
    const s = new StatBlock(baseStats);
    expect(s.level).toBe(1);
    // threshold for level 1→2: 2^1 * 2 = 4
    const levelled = s.addXp(4);
    expect(levelled).toBe(true);
    expect(s.level).toBe(2);
  });

  it("addXp returns false when not enough XP for level-up", () => {
    const s = new StatBlock(baseStats);
    const levelled = s.addXp(2);
    expect(levelled).toBe(false);
    expect(s.level).toBe(1);
  });
});

// ── UnitEntity ───────────────────────────────────────────────────────────────

describe("UnitEntity", () => {
  it("creates with idle state", () => {
    const u = new UnitEntity({ faction: "wizards", typeKey: "evoker", position: { x: 5, y: 5 }, stats: baseStats });
    expect(u.kind).toBe("unit");
    expect(u.state.kind).toBe("idle");
  });

  it("auto-generates id with typeKey prefix", () => {
    const u = new UnitEntity({ faction: "robots", typeKey: "spitter", position: { x: 0, y: 0 }, stats: baseStats });
    expect(u.id).toMatch(/^spitter_/);
  });
});

// ── BuildingEntity ───────────────────────────────────────────────────────────

describe("BuildingEntity", () => {
  it("starts under construction", () => {
    const b = new BuildingEntity({ faction: "wizards", typeKey: "castle", position: { x: 0, y: 0 }, stats: baseStats, constructionTicks: 3 });
    expect(b.state.kind).toBe("underConstruction");
    expect(b.isOperational).toBe(false);
  });

  it("becomes operational after constructionTicks advances", () => {
    const b = new BuildingEntity({ faction: "wizards", typeKey: "castle", position: { x: 0, y: 0 }, stats: baseStats, constructionTicks: 2 });
    expect(b.advanceConstruction()).toBe(false);
    expect(b.advanceConstruction()).toBe(true);
    expect(b.isOperational).toBe(true);
  });
});

// ── EntityManager ─────────────────────────────────────────────────────────────

describe("EntityManager", () => {
  it("add and get entity by id", () => {
    const mgr = new EntityManager();
    const u = new UnitEntity({ faction: "wizards", typeKey: "evoker", position: { x: 0, y: 0 }, stats: baseStats });
    mgr.add(u);
    expect(mgr.get(u.id)).toBe(u);
    expect(mgr.count).toBe(1);
  });

  it("throws on duplicate id", () => {
    const mgr = new EntityManager();
    const u = new UnitEntity({ id: "fixed_id", faction: "wizards", typeKey: "evoker", position: { x: 0, y: 0 }, stats: baseStats });
    mgr.add(u);
    const u2 = new UnitEntity({ id: "fixed_id", faction: "wizards", typeKey: "evoker", position: { x: 1, y: 1 }, stats: baseStats });
    expect(() => mgr.add(u2)).toThrow();
  });

  it("remove deletes entity", () => {
    const mgr = new EntityManager();
    const u = new UnitEntity({ faction: "wizards", typeKey: "evoker", position: { x: 0, y: 0 }, stats: baseStats });
    mgr.add(u);
    mgr.remove(u.id);
    expect(mgr.get(u.id)).toBeUndefined();
    expect(mgr.count).toBe(0);
  });

  it("byFaction returns only matching faction", () => {
    const mgr = new EntityManager();
    const w = new UnitEntity({ faction: "wizards", typeKey: "evoker", position: { x: 0, y: 0 }, stats: baseStats });
    const r = new UnitEntity({ faction: "robots", typeKey: "spitter", position: { x: 1, y: 1 }, stats: baseStats });
    mgr.add(w);
    mgr.add(r);
    expect(mgr.byFaction("wizards")).toHaveLength(1);
    expect(mgr.byFaction("wizards")[0]?.id).toBe(w.id);
  });

  it("pruneDeadEntities removes and returns dead entity ids", () => {
    const mgr = new EntityManager();
    const u = new UnitEntity({ faction: "wizards", typeKey: "evoker", position: { x: 0, y: 0 }, stats: baseStats });
    mgr.add(u);
    u.stats.applyDamage(9999); // kill it
    const removed = mgr.pruneDeadEntities();
    expect(removed).toContain(u.id);
    expect(mgr.count).toBe(0);
  });

  it("units() returns only units, buildings() only buildings", () => {
    const mgr = new EntityManager();
    const u = new UnitEntity({ faction: "wizards", typeKey: "evoker", position: { x: 0, y: 0 }, stats: baseStats });
    const b = new BuildingEntity({ faction: "wizards", typeKey: "castle", position: { x: 5, y: 5 }, stats: baseStats, constructionTicks: 60 });
    mgr.add(u);
    mgr.add(b);
    expect(mgr.units()).toHaveLength(1);
    expect(mgr.buildings()).toHaveLength(1);
  });
});
