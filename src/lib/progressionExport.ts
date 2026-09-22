/**
 * MIDI and WAV export for a bare list of chord names.
 *
 * The editor exports a `Section[]` because it has sections, repeats and per-chord
 * durations. The marketing pages only ever have "these four chords, this tempo", so this
 * wraps them into the one-section shape the real exporters already take, rather than
 * giving the home page a second export implementation to drift out of sync.
 */
import { parseChordString } from './chordParser';
import { createSection, type Section } from './sections';
import { exportMidi } from './midiExporter';
import { exportSongWav } from './appEngine/player';
import { downloadBlob } from './mp3Encoder';
import { getDefaultInstrumentStates } from './instruments';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';
import { MUSICAL_STYLES } from './styles';

/** Beats per chord, matching the two-beat slot progressionPreview plays them at. */
const BEATS_PER_CHORD = 2;

function toSections(chordNames: string[]): Section[] {
  const chords = parseChordString(chordNames.join(' ')).map((chord) => ({
    ...chord,
    duration: BEATS_PER_CHORD,
  }));
  return [{ ...createSection('Progression'), chords }];
}

/** Turns a display name into a safe, lowercase file stem. */
function toFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'chord-progression';
}

export function downloadProgressionMidi(chordNames: string[], name: string, bpm: number): void {
  exportMidi(toSections(chordNames), bpm, 0, `chord-sequence-${toFilename(name)}`);
}

/**
 * Renders the progression with the player's engine (effects included) and saves it as a WAV.
 */
export async function downloadProgressionWav(
  chordNames: string[],
  name: string,
  bpm: number,
  styleId: string,
): Promise<void> {
  const style = MUSICAL_STYLES.find((s) => s.id === styleId) ?? MUSICAL_STYLES[0];
  const instruments = getEffectiveInstruments(getDefaultInstrumentStates(), style);
  const blob = await exportSongWav({ song: { sections: toSections(chordNames), bpm, instrumentSettings: instruments }, style, lookup: () => undefined });
  downloadBlob(blob, `chord-sequence-${toFilename(name)}.wav`);
}

/**
 * Deep link that opens this exact progression in the editor.
 *
 * The chord list MUST be percent-encoded: sharp chords contain '#', which is the URL
 * fragment delimiter, so a raw `?chords=Bmaj9-A#m7-D#m9` reaches the editor as just
 * "Bmaj9-A" and silently loses three quarters of the progression. The editor reads this
 * back with URLSearchParams, which decodes %23 for free.
 */
export function editorUrl(chordNames: string[], bpm: number, styleId: string): string {
  const chords = encodeURIComponent(chordNames.join('-'));
  return `/chord-player/?chords=${chords}&bpm=${bpm}&style=${styleId}`;
}
