import type { TipId } from '../gameplay/Tutorial';

/** First-run tip copy (Gen Z Taglish). `desktop` / `touch` pick the control hint. */
export const TIPS: Record<TipId, { icon: string; title: string; desktop: string; touch: string }> = {
  move: { icon: '🏃', title: 'Takbo na!', desktop: 'WASD / arrow keys para gumalaw. Iwasan ang guards 👮, kunin ang coins 🪙', touch: 'I-drag ang left side ng screen para gumalaw. Iwasan ang guards 👮, kunin ang coins 🪙' },
  exhibit: { icon: '🏛️', title: 'Sundan ang dilaw na arrow', desktop: 'Papunta yan sa exhibit. Pindutin ang E para sa mini-game, tapos basahin ang history!', touch: 'Papunta yan sa exhibit. I-tap ang prompt para sa mini-game, tapos basahin ang history!' },
  ability: { icon: '⚡', title: 'Hero skill', desktop: 'Space = skill ng hero mo.', touch: 'Yung bilog na button sa kanan = skill ng hero mo.' },
  gadget: { icon: '🎒', title: 'May gadget ka!', desktop: 'Pindutin ang Q para gamitin. Isa lang pwedeng hawakan.', touch: 'I-tap ang 🎒 button para gamitin. Isa lang pwedeng hawakan.' },
};

export const TIP_LOCKED_SUFFIX = ' 🔒 Bukas ito sa hero Lv 5: mag-level up by playing!';
