/**
 * ASCII tab, as a format rather than as an instrument.
 *
 * Drums, bass and guitar all print the same picture — one line per row, one
 * column per subdivision, `|` between bars — and all three had written their
 * own copy of it (`drumTab/drumTabText.ts`, `bassTab/exportTab.ts`,
 * `guitarTab/exportTab.ts`), each with its own resolution, its own bar
 * splitting and its own bugs. This module owns the geometry: systems, bars,
 * columns, and which beat a column is. What a *token* means — `x` for a
 * closed hi-hat, `12` for the twelfth fret — stays with the instrument, in an
 * adapter.
 *
 * The unit is a token, not a character. That is the whole reason this can be
 * shared: a drum column is one character wide, a guitar column is as wide as
 * `12h`, and a column laid out as "widest token in that column, padded" is
 * both — which is also what makes the dotted and spaced styles fall out for
 * free instead of needing their own renderer.
 */

export interface TabTextRow {
  /** Stable id the adapter reads back — a piece id, a string index. */
  key: string
  /** Printed in the gutter: `HH`, `SD`, `e`, `G`. */
  label: string
}

export interface TabTextSection {
  name: string
  startBar: number
}

export interface TabTextModel {
  rows: TabTextRow[]
  beatsPerBar: number
  totalBars: number
  /** Grid resolution. 4 = sixteenths, 3 or 6 = triplets. */
  columnsPerBeat: number
  /** row key → column index → token. A missing entry is a rest. */
  cells: Map<string, Map<number, string>>
  /** Printed above the tab when `RenderOptions.header` is on. */
  header?: string
  sections?: TabTextSection[]
}

/** How a rest is drawn. The three styles are the same tab, differently dressed. */
export type RestStyle = 'dash' | 'dot' | 'space'

export const REST_CHAR: Record<RestStyle, string> = {
  dash: '-',
  dot: '·',
  space: ' ',
}

export interface RenderOptions {
  rest?: RestStyle
  /**
   * `auto` widens only the columns that need it — right for a drum tab, where
   * every token is one character anyway.
   *
   * `bar` gives every column in a bar the width of the widest token in that
   * bar. Fret tabs need this: with per-column widths a bar holding one `12` has
   * columns of two different widths, and a reader — human or parser — has no
   * way to tell which subdivision a character belongs to without a count line.
   * Uniform columns keep the bar a grid, and cost the extra character only in
   * the bars that actually have a two-digit fret.
   */
  columnWidth?: 'auto' | 'bar'
  /** `spaced` puts a blank column between steps, as most dotted tabs do. */
  spacing?: 'compact' | 'spaced'
  /** The `1 + 2 + 3 + 4 +` count line under each system. */
  ruler?: boolean
  /** Bars per line. 0 prints the whole track on one line. */
  barsPerSystem?: number
  header?: boolean
  /** Section names as `// Verse` comment lines. */
  sections?: boolean
}

export const DEFAULT_RENDER: Required<Omit<RenderOptions, never>> = {
  rest: 'dash',
  columnWidth: 'auto',
  spacing: 'compact',
  ruler: true,
  barsPerSystem: 4,
  header: false,
  sections: true,
}

/**
 * Where a column ended up on the page.
 *
 * This is what makes a moving playhead possible over text: the renderer already
 * knows the character offset of every column, so nothing downstream has to
 * re-derive it from the string and get it subtly wrong.
 */
export interface RenderedColumn {
  /** Column index from the top of the track. */
  index: number
  bar: number
  beat: number
  /** Which system (line block) it was printed in. */
  system: number
  /** Character offset within its line. */
  x: number
  /** Character width, separator included. */
  width: number
}

export interface RenderedSystem {
  index: number
  startBar: number
  barCount: number
  /** Index into `text.split('\n')` of this system's first row line. */
  firstLine: number
  /** How many row lines it has (the ruler and comments are not counted). */
  rowLines: number
  labelWidth: number
}

export interface RenderedTab {
  text: string
  columns: RenderedColumn[]
  systems: RenderedSystem[]
}

/** One cell of a parsed tab: the raw text of a column, and when it sounds. */
export interface ParsedCell {
  column: number
  beat: number
  /** Raw slice, untrimmed — an adapter may need to look at what follows. */
  text: string
  /** Character offset of the column inside its bar segment. */
  x: number
  width: number
}

export interface ParsedRow {
  /** Row key resolved by the adapter's label map, e.g. `hh-closed`. */
  key: string
  label: string
  cells: ParsedCell[]
  /** The bar segments as written, for adapters with multi-column tokens. */
  segments: { bar: number; text: string; startBeat: number; columnWidth: number; columns: number }[]
}

export interface ParsedTab {
  rows: ParsedRow[]
  bars: number
  beatsPerBar: number
  sections: TabTextSection[]
  /** Labels that looked like a tab line but matched no row. */
  unknownLabels: string[]
  /** Characters in a hit position that no rest or token rule claimed. */
  unknownChars: string[]
}

/** Rests, in every spelling a pasted tab uses. */
export const REST_CHARS = new Set(['-', '·', '.', '_', ' ', '\t', '*'])

export function isRestChar(ch: string): boolean {
  return REST_CHARS.has(ch)
}
