export interface Scale {
  name: string;
  intervals: number[]; // semitone offsets from root, 0-indexed (0–11)
  category: string;
}

// Convert TuxGuitar 1-indexed keys string to 0-indexed intervals array
function k(keys: string): number[] {
  return keys.split(',').map(n => parseInt(n, 10) - 1);
}

export const SCALES: Scale[] = [
  // ── Essential ────────────────────────────────────────────────────────────────
  { name: 'Major Scale',                       intervals: k('1,3,5,6,8,10,12'),       category: 'Essential' },
  { name: 'Natural Minor Scale',               intervals: k('1,3,4,6,8,9,11'),        category: 'Essential' },
  { name: 'Harmonic Minor Scale',              intervals: k('1,3,4,6,8,9,12'),        category: 'Essential' },
  { name: 'Melodic Minor Scale',               intervals: k('1,3,4,6,8,10,12'),       category: 'Essential' },
  { name: 'Pentatonic Major Scale',            intervals: k('1,3,5,8,10'),            category: 'Essential' },
  { name: 'Pentatonic Minor Scale',            intervals: k('1,4,6,8,11'),            category: 'Essential' },
  { name: 'Blues Major Scale',                 intervals: k('1,4,6,7,8,10'),          category: 'Essential' },
  { name: 'Blues Minor Scale',                 intervals: k('1,4,6,7,8,11'),          category: 'Essential' },
  { name: 'Chromatic Scale',                   intervals: k('1,2,3,4,5,6,7,8,9,10,11,12'), category: 'Essential' },
  { name: 'Whole Tone Scale',                  intervals: k('1,3,5,7,9,11'),          category: 'Essential' },
  { name: 'Augmented Scale',                   intervals: k('1,4,5,8,9,12'),          category: 'Essential' },
  { name: 'Whole-Half Scale',                  intervals: k('1,3,4,6,7,9,10,12'),     category: 'Essential' },
  { name: 'Half-Whole Scale',                  intervals: k('1,2,4,5,7,8,10,11'),     category: 'Essential' },
  { name: 'Be-Bop Scale',                      intervals: k('1,3,5,6,8,10,11,12'),    category: 'Essential' },

  // ── Church Modes ─────────────────────────────────────────────────────────────
  { name: 'Ionian Mode',                       intervals: k('1,3,5,6,8,10,12'),       category: 'Church Modes' },
  { name: 'Dorian Mode',                       intervals: k('1,3,4,6,8,10,11'),       category: 'Church Modes' },
  { name: 'Phrygian Mode',                     intervals: k('1,2,4,6,8,9,11'),        category: 'Church Modes' },
  { name: 'Lydian Mode',                       intervals: k('1,3,5,7,8,10,12'),       category: 'Church Modes' },
  { name: 'Mixolydian Mode',                   intervals: k('1,3,5,6,8,10,11'),       category: 'Church Modes' },
  { name: 'Aeolian Mode',                      intervals: k('1,3,4,6,8,9,11'),        category: 'Church Modes' },
  { name: 'Locrian Mode',                      intervals: k('1,2,4,6,7,9,11'),        category: 'Church Modes' },

  // ── Melodic Minor Modes ───────────────────────────────────────────────────────
  { name: 'Jazz Minor Mode',                   intervals: k('1,3,4,6,8,10,12'),       category: 'Melodic Minor Modes' },
  { name: 'Dorian b2 Minor Mode',              intervals: k('1,2,4,6,8,10,12'),       category: 'Melodic Minor Modes' },
  { name: 'Lydian Augmented Minor Mode',        intervals: k('1,3,5,7,9,10,12'),       category: 'Melodic Minor Modes' },
  { name: 'Lydian Flat 7 Minor Mode',          intervals: k('1,3,5,7,8,10,11'),       category: 'Melodic Minor Modes' },
  { name: 'Mixolydian Flat 6 Minor Mode',      intervals: k('1,3,5,6,8,9,11'),        category: 'Melodic Minor Modes' },
  { name: 'Locrian Sharp 2 Minor Mode',        intervals: k('1,3,4,6,7,9,11'),        category: 'Melodic Minor Modes' },
  { name: 'Superlocrian Minor Mode',           intervals: k('1,2,4,5,7,9,11'),        category: 'Melodic Minor Modes' },

  // ── Harmonic Minor Modes ──────────────────────────────────────────────────────
  { name: 'Aeolian Harmonic Mode',             intervals: k('1,3,4,6,8,9,12'),        category: 'Harmonic Minor Modes' },
  { name: 'Locrian Sharp 6 Mode',              intervals: k('1,2,4,6,7,10,11'),       category: 'Harmonic Minor Modes' },
  { name: 'Major Sharp 5 Mode',                intervals: k('1,3,5,6,9,10,12'),       category: 'Harmonic Minor Modes' },
  { name: 'Dorian Sharp 4 Mode',               intervals: k('1,3,4,7,8,10,11'),       category: 'Harmonic Minor Modes' },
  { name: 'Phrygian Major Mode',               intervals: k('1,2,5,6,8,9,11'),        category: 'Harmonic Minor Modes' },
  { name: 'Lydian Sharp 2 Mode',               intervals: k('1,4,5,7,8,10,12'),       category: 'Harmonic Minor Modes' },
  { name: 'Superlocrian Double Flat 7 Mode',   intervals: k('1,2,4,5,7,9,10'),        category: 'Harmonic Minor Modes' },

  // ── Pentatonic Modes ─────────────────────────────────────────────────────────
  { name: 'Pentatonic Majeur Mode',            intervals: k('1,3,5,8,10'),            category: 'Pentatonic Modes' },
  { name: 'Pentatonic Mode 2',                 intervals: k('1,3,6,8,11'),            category: 'Pentatonic Modes' },
  { name: 'Pentatonic Mode 3',                 intervals: k('1,4,6,9,11'),            category: 'Pentatonic Modes' },
  { name: 'Pentatonic Mode 4',                 intervals: k('1,3,6,8,10'),            category: 'Pentatonic Modes' },
  { name: 'Pentatonic Dominant Mode',          intervals: k('1,3,5,8,11'),            category: 'Pentatonic Modes' },
  { name: 'Pentatonic Minor Mode',             intervals: k('1,4,6,8,11'),            category: 'Pentatonic Modes' },
  { name: 'Altered Pentatonic Mode',           intervals: k('1,2,5,8,10'),            category: 'Pentatonic Modes' },
  { name: 'Blues Mode',                        intervals: k('1,4,6,7,8,10'),          category: 'Pentatonic Modes' },

  // ── Arpeggios ────────────────────────────────────────────────────────────────
  { name: 'Major Arpeggio',                    intervals: k('1,5,8'),                 category: 'Arpeggios' },
  { name: 'Minor Arpeggio',                    intervals: k('1,4,8'),                 category: 'Arpeggios' },
  { name: 'Augmented Arpeggio',                intervals: k('1,5,9'),                 category: 'Arpeggios' },
  { name: 'Diminished Arpeggio',               intervals: k('1,4,7,10'),              category: 'Arpeggios' },
  { name: 'Major 7th Major Arpeggio',          intervals: k('1,5,8,12'),              category: 'Arpeggios' },
  { name: 'Major 7th Minor Arpeggio',          intervals: k('1,5,8,11'),              category: 'Arpeggios' },
  { name: 'Minor 7th Major Arpeggio',          intervals: k('1,4,8,12'),              category: 'Arpeggios' },
  { name: 'Minor 7th Minor Arpeggio',          intervals: k('1,4,8,11'),              category: 'Arpeggios' },
  { name: 'Major 9th Arpeggio',                intervals: k('1,3,5,8,11'),            category: 'Arpeggios' },
  { name: 'Minor 9th Arpeggio',                intervals: k('1,3,4,8,11'),            category: 'Arpeggios' },
  { name: 'Major 11th Arpeggio',               intervals: k('1,3,5,6,8,11'),          category: 'Arpeggios' },
  { name: 'Minor 11th Arpeggio',               intervals: k('1,3,4,6,8,11'),          category: 'Arpeggios' },
  { name: 'Major 13th Arpeggio',               intervals: k('1,3,5,6,8,10,11'),       category: 'Arpeggios' },
  { name: 'Minor 13th Arpeggio',               intervals: k('1,3,4,6,8,10,11'),       category: 'Arpeggios' },

  // ── World Scales ─────────────────────────────────────────────────────────────
  { name: 'Augmented Fifth Scale',             intervals: k('1,3,5,6,8,9,10,12'),     category: 'World' },
  { name: 'Algerian Scale',                    intervals: k('1,3,4,7,8,9,12'),        category: 'World' },
  { name: 'Arabian Scale',                     intervals: k('1,3,5,6,7,9,11'),        category: 'World' },
  { name: 'Balinese Scale',                    intervals: k('1,2,4,8,9'),             category: 'World' },
  { name: 'Bartok Scale',                      intervals: k('1,3,5,7,8,10,11'),       category: 'World' },
  { name: 'Byzantine Scale',                   intervals: k('1,2,5,6,8,9,12'),        category: 'World' },
  { name: 'Chinese Scale',                     intervals: k('1,3,5,8,10'),            category: 'World' },
  { name: 'Egyptian Scale',                    intervals: k('1,3,6,8,11'),            category: 'World' },
  { name: 'Enigmatic Scale',                   intervals: k('1,2,5,7,9,11,12'),       category: 'World' },
  { name: 'Spanish Scale',                     intervals: k('1,2,5,6,8,9,11'),        category: 'World' },
  { name: 'Spanish 8 Tone Scale',              intervals: k('1,2,4,5,6,7,9,11'),      category: 'World' },
  { name: 'Ethiopian Scale',                   intervals: k('1,3,4,6,8,9,11'),        category: 'World' },
  { name: 'Gypsy Scale',                       intervals: k('1,2,5,6,8,10,11'),       category: 'World' },
  { name: 'Hungarian Gypsy Scale',             intervals: k('1,3,4,7,8,9,11'),        category: 'World' },
  { name: 'Hindu Scale',                       intervals: k('1,3,5,6,8,9,11'),        category: 'World' },
  { name: 'Iwato Scale',                       intervals: k('1,2,6,7,11'),            category: 'World' },
  { name: 'Japanese Scale',                    intervals: k('1,2,6,8,9'),             category: 'World' },
  { name: 'Javanese Scale',                    intervals: k('1,2,4,6,8,10,11'),       category: 'World' },
  { name: 'Jewish Scale',                      intervals: k('1,2,5,6,8,9,11'),        category: 'World' },
  { name: 'Hawaiian Scale',                    intervals: k('1,3,4,6,8,10,12'),       category: 'World' },
  { name: 'Hirajoshi Scale',                   intervals: k('1,3,4,8,9'),             category: 'World' },
  { name: 'Hungarian Minor Scale',             intervals: k('1,3,4,7,8,9,12'),        category: 'World' },
  { name: 'Hungarian Major Scale',             intervals: k('1,4,5,7,8,10,11'),       category: 'World' },
  { name: 'Kumoi Scale',                       intervals: k('1,2,6,8,9'),             category: 'World' },
  { name: 'Leading Whole Tone Scale',          intervals: k('1,3,5,7,9,11,12'),       category: 'World' },
  { name: 'Mohammedan Scale',                  intervals: k('1,3,4,6,8,9,12'),        category: 'World' },
  { name: 'Mongolian Scale',                   intervals: k('1,3,5,8,10'),            category: 'World' },
  { name: 'Neapolitan Minor Scale',            intervals: k('1,2,4,6,8,9,12'),        category: 'World' },
  { name: 'Neapolitan Major Scale',            intervals: k('1,2,4,6,8,10,12'),       category: 'World' },
  { name: 'Oriental Scale',                    intervals: k('1,2,5,6,7,10,11'),       category: 'World' },
  { name: 'Overtone Scale',                    intervals: k('1,3,5,7,8,10,11'),       category: 'World' },
  { name: 'Pelog Scale',                       intervals: k('1,2,4,8,11'),            category: 'World' },
  { name: 'Persian Scale',                     intervals: k('1,2,5,6,7,9,12'),        category: 'World' },

  // ── Advanced (Slonimsky / Melakarta) ──────────────────────────────────────────
  { name: 'Gb: Ionian b5',                     intervals: k('1,3,5,6,7,10,12'),       category: 'Advanced' },
  { name: 'Gb: Dorian b4',                     intervals: k('1,3,4,5,8,10,11'),       category: 'Advanced' },
  { name: 'Gb: Phrygian b3',                   intervals: k('1,2,3,6,8,9,11'),        category: 'Advanced' },
  { name: 'Gb: Lydian b2',                     intervals: k('1,2,5,7,8,10,12'),       category: 'Advanced' },
  { name: 'Gb: Mixolydian b1',                 intervals: k('1,4,6,7,9,11,12'),       category: 'Advanced' },
  { name: 'Gb: Aeolian b7',                    intervals: k('1,3,4,6,8,9,10'),        category: 'Advanced' },
  { name: 'Gb: Locrian b6',                    intervals: k('1,2,4,6,7,8,11'),        category: 'Advanced' },
  { name: 'Db: Ionian b2',                     intervals: k('1,2,5,6,8,10,12'),       category: 'Advanced' },
  { name: 'Db: Dorian b1',                     intervals: k('1,4,5,7,9,11,12'),       category: 'Advanced' },
  { name: 'Db: Phrygian b7',                   intervals: k('1,2,4,6,8,9,10'),        category: 'Advanced' },
  { name: 'Db: Lydian b6',                     intervals: k('1,3,5,7,8,9,12'),        category: 'Advanced' },
  { name: 'Db: Mixolydian b5',                 intervals: k('1,3,5,6,7,10,11'),       category: 'Advanced' },
  { name: 'Db: Aeolian b4',                    intervals: k('1,3,4,5,8,9,11'),        category: 'Advanced' },
  { name: 'Db: Locrian b3',                    intervals: k('1,2,3,6,7,9,11'),        category: 'Advanced' },
  { name: 'Ab: Ionian b6',                     intervals: k('1,3,5,6,8,9,12'),        category: 'Advanced' },
  { name: 'Ab: Dorian b5',                     intervals: k('1,3,4,6,7,10,11'),       category: 'Advanced' },
  { name: 'Ab: Phrygian b4',                   intervals: k('1,2,4,5,8,9,11'),        category: 'Advanced' },
  { name: 'Ab: Lydian b3',                     intervals: k('1,3,4,7,8,10,12'),       category: 'Advanced' },
  { name: 'Ab: Mixolydian b2',                 intervals: k('1,2,5,6,8,10,11'),       category: 'Advanced' },
  { name: 'Ab: Aeolian b1',                    intervals: k('1,4,5,7,9,10,12'),       category: 'Advanced' },
  { name: 'Ab: Locrian b7',                    intervals: k('1,2,4,6,7,9,10'),        category: 'Advanced' },
  { name: 'Eb: Ionian b3 (Melodic Minor)',      intervals: k('1,3,4,6,8,10,12'),       category: 'Advanced' },
  { name: 'Eb: Dorian b2',                     intervals: k('1,2,4,6,8,10,11'),       category: 'Advanced' },
  { name: 'Eb: Phrygian b1 (Lydian Aug)',       intervals: k('1,3,5,7,9,10,12'),       category: 'Advanced' },
  { name: 'Eb: Lydian b7 (Bartok)',             intervals: k('1,3,5,7,8,10,11'),       category: 'Advanced' },
  { name: 'Eb: Mixolydian b6',                 intervals: k('1,3,5,6,8,9,11'),        category: 'Advanced' },
  { name: 'Eb: Aeolian b5',                    intervals: k('1,3,4,6,7,9,11'),        category: 'Advanced' },
  { name: 'Eb: Locrian b4 (Altered)',           intervals: k('1,2,4,5,7,9,11'),        category: 'Advanced' },
  { name: 'G#: Ionian #5',                     intervals: k('1,3,5,6,9,10,12'),       category: 'Advanced' },
  { name: 'G#: Dorian #4',                     intervals: k('1,3,4,7,8,10,11'),       category: 'Advanced' },
  { name: 'G#: Phrygian #3 (Spanish/Jewish)',   intervals: k('1,2,5,6,8,9,11'),        category: 'Advanced' },
  { name: 'G#: Lydian #2',                     intervals: k('1,4,5,7,8,10,12'),       category: 'Advanced' },
  { name: 'G#: Mixolydian #1',                 intervals: k('1,2,4,5,7,9,10'),        category: 'Advanced' },
  { name: 'G#: Aeolian #7 (Harmonic Minor)',    intervals: k('1,3,4,6,8,9,12'),        category: 'Advanced' },
  { name: 'G#: Locrian #6',                    intervals: k('1,2,4,6,7,10,11'),       category: 'Advanced' },
  { name: 'D#: Ionian #2',                     intervals: k('1,4,5,6,8,10,12'),       category: 'Advanced' },
  { name: 'D#: Dorian #1',                     intervals: k('1,2,3,5,7,9,10'),        category: 'Advanced' },
  { name: 'D#: Phrygian #7 (Neapolitan Min)',   intervals: k('1,2,4,6,8,9,12'),        category: 'Advanced' },
  { name: 'D#: Lydian #6',                     intervals: k('1,3,5,7,8,11,12'),       category: 'Advanced' },
  { name: 'D#: Mixolydian #5',                 intervals: k('1,3,5,6,9,10,11'),       category: 'Advanced' },
  { name: 'D#: Aeolian #4',                    intervals: k('1,3,4,7,8,9,11'),        category: 'Advanced' },
  { name: 'D#: Locrian #3',                    intervals: k('1,2,5,6,7,9,11'),        category: 'Advanced' },
  { name: 'A#: Ionian #6',                     intervals: k('1,3,5,6,8,11,12'),       category: 'Advanced' },
  { name: 'A#: Dorian #5',                     intervals: k('1,3,4,6,9,10,11'),       category: 'Advanced' },
  { name: 'A#: Phrygian #4',                   intervals: k('1,2,4,7,8,9,11'),        category: 'Advanced' },
  { name: 'A#: Lydian #3',                     intervals: k('1,3,6,7,8,10,12'),       category: 'Advanced' },
  { name: 'A#: Mixolydian #2',                 intervals: k('1,4,5,6,8,10,11'),       category: 'Advanced' },
  { name: 'A#: Aeolian #1',                    intervals: k('1,2,3,5,7,8,10'),        category: 'Advanced' },
  { name: 'A#: Locrian #7',                    intervals: k('1,2,4,6,7,9,12'),        category: 'Advanced' },
  { name: 'C#Eb: Ionian #1b3',                 intervals: k('1,2,3,5,7,9,11'),        category: 'Advanced' },
  { name: 'C#Eb: Dorian #7b2 (Neapolitan Maj)',intervals: k('1,2,4,6,8,10,12'),       category: 'Advanced' },
  { name: 'C#Eb: Phrygian #6b1 (Lead.WholeTone)', intervals: k('1,3,5,7,9,11,12'),   category: 'Advanced' },
  { name: 'C#Eb: Lydian #5b7',                 intervals: k('1,3,5,7,9,10,11'),       category: 'Advanced' },
  { name: 'C#Eb: Mixolydian #4b6',             intervals: k('1,3,5,7,8,9,11'),        category: 'Advanced' },
  { name: 'C#Eb: Aeolian #3b5 (Locrian Maj)',  intervals: k('1,3,5,6,7,9,11'),        category: 'Advanced' },
  { name: 'C#Eb: Locrian #2b4',                intervals: k('1,3,4,5,7,9,11'),        category: 'Advanced' },
  { name: 'GbAb: Ionian b5b6',                 intervals: k('1,3,5,6,7,9,12'),        category: 'Advanced' },
  { name: 'GbAb: Dorian b4b5',                 intervals: k('1,3,4,5,7,10,11'),       category: 'Advanced' },
  { name: 'GbAb: Phrygian b3b4',               intervals: k('1,2,3,5,8,9,11'),        category: 'Advanced' },
  { name: 'GbAb: Lydian b2b3',                 intervals: k('1,2,4,7,8,10,12'),       category: 'Advanced' },
  { name: 'GbAb: Mixolydian b1b2',             intervals: k('1,3,6,7,9,11,12'),       category: 'Advanced' },
  { name: 'GbAb: Aeolian b7b1',                intervals: k('1,4,5,7,9,10,11'),       category: 'Advanced' },
  { name: 'GbAb: Locrian b6b7',                intervals: k('1,2,4,6,7,8,10'),        category: 'Advanced' },
  { name: 'C#Gb: Ionian #1b5',                 intervals: k('1,2,4,5,6,9,11'),        category: 'Advanced' },
  { name: 'C#Gb: Dorian #7b4',                 intervals: k('1,3,4,5,8,10,12'),       category: 'Advanced' },
  { name: 'C#Gb: Phrygian #6b3',               intervals: k('1,2,3,6,8,10,11'),       category: 'Advanced' },
  { name: 'C#Gb: Lydian #5b2',                 intervals: k('1,2,5,7,9,10,12'),       category: 'Advanced' },
  { name: 'C#Gb: Mixolydian #4b1',             intervals: k('1,4,6,8,9,11,12'),       category: 'Advanced' },
  { name: 'C#Gb: Aeolian #3b7',                intervals: k('1,3,5,6,8,9,10'),        category: 'Advanced' },
  { name: 'C#Gb: Locrian #2b6',                intervals: k('1,3,4,6,7,8,11'),        category: 'Advanced' },
  { name: 'AbD#: Ionian #2b6',                 intervals: k('1,4,5,6,8,9,12'),        category: 'Advanced' },
  { name: 'AbD#: Dorian #1b5',                 intervals: k('1,2,3,5,6,9,10'),        category: 'Advanced' },
  { name: 'AbD#: Phrygian #7b4',               intervals: k('1,2,4,5,8,9,12'),        category: 'Advanced' },
  { name: 'AbD#: Lydian #6b3',                 intervals: k('1,3,4,7,8,11,12'),       category: 'Advanced' },
  { name: 'AbD#: Mixolydian #5b2',             intervals: k('1,2,5,6,9,10,11'),       category: 'Advanced' },
  { name: 'AbD#: Aeolian #4b1',                intervals: k('1,4,5,8,9,10,12'),       category: 'Advanced' },
  { name: 'AbD#: Locrian #3b7',                intervals: k('1,2,5,6,7,9,10'),        category: 'Advanced' },
  { name: 'A#Eb: Ionian #6b3',                 intervals: k('1,3,4,6,8,11,12'),       category: 'Advanced' },
  { name: 'A#Eb: Dorian #5b2',                 intervals: k('1,2,4,6,9,10,11'),       category: 'Advanced' },
  { name: 'A#Eb: Phrygian #4b1',               intervals: k('1,3,5,8,9,10,12'),       category: 'Advanced' },
  { name: 'A#Eb: Lydian #3b7',                 intervals: k('1,3,6,7,8,10,11'),       category: 'Advanced' },
  { name: 'A#Eb: Mixolydian #2b6',             intervals: k('1,4,5,6,8,9,11'),        category: 'Advanced' },
  { name: 'A#Eb: Aeolian #1b5',                intervals: k('1,2,3,5,6,8,10'),        category: 'Advanced' },
  { name: 'A#Eb: Locrian #7b4',                intervals: k('1,2,4,5,7,9,12'),        category: 'Advanced' },
  { name: 'G#Db: Ionian #5b2',                 intervals: k('1,2,5,6,9,10,12'),       category: 'Advanced' },
  { name: 'G#Db: Dorian #4b1',                 intervals: k('1,4,5,8,9,11,12'),       category: 'Advanced' },
  { name: 'G#Db: Phrygian #3b7',               intervals: k('1,2,5,6,8,9,10'),        category: 'Advanced' },
  { name: 'G#Db: Lydian #2b6',                 intervals: k('1,4,5,7,8,9,12'),        category: 'Advanced' },
  { name: 'G#Db: Mixolydian #1b5',             intervals: k('1,2,4,5,6,9,10'),        category: 'Advanced' },
  { name: 'G#Db: Aeolian #7b4',                intervals: k('1,3,4,5,8,9,12'),        category: 'Advanced' },
  { name: 'G#Db: Locrian #6b3',                intervals: k('1,2,3,6,7,10,11'),       category: 'Advanced' },
  { name: 'G#Eb: Ionian #5b3',                 intervals: k('1,3,4,6,9,10,12'),       category: 'Advanced' },
  { name: 'G#Eb: Dorian #4b2',                 intervals: k('1,2,4,7,8,10,11'),       category: 'Advanced' },
  { name: 'G#Eb: Phrygian #3b1',               intervals: k('1,3,6,7,9,10,12'),       category: 'Advanced' },
  { name: 'G#Eb: Lydian #2b7 (Hungarian Maj)', intervals: k('1,4,5,7,8,10,11'),       category: 'Advanced' },
  { name: 'G#Eb: Mixolydian #1b6',             intervals: k('1,2,4,5,7,8,10'),        category: 'Advanced' },
  { name: 'G#Eb: Aeolian #7b5',                intervals: k('1,3,4,6,7,9,12'),        category: 'Advanced' },
  { name: 'G#Eb: Locrian #6b4',                intervals: k('1,2,4,5,7,10,11'),       category: 'Advanced' },
  { name: 'G#D#: Ionian #5#2',                 intervals: k('1,4,5,6,9,10,12'),       category: 'Advanced' },
  { name: 'G#D#: Dorian #4#1',                 intervals: k('1,2,3,6,7,9,10'),        category: 'Advanced' },
  { name: 'G#D#: Phrygian #3#7',               intervals: k('1,2,5,6,8,9,12'),        category: 'Advanced' },
  { name: 'G#D#: Lydian #2#6',                 intervals: k('1,4,5,7,8,11,12'),       category: 'Advanced' },
  { name: 'G#D#: Mixolydian #1#5',             intervals: k('1,2,4,5,8,9,10'),        category: 'Advanced' },
  { name: 'G#D#: Aeolian #7#4',                intervals: k('1,3,4,7,8,9,12'),        category: 'Advanced' },
  { name: 'G#D#: Locrian #6#3',                intervals: k('1,2,5,6,7,10,11'),       category: 'Advanced' },
  { name: 'AbC#: Ionian b6#1',                 intervals: k('1,2,4,5,7,8,11'),        category: 'Advanced' },
  { name: 'AbC#: Dorian b5#7',                 intervals: k('1,3,4,6,7,10,12'),       category: 'Advanced' },
  { name: 'AbC#: Phrygian b4#6',               intervals: k('1,2,4,5,8,10,11'),       category: 'Advanced' },
  { name: 'AbC#: Lydian b3#5',                 intervals: k('1,3,4,7,9,10,12'),       category: 'Advanced' },
  { name: 'AbC#: Mixolydian b2#4',             intervals: k('1,2,5,7,8,10,11'),       category: 'Advanced' },
  { name: 'AbC#: Aeolian b1#3',                intervals: k('1,4,6,7,9,10,12'),       category: 'Advanced' },
  { name: 'AbC#: Locrian b7#2 (Blue Scale)',   intervals: k('1,3,4,6,7,9,10'),        category: 'Advanced' },
  { name: 'G#A#: Ionian #5#6',                 intervals: k('1,3,5,6,9,11,12'),       category: 'Advanced' },
  { name: 'G#A#: Dorian #4#5',                 intervals: k('1,3,4,7,9,10,11'),       category: 'Advanced' },
  { name: 'G#A#: Phrygian #3#4',               intervals: k('1,2,5,7,8,9,11'),        category: 'Advanced' },
  { name: 'G#A#: Lydian #2#3',                 intervals: k('1,4,6,7,8,10,12'),       category: 'Advanced' },
  { name: 'G#A#: Mixolydian #1#2',             intervals: k('1,3,4,5,7,9,10'),        category: 'Advanced' },
  { name: 'G#A#: Aeolian #7#1',                intervals: k('1,2,3,5,7,8,11'),        category: 'Advanced' },
  { name: 'G#A#: Locrian #6#5',                intervals: k('1,2,4,6,7,10,12'),       category: 'Advanced' },
  { name: 'DbGb: Ionian b2b5',                 intervals: k('1,2,5,6,7,10,12'),       category: 'Advanced' },
  { name: 'DbGb: Dorian b1b4',                 intervals: k('1,4,5,6,9,11,12'),       category: 'Advanced' },
  { name: 'DbGb: Phrygian b7b3',               intervals: k('1,2,3,6,8,9,10'),        category: 'Advanced' },
  { name: 'DbGb: Lydian b6b2 (Composite)',      intervals: k('1,2,5,7,8,9,12'),        category: 'Advanced' },
  { name: 'DbGb: Mixolydian b5b1',             intervals: k('1,4,6,7,8,11,12'),       category: 'Advanced' },
  { name: 'DbGb: Aeolian b4b7',                intervals: k('1,3,4,5,8,9,10'),        category: 'Advanced' },
  { name: 'DbGb: Locrian b3b6',                intervals: k('1,2,3,6,7,8,11'),        category: 'Advanced' },
  { name: 'D#A#: Ionian #2#6',                 intervals: k('1,4,5,6,8,11,12'),       category: 'Advanced' },
  { name: 'D#A#: Dorian #1#5',                 intervals: k('1,2,3,5,8,9,10'),        category: 'Advanced' },
  { name: 'D#A#: Phrygian #7#4 (Todî)',        intervals: k('1,2,4,7,8,9,12'),        category: 'Advanced' },
  { name: 'D#A#: Lydian #6#3',                 intervals: k('1,3,6,7,8,11,12'),       category: 'Advanced' },
  { name: 'D#A#: Mixolydian #5#2',             intervals: k('1,4,5,6,9,10,11'),       category: 'Advanced' },
  { name: 'D#A#: Aeolian #4#1',                intervals: k('1,2,3,6,7,8,10'),        category: 'Advanced' },
  { name: 'D#A#: Locrian #3#7',                intervals: k('1,2,5,6,7,9,12'),        category: 'Advanced' },
  { name: 'GbD#: Ionian b5#2',                 intervals: k('1,4,5,6,7,10,12'),       category: 'Advanced' },
  { name: 'GbD#: Dorian b4#1',                 intervals: k('1,2,3,4,7,9,10'),        category: 'Advanced' },
  { name: 'GbD#: Phrygian b3#7',               intervals: k('1,2,3,6,8,9,12'),        category: 'Advanced' },
  { name: 'GbD#: Lydian b2#6',                 intervals: k('1,2,5,7,8,11,12'),       category: 'Advanced' },
  { name: 'GbD#: Mixolydian b1#5',             intervals: k('1,4,6,7,10,11,12'),      category: 'Advanced' },
  { name: 'GbD#: Aeolian b7#4',                intervals: k('1,3,4,7,8,9,10'),        category: 'Advanced' },
  { name: 'GbD#: Locrian b6#3',                intervals: k('1,2,5,6,7,8,11'),        category: 'Advanced' },
  { name: 'A#Db: Ionian #6b2',                 intervals: k('1,2,5,6,8,11,12'),       category: 'Advanced' },
  { name: 'A#Db: Dorian #5b1',                 intervals: k('1,4,5,7,10,11,12'),      category: 'Advanced' },
  { name: 'A#Db: Phrygian #4b7',               intervals: k('1,2,4,7,8,9,10'),        category: 'Advanced' },
  { name: 'A#Db: Lydian #3b6',                 intervals: k('1,3,6,7,8,9,12'),        category: 'Advanced' },
  { name: 'A#Db: Mixolydian #2b5',             intervals: k('1,4,5,6,7,10,11'),       category: 'Advanced' },
  { name: 'A#Db: Aeolian #1b4',                intervals: k('1,2,3,4,7,8,10'),        category: 'Advanced' },
  { name: 'A#Db: Locrian #7b3',                intervals: k('1,2,3,6,7,9,12'),        category: 'Advanced' },
  { name: 'A#Gb: Ionian #6b5',                 intervals: k('1,3,5,6,7,11,12'),       category: 'Advanced' },
  { name: 'A#Gb: Dorian #5b4',                 intervals: k('1,3,4,5,9,10,11'),       category: 'Advanced' },
  { name: 'A#Gb: Phrygian #4b3',               intervals: k('1,2,3,7,8,9,11'),        category: 'Advanced' },
  { name: 'A#Gb: Lydian #3b2',                 intervals: k('1,2,6,7,8,10,12'),       category: 'Advanced' },
  { name: 'A#Gb: Mixolydian #2b1',             intervals: k('1,5,6,7,9,11,12'),       category: 'Advanced' },
  { name: 'A#Gb: Aeolian #1b7',                intervals: k('1,2,3,5,7,8,9'),         category: 'Advanced' },
  { name: 'A#Gb: Locrian #7b6',                intervals: k('1,2,4,6,7,8,12'),        category: 'Advanced' },
  { name: 'GbA#C#: Phrygian b3#4#6',          intervals: k('1,2,3,7,8,10,11'),       category: 'Advanced' },
  { name: 'GbA#C#: Locrian b6#7#3',           intervals: k('1,3,4,6,7,8,12'),        category: 'Advanced' },
  { name: 'Ionian omit2 addb6',               intervals: k('1,5,6,8,9,10,12'),       category: 'Advanced' },
  { name: 'GbA#D#: Phrygian b3#4#7',          intervals: k('1,2,3,7,8,9,12'),        category: 'Advanced' },
  { name: 'EbGbA#: Aeolian b5b7#1',           intervals: k('1,2,3,5,6,8,9'),         category: 'Advanced' },
  { name: 'GbA#Db: Phrygian b3#4b7',          intervals: k('1,2,3,7,8,9,10'),        category: 'Advanced' },
  { name: 'B#C#Gb: Dorian #6#7b4',            intervals: k('1,3,4,5,8,11,12'),       category: 'Advanced' },
  { name: 'B#C#Gb: Aeolian #2#3b7',           intervals: k('1,4,5,6,8,9,10'),        category: 'Advanced' },
  { name: 'DbEbb: Ionian b2bb3',              intervals: k('1,2,3,6,8,10,12'),       category: 'Advanced' },
  { name: 'DbEbb: Dorian b1bb2 (Enigmatic)',   intervals: k('1,2,5,7,9,11,12'),       category: 'Advanced' },
  { name: 'DbEbb: Phrygian b7bb1',            intervals: k('1,4,6,8,10,11,12'),      category: 'Advanced' },
  { name: 'DbEbb: Lydian b6bb7',              intervals: k('1,3,5,7,8,9,10'),        category: 'Advanced' },
  { name: 'DbEbb: Mixolydian b5bb6',          intervals: k('1,3,5,6,7,8,11'),        category: 'Advanced' },
  { name: 'C#D#Ab: Ionian #1#2b6',            intervals: k('1,3,4,5,7,8,11'),        category: 'Advanced' },
  { name: 'C#D#Ab: Phrygian 6#7#4b',          intervals: k('1,2,4,5,8,10,12'),       category: 'Advanced' },
  { name: 'C#D#Ab: Aeolian #3#4b1',           intervals: k('1,4,6,8,9,10,12'),       category: 'Advanced' },
  { name: 'GbAbC#: Ionian b5b6#1',            intervals: k('1,2,4,5,6,8,11'),        category: 'Advanced' },
  { name: 'GbAbC#: Locrian b6b7#2',           intervals: k('1,3,4,6,7,8,10'),        category: 'Advanced' },
  { name: 'G#A#Eb: Lydian #2#3b7',            intervals: k('1,4,6,7,8,10,11'),       category: 'Advanced' },
  { name: 'G#A#Db: Phrygian #3#4b7',          intervals: k('1,2,5,7,8,9,10'),        category: 'Advanced' },
  { name: 'G#A#Db: Lydian #2#3b6',            intervals: k('1,4,6,7,8,9,12'),        category: 'Advanced' },
  { name: 'D#GbAb: Lydian #6b2b3',            intervals: k('1,2,4,7,8,11,12'),       category: 'Advanced' },
  { name: 'D#GbAb: Aeolian #4b7b1',           intervals: k('1,4,5,8,9,10,11'),       category: 'Advanced' },
  { name: 'A#C#Eb: Mixolydian #2#4b6',        intervals: k('1,4,5,7,8,9,11'),        category: 'Advanced' },
  { name: 'A#DbEb: Ionian #6b2b3',            intervals: k('1,2,4,6,8,11,12'),       category: 'Advanced' },
  { name: 'A#DbEb: Aeolian #1b4b5',           intervals: k('1,2,3,4,6,8,10'),        category: 'Advanced' },
  { name: 'A#B#C#Eb: Mixolydian #2#3#4b6',   intervals: k('1,4,6,7,8,9,11'),        category: 'Advanced' },
  { name: 'C#D#GbAb: Locrian #2#3b6b7',      intervals: k('1,3,5,6,7,8,10'),        category: 'Advanced' },
  { name: 'GbA#C#D#: Locrian b6#7#2#3',      intervals: k('1,3,5,6,7,8,12'),        category: 'Advanced' },
  { name: 'GbA#C#D#: Phrygian b3#4#6#7',     intervals: k('1,2,3,7,8,10,12'),       category: 'Advanced' },
  { name: 'EbFbGbb: Aeolian b5b6bb7',         intervals: k('1,3,4,6,7,8,9'),         category: 'Advanced' },
];

// ── Utilities ──────────────────────────────────────────────────────────────────

const CHROMATIC_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const CHROMATIC_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

const PREFER_FLATS = new Set([1,3,5,8,10]); // C#→Db, D#→Eb, F#→Gb, G#→Ab, A#→Bb

export const SCALE_CATEGORIES = [
  'Essential',
  'Church Modes',
  'Melodic Minor Modes',
  'Harmonic Minor Modes',
  'Pentatonic Modes',
  'Arpeggios',
  'World',
  'Advanced',
] as const;

export type ScaleCategory = typeof SCALE_CATEGORIES[number];

export const CHROMATIC_NOTES = CHROMATIC_SHARP;

/** Returns the 12 note names for every pitch class in the chromatic scale, preferring flats for keys like Bb/Eb. */
export function getNoteNames(rootPitchClass: number): string[] {
  const useFlats = PREFER_FLATS.has(rootPitchClass);
  return useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
}

/** Returns the note name for a pitch class, relative to a root. */
export function pitchClassName(pc: number, rootPitchClass: number): string {
  const names = getNoteNames(rootPitchClass);
  return names[pc % 12];
}

/** Returns the pitch class (0–11) for a note name like 'C', 'F#', 'Bb'. */
export function noteNameToPitchClass(name: string): number {
  const idx = CHROMATIC_SHARP.indexOf(name);
  if (idx !== -1) return idx;
  return CHROMATIC_FLAT.indexOf(name);
}

/** Given a root pitch class and scale intervals, returns the scale's note names. */
export function getScaleNoteNames(rootPitchClass: number, intervals: number[]): string[] {
  const useFlats = PREFER_FLATS.has(rootPitchClass);
  const names = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  return intervals.map(i => names[(rootPitchClass + i) % 12]);
}

/** Returns true if `notePitchClass` belongs to the scale defined by `rootPitchClass` + `intervals`. */
export function isNoteInScale(notePitchClass: number, rootPitchClass: number, intervals: number[]): boolean {
  const relative = (notePitchClass - rootPitchClass + 12) % 12;
  return intervals.includes(relative);
}

/** Returns a chord's root pitch class from its root string + accidental string. */
export function chordRootToPitchClass(root: string, accidental: string): number {
  let pc = CHROMATIC_SHARP.indexOf(root);
  if (pc === -1) pc = CHROMATIC_FLAT.indexOf(root);
  if (accidental === '#') pc = (pc + 1) % 12;
  if (accidental === 'b') pc = (pc - 1 + 12) % 12;
  return pc;
}

/** Lookup by exact name (case-sensitive). */
export function findScaleByName(name: string): Scale | undefined {
  return SCALES.find(s => s.name === name);
}

/** Returns all scales in a given category. */
export function getScalesByCategory(category: ScaleCategory): Scale[] {
  return SCALES.filter(s => s.category === category);
}
