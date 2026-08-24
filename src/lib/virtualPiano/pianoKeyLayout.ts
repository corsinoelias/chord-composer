// Single source of truth for "where is this MIDI note horizontally, as a
// fraction of the keyboard's width" — used by the physical key layout, the
// click/tap burst effect, and the falling-notes visualizer. All three must
// agree pixel-for-pixel or falling notes land on the wrong key; keeping one
// function instead of three copies is what guarantees that.

export const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11]

export function isBlackKey(midi: number): boolean {
  return ![0, 2, 4, 5, 7, 9, 11].includes(((midi % 12) + 12) % 12)
}

/**
 * Returns [xFrac, widthFrac, isBlack] for a MIDI note within the currently
 * visible range (baseOctave..baseOctave+nOct), or null if it's off-screen.
 * `blackWidthFactor` widens the black key's fraction of a white key's width
 * — used to grow the touch target on narrow (2-octave) mobile layouts
 * without changing how wide the key is drawn.
 */
export function keyXFrac(midi: number, baseOctave: number, nOct: number, blackWidthFactor = 0.62): [number, number, boolean] | null {
  const nW = nOct * 7 + 1
  const pc = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - 1 - baseOctave
  const wIdx = WHITE_SEMITONES.indexOf(pc)
  if (wIdx >= 0) {
    const i = oct * 7 + wIdx
    if (i < 0 || i >= nW) return null
    return [i / nW, 1 / nW, false]
  }
  const wBefore = WHITE_SEMITONES.indexOf(pc - 1)
  const i = oct * 7 + wBefore
  if (i < 0 || i >= nW - 1) return null
  const bw = blackWidthFactor / nW
  return [(i + 1) / nW - bw / 2, bw, true]
}
