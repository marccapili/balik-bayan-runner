import { GALLERY_PAGES } from './galleryPages';

/**
 * Future Heroes Gallery: the class's "Ang Aking Ambag sa Kasaysayan ng Pilipinas" works, shown in their own
 * museum room reached from the lobby event banner. Files live in public/gallery/<slug>/ and are produced by
 * tools/gallery_assets.py from the class's Drive submissions; the page lists come from galleryPages.ts.
 *
 * Works are listed alphabetically by surname (owner's rule). One-page works are scrolls, everything with
 * more than one page or file is a book (one file = one page).
 */

export type GalleryPage =
  | { type: 'image'; src: string; w: number; h: number }
  | { type: 'video'; src: string; poster: string; w: number; h: number };

export interface GalleryWork {
  /** Folder under public/gallery. */
  slug: string;
  /** Full name as shown on the plaque. */
  name: string;
  /** Sort key (surname first). */
  sortName: string;
  title: string;
  /** What kind of work it is (shown under the title). */
  form: string;
  pages: GalleryPage[];
}

export type ExhibitStyle = 'book' | 'scroll';

const work = (slug: string, name: string, sortName: string, title: string, form: string): GalleryWork => {
  const pages = GALLERY_PAGES[slug];
  if (!pages?.length) throw new Error(`gallery: no pages for ${slug}`);
  return { slug, name, sortName, title, form, pages };
};

export const GALLERY_WORKS: readonly GalleryWork[] = [
  work('acuna', 'Shailoh Acuña', 'Acuna', 'Ang Aking Ambag', 'Guhit at paliwanag'),
  work('aguilar', 'Athea Aguilar', 'Aguilar', 'Mula Kusina Hanggang Busina', 'Photo collage'),
  work('amargo', 'Miguel Franco Amargo', 'Amargo', 'Pag-Ibig Na Wagas', 'Tula'),
  work('casantusan', 'JD Casantusan', 'Casantusan', 'Sa Likod ng Manibela', 'Magazine'),
  work('diaz', 'Jan Marchielle J. Diaz', 'Diaz', 'Jeepney Phaseout', 'Poster at paliwanag'),
  work('esguerra', 'Nathaniel Angela B. Esguerra', 'Esguerra', 'Banga ng Pagbabago', 'Ilustrasyon at paliwanag'),
  work('factor', 'Javin Factor', 'Factor', 'Sa Gitna ng Hirap, Gising Pa Rin', 'Tula'),
  work('ignacio', 'Edgar Ignacio', 'Ignacio', 'What the PAX?', 'Mga poster at repleksyon'),
  work('jacinto', 'Jed Ray Joshua C. Jacinto', 'Jacinto', 'Ang Aking Ambag', 'Memes na may paliwanag'),
  work('kabaki', 'Myanla Kabaki', 'Kabaki', 'The Things We Leave Behind', 'Maikling kuwento'),
  work('minerva', 'Cole Minerva', 'Minerva', 'Ang Aking Ambag', 'Tula'),
  work('munoz', 'Mariana T. Muñoz', 'Munoz', 'Ang Aking Ambag sa Lipunan', 'Collage'),
  work('rodriguez', 'Rafael Rodriguez', 'Rodriguez', 'Scrapbook ng Ambag ko sa Lipunan', 'Scrapbook'),
  work('santos', 'Gabriel Alan Santos', 'Santos', 'Ang Aking Ambag', 'Tula'),
  work('sinfuego', 'Ethan Sinfuego', 'Sinfuego', 'Existence of Greed', 'Guhit at paliwanag'),
  work('stolk', 'Winston Stolk Jr.', 'Stolk', 'Ang Aking Ambag sa Lipunan', 'Infographic'),
  work('uy', 'Raphael Uy', 'Uy', 'Ang Aking Ambag sa Kasaysayan', 'Sanaysay'),
  work('vargas', 'Dunhill Porsche Vargas', 'Vargas', 'Ano ang Ambag Mo?', 'Tula, cartoon, memes at video'),
  work('vera-perez', 'Reigen Vera-Perez', 'Vera-Perez', 'Ang Dalawang Mukha ng Progreso', 'Poster'),
  work('villarama', 'Villarama', 'Villarama', 'Ang Aking Ambag', 'Ilustrasyon'),
].sort((a, b) => a.sortName.localeCompare(b.sortName, 'en'));

export const exhibitStyle = (w: GalleryWork): ExhibitStyle => (w.pages.length > 1 ? 'book' : 'scroll');

/** Public URL of a work's file. */
export const galleryFile = (slug: string, file: string): string => `${import.meta.env?.BASE_URL ?? '/'}gallery/${slug}/${file}`;

/** The game itself, on its own plaque by the entrance. */
export const GAME_PLAQUE = {
  name: 'Marc Reiven Capili at Anne Marielle Dillena',
  title: 'Balik Bayan Runner',
  form: 'Laro (3D browser game)',
  body: [
    'Ang Balik Bayan Runner ay isang 3D arcade game kung saan naglakbay sa panahon ang mga kilalang personalidad sa kasaysayan papunta sa kasalukuyan. Napadpad sila sa isang museo noong taong 2026, at kailangan nilang alamin ang mga pangyayari sa kasaysayan, ngunit may mga guard na nagbabantay sa loob ng museo. Habang tumatagal, lalong humihirap ang laro at dumarami ang mga humahabol, kaya kailangang matutunan ng mga personalidad na ito ang mahahalagang pangyayari sa kasaysayan nang hindi nahuhuli. Kaya takbo, takas, at matuto sa larong Balik Bayan Runner!',
    'Ang ambag namin: gawing laro ang kasaysayan, para maalala ng mga kabataan at ng bawat manlalaro ang mahahalagang bahagi nito habang naglalaro. Bawat exhibit sa museo ay may totoong kasaysayan at mga pinagkunan (sources).',
    'At ang gallery na ito ang website ng buong klase: lahat ng ambag ng aming mga kaklase, nasa iisang museo.',
  ],
} as const;

/** The center TV: the class's introduction video (plays from YouTube). */
export const GALLERY_TV = {
  youtubeId: 'N294xA7iqTQ',
  title: 'Panimula: Babasahin sa Kasaysayan ng Pilipinas',
  credit: 'Video ni Jill Cerbito',
} as const;

/** Room shape and spacing (metres). The room is built from these by gallery/galleryLayout.ts. */
export const GALLERY_ROOM = {
  width: 14,
  /** First pedestal row from the entrance wall, and spacing between pedestals along a side wall. */
  firstZ: 5,
  spacing: 2.6,
  /** Pedestals stand this far in from the side walls. */
  wallInset: 1.3,
  wallHeight: 3.2,
  /** Hero spawn, just inside the entrance. */
  spawn: { x: 0, z: 2.2 },
  /** How close the hero must be to read a work (distance to the pedestal centre). */
  reach: 1.55,
  /** Collision half-size of a pedestal. */
  pedestalHalf: 0.45,
  tvReach: 2.4,
  plaqueReach: 1.6,
} as const;

export const GALLERY_UI = {
  bannerTitle: '✨ Future Heroes Gallery',
  bannerSub: 'Ambag ng klase sa kasaysayan, tara!',
  heading: 'Future Heroes Gallery',
  subheading: 'Ang Aming Ambag sa Kasaysayan ng Pilipinas',
  note: 'Ang mga gawa ay sariling likha ng bawat estudyante.',
  /** Book page-turn duration (seconds). */
  flipSeconds: 0.7,
  /** Scroll unroll duration (seconds). */
  unrollSeconds: 0.6,
} as const;
