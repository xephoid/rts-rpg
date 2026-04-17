// Runtime stat block — mutable, carries current HP and XP.
// Initialised from config values in /packages/shared/config/unitStats.ts.

export type StatBlockInit = {
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  charisma: number;
  armor: number;
  capacity: number;
};

export type LevelUpBonus = {
  hpPct: number;
  damagePct: number;
  armorPct: number;
  speedPct: number;
  charismaPct: number;
  rangePct: number;
  capacityPct: number;
};

export class StatBlock {
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  charisma: number;
  armor: number;
  capacity: number;
  xp: number;
  level: number;

  constructor(init: StatBlockInit) {
    this.hp = init.maxHp;
    this.maxHp = init.maxHp;
    this.damage = init.damage;
    this.range = init.range;
    this.speed = init.speed;
    this.charisma = init.charisma;
    this.armor = init.armor;
    this.capacity = init.capacity;
    this.xp = 0;
    this.level = 1;
  }

  /** Apply damage after flat armor reduction. Returns actual damage dealt. */
  applyDamage(rawDamage: number): number {
    const reduced = Math.max(1, rawDamage - this.armor);
    this.hp = Math.max(0, this.hp - reduced);
    return reduced;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  /** Add XP. Returns true if a level-up occurred. Level threshold doubles: 2^level * base. */
  addXp(amount: number): boolean {
    this.xp += amount;
    const threshold = Math.pow(2, this.level) * 2; // level 1→2 needs 4 XP, 2→3 needs 8, etc.
    if (this.xp >= threshold) {
      this.level++;
      return true;
    }
    return false;
  }

  /** Apply level-up stat bonuses (percentage increases per role). */
  applyLevelUp(bonus: LevelUpBonus): void {
    if (bonus.hpPct > 0) {
      const hpGain = Math.round(this.maxHp * bonus.hpPct / 100);
      this.maxHp += hpGain;
      this.hp = Math.min(this.hp + hpGain, this.maxHp);
    }
    if (bonus.damagePct > 0) this.damage = Math.max(1, Math.round(this.damage * (1 + bonus.damagePct / 100)));
    if (bonus.armorPct > 0) this.armor = Math.round(this.armor * (1 + bonus.armorPct / 100));
    if (bonus.speedPct > 0) this.speed = Math.round(this.speed * (1 + bonus.speedPct / 100) * 10) / 10;
    if (bonus.charismaPct > 0) this.charisma = Math.round(this.charisma * (1 + bonus.charismaPct / 100));
    if (bonus.rangePct > 0) this.range = Math.round(this.range * (1 + bonus.rangePct / 100) * 10) / 10;
    if (bonus.capacityPct > 0) this.capacity = Math.round(this.capacity * (1 + bonus.capacityPct / 100));
  }

  toSnapshot(): {
    hp: number;
    maxHp: number;
    damage: number;
    range: number;
    speed: number;
    charisma: number;
    armor: number;
    capacity: number;
    xp: number;
    level: number;
  } {
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      damage: this.damage,
      range: this.range,
      speed: this.speed,
      charisma: this.charisma,
      armor: this.armor,
      capacity: this.capacity,
      xp: this.xp,
      level: this.level,
    };
  }
}
