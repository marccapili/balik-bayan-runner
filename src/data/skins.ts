import type { HeroId } from './heroes';

/**
 * Costume colourways (cosmetic only, not historical claims). A skin is a colour remap applied
 * to the hero's procedural costume: every material/cloth colour listed is swapped at build time.
 */
export interface SkinDef {
  id: string;
  hero: HeroId;
  name: string;
  /** Price in Hiyas (0 = the free classic look). */
  cost: number;
  /** Two colours for the shop swatch. */
  swatch: [string, string];
  remap: Record<string, string>;
}

const classic = (hero: HeroId, swatch: [string, string]): SkinDef => ({ id: `${hero}.classic`, hero, name: 'Classic', cost: 0, swatch, remap: {} });

export const SKINS: SkinDef[] = [
  classic('rizal', ['#1c1a21', '#f5f2ec']),
  {
    id: 'rizal.puti',
    hero: 'rizal',
    name: 'Puting Amerikana',
    cost: 30,
    swatch: ['#e8e2d4', '#3d3158'],
    remap: {
      '#1c1a21': '#e8e2d4', '#121116': '#cfc7b5', '#16151a': '#d4ccbb', '#2e2b33': '#bdb4a0', '#2b2830': '#a89f8b',
      '#18161e': '#ece6d8', '#1f1c26': '#f2ecdf', '#3d3158': '#1c1a21',
    },
  },
  classic('lapulapu', ['#b01e24', '#e0b04a']),
  {
    id: 'lapulapu.dagat',
    hero: 'lapulapu',
    name: 'Mandirigma ng Dagat',
    cost: 30,
    swatch: ['#1f5fa8', '#e0b04a'],
    remap: { '#b01e24': '#1f5fa8', '#c3212a': '#2272c3', '#b3262b': '#2a7bd1', '#2a1410': '#0d2440' },
  },
  classic('bonifacio', ['#efe6d2', '#b3202a']),
  {
    id: 'bonifacio.asul',
    hero: 'bonifacio',
    name: 'Kamisang Asul',
    cost: 30,
    swatch: ['#4a6fa5', '#b3202a'],
    remap: { '#efe6d2': '#4a6fa5', '#ddd2b9': '#3d5d8c', '#e2d7bf': '#3d5d8c', '#c9bea6': '#e8e2d4' },
  },
  classic('gabriela', ['#9a1f22', '#f6efe2']),
  {
    id: 'gabriela.berde',
    hero: 'gabriela',
    name: 'Ilocos Berde',
    cost: 30,
    swatch: ['#1d6b4a', '#e0a94a'],
    remap: { '#9a1f22': '#1d6b4a', '#a8262a': '#d39a3a', '#4a0f12': '#0f3a28', '#9e2a26': '#1d6b4a', '#b8402c': '#1d6b4a' },
  },
];

export const SKIN_BY_ID: Record<string, SkinDef> = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const classicSkin = (hero: HeroId): string => `${hero}.classic`;
export const skinsFor = (hero: HeroId): SkinDef[] => SKINS.filter((s) => s.hero === hero);

/** Coins → Hiyas exchange in the shop (the only way to buy Hiyas; there is no real-money store). */
export const EXCHANGE = { coins: 200, hiyas: 5 } as const;
