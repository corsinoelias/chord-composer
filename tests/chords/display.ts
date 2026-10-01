/**
 * Chords are written as the app writes them (lib/core/music/chord_spelling.dart): the same
 * four notations, Roman numerals always in capitals with an m for minor, and sharps or
 * flats as the key wants them unless one is forced.
 *
 *   npm run test:chords
 */
import { chordNameParts, partsText, type ChordDisplay } from '../../src/lib/chordDisplay';
import { type Chord } from '../../src/lib/musicTheory';
import { type DetectedKey } from '../../src/lib/keyDetect';

let passed = 0;
const failures: string[] = [];
const eq = (got: string, want: string, what: string) => {
  if (got === want) passed++;
  else failures.push(`${what}: got ${got}, want ${want}`);
};

const A: DetectedKey = { pitchClass: 9, mode: 'major' };
const chord = (root: Chord['root'], accidental: Chord['accidental'], quality: Chord['quality'], bassNote?: string): Chord =>
  ({ id: 'x', root, accidental, quality, duration: 4, bassNote });
const write = (c: Chord, notation: ChordDisplay['notation'], accidentals: ChordDisplay['accidentals'] = 'auto', transposition = 0) =>
  partsText(chordNameParts(c, { notation, accidentals }, { key: A, transposition }));

const fSharpM7 = chord('F', '#', 'min7');
const g = chord('G', '', 'maj');
const slash = chord('C', '#', 'm7b5', 'G#');

eq(write(fSharpM7, 'chord'), 'F♯m7', 'letters');
eq(write(fSharpM7, 'solfege'), 'Fa♯m7', 'Do Re Mi');
eq(write(fSharpM7, 'number'), '6m7', 'numbers');
eq(write(fSharpM7, 'roman'), 'VIm7', 'numerals in capitals');
eq(write(g, 'roman'), '♭VII', 'a borrowed numeral');
eq(write(g, 'number'), '♭7', 'a borrowed number');
eq(write(slash, 'roman'), 'IIIm7♭5/VII', 'a numeral over its bass');
eq(write(slash, 'solfege'), 'Do♯m7♭5/Sol♯', 'Do Re Mi over its bass');
eq(write(fSharpM7, 'chord', 'flat'), 'G♭m7', 'flats forced');
eq(write(chord('B', 'b', 'maj'), 'chord', 'sharp'), 'A♯', 'sharps forced');
eq(write(fSharpM7, 'number', 'flat'), '6m7', 'numbers ignore the forced flats');
eq(write(fSharpM7, 'chord', 'auto', 2), 'G♯m7', 'letters move with the transposition');
eq(write(fSharpM7, 'roman', 'auto', 2), 'VIm7', 'numerals do not');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`chords: ${passed} passed`);
