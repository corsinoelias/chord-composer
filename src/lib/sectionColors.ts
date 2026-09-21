/**
 * The three colours sections cycle through down the song, from the redesign canvas.
 *
 * Assigned by position, not by section id: the canvas draws Intro/Chorus teal,
 * Verse pink, Pre/Bridge purple — a straight cycle — which guarantees that two
 * neighbouring segments in the structure bar never share a colour. Hashing the id
 * (what the old section cards did) could hand three adjacent sections the same one.
 */
export const SECTION_COLOR_VARS = ['var(--cp-s-a)', 'var(--cp-s-b)', 'var(--cp-s-c)'] as const;

export function sectionColorVar(index: number): string {
  return SECTION_COLOR_VARS[index % SECTION_COLOR_VARS.length];
}
