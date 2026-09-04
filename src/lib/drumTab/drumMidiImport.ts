import { parseSmf, type SmfNote } from '../smf'
import { makeHitId, STEPS_PER_BEAT, type DrumHit, type DrumPieceId, type DrumTrack } from './types'
import { GM_DRUM_NOTES } from './drumMidi'

/**
 * A `.mid` file back into a drum track — the inverse of `drumMidi.ts`, and
 * nearly free once the GM map exists.
 *
 * The file format itself is `parseSmf` in `src/lib/smf.ts`, shared with the
 * guitar tab's importer. What this module owns is the percussion reading: which
 * GM note is which kit piece, which of the file's channels is the drummer, and
 * how two hits a few milliseconds apart are a flam rather than two strokes.
 */

/**
 * GM note → kit piece.
 *
 * Built from `GM_DRUM_NOTES` so the two can never drift, plus the aliases a
 * real file uses that this kit has no separate voice for: 35 and 36 are both
 * bass drums, 38 and 40 both snares, 39 a hand clap that reads as one, and the
 * six GM toms collapse onto three.
 */
const PIECE_BY_NOTE = new Map<number, DrumPieceId>()
for (const [piece, note] of Object.entries(GM_DRUM_NOTES)) {
  PIECE_BY_NOTE.set(note, piece as DrumPieceId)
}
const ALIASES: Record<number, DrumPieceId> = {
  35: 'kick',        // Acoustic Bass Drum
  40: 'snare',       // Electric Snare
  39: 'snare',       // Hand Clap
  43: 'tom-floor',   // High Floor Tom
  45: 'tom-lo',      // Low Tom
  47: 'tom-lo',      // Low-Mid Tom
  50: 'tom-hi',      // High Tom
  52: 'crash-body',  // Chinese Cymbal
  54: 'ride-bell',   // Tambourine — a bright, short ping in this kit
  56: 'ride-bell',   // Cowbell
  58: 'crash-body',  // Vibraslap
  60: 'tom-hi', 61: 'tom-lo', 62: 'tom-hi', 63: 'tom-lo', 64: 'tom-floor',
}
for (const [note, piece] of Object.entries(ALIASES)) {
  if (!PIECE_BY_NOTE.has(Number(note))) PIECE_BY_NOTE.set(Number(note), piece)
}

/** Same snap the text parser uses: keeps triplets, drops float noise. */
const SNAP = 48

/**
 * Two hits on the same piece closer together than this are one stroke with a
 * grace note. It is the same threshold the export writes at (30 ms for a flam,
 * 58 for a drag) with room to spare, and well under the ~90 ms where two hits
 * stop being heard as one gesture.
 */
const GRACE_SECONDS = 0.075

export interface DrumMidiImportResult {
  track: Partial<DrumTrack> & { hits: DrumHit[]; bpm: number; totalBars: number }
  /** Notes that matched no kit piece — usually a melodic track in the file. */
  skipped: number
}

/**
 * Which notes are the drummer.
 *
 * Channel 10 (index 9) is percussion by GM convention, so if the file uses it
 * at all that is the answer. Files exported from a drum-only tool often ignore
 * that, in which case anything landing on a mapped percussion note is taken.
 */
function drumNotes(notes: SmfNote[]): SmfNote[] {
  const onNine = notes.filter(n => n.channel === 9)
  if (onNine.length) return onNine
  return notes.filter(n => PIECE_BY_NOTE.has(n.midi))
}

export function importDrumMidi(buf: ArrayBuffer, name?: string): DrumMidiImportResult {
  const { notes, ticksPerBeat, bpm, timeSignature, endTick } = parseSmf(buf)
  const beatsPerBar = timeSignature?.numerator ?? 4
  const candidates = drumNotes(notes)

  const hits: DrumHit[] = []
  let skipped = 0
  for (const note of candidates) {
    const pieceId = PIECE_BY_NOTE.get(note.midi)
    if (!pieceId) { skipped++; continue }
    const beat = note.startTick / Math.max(1, ticksPerBeat)
    hits.push({
      id: makeHitId(),
      pieceId,
      startBeat: Math.max(0, Math.round(beat * SNAP) / SNAP),
      velocity: Math.max(0.05, Math.min(1, note.velocity / 127)),
    })
  }
  skipped += notes.length - candidates.length

  hits.sort((a, b) => a.startBeat - b.startBeat)
  const collapsed = collapseGraceNotes(hits, bpm)

  // The file says how long it is; the last hit only says where the playing
  // stopped. Taking the greater of the two keeps a trailing empty bar, which is
  // a real part of a loop and which measuring by notes alone would throw away.
  const lastBeat = collapsed.reduce((max, h) => Math.max(max, h.startBeat), 0)
  const endBeat = Math.max(lastBeat + 1 / STEPS_PER_BEAT, endTick / Math.max(1, ticksPerBeat))
  const totalBars = Math.max(1, Math.round(endBeat / beatsPerBar))

  return {
    track: {
      name: name?.replace(/\.mid(i)?$/i, '') || 'Imported MIDI',
      bpm: Math.max(30, Math.min(300, bpm)),
      beatsPerBar,
      totalBars,
      hits: collapsed,
    },
    skipped,
  }
}

/**
 * Grace notes, back into the stroke they belong to.
 *
 * Without this a flam imports as two separate sixteenth-ish hits a couple of
 * milliseconds apart — which is not what the chart says, cannot be written in
 * the text view, and reads as a mistake in the grid. One quiet hit just before
 * a louder one on the same piece is a flam; two are a drag.
 */
function collapseGraceNotes(hits: DrumHit[], bpm: number): DrumHit[] {
  const beatsPerSecond = bpm / 60
  const window = GRACE_SECONDS * beatsPerSecond
  const out: DrumHit[] = []
  const byPiece = new Map<DrumPieceId, DrumHit[]>()

  for (const hit of hits) {
    const run = byPiece.get(hit.pieceId)
    if (run) run.push(hit)
    else byPiece.set(hit.pieceId, [hit])
  }

  for (const run of byPiece.values()) {
    let i = 0
    while (i < run.length) {
      // How many of the hits before this one crowd into the grace window and
      // are quieter than it — those are the grace notes of this stroke.
      let leading = 0
      while (
        leading < 2 &&
        i + leading + 1 < run.length &&
        run[i + leading + 1].startBeat - run[i + leading].startBeat <= window &&
        run[i + leading].velocity <= run[i + leading + 1].velocity + 0.05
      ) {
        leading++
      }
      const main = run[i + leading]
      out.push(leading === 0 ? main : {
        ...main,
        articulation: leading === 1 ? 'flam' : 'drag',
      })
      i += leading + 1
    }
  }

  out.sort((a, b) => a.startBeat - b.startBeat)
  return out
}
