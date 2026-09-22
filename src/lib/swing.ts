/**
 * Swing as the Android app has it: the ratio between the two eighths of a beat, chosen per
 * song from a chip beside the tempo (lib/core/music/constants.dart swingOptions). 1 is
 * straight; 2 is the classic shuffle, the first eighth twice as long as the second. Saved
 * with the song where the app keeps it, app.swing (songSwing / withSwing in songs.ts).
 *
 * A song with none of its own plays its rhythm's feel: StylePattern.swing (0-1, where the
 * "and" lands between 50 % and 66.7 % of the beat) as the same ratio.
 */
import { type StylePattern } from './styles';

export const SWING_OPTIONS = [
  { ratio: 1, label: 'Straight' },
  { ratio: 1.5, label: 'Light' },
  { ratio: 2, label: 'Shuffle' },
] as const;

/** A rhythm's own feel as a ratio: 1 for every style but Jazz Swing (2). */
export function styleSwingRatio(style: Pick<StylePattern, 'swing'>): number {
  const p = 0.5 + Math.max(0, Math.min(1, style.swing ?? 0)) / 6;
  return p / (1 - p);
}

/** The option nearest [ratio], for the chip's label. */
export function swingOption(ratio: number): (typeof SWING_OPTIONS)[number] {
  return SWING_OPTIONS.reduce((best, o) => (Math.abs(o.ratio - ratio) < Math.abs(best.ratio - ratio) ? o : best));
}
