import { ABILITIES, type AbilityKind } from '../data/abilities';
import { DAILY, HERO_LEVEL, PLAYER_LEVEL, PROFILE_FRAMES, type DailyKind } from '../data/progression';
import { formatTime } from '../utils/format';

/** Engine-free level math (unit-tested). XP is stored as a running total; levels are derived. */

export function heroLevel(xp: number): number {
  let lv = 1;
  while (lv < HERO_LEVEL.cap && xp >= HERO_LEVEL.xpToReach[lv + 1]!) lv++;
  return lv;
}

/** Progress inside the current hero level: { into, need } (need 0 at the cap). */
export function heroLevelProgress(xp: number): { level: number; into: number; need: number } {
  const level = heroLevel(xp);
  if (level >= HERO_LEVEL.cap) return { level, into: 0, need: 0 };
  const lo = HERO_LEVEL.xpToReach[level]!;
  return { level, into: xp - lo, need: HERO_LEVEL.xpToReach[level + 1]! - lo };
}

/** Diamonds paid for reaching every level in (from, to]. */
export function heroDiamondsBetween(from: number, to: number): number {
  return HERO_LEVEL.rewards.filter((r) => r.level > from && r.level <= to).reduce((s, r) => s + (r.diamonds ?? 0), 0);
}

export interface HeroPerks {
  abilityUnlocked: boolean;
  /** Multiplies the ability cooldown (level 7). */
  cooldownMult: number;
  /** Multiplies how long / far the ability goes (level 9). */
  boost: number;
  badge: boolean;
  master: boolean;
}

export function heroPerks(level: number): HeroPerks {
  const has = (p: string): boolean => HERO_LEVEL.rewards.some((r) => r.perk === p && r.level <= level);
  return {
    abilityUnlocked: has('ability'),
    cooldownMult: has('cooldown') ? 1 - HERO_LEVEL.cooldownCut : 1,
    boost: has('boost') ? 1 + HERO_LEVEL.boost : 1,
    badge: has('badge'),
    master: has('master'),
  };
}

/** Ability cooldown in seconds after perks. */
export const abilityCooldown = (kind: AbilityKind, perks: HeroPerks): number => ABILITIES[kind].cooldown * perks.cooldownMult;

export function heroRunXp(r: { time: number; exhibits: number; coinsPicked: number }): number {
  const x = HERO_LEVEL.xp;
  return Math.max(0, Math.floor(r.time * x.perSecond) + r.exhibits * x.perExhibit + r.coinsPicked * x.perCoin);
}

/** XP needed to go from player level n to n+1. */
export const playerXpForNext = (n: number): number => PLAYER_LEVEL.base + PLAYER_LEVEL.step * (n - 1);

/** Total XP needed to *be* player level n. */
export function playerXpToReach(n: number): number {
  const k = n - 1;
  return PLAYER_LEVEL.base * k + (PLAYER_LEVEL.step * k * (k - 1)) / 2;
}

export function playerLevel(xp: number): number {
  // Solve the quadratic, then fix rounding at the edges.
  const { base, step, cap } = PLAYER_LEVEL;
  const a = step / 2;
  const b = base - step / 2;
  const k = Math.floor((-b + Math.sqrt(b * b + 4 * a * Math.max(0, xp))) / (2 * a));
  let lv = Math.min(cap, Math.max(1, k + 1));
  while (lv < cap && xp >= playerXpToReach(lv + 1)) lv++;
  while (lv > 1 && xp < playerXpToReach(lv)) lv--;
  return lv;
}

export function playerLevelProgress(xp: number): { level: number; into: number; need: number } {
  const level = playerLevel(xp);
  if (level >= PLAYER_LEVEL.cap) return { level, into: 0, need: 0 };
  return { level, into: xp - playerXpToReach(level), need: playerXpForNext(level) };
}

export function playerRunXp(r: { score: number; exhibits: number }): number {
  return Math.max(0, Math.floor(r.score / PLAYER_LEVEL.scoreDivisor) + r.exhibits * PLAYER_LEVEL.perExhibit);
}

/** Profile frames unlocked at a player level (always includes the starter). */
export const framesAt = (level: number) => PROFILE_FRAMES.filter((f) => f.level <= level);

// ── Daily tasks ──

export interface DailyTask {
  kind: DailyKind;
  target: number;
  progress: number;
  coins: number;
  claimed: boolean;
}

/** Local calendar date (yyyy-mm-dd) — daily tasks reset at the player's own midnight. */
export function localDay(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Seconds until the next local midnight. */
export function secondsToMidnight(d: Date): number {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return Math.max(0, Math.ceil((next.getTime() - d.getTime()) / 1000));
}

/** Deterministic pick of today's tasks from the pool (same day = same tasks). */
export function dailyTasksFor(day: string): DailyTask[] {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const pool = [...DAILY.pool];
  const out: DailyTask[] = [];
  while (out.length < DAILY.count && pool.length) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const t = pool.splice(h % pool.length, 1)[0]!;
    out.push({ kind: t.kind, target: t.target, progress: 0, coins: t.coins, claimed: false });
  }
  return out;
}

export interface DailyRun {
  exhibits: number;
  coinsPicked: number;
  time: number;
  gamesWon: number;
  abilityUses: number;
  score: number;
}

/** Adds a run to today's tasks; returns the tasks that just became complete. */
export function applyDaily(tasks: DailyTask[], r: DailyRun): DailyTask[] {
  const done: DailyTask[] = [];
  for (const t of tasks) {
    if (t.progress >= t.target) continue;
    switch (t.kind) {
      case 'exhibits':
        t.progress += r.exhibits;
        break;
      case 'coins':
        t.progress += r.coinsPicked;
        break;
      case 'runs':
        t.progress += 1;
        break;
      case 'survive':
        t.progress = Math.max(t.progress, Math.floor(r.time));
        break;
      case 'minigames':
        t.progress += r.gamesWon;
        break;
      case 'ability':
        t.progress += r.abilityUses;
        break;
      case 'score':
        t.progress = Math.max(t.progress, Math.floor(r.score));
        break;
    }
    t.progress = Math.min(t.progress, t.target);
    if (t.progress >= t.target) done.push(t);
  }
  return done;
}

export function describeDaily(t: DailyTask): string {
  switch (t.kind) {
    case 'exhibits':
      return `Mag-clear ng ${t.target} exhibits ngayong araw`;
    case 'coins':
      return `Kumuha ng ${t.target} coins ngayong araw`;
    case 'runs':
      return `Maglaro ng ${t.target} runs`;
    case 'survive':
      return `Mag-survive ng ${formatTime(t.target)} sa isang run`;
    case 'minigames':
      return `Manalo sa ${t.target} mini-games`;
    case 'ability':
      return `Gamitin ang ability nang ${t.target} beses`;
    case 'score':
      return `Umabot ng ${t.target.toLocaleString('en-US')} score sa isang run`;
  }
}
