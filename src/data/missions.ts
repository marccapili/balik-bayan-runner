/** Mission pool (M4, exhibits M6, XP rewards M7). Missions cycle in this order; each full cycle raises targets and rewards. */

export type MissionKind = 'coinsRun' | 'surviveRun' | 'scoreRun' | 'comboRun' | 'abilityTotal' | 'runsTotal' | 'coinsTotal' | 'exhibitsRun';

export interface MissionTemplate {
  kind: MissionKind;
  target: number;
  /** Player XP paid when claimed (owner, M7: missions give XP; daily tasks give coins). */
  xp: number;
}

export const MISSION_POOL: readonly MissionTemplate[] = [
  { kind: 'coinsRun', target: 15, xp: 60 },
  { kind: 'abilityTotal', target: 3, xp: 50 },
  { kind: 'surviveRun', target: 45, xp: 60 },
  { kind: 'runsTotal', target: 3, xp: 50 },
  { kind: 'comboRun', target: 3, xp: 70 },
  { kind: 'scoreRun', target: 600, xp: 70 },
  { kind: 'coinsTotal', target: 60, xp: 80 },
  { kind: 'surviveRun', target: 90, xp: 90 },
  { kind: 'exhibitsRun', target: 3, xp: 80 },
];

export const MISSIONS = {
  /** Missions shown at once. */
  active: 3,
  /** Each completed cycle of the pool multiplies targets/rewards by (1 + step × cycle). */
  cycleStep: 0.5,
  /** Combo targets can't exceed the max multiplier. */
  maxCombo: 4,
} as const;
