import { EXHIBIT_BY_ID } from '../data/exhibits';
import { HERO_ORDER, HEROES, STARTER_HERO, type HeroId } from '../data/heroes';
import { LEADERBOARD } from '../data/lobby';
import { MISSIONS } from '../data/missions';
import { PLAYER_LEVEL, PROFILE_FRAMES } from '../data/progression';
import { classicSkin, SKIN_BY_ID, SKINS } from '../data/skins';
import { applyRun, isDone, makeMission, type Mission, type RunSummary } from '../gameplay/Missions';
import {
  applyDaily,
  dailyTasksFor,
  heroDiamondsBetween,
  heroLevel,
  heroRunXp,
  localDay,
  playerLevel,
  playerRunXp,
  playerXpToReach,
  type DailyTask,
} from '../gameplay/Progression';

/**
 * Versioned local save. v2 adds owned/selected heroes, nickname, local leaderboard and settings;
 * v3 adds skins (owned + equipped per hero) and missions; v4 adds the history archive (discovered exhibits);
 * v5 adds hero XP, player XP, profile frame and daily tasks (missions now pay XP, no diamond exchange).
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

export type Quality = 'auto' | 'low' | 'high';

export interface Settings {
  muted: boolean;
  /** Fewer particles, no camera shake (accessibility + weak devices). */
  reducedEffects: boolean;
  /** 0..1 sliders (Music and SFX are separate). */
  musicVolume: number;
  sfxVolume: number;
  /** Graphics: low = 1× resolution + no glow; high = sharp + glow; auto picks by device. */
  quality: Quality;
  /** FPS counter on the HUD (to measure on a real phone). */
  showFps: boolean;
  /** Bigger UI text. */
  largeText: boolean;
  /** First-run tips already shown. */
  tutorialDone: boolean;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const defaultSettings = (): Settings => ({
  muted: false,
  reducedEffects: prefersReducedMotion(),
  musicVolume: 0.5,
  sfxVolume: 0.8,
  quality: 'auto',
  showFps: false,
  largeText: false,
  tutorialDone: false,
});

const vol = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

export interface SaveData {
  version: 5;
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
  ownedSkins: string[];
  equippedSkins: Record<HeroId, string>;
  missions: Mission[];
  /** Next mission sequence number. */
  missionSeq: number;
  /** Exhibit ids found so far (the lobby Archive), in discovery order. */
  discovered: string[];
  /** Hero XP totals (levels are derived). */
  heroXp: Record<HeroId, number>;
  /** Player XP total (level is derived). */
  playerXp: number;
  /** Chosen profile frame id (must be unlocked). */
  profileFrame: number;
  /** Today's tasks; `day` is the local date they belong to. */
  daily: { day: string; tasks: DailyTask[] };
}

/** A level change and the diamonds it paid. */
export interface LevelUp {
  from: number;
  to: number;
  xp: number;
  diamonds: number;
}

/** What `recordRun` reports back to the results screen. */
export interface RunRecord {
  newBest: boolean;
  completedMissions: Mission[];
  completedDaily: DailyTask[];
  hero: LevelUp;
  player: LevelUp;
}

export type ShopResult = 'ok' | 'owned' | 'insufficient' | 'locked';

const KEY = 'bbr.save';
export const SAVE_VERSION = 5;

const isHero = (v: unknown): v is HeroId => typeof v === 'string' && v in HEROES;

const classicSkins = (): Record<HeroId, string> =>
  Object.fromEntries(HERO_ORDER.map((h) => [h, classicSkin(h)])) as Record<HeroId, string>;

const zeroXp = (): Record<HeroId, number> => Object.fromEntries(HERO_ORDER.map((h) => [h, 0])) as Record<HeroId, number>;

const freshMissions = (): Mission[] => Array.from({ length: MISSIONS.active }, (_, i) => makeMission(i));

export function defaultSave(now = new Date()): SaveData {
  const day = localDay(now);
  return {
    version: 5,
    coins: 0,
    diamonds: 0,
    bestScore: 0,
    bestTime: 0,
    runs: 0,
    nickname: '',
    ownedHeroes: HERO_ORDER.filter((h) => HEROES[h].unlockCost === 0),
    selectedHero: STARTER_HERO,
    leaderboard: [],
    settings: defaultSettings(),
    ownedSkins: SKINS.filter((s) => s.cost === 0).map((s) => s.id),
    equippedSkins: classicSkins(),
    missions: freshMissions(),
    missionSeq: MISSIONS.active,
    discovered: [],
    heroXp: zeroXp(),
    playerXp: 0,
    profileFrame: 0,
    daily: { day, tasks: dailyTasksFor(day) },
  };
}

function migrateDaily(raw: unknown, now: Date): SaveData['daily'] {
  const day = localDay(now);
  const fresh = { day, tasks: dailyTasksFor(day) };
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Record<string, unknown>;
  if (r.day !== day || !Array.isArray(r.tasks)) return fresh;
  // Rebuild from today's pick so tampered targets/rewards can't stick; keep progress + claimed.
  fresh.tasks.forEach((t, i) => {
    const o = (r.tasks as unknown[])[i] as Record<string, unknown> | undefined;
    if (!o || o.kind !== t.kind) return;
    t.progress = Math.min(t.target, num(o.progress));
    t.claimed = o.claimed === true && t.progress >= t.target;
  });
  return fresh;
}

function migrateMission(raw: unknown): Mission | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.seq !== 'number' || !Number.isInteger(r.seq) || r.seq < 0) return null;
  // Rebuild from the pool so a tampered target/reward can't stick; only progress is kept.
  const m = makeMission(r.seq);
  m.progress = Math.min(m.target, num(r.progress));
  return m;
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
export function migrate(raw: unknown, now = new Date()): SaveData {
  const d = defaultSave(now);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const owned = Array.isArray(r.ownedHeroes) ? r.ownedHeroes.filter(isHero) : [];
  // Before v5 Rizal was the free starter: players who already had a save keep him.
  if (!(typeof r.version === 'number' && r.version >= 5)) owned.push('rizal');
  const ownedHeroes = HERO_ORDER.filter((h) => d.ownedHeroes.includes(h) || owned.includes(h));
  const selectedHero = isHero(r.selectedHero) && ownedHeroes.includes(r.selectedHero) ? r.selectedHero : d.selectedHero;
  const s = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const leaderboard = Array.isArray(r.leaderboard)
    ? (r.leaderboard.map(migrateEntry).filter(Boolean) as LeaderboardEntry[]).sort((a, b) => b.score - a.score).slice(0, LEADERBOARD.size)
    : [];
  const ownedSkins = SKINS.filter((sk) => sk.cost === 0 || (Array.isArray(r.ownedSkins) && r.ownedSkins.includes(sk.id))).map((sk) => sk.id);
  const eqRaw = (r.equippedSkins && typeof r.equippedSkins === 'object' ? r.equippedSkins : {}) as Record<string, unknown>;
  const equippedSkins = classicSkins();
  for (const h of HERO_ORDER) {
    const id = eqRaw[h];
    if (typeof id === 'string' && SKIN_BY_ID[id]?.hero === h && ownedSkins.includes(id)) equippedSkins[h] = id;
  }
  const seen = new Set<number>();
  let missions = (Array.isArray(r.missions) ? r.missions.map(migrateMission) : []).filter((m): m is Mission => !!m && !seen.has(m.seq) && !!seen.add(m.seq));
  let missionSeq = Math.max(num(r.missionSeq), ...missions.map((m) => m.seq + 1), 0);
  if (!Array.isArray(r.missions)) {
    missions = freshMissions();
    missionSeq = MISSIONS.active;
  }
  while (missions.length < MISSIONS.active) missions.push(makeMission(missionSeq++));
  missions = missions.slice(0, MISSIONS.active);
  const discovered = Array.isArray(r.discovered) ? [...new Set(r.discovered.filter((id): id is string => typeof id === 'string' && id in EXHIBIT_BY_ID))] : [];
  const hx = (r.heroXp && typeof r.heroXp === 'object' ? r.heroXp : {}) as Record<string, unknown>;
  const heroXp = zeroXp();
  for (const h of HERO_ORDER) heroXp[h] = num(hx[h]);
  const playerXp = Math.min(num(r.playerXp), playerXpToReach(PLAYER_LEVEL.cap));
  const pf = num(r.profileFrame);
  const profileFrame = (PROFILE_FRAMES[pf]?.level ?? Infinity) <= playerLevel(playerXp) ? pf : 0;
  return {
    version: 5,
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
    settings: {
      muted: s.muted === true || r.muted === true,
      reducedEffects: typeof s.reducedEffects === 'boolean' ? s.reducedEffects : defaultSettings().reducedEffects,
      musicVolume: vol(s.musicVolume, 0.5),
      sfxVolume: vol(s.sfxVolume, 0.8),
      quality: s.quality === 'low' || s.quality === 'high' ? s.quality : 'auto',
      showFps: s.showFps === true,
      largeText: s.largeText === true,
      // Players with an existing save already know the basics.
      tutorialDone: s.tutorialDone === true || num(r.runs) > 0,
    },
    ownedSkins,
    equippedSkins,
    missions,
    missionSeq,
    discovered,
    heroXp,
    playerXp,
    profileFrame,
    daily: migrateDaily(r.daily, now),
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

  /** Applies a finished run: wallet, bests, leaderboard and mission progress. */
  recordRun(r: RunSummary, hero: HeroId, today = new Date()): RunRecord {
    this.ensureDaily(today);
    const d = this.data;
    const { score, time } = r;
    d.runs += 1;
    d.coins += Math.max(0, Math.floor(r.runCoins));
    const best = score > d.bestScore;
    if (best) d.bestScore = Math.floor(score);
    if (time > d.bestTime) d.bestTime = time;
    if (score > 0) this.addToLeaderboard({ name: this.displayName, score: Math.floor(score), time, hero, date: today.toISOString().slice(0, 10) });
    const completedMissions = applyRun(d.missions, r).map((m) => ({ ...m }));
    const completedDaily = applyDaily(d.daily.tasks, r).map((t) => ({ ...t }));
    const heroUp = this.addHeroXp(hero, heroRunXp(r));
    const playerUp = this.addPlayerXp(playerRunXp(r));
    this.save();
    return { newBest: best, completedMissions, completedDaily, hero: heroUp, player: playerUp };
  }

  heroLevel(hero: HeroId): number {
    return heroLevel(this.data.heroXp[hero] ?? 0);
  }

  get playerLevel(): number {
    return playerLevel(this.data.playerXp);
  }

  /** Adds hero XP and pays the diamonds of every level reached. */
  addHeroXp(hero: HeroId, xp: number): LevelUp {
    const d = this.data;
    const from = heroLevel(d.heroXp[hero] ?? 0);
    d.heroXp[hero] = (d.heroXp[hero] ?? 0) + Math.max(0, Math.floor(xp));
    const to = heroLevel(d.heroXp[hero]);
    const diamonds = heroDiamondsBetween(from, to);
    d.diamonds += diamonds;
    this.save();
    return { from, to, xp: Math.max(0, Math.floor(xp)), diamonds };
  }

  /** Adds player XP (capped at the max level) and pays diamonds per level gained. */
  addPlayerXp(xp: number): LevelUp {
    const d = this.data;
    const from = playerLevel(d.playerXp);
    d.playerXp = Math.min(playerXpToReach(PLAYER_LEVEL.cap), d.playerXp + Math.max(0, Math.floor(xp)));
    const to = playerLevel(d.playerXp);
    const diamonds = (to - from) * PLAYER_LEVEL.diamondsPerLevel;
    d.diamonds += diamonds;
    this.save();
    return { from, to, xp: Math.max(0, Math.floor(xp)), diamonds };
  }

  /** Exhibit milestone diamonds (paid during the run so a knockout never loses them). */
  addDiamonds(n: number): void {
    this.data.diamonds += Math.max(0, Math.floor(n));
    this.save();
  }

  /** Rolls daily tasks over at local midnight. Returns true when they changed. */
  ensureDaily(now = new Date()): boolean {
    const day = localDay(now);
    if (this.data.daily.day === day) return false;
    this.data.daily = { day, tasks: dailyTasksFor(day) };
    this.save();
    return true;
  }

  claimDaily(i: number, now = new Date()): number | null {
    if (this.ensureDaily(now)) return null;
    const t = this.data.daily.tasks[i];
    if (!t || t.claimed || t.progress < t.target) return null;
    t.claimed = true;
    this.data.coins += t.coins;
    this.save();
    return t.coins;
  }

  get claimableDaily(): number {
    return this.data.daily.tasks.filter((t) => !t.claimed && t.progress >= t.target).length;
  }

  setFrame(id: number): boolean {
    const f = PROFILE_FRAMES[id];
    if (!f || f.level > this.playerLevel) return false;
    this.data.profileFrame = id;
    this.save();
    return true;
  }

  /** Adds an exhibit to the archive. Returns true the first time it is ever found. */
  discover(id: string): boolean {
    if (!(id in EXHIBIT_BY_ID) || this.data.discovered.includes(id)) return false;
    this.data.discovered.push(id);
    this.save();
    return true;
  }

  /** Pays out a completed mission (player XP) and replaces it with the next one. */
  claimMission(seq: number): LevelUp | null {
    const d = this.data;
    const i = d.missions.findIndex((m) => m.seq === seq);
    const m = d.missions[i];
    if (!m || !isDone(m)) return null;
    d.missions.splice(i, 1, makeMission(d.missionSeq++));
    return this.addPlayerXp(m.xp);
  }

  get claimableMissions(): number {
    return this.data.missions.filter(isDone).length;
  }

  /** Buys a skin with Hiyas. The hero must be owned first. */
  buySkin(id: string): ShopResult {
    const d = this.data;
    const s = SKIN_BY_ID[id];
    if (!s) return 'locked';
    if (d.ownedSkins.includes(id)) return 'owned';
    if (!d.ownedHeroes.includes(s.hero)) return 'locked';
    if (d.diamonds < s.cost) return 'insufficient';
    d.diamonds -= s.cost;
    d.ownedSkins = SKINS.filter((x) => x.id === id || d.ownedSkins.includes(x.id)).map((x) => x.id);
    this.save();
    return 'ok';
  }

  equipSkin(id: string): boolean {
    const s = SKIN_BY_ID[id];
    if (!s || !this.data.ownedSkins.includes(id)) return false;
    this.data.equippedSkins[s.hero] = id;
    this.save();
    return true;
  }

  skinOf(hero: HeroId): string {
    return this.data.equippedSkins[hero] ?? classicSkin(hero);
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
