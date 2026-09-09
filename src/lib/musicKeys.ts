const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_ENHARMONICS: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};
const PREFER_FLATS_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim'];
const MINOR_QUALITIES = ['m', 'dim', '', 'm', 'm', '', ''];

function noteAt(rootIdx: number, interval: number, useFlats: boolean): string {
  const idx = (rootIdx + interval) % 12;
  const note = CHROMATIC[idx];
  return useFlats && FLAT_ENHARMONICS[note] ? FLAT_ENHARMONICS[note] : note;
}

/**
 * Whether a key writes its black keys as flats — the IV of F is Bb, not A#.
 * Takes the same key spellings as getDiatonicChords ("F", "Bb", "Cm").
 */
export function keyPrefersFlats(key: string): boolean {
  return PREFER_FLATS_KEYS.has(key.trim());
}

export function getDiatonicChords(key: string): string[] {
  const isMinor = key.endsWith('m') && key.length > 1;
  const root = isMinor ? key.slice(0, -1) : key;
  const useFlats = PREFER_FLATS_KEYS.has(key);

  // Resolve flat root to chromatic index
  const flatToSharp: Record<string, string> = {
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
  };
  const resolvedRoot = flatToSharp[root] ?? root;
  const rootIdx = CHROMATIC.indexOf(resolvedRoot);
  if (rootIdx === -1) return ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'];

  const intervals = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS;
  const qualities = isMinor ? MINOR_QUALITIES : MAJOR_QUALITIES;

  return intervals.map((interval, i) => {
    const note = noteAt(rootIdx, interval, useFlats);
    const q = qualities[i];
    if (q === 'dim') return `${note}dim`;
    return `${note}${q}`;
  });
}

export function generateSlug(title: string, artist: string): string {
  return `${title}-${artist}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const ALL_KEYS = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F',
  'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm',
];

export const SONG_GENRES = [
  'pop', 'rock', 'jazz', 'folk', 'blues', 'country', 'r&b', 'soul',
  'indie', 'worship', 'classical', 'metal', 'reggae', 'latin', 'lo-fi', 'other',
];
