import type { HeroId } from '../data/heroes';
import bonifacio from '../assets/portraits/bonifacio.webp';
import gabriela from '../assets/portraits/gabriela.webp';
import lapulapu from '../assets/portraits/lapulapu.webp';
import rizal from '../assets/portraits/rizal.webp';

/** Shop / lobby card art: cut-outs from the owner's own character sheets (see docs/ASSETS.md). */
export const PORTRAIT: Record<HeroId, string> = { bonifacio, gabriela, lapulapu, rizal };
