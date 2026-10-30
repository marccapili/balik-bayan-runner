import { HERO_ORDER, HEROES, type HeroId } from '../data/heroes';
import { LEADERBOARD } from '../data/lobby';

/**
 * Versioned local save. v2 adds owned/selected heroes, nickname, local leaderboard and settings.
 * Anything missing, corrupted or from an older version goes through `migrate`.
 */
export interface LeaderboardEntry {
  name: string;
  score: number;
  time: number;
  hero: HeroId;
  /** ISO date (yyyy-mm-dd) of the run. */
  date: string;
}

export interface Settings {
  muted: boolean;
  /** Fewer particles, no camera shake (accessibility + weak devices). */
  reducedEffects: boolean;
}

export interface SaveData {
  version: 2;
  coins: number;
  diamonds: number;
  bestScore: number;
  bestTime: number;
  runs: number;
  nickname: string;
  ownedHeroes: HeroId[];
  selectedHero: HeroId;
  leaderboard: LeaderboardEntry[];
  settings: Settings;
}

const KEY = 'bbr.save';
export const SAVE_VERSION = 2;

const isHero = (v: unknown): v is HeroId => typeof v === 'string' && v in HEROES;

export function defaultSave(): SaveData {
  return {
    version: 2,
    coins: 0,
    diamonds: 0,
    bestScore: 0,
    bestTime: 0,
    runs: 0,
    nickname: '',
    ownedHeroes: HERO_ORDER.filter((h) => HEROES[h].unlockCost === 0),
    selectedHero: 'rizal',
    leaderboard: [],
    settings: { muted: false, reducedEffects: false },
  };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const time = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Trims and validates a nickname. Returns null when it is not acceptable. */
export function cleanNickname(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length < LEADERBOARD.nameMin || s.length > LEADERBOARD.nameMax) return null;
  if (!/^[\p{L}\p{N} _.-]+$/u.test(s)) return null;
  return s;
}

function migrateEntry(raw: unknown): LeaderboardEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? cleanNickname(r.name) : null;
  if (!name || !isHero(r.hero)) return null;
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '';
  return { name, score: num(r.score), time: time(r.time), hero: r.hero, date };
}

/** Accepts anything (missing, corrupted, v1, v2) and returns a valid current save. */
export function migrate(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const owned = Array.isArray(r.ownedHeroes) ? r.ownedHeroes.filter(isHero) : [];
  const ownedHeroes = HERO_ORDER.filter((h) => d.ownedHeroes.includes(h) || owned.includes(h));
  const selectedHero = isHero(r.selectedHero) && ownedHeroes.includes(r.selectedHero) ? r.selectedHero : d.selectedHero;
  const s = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const leaderboard = Array.isArray(r.leaderboard)
    ? (r.leaderboard.map(migrateEntry).filter(Boolean) as LeaderboardEntry[]).sort((a, b) => b.score - a.score).slice(0, LEADERBOARD.size)
    : [];
  return {
    version: 2,
    coins: num(r.coins),
    diamonds: num(r.diamonds),
    bestScore: num(r.bestScore),
    bestTime: time(r.bestTime),
    runs: num(r.runs),
    nickname: typeof r.nickname === 'string' ? (cleanNickname(r.nickname) ?? '') : '',
    ownedHeroes,
    selectedHero,
    leaderboard,
    // v1 kept `muted` at the top level.
    settings: { muted: s.muted === true || r.muted === true, reducedEffects: s.reducedEffects === true },
  };
}

export type UnlockResult = 'ok' | 'owned' | 'insufficient';

export class SaveManager {
  data: SaveData;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    let raw: unknown = null;
    try {
      const s = this.storage?.getItem(KEY);
      raw = s ? JSON.parse(s) : null;
    } catch {
      raw = null;
    }
    this.data = migrate(raw);
  }

  save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode / quota: keep playing without persistence */
    }
  }

  /** Name shown on the leaderboard (a friendly default until the player sets one). */
  get displayName(): string {
    return this.data.nickname || 'Bagong Bayani';
  }

  setNickname(raw: string): boolean {
    const n = cleanNickname(raw);
    if (!n) return false;
    this.data.nickname = n;
    this.save();
    return true;
  }

  /** Spends coins to unlock a hero. Never charges twice, never goes negative. */
  unlockHero(id: HeroId): UnlockResult {
    const d = this.data;
    if (d.ownedHeroes.includes(id)) return 'owned';
    const cost = HEROES[id].unlockCost;
    if (d.coins < cost) return 'insufficient';
    d.coins -= cost;
    d.ownedHeroes = HERO_ORDER.filter((h) => h === id || d.ownedHeroes.includes(h));
    this.save();
    return 'ok';
  }

  selectHero(id: HeroId): boolean {
    if (!this.data.ownedHeroes.includes(id)) return false;
    this.data.selectedHero = id;
    this.save();
    return true;
  }

  /** Applies a finished run. Returns whether it set a new best score. */
  recordRun(score: number, time: number, runCoins: number, hero: HeroId, today = new Date()): boolean {
    const d = this.data;
    d.runs += 1;
    d.coins += Math.max(0, Math.floor(runCoins));
    const best = score > d.bestScore;
    if (best) d.bestScore = Math.floor(score);
    if (time > d.bestTime) d.bestTime = time;
    if (score > 0) this.addToLeaderboard({ name: this.displayName, score: Math.floor(score), time, hero, date: today.toISOString().slice(0, 10) });
    this.save();
    return best;
  }

  /** One row per nickname (their best run), top N by score. */
  private addToLeaderboard(e: LeaderboardEntry): void {
    const lb = this.data.leaderboard;
    const i = lb.findIndex((x) => x.name.toLowerCase() === e.name.toLowerCase());
    if (i >= 0) {
      if (lb[i]!.score >= e.score) return;
      lb.splice(i, 1);
    }
    lb.push(e);
    lb.sort((a, b) => b.score - a.score || a.time - b.time);
    lb.length = Math.min(lb.length, LEADERBOARD.size);
  }

  /** Wipes everything back to a fresh save (settings included). */
  reset(): void {
    this.data = defaultSave();
    this.save();
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
