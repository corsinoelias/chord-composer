import { parseSheet, formatChordParts, type ChartNotation } from './chordSheetCore';

/** Plain-text rendering of a sheet — chords on their own line above the lyrics they land
 *  on, padded to line up. Used by the "copy sheet as text" and "email sheet" export
 *  actions (a ChordPro source dump isn't readable to someone who doesn't know the syntax).
 *  Port of the reference prototype's `plainText()`, adapted to read from parseSheet's
 *  slots directly instead of a pre-built display structure, applying the transpose/chart-
 *  notation formatting inline via `chordName` + `formatChordParts`. */
export function sheetToPlainText(
  text: string,
  displayKey: string,
  chartType: ChartNotation,
  chordName: (raw: string) => string,
): string {
  const sections = parseSheet(text);
  return sections
    .map((sec) => {
      const head = sec.name ? sec.name + '\n' : '';
      const body = sec.lines
        .map((line) => {
          if (!line.slots.length) return '';
          const full = (chord: string) => {
            if (!chord) return '';
            const parts = formatChordParts(chordName(chord), displayKey, chartType);
            return (parts.main + parts.sup + parts.tail).trim();
          };
          const hasChord = line.slots.some((s) => full(s.chord));
          const lyricRow = line.slots.map((s) => s.lyric).join('');
          const chordRow = line.slots
            .map((s) => {
              const c = full(s.chord);
              return c + ' '.repeat(Math.max(1, s.lyric.length - c.length));
            })
            .join('')
            .replace(/\s+$/, '');
          return (hasChord ? chordRow + '\n' : '') + lyricRow;
        })
        .join('\n');
      return head + body;
    })
    .join('\n\n');
}
