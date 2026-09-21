import { type Section } from './sections';

/**
 * Eight clearly different hues, so every section of an ordinary song gets its own colour
 * and the structure bar reads at a glance. Ordered so that sections created one after
 * another land far apart on the wheel (teal → pink → amber → violet …) rather than on
 * neighbouring shades.
 */
export const SECTION_COLORS = [
  '#0F9488', // teal
  '#DB2777', // pink
  '#CA8A04', // amber
  '#7C3AED', // violet
  '#16A34A', // green
  '#DC2626', // red
  '#2563EB', // blue
  '#EA580C', // orange
] as const;

/** Milliseconds a section was created at, read from its id (see generateSectionId). */
function createdAt(section: Section): number | null {
  const m = /^section_(\d+)_/.exec(section.id);
  return m ? Number(m[1]) : null;
}

/**
 * Colour for each section, by id.
 *
 * Assigned in the order the sections were *created*, not the order they sit in: moving a
 * section keeps its colour, which is what lets someone follow it along the structure bar
 * while they rearrange the song. The creation time is already in every id, so this needs
 * no stored field — the song format (shared with the Android app) is untouched, and the
 * same song gets the same colours after a reload. Sections whose id carries no timestamp
 * (older or imported songs) fall in after the others, in running order.
 *
 * Colours only repeat once a song has more than eight sections.
 */
export function sectionColorMap(sections: Section[]): Map<string, string> {
  const ordered = sections
    .map((section, index) => ({ section, index, t: createdAt(section) }))
    .sort((a, b) => {
      if (a.t !== null && b.t !== null && a.t !== b.t) return a.t - b.t;
      if (a.t === null && b.t !== null) return 1;
      if (a.t !== null && b.t === null) return -1;
      return a.index - b.index;
    });
  const map = new Map<string, string>();
  ordered.forEach(({ section }, i) => map.set(section.id, SECTION_COLORS[i % SECTION_COLORS.length]));
  return map;
}
