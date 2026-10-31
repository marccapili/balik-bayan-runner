/** Mission pool (M4). Missions cycle in this order; each full cycle raises targets and rewards. */

export type MissionKind = 'coinsRun' | 'surviveRun' | 'scoreRun' | 'comboRun' | 'abilityTotal' | 'runsTotal' | 'coinsTotal';

export interface MissionTemplate {
  kind: MissionKind;
  target: number;
  coins: number;
  hiyas: number;
}

export const MISSION_POOL: readonly MissionTemplate[] = [
  { kind: 'coinsRun', target: 15, coins: 60, hiyas: 0 },
  { kind: 'abilityTotal', target: 3, coins: 0, hiyas: 5 },
  { kind: 'surviveRun', target: 45, coins: 80, hiyas: 0 },
  { kind: 'runsTotal', target: 3, coins: 0, hiyas: 5 },
  { kind: 'comboRun', target: 3, coins: 100, hiyas: 0 },
  { kind: 'scoreRun', target: 600, coins: 0, hiyas: 8 },
  { kind: 'coinsTotal', target: 60, coins: 120, hiyas: 0 },
  { kind: 'surviveRun', target: 90, coins: 0, hiyas: 10 },
];

export const MISSIONS = {
  /** Missions shown at once. */
  active: 3,
  /** Each completed cycle of the pool multiplies targets/rewards by (1 + step × cycle). */
  cycleStep: 0.5,
  /** Combo targets can't exceed the max multiplier. */
  maxCombo: 4,
} as const;
