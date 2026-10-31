/**
 * M6 museum exhibits: real history (with sources) and clearly labelled folklore.
 * Text is drafted from the cited works; anything that varies between sources or still needs a
 * second check is listed in `review` and shown in-game as "for verification".
 * The time travel, hero powers and museum chase are fiction; these panels are not.
 */
import type { RoomId } from './museumLayout';

export type ExhibitKind = 'history' | 'artifact' | 'folklore';

export interface Exhibit {
  id: string;
  kind: ExhibitKind;
  room: RoomId;
  /** Exhibit title (Filipino) + short English/era line. */
  title: string;
  era: string;
  /** Big glyph shown as the panel's illustration (an icon, not a historical image). */
  icon: string;
  /** Where the exhibit stands (its prop) and how close the hero must be to read it. */
  at: { x: number; z: number };
  reach: number;
  /** Height of the floating marker above the floor. */
  markerY: number;
  /** Marker position when it should float in front of a tall prop instead of above it. */
  marker?: { x: number; z: number };
  /** 2–4 short paragraphs. */
  body: string[];
  /** Optional one-liner shown as "Alam mo ba?". */
  fact?: string;
  /** Full references. Every entry has at least one. */
  sources: string[];
  /** Points still to double-check (shown as "for verification"); omit when none. */
  review?: string;
}

export const EXHIBIT_CONFIG = {
  /** Seconds of invulnerability after closing a panel, so you never resume straight into a hit. */
  resumeGrace: 1.2,
} as const;

export const EXHIBITS: readonly Exhibit[] = [
  // ── Hall of Heroes ──
  {
    id: 'mactan',
    kind: 'history',
    room: 'heroes',
    title: 'Labanan sa Mactan',
    era: 'Battle of Mactan · 27 April 1521',
    icon: '🌊',
    at: { x: 16, z: 7 },
    reach: 2.3,
    markerY: 3.0,
    body: [
      'In 1521 the Spanish expedition led by Ferdinand Magellan reached Cebu and allied with Rajah Humabon. Lapulapu, a chief of Mactan island, refused to submit.',
      'On 27 April 1521, Magellan led an armed landing at Mactan. Lapulapu and his warriors defeated the landing party, and Magellan was killed in the fighting.',
      'The main eyewitness account comes from Antonio Pigafetta, an Italian chronicler who sailed with the expedition. Lapulapu is remembered as one of the first recorded people in the islands to resist European colonizers.',
    ],
    fact: 'Ang 2021 ay ang ika-500 taon ng labanan, at ginunita ito sa buong bansa.',
    sources: [
      'Antonio Pigafetta, Relazione del primo viaggio intorno al mondo (account of the Magellan expedition, written c. 1524).',
      'National Historical Commission of the Philippines (NHCP), materials for the 2021 Quincentennial Commemorations.',
    ],
  },
  {
    id: 'rizal',
    kind: 'history',
    room: 'heroes',
    title: 'José Rizal at ang Propaganda Movement',
    era: 'Reform campaign · c. 1880–1896',
    icon: '📖',
    at: { x: 25, z: 7 },
    reach: 2.3,
    markerY: 3.0,
    body: [
      'José Rizal (1861–1896) was born in Calamba, Laguna, and studied in Manila and in Madrid. He was a physician, writer and one of the leading figures of the Propaganda Movement.',
      'The Propagandists were Filipino reformists, many of them students in Europe, who campaigned for reforms under Spain: equality before the law, representation in the Spanish Cortes and freedom of expression. Their newspaper was La Solidaridad, founded in 1889.',
      'Rizal\'s novels Noli Me Tángere (1887) and El Filibusterismo (1891) exposed abuses under colonial rule. In July 1892 he founded La Liga Filipina in Manila and was deported to Dapitan days later. He was executed at Bagumbayan (now Rizal Park) on 30 December 1896.',
    ],
    fact: 'Ang Noli ay inilimbag sa Berlin, at ang Fili sa Ghent, Belgium.',
    sources: [
      'John N. Schumacher, S.J., The Propaganda Movement, 1880–1895 (Ateneo de Manila University Press, rev. ed. 1997).',
      'National Historical Commission of the Philippines (NHCP), biography of Dr. José Rizal.',
    ],
  },
  {
    id: 'katipunan',
    kind: 'history',
    room: 'heroes',
    title: 'Andrés Bonifacio at ang Katipunan',
    era: 'Revolution · 1892–1897',
    icon: '🔥',
    at: { x: 16, z: 19 },
    reach: 2.3,
    markerY: 3.0,
    body: [
      'Andrés Bonifacio was born on 30 November 1863 in Tondo, Manila. On 7 July 1892, after news of Rizal\'s arrest and deportation, he and fellow founders organized the Katipunan (Kataas-taasang, Kagalang-galangang Katipunan ng mga Anak ng Bayan), a secret society that aimed to win independence through revolution.',
      'When the Katipunan was discovered in August 1896, Bonifacio and his members tore up their cédulas (tax certificates) as a sign of revolt. This "Cry" began the Philippine Revolution.',
      'Conflict later grew between Bonifacio and the Magdalo faction of Emilio Aguinaldo. Bonifacio was tried by the revolutionary government and executed in Maragondon, Cavite, on 10 May 1897.',
    ],
    fact: 'Ang pambansang araw para sa kanya, Bonifacio Day, ay tuwing 30 Nobyembre.',
    sources: [
      'Teodoro A. Agoncillo, The Revolt of the Masses: The Story of Bonifacio and the Katipunan (University of the Philippines, 1956).',
      'National Historical Commission of the Philippines (NHCP), biography of Andrés Bonifacio.',
    ],
    review: 'The exact date and place of the "Cry" (Pugad Lawin or Balintawak, 23–26 August 1896) are debated by historians, so the panel gives only the month.',
  },
  {
    id: 'gabriela',
    kind: 'history',
    room: 'heroes',
    title: 'Gabriela Silang at ang Pag-aalsa sa Ilocos',
    era: 'Ilocos revolt · 1762–1763',
    icon: '🐎',
    at: { x: 25, z: 19 },
    reach: 2.3,
    markerY: 3.0,
    body: [
      'Gabriela Silang was the wife of Diego Silang, who led a revolt against Spanish rule in Ilocos in 1762–1763, while the British occupied Manila during the Seven Years\' War.',
      'After Diego was assassinated in May 1763, Gabriela took over the leadership, regrouped the rebels in the mountains of Abra and led an attack on Vigan.',
      'The attack failed. She was captured and executed by the Spanish authorities in Vigan later in 1763. She is often remembered as the first Filipina to lead a revolt.',
    ],
    sources: [
      'Teodoro A. Agoncillo, History of the Filipino People (8th ed., Garotech, 1990).',
      'National Historical Commission of the Philippines (NHCP), historical marker and biography of Gabriela Silang.',
    ],
    review: 'Accounts differ on Gabriela\'s birth date and the exact date of her execution (often given as 20 September 1763), so the panel gives only the year.',
  },
  // ── Main gallery ──
  {
    id: 'flag-sun',
    kind: 'history',
    room: 'main',
    title: 'Ang Araw at Tatlong Bituin',
    era: 'The Philippine flag · 1898',
    icon: '☀️',
    at: { x: 0, z: 15 },
    reach: 2.9,
    markerY: 1.9,
    marker: { x: 0, z: 12.9 },
    body: [
      'The Philippine flag was formally unfurled in Kawit, Cavite, on 12 June 1898, when Emilio Aguinaldo proclaimed independence from Spain.',
      'Under the Flag and Heraldic Code (Republic Act No. 8491), the eight rays of the sun stand for the first eight provinces placed under martial law for revolting against Spain: Manila, Cavite, Bulacan, Pampanga, Nueva Ecija, Bataan, Laguna and Batangas.',
      'The three stars stand for Luzon, the Visayas and Mindanao.',
    ],
    fact: 'Kapag nakataas ang pula sa itaas, ibig sabihin ay nasa estado ng digmaan ang bansa.',
    sources: [
      'Republic Act No. 8491, An Act Prescribing the Code of the National Flag, Anthem, Motto, Coat-of-Arms and Other Heraldic Items and Devices of the Philippines (1998).',
      'National Historical Commission of the Philippines (NHCP), the Philippine flag.',
    ],
  },
  {
    id: 'balangay',
    kind: 'artifact',
    room: 'main',
    title: 'Balangay ng Butuan',
    era: 'Pre-colonial boats · c. 4th–13th century CE',
    icon: '⛵',
    at: { x: 0, z: -15 },
    reach: 3.4,
    markerY: 2.4,
    body: [
      'Balangay are plank-built wooden boats. Their planks were carved with lugs, fitted edge to edge with wooden dowels and lashed together, without metal nails.',
      'Remains of several balangay were excavated in Butuan, Agusan del Norte, starting in 1976. They show that people in the islands built seagoing boats and traded across the region long before colonization.',
      'The Butuan boats are among the country\'s declared National Cultural Treasures.',
    ],
    fact: 'Ang salitang "barangay" ay madalas iugnay sa "balangay": isang bangka, isang komunidad.',
    sources: [
      'National Museum of the Philippines, Butuan boat (balangay) collection records.',
      'William Henry Scott, Barangay: Sixteenth-Century Philippine Culture and Society (Ateneo de Manila University Press, 1994).',
    ],
    review: 'The radiocarbon dates differ from boat to boat; the 4th–13th century range and the National Cultural Treasure listing should be checked against the National Museum\'s current records.',
  },
  // ── Artifacts ──
  {
    id: 'manunggul',
    kind: 'artifact',
    room: 'artifacts',
    title: 'Manunggul Jar',
    era: 'Burial jar · c. 890–710 BCE',
    icon: '🏺',
    at: { x: -20, z: -12 },
    reach: 2.8,
    markerY: 2.8,
    body: [
      'The Manunggul Jar is a secondary burial jar found in Manunggul Cave, part of the Tabon Caves complex in Palawan, during excavations led by the National Museum in the 1960s.',
      'Its lid shows two figures riding a boat: often read as a "ship of the dead" carrying a soul to the afterlife. It dates to the late Neolithic, around 890–710 BCE.',
      'It is a National Treasure and is displayed at the National Museum of the Philippines.',
    ],
    fact: 'Lumabas ang Manunggul Jar sa lumang disenyo ng ₱1,000 bill.',
    sources: [
      'Robert B. Fox, The Tabon Caves (National Museum Monograph No. 1, 1970).',
      'National Museum of the Philippines, Manunggul Jar (National Treasure) collection records.',
    ],
  },
  {
    id: 'copperplate',
    kind: 'artifact',
    room: 'artifacts',
    title: 'Laguna Copperplate Inscription',
    era: 'Oldest known Philippine document · 900 CE',
    icon: '📜',
    at: { x: -26, z: -6 },
    reach: 2.4,
    markerY: 2.2,
    body: [
      'Found in 1989 near Lumban, Laguna, this thin copper plate carries the date Saka year 822, which is 900 CE. It is the oldest known written document found in the Philippines.',
      'It is written in Kawi script, mostly in Old Malay with Sanskrit, Old Javanese and Old Tagalog words. The text declares that a man named Namwaran and his family were cleared of a debt.',
      'It shows that communities around Manila Bay had writing, laws and links with other parts of Southeast Asia centuries before the Spanish arrived.',
    ],
    sources: [
      'Antoon Postma, "The Laguna Copper-Plate Inscription: Text and Commentary," Philippine Studies 40, no. 2 (1992): 183–203.',
      'National Museum of the Philippines, Laguna Copperplate Inscription collection records.',
    ],
  },
  // ── Library ──
  {
    id: 'baybayin',
    kind: 'history',
    room: 'library',
    title: 'Baybayin',
    era: 'Pre-colonial script · 16th century records',
    icon: '✍️',
    at: { x: -21, z: 17.5 },
    reach: 2.9,
    markerY: 3.0,
    body: [
      'Baybayin is a writing system used by Tagalog and other peoples before and during early Spanish rule. Each basic character is a consonant with the vowel "a"; a small mark called a kudlit changes the vowel.',
      'Spanish writers in the 16th century recorded that many people in the islands could read and write it.',
      'The Doctrina Christiana, printed in Manila in 1593 and one of the earliest books printed in the Philippines, has Tagalog text in baybayin.',
    ],
    fact: 'Hanggang ngayon, may mga katutubong sulat pa ring buhay, gaya ng Hanunuo at Buhid sa Mindoro.',
    sources: [
      'William Henry Scott, Barangay: Sixteenth-Century Philippine Culture and Society (Ateneo de Manila University Press, 1994).',
      'Doctrina Christiana en lengua española y tagala (Manila, 1593); facsimile held by the U.S. Library of Congress.',
    ],
  },
  {
    id: 'american-japanese',
    kind: 'history',
    room: 'library',
    title: 'Sa Ilalim ng Amerika at Hapon',
    era: 'American and Japanese rule · 1898–1946',
    icon: '🗞️',
    at: { x: -21, z: 9 },
    reach: 2.6,
    markerY: 1.9,
    body: [
      'With the Treaty of Paris (December 1898), Spain ceded the Philippines to the United States. Filipinos fought the Philippine–American War from February 1899; the U.S. declared it over in July 1902, though resistance continued in some provinces.',
      'American rule brought a public school system in English, an elected Philippine Assembly (1907) and, from 1935, the Commonwealth under President Manuel L. Quezon, with independence promised after ten years.',
      'Japan invaded in December 1941. The occupation (1942–1945) brought hardship, the Bataan Death March (April 1942) and widespread guerrilla resistance. The United States recognized Philippine independence on 4 July 1946.',
    ],
    fact: 'Mula 1962, 12 Hunyo na ang Araw ng Kalayaan, bilang paggunita sa 1898 na proklamasyon.',
    sources: [
      'Teodoro A. Agoncillo, History of the Filipino People (8th ed., Garotech, 1990).',
      'Renato Constantino, The Philippines: A Past Revisited (Tala Publishing, 1975).',
    ],
  },
  // ── Folklore (alamat, hindi history) ──
  {
    id: 'tikbalang',
    kind: 'folklore',
    room: 'folklore',
    title: 'Tikbalang',
    era: 'Folklore · Philippine lower mythology',
    icon: '🐴',
    at: { x: 26, z: -19.5 },
    reach: 2.4,
    markerY: 2.9,
    body: [
      'In Philippine folklore, the tikbalang is a tall, bony creature with the head of a horse, long limbs and hooves. Stories place it in forests, bamboo groves and big trees such as the balete.',
      'It is said to play tricks on travellers so they lose their way. A traditional "remedy" is to wear your shirt inside out.',
      'This is folklore: stories passed down by communities, not historical events. The tikbalang\'s charge and illusions in this game are made up.',
    ],
    fact: 'Kapag umuulan habang maaraw, sabi ng matatanda: "May ikinakasal na tikbalang!"',
    sources: ['Maximo D. Ramos, The Creatures of Philippine Lower Mythology (University of the Philippines Press, 1971).'],
  },
  {
    id: 'balete',
    kind: 'folklore',
    room: 'folklore',
    title: 'Ang Balete at ang mga Multo',
    era: 'Folklore · beliefs about spirits',
    icon: '🌳',
    at: { x: 20, z: -12.5 },
    reach: 2.9,
    markerY: 2.2,
    marker: { x: 20, z: -10.4 },
    body: [
      '"Multo" is the everyday Filipino word for a ghost, borrowed from the Spanish "muerto" (dead).',
      'In many folk beliefs, old balete trees (strangler figs) are homes of spirits and creatures such as the kapre and the tikbalang. People say "tabi-tabi po" to ask permission when passing such places.',
      'This is folklore, not history. The multo that floats through walls in this game is made up for gameplay.',
    ],
    sources: ['Maximo D. Ramos, The Creatures of Philippine Lower Mythology (University of the Philippines Press, 1971).'],
  },
];

export const EXHIBIT_BY_ID: Readonly<Record<string, Exhibit>> = Object.fromEntries(EXHIBITS.map((e) => [e.id, e]));

/** Labels shown on panels and in the archive. */
export const KIND_LABEL: Record<ExhibitKind, string> = {
  history: '📚 Kasaysayan',
  artifact: '🏺 Artifact',
  folklore: '👻 Folklore · alamat, hindi history',
};

export const FICTION_NOTE =
  'Fiction ang time travel, hero powers at habulan sa larong ito. Ang History at Artifact exhibits ay totoong kasaysayan (may sources); ang Folklore ay mga alamat.';
