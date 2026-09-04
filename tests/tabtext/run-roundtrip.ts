/**
 * ASCII tab round trip: render → parse → the same music.
 *
 * There is no test runner in this repo, so this is a script, in the shape the
 * `tests/audio/*` ones already use: run it, read the lines, non-zero exit if
 * anything broke. Run with `npm run test:tabtext`.
 *
 * It covers the two things that actually went wrong before `lib/tabtext`
 * existed: a wrapped tab (several systems) read as one system with its hits
 * stacked, and a tab with uneven column widths read at the wrong resolution,
 * putting hits at 0.53 and 2.13 beats. The three fixtures at the bottom are the
 * same eleven bars written three ways — dashes, dots and spaces — so if the
 * geometry is right they must parse to identical music.
 */

import { parseDrumTab, toDrumTab } from '../../src/lib/drumTab/drumTabText'
import { hitsSignature, ROW_BY_PIECE, strikesFor, type DrumTrack } from '../../src/lib/drumTab/types'
import { toAsciiTab as bassAscii } from '../../src/lib/bassTab/exportTab'
import { toAsciiTab as guitarAscii } from '../../src/lib/guitarTab/exportTab'
import { stringNotesFromText } from '../../src/lib/tabtext/adapters/strings'
import type { RestStyle } from '../../src/lib/tabtext/types'

let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
  }
}

// ── A drum track worth round-tripping ───────────────────────────────────────
// ASCII carries three dynamic levels (accent, normal, ghost), so the fixture is
// built from those three: a velocity of 0.95 would come back as an accent's 1.0
// and fail for a reason that is about the format, not about a bug.
function fixtureTrack(): DrumTrack {
  const hits: DrumTrack['hits'] = []
  const vel = (piece: string, kind: 'accent' | 'normal' | 'ghost') =>
    kind === 'accent' ? 1 : kind === 'ghost' ? 0.5 : ROW_BY_PIECE[piece].defaultVel

  for (let bar = 0; bar < 8; bar++) {
    for (let step = 0; step < 16; step++) {
      const beat = bar * 4 + step / 4
      if (step % 2 === 0) {
        hits.push({ id: `h${bar}-${step}`, pieceId: 'hh-closed', startBeat: beat,
          velocity: vel('hh-closed', step % 4 === 0 ? 'accent' : 'normal') })
      }
      if (step === 0 || step === 10) {
        hits.push({ id: `k${bar}-${step}`, pieceId: 'kick', startBeat: beat, velocity: vel('kick', 'accent') })
      }
      if (step === 4 || step === 12) {
        hits.push({ id: `s${bar}-${step}`, pieceId: 'snare', startBeat: beat, velocity: vel('snare', 'accent') })
      }
      if (step === 6 && bar % 2 === 1) {
        hits.push({ id: `g${bar}-${step}`, pieceId: 'snare', startBeat: beat, velocity: vel('snare', 'ghost') })
      }
      if (step === 14 && bar === 3) {
        hits.push({ id: `t${bar}`, pieceId: 'tom-floor', startBeat: beat, velocity: vel('tom-floor', 'normal') })
      }
    }
  }

  return {
    id: 'fixture', name: 'Round trip', bpm: 96, beatsPerBar: 4, totalBars: 8,
    kit: 'acoustic', hits,
  }
}

console.log('drum tab — every format round trips')
{
  const track = fixtureTrack()
  const want = hitsSignature(track.hits)
  for (const rest of ['dash', 'dot', 'space'] as RestStyle[]) {
    for (const spacing of ['compact', 'spaced'] as const) {
      for (const ruler of [true, false]) {
        for (const barsPerSystem of [4, 1, 0]) {
          const text = toDrumTab(track, { rest, spacing, ruler, barsPerSystem })
          const back = parseDrumTab(text, track.beatsPerBar)
          const name = `${rest}/${spacing}/ruler=${ruler}/bars-per-line=${barsPerSystem}`
          check(
            name,
            hitsSignature(back.hits) === want && back.bars === track.totalBars,
            `${back.bars} bars, ${back.hits.length}/${track.hits.length} hits`,
          )
        }
      }
    }
  }
}

// ── The same eleven bars, written three ways ────────────────────────────────
// Trimmed from a tab pasted by hand: wrapped onto systems, with uneven column
// widths inside a bar and a count line to align them. Both of the bugs this
// module was written for are in these three strings.
const DOTS = `
 C|· · · · · · · · |·   ·   · · · · · X |
HH|· ddX X O · + · |+   ·   · · · · · · |
 S|· · · · · · · f |·   · o · · o · · · |
 B|· · · · · · · · |·   ·   · · · · · o |
   1 + 2 + 3 + 4 +  1   +   2 + 3 + 4 +

 C|X · · · · · · · |· · · · · · · · |
HH|· X X x X x X xx|x x X x X xxx X |
 S|· · · · o · · · |· · · · o · · · |
 B|o · · · · · o · |· o o · · · · · |
   1 + 2 + 3 + 4 +  1 + 2 + 3 + 4 +
`.trim()

const DASHES = `
 C|----------------|------------------X-|
HH|--ddX-X-O---+---|+-------------------|
 S|--------------f-|------o-----o-------|
 B|----------------|------------------o-|
   1 + 2 + 3 + 4 +  1   +   2 + 3 + 4 +

 C|X---------------|----------------|
HH|--X-X-x-X-x-X-xx|x-x-X-x-X-xxx-X-|
 S|--------o-------|--------o-------|
 B|o-----------o---|--o-o-----------|
   1 + 2 + 3 + 4 +  1 + 2 + 3 + 4 +
`.trim()

const SPACES = `
 C|                |                  X |
HH|  ddX X O   +   |+                   |
 S|              f |      o     o       |
 B|                |                  o |
   1 + 2 + 3 + 4 +  1   +   2 + 3 + 4 +

 C|X               |                |
HH|  X X x X x X xx|x x X x X xxx X |
 S|        o       |        o       |
 B|o           o   |  o o           |
   1 + 2 + 3 + 4 +  1 + 2 + 3 + 4 +
`.trim()

console.log('\npasted tabs — systems, count lines, uneven columns')
{
  const parsed = { dashes: parseDrumTab(DASHES), dots: parseDrumTab(DOTS), spaces: parseDrumTab(SPACES) }
  const sig = (r: ReturnType<typeof parseDrumTab>) =>
    r.hits.map(h => `${h.pieceId}@${h.startBeat.toFixed(3)}`).sort().join('|')

  check('four bars across two systems, not two stacked', parsed.dashes.bars === 4, `${parsed.dashes.bars} bars`)
  check('dots agree with dashes', sig(parsed.dots) === sig(parsed.dashes))
  check('spaces agree with dashes', sig(parsed.spaces) === sig(parsed.dashes))
  check('nothing unreadable', parsed.dashes.unknownChars.length === 0,
    parsed.dashes.unknownChars.join(' '))
}

// ── Fret tabs use the same renderer ─────────────────────────────────────────
console.log('\nbass tab — two-digit frets keep their column')
{
  const notes = [
    { id: '1', stringIndex: 3 as const, fret: 0, startBeat: 0, durationBeats: 0.5, velocity: 0.8 },
    { id: '2', stringIndex: 3 as const, fret: 12, startBeat: 1, durationBeats: 0.5, velocity: 0.8 },
    { id: '3', stringIndex: 2 as const, fret: 7, startBeat: 1.75, durationBeats: 0.25, velocity: 0.8 },
    { id: '4', stringIndex: 1 as const, fret: 10, startBeat: 2.5, durationBeats: 0.5, velocity: 0.8 },
    { id: '5', stringIndex: 0 as const, fret: 3, startBeat: 4, durationBeats: 1, velocity: 0.8 },
  ]
  const track = { id: 'b', name: 'Line', bpm: 100, beatsPerBar: 4, totalBars: 2, notes } as never
  const text = bassAscii(track)
  const back = stringNotesFromText(text, { labels: ['G', 'D', 'A', 'E'] }, 4)
  const want = notes.map(n => `s${n.stringIndex}f${n.fret}@${n.startBeat}`).sort().join(' ')
  const got = back.notes.map(n => `s${n.stringIndex}f${n.fret}@${n.startBeat}`).sort().join(' ')
  check('frets and positions survive the round trip', want === got, `\n    want ${want}\n    got  ${got}`)

  const lines = text.split('\n').filter(l => l.includes('|'))
  const widths = new Set(lines.map(l => l.length))
  check('every string line is the same length', widths.size === 1, [...widths].join(', '))
}

console.log('\ndrum tab — flams and drags survive the text')
{
  const track: DrumTrack = {
    id: 'a', name: 'Fills', bpm: 100, beatsPerBar: 4, totalBars: 1, kit: 'acoustic',
    hits: [
      { id: '1', pieceId: 'snare', startBeat: 0, velocity: 1, articulation: 'flam' },
      // A tom rather than the snare for the unaccented one: the snare's own
      // default velocity is 0.95, which the format writes as an accent, so it
      // could not come back as anything else — a property of ASCII's three
      // dynamic levels, not of the parser.
      { id: '2', pieceId: 'tom-hi', startBeat: 1, velocity: ROW_BY_PIECE['tom-hi'].defaultVel, articulation: 'drag' },
      { id: '3', pieceId: 'kick', startBeat: 2, velocity: 1 },
      { id: '4', pieceId: 'snare', startBeat: 3, velocity: 0.5 },
    ],
  }
  for (const rest of ['dash', 'dot', 'space'] as RestStyle[]) {
    const text = toDrumTab(track, { rest })
    const back = parseDrumTab(text, 4)
    check(`${rest}: flam, drag, accent and ghost all come back`,
      hitsSignature(back.hits) === hitsSignature(track.hits),
      `\n    want ${hitsSignature(track.hits)}\n    got  ${hitsSignature(back.hits)}`)
  }
  // A flam is two strikes, a drag three — the property the transport, the WAV
  // render and the MIDI export all read from `strikesFor`.
  check('a flam is two strikes and a drag is three',
    strikesFor('flam').length === 2 && strikesFor('drag').length === 3 && strikesFor(undefined).length === 1)
  check('grace notes come before the stroke, and quieter',
    strikesFor('flam').every(s => s.lead >= 0 && s.gain <= 1) && strikesFor('flam')[0].lead > 0)
}

console.log('\nguitar tab — the two E strings stay apart')
{
  // `e` and `E` are the high and low strings. Matched case-insensitively, every
  // note on the high one landed on the low one, and the system split in two
  // where the labels "repeated" — which is how the bar count doubled.
  const labels = ['e', 'B', 'G', 'D', 'A', 'E']
  const notes = [
    { stringIndex: 0, fret: 3, startBeat: 0, durationBeats: 0.5, velocity: 0.8 },
    { stringIndex: 5, fret: 3, startBeat: 1, durationBeats: 0.5, velocity: 0.8 },
    { stringIndex: 1, fret: 1, startBeat: 2, durationBeats: 0.5, velocity: 0.8 },
    { stringIndex: 4, fret: 12, startBeat: 5, durationBeats: 0.5, velocity: 0.8 },
  ]
  const track = { id: 'g', name: 'Riff', bpm: 120, beatsPerBar: 4, totalBars: 2, capo: 0, notes } as never
  const text = guitarAscii(track)
  const back = stringNotesFromText(text, { labels }, 4)
  const want = notes.map(n => `s${n.stringIndex}f${n.fret}@${n.startBeat}`).sort().join(' ')
  const got = back.notes.map(n => `s${n.stringIndex}f${n.fret}@${n.startBeat}`).sort().join(' ')
  check('notes stay on their own string', want === got, `\n    want ${want}\n    got  ${got}`)
  check('two bars, not four', back.bars === 2, `${back.bars} bars`)
}

console.log(failures ? `\n${failures} failing check(s)` : '\nall checks passed')
process.exit(failures ? 1 : 0)
