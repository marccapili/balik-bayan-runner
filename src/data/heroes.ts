/** Hero roster. Gameplay numbers here; ability tuning in abilities.ts, skins in skins.ts. */
import type { AbilityKind } from './abilities';

export type HeroId = 'rizal' | 'lapulapu' | 'bonifacio' | 'gabriela';

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  heroClass: string;
  ability: string;
  abilityKind: AbilityKind;
  /** Short, playful ability blurb for the UI. */
  abilityBlurb: string;
  unlockCost: number;
}

export const HEROES: Record<HeroId, HeroDef> = {
  rizal: {
    id: 'rizal',
    name: 'José Rizal',
    title: 'Ang Pambansang Bayani',
    heroClass: 'Scholar',
    ability: 'Mabilis na Isip',
    abilityKind: 'sprint',
    abilityBlurb: 'Sprint mode on! Bilis-takbo for a few secs.',
    unlockCost: 500,
  },
  lapulapu: {
    id: 'lapulapu',
    name: 'Lapu-Lapu',
    title: 'Datu ng Mactan',
    heroClass: 'Defender',
    ability: 'Kalasag ng Mactan',
    abilityKind: 'shield',
    abilityBlurb: 'Shield up — blocks the next hit, no cap.',
    unlockCost: 500,
  },
  bonifacio: {
    id: 'bonifacio',
    name: 'Andrés Bonifacio',
    title: 'Supremo ng Katipunan',
    heroClass: 'Revolutionary',
    ability: 'Sigaw ng Katipunan',
    abilityKind: 'shockwave',
    abilityBlurb: 'Shockwave! Tulak lahat ng humahabol.',
    unlockCost: 0,
  },
  gabriela: {
    id: 'gabriela',
    name: 'Gabriela Silang',
    title: 'Tapang ng Ilocos',
    heroClass: 'Agile Leader',
    ability: 'Matapang na Hakbang',
    abilityKind: 'dash',
    abilityBlurb: 'Quick dash para umiwas. Slay.',
    unlockCost: 500,
  },
};

/** Bonifacio is the free starter (owner, 2026-10-31); the rest cost coins. */
export const HERO_ORDER: HeroId[] = ['bonifacio', 'rizal', 'lapulapu', 'gabriela'];
export const STARTER_HERO: HeroId = 'bonifacio';
