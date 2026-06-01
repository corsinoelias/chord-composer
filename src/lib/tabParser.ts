/**
 * ASCII Tab Parser
 * Converts the standard guitar chord-above-lyric format:
 *
 *   C                    F                 C
 *   A thousand generations falling down in worship
 *
 * Into the inline [Chord] notation:
 *   [C]A thousand generations [F]falling down in [C]worship
 */

// ─── Chord token detection ────────────────────────────────────────────────────

const CHORD_PATTERN =
  /^[A-G][b#]?(?:m(?:aj)?7?|maj7?|min7?|sus[24]|add9|aug|dim7?|m7b5|[0-9]+)?(?:\/[A-G][b#]?)?$/;

function isChordToken(token: string): boolean {
  return CHORD_PATTERN.test(token.trim());
}

/**
 * A "chord line" is a line where every meaningful token looks like a chord name.
 * We also require at least one chord to be present.
 */
function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordTokens = tokens.filter(t => isChordToken(t));
  // At least 50% are chords AND at least one chord exists
  return chordTokens.length > 0 && chordTokens.length / tokens.length >= 0.5;
}

/**
 * Merge a chord line and a lyric line into inline notation.
 * Finds each chord's column position and inserts [Chord] at that column
 * in the lyric string.
 */
function mergeChordWithLyric(chordLine: string, lyricLine: string): string {
  // Find all chords with their start positions
  const entries: Array<{ chord: string; pos: number }> = [];
  let i = 0;

  while (i < chordLine.length) {
    // Skip whitespace
    if (/\s/.test(chordLine[i])) { i++; continue; }

    // Try to read a chord token starting at i
    let j = i;
    while (j < chordLine.length && !/\s/.test(chordLine[j])) j++;
    const token = chordLine.slice(i, j);

    if (isChordToken(token)) {
      entries.push({ chord: token, pos: i });
    }

    i = j;
  }

  if (entries.length === 0) return lyricLine;

  // Build merged string by interleaving lyric text with [Chord] markers
  let result = '';
  let lyricPos = 0;

  for (const { chord, pos } of entries) {
    // Clamp position to lyric length
    const insertAt = Math.min(pos, lyricLine.length);

    // Add lyrics from current position up to chord insertion point
    if (insertAt > lyricPos) {
      result += lyricLine.slice(lyricPos, insertAt);
      lyricPos = insertAt;
    }

    result += `[${chord}]`;
  }

  // Append remaining lyrics
  if (lyricPos < lyricLine.length) {
    result += lyricLine.slice(lyricPos);
  }

  return result.trimEnd();
}

// ─── Section detection ────────────────────────────────────────────────────────

const SECTION_PATTERN = /^\[(.+?)\]\s*$/;

function detectSectionName(line: string): string | null {
  const m = line.match(SECTION_PATTERN);
  return m ? m[1] : null;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export interface ParsedTabSection {
  name: string;
  lines: string[];
}

/**
 * Parse a full ASCII tab (multiple sections) into our data format.
 *
 * Input example:
 * ```
 * [Verse 1]
 *   C                    F                 C
 * A thousand generations falling down in worship
 *   Am               G             F
 * To sing the song of ages to the Lamb
 * ```
 *
 * Output: array of ParsedTabSection with inline [Chord] notation.
 */
export function parseAsciiTab(input: string): ParsedTabSection[] {
  const rawLines = input.split('\n');
  const sections: ParsedTabSection[] = [];
  let currentSection: ParsedTabSection = { name: 'Verse 1', lines: [] };

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    // Blank line — just skip
    if (!line.trim()) { i++; continue; }

    // Section header like [Verse 1] or [Chorus]
    const sectionName = detectSectionName(line.trim());
    if (sectionName) {
      if (currentSection.lines.length > 0) sections.push(currentSection);
      currentSection = { name: sectionName, lines: [] };
      i++;
      continue;
    }

    // Check if this is a chord line followed by a lyric line
    const nextLine = rawLines[i + 1];
    if (isChordLine(line) && nextLine !== undefined && !isChordLine(nextLine) && nextLine.trim()) {
      const merged = mergeChordWithLyric(line, nextLine);
      currentSection.lines.push(merged);
      i += 2;
      continue;
    }

    // Chord-only line with no following lyric (e.g. intro vamp)
    if (isChordLine(line)) {
      // Convert to inline notation with empty lyrics: [C] [F] [G]
      const tokens = line.trim().split(/\s+/).filter(Boolean);
      currentSection.lines.push(tokens.map(t => `[${t}]`).join('  '));
      i++;
      continue;
    }

    // Regular lyric line with no chords
    currentSection.lines.push(line.trimEnd());
    i++;
  }

  if (currentSection.lines.length > 0) sections.push(currentSection);

  return sections.length > 0 ? sections : [{ name: 'Verse 1', lines: [] }];
}

/**
 * Parse a single chord+lyric pair (one section, already split).
 * Useful for quick single-section import.
 */
export function parseSingleSection(input: string): string[] {
  const result = parseAsciiTab(input);
  return result[0]?.lines ?? [];
}
