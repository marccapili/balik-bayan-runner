/**
 * Real pictures for the exhibits (owner-supplied, 2026-11-06), served from `public/exhibits/`.
 * One photo per exhibit fills the reading panel, the Archive tile and the Restore / Dust Off art.
 * `caption` says what the picture shows; `credit` is filled in once the owner sends the source.
 */

export interface ExhibitPhoto {
  /** File in public/exhibits/. */
  file: string;
  caption: string;
  credit?: string;
  /** 0 = keep the top when cropping to a square (faces, mastheads), 0.5 = centre. Default 0.5. */
  focusY?: number;
}

export const EXHIBIT_PHOTOS: Readonly<Record<string, ExhibitPhoto>> = {
  mactan: { file: 'mactan.jpg', caption: 'Painting of the Battle of Mactan.' },
  rizal: { file: 'rizal.jpg', caption: 'La Solidaridad, the Propaganda Movement newspaper.', focusY: 0 },
  katipunan: { file: 'katipunan.jpg', caption: 'Mural of Bonifacio and the Katipunan.', focusY: 0.2 },
  gabriela: { file: 'gabriela.jpg', caption: 'Gabriela Silang monument, Ayala Avenue, Makati.' },
  'flag-sun': { file: 'flag-sun.jpg', caption: 'The Philippine flag: the sun and three stars.', focusY: 0.3 },
  balangay: { file: 'balangay.jpg', caption: 'Remains of a balangay boat from Butuan.' },
  manunggul: { file: 'manunggul.jpg', caption: 'The Manunggul Jar, National Museum of the Philippines.', focusY: 0.3 },
  copperplate: { file: 'copperplate.jpg', caption: 'The Laguna Copperplate Inscription, National Museum of the Philippines.' },
  baybayin: { file: 'baybayin.jpg', caption: 'Chart of baybayin characters and their sounds.' },
  'american-japanese': {
    file: 'american-japanese.jpg',
    caption: 'Gen. Douglas MacArthur wading ashore at Leyte, 20 October 1944 (U.S. Army photo).',
  },
  spoliarium: { file: 'spoliarium.jpg', caption: 'Spoliarium (1884) by Juan Luna, National Museum of Fine Arts, Manila.' },
  'rice-terraces': { file: 'rice-terraces.jpg', caption: 'Rice terraces in Ifugao, Cordillera.' },
  edsa: { file: 'edsa.jpg', caption: 'Crowds at the 1986 EDSA People Power gatherings.' },
  tikbalang: { file: 'tikbalang.jpg', caption: 'A modern illustration of a tikbalang (folklore).' },
  balete: { file: 'balete.jpg', caption: 'A giant balete tree.' },
};

/** Portrait frames on the museum walls, by `WALL_ART` portrait variant. */
export const WALL_PORTRAITS: Readonly<Record<number, string>> = {
  0: 'wall-rizal.jpg',
  1: 'wall-bonifacio.jpg',
  2: 'wall-lapulapu.jpg',
  3: 'wall-gabriela.jpg',
};

/** Public URL of a file in public/exhibits/ (works under the GitHub Pages sub-path). */
export const exhibitAsset = (file: string): string => `${import.meta.env?.BASE_URL ?? '/'}exhibits/${file}`;

export const exhibitPhoto = (id: string): ExhibitPhoto | undefined => EXHIBIT_PHOTOS[id];
