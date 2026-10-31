import { MISSION_POOL, MISSIONS, type MissionKind } from '../data/missions';
import { formatTime } from '../utils/format';

export interface Mission {
  /** Sequence number: unique, also picks the template. */
  seq: number;
  kind: MissionKind;
  target: number;
  progress: number;
  xp: number;
}

/** What a finished run contributes to missions. */
export interface RunSummary {
  score: number;
  time: number;
  /** Spendable coins earned (rare coins count more). */
  runCoins: number;
  /** Coin pickups collected. */
  coinsPicked: number;
  bestMultiplier: number;
  abilityUses: number;
  /** Exhibits cleared (mini-game won) this run. */
  exhibits: number;
  /** Mini-games won this run. */
  gamesWon: number;
}

/** Builds mission number `seq` (deterministic: pool order, scaled up every full cycle). */
export function makeMission(seq: number): Mission {
  const t = MISSION_POOL[seq % MISSION_POOL.length]!;
  const scale = 1 + MISSIONS.cycleStep * Math.floor(seq / MISSION_POOL.length);
  let target = Math.round(t.target * scale);
  if (t.kind === 'comboRun') target = Math.min(MISSIONS.maxCombo, t.target + Math.floor(seq / MISSION_POOL.length));
  if (t.kind === 'scoreRun') target = Math.round(target / 50) * 50;
  return { seq, kind: t.kind, target, progress: 0, xp: Math.round(t.xp * scale) };
}

export const isDone = (m: Mission): boolean => m.progress >= m.target;

/** Player-facing text (Taglish). */
export function describe(m: Mission): string {
  switch (m.kind) {
    case 'coinsRun':
      return `Kumuha ng ${m.target} coins sa isang run`;
    case 'surviveRun':
      return `Mag-survive ng ${formatTime(m.target)} sa isang run`;
    case 'scoreRun':
      return `Umabot ng ${m.target.toLocaleString('en-US')} score sa isang run`;
    case 'comboRun':
      return `Umabot sa x${m.target} combo`;
    case 'abilityTotal':
      return `Gamitin ang ability nang ${m.target} beses`;
    case 'runsTotal':
      return `Maglaro ng ${m.target} runs`;
    case 'coinsTotal':
      return `Kumuha ng ${m.target} coins (total)`;
    case 'exhibitsRun':
      return `Mag-clear ng ${m.target} exhibits sa isang run`;
  }
}

/**
 * Adds a run's stats to the active missions. "Run" missions keep the best single run,
 * "total" missions accumulate. Returns the missions that became complete with this run.
 */
export function applyRun(missions: Mission[], r: RunSummary): Mission[] {
  const done: Mission[] = [];
  for (const m of missions) {
    if (isDone(m)) continue;
    switch (m.kind) {
      case 'coinsRun':
        m.progress = Math.max(m.progress, r.coinsPicked);
        break;
      case 'surviveRun':
        m.progress = Math.max(m.progress, Math.floor(r.time));
        break;
      case 'scoreRun':
        m.progress = Math.max(m.progress, r.score);
        break;
      case 'comboRun':
        m.progress = Math.max(m.progress, r.bestMultiplier);
        break;
      case 'abilityTotal':
        m.progress += r.abilityUses;
        break;
      case 'runsTotal':
        m.progress += 1;
        break;
      case 'coinsTotal':
        m.progress += r.coinsPicked;
        break;
      case 'exhibitsRun':
        m.progress = Math.max(m.progress, r.exhibits);
        break;
    }
    m.progress = Math.min(m.progress, m.target);
    if (isDone(m)) done.push(m);
  }
  return done;
}
