/**
 * Versioned local save. M2 stores the wallet and best scores; M4 extends the schema
 * (heroes, skins, missions) through `migrate`.
 */
export interface SaveData {
  version: 1;
  coins: number;
  diamonds: number;
  bestScore: number;
  bestTime: number;
  runs: number;
  muted: boolean;
}

const KEY = 'bbr.save';
export const SAVE_VERSION = 1;

export function defaultSave(): SaveData {
  return { version: 1, coins: 0, diamonds: 0, bestScore: 0, bestTime: 0, runs: 0, muted: false };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Accepts anything (missing, corrupted, older) and returns a valid current save. */
export function migrate(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return {
    version: 1,
    coins: num(r.coins),
    diamonds: num(r.diamonds),
    bestScore: num(r.bestScore),
    bestTime: typeof r.bestTime === 'number' && Number.isFinite(r.bestTime) && r.bestTime > 0 ? r.bestTime : 0,
    runs: num(r.runs),
    muted: r.muted === true,
  };
}

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

  /** Applies a finished run. Returns whether it set a new best score. */
  recordRun(score: number, time: number, runCoins: number): boolean {
    const d = this.data;
    d.runs += 1;
    d.coins += Math.max(0, Math.floor(runCoins));
    const best = score > d.bestScore;
    if (best) d.bestScore = Math.floor(score);
    if (time > d.bestTime) d.bestTime = time;
    this.save();
    return best;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
