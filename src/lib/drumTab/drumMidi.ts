import {
  DRUM_ROWS, hasSolo, mixedVelocity, swingOffsetBeats,
  type DrumHit, type DrumPieceId, type DrumTrack,
} from './types'
import {
  PPQ, buildSmf, downloadMidi, noteEvents, safeFileName,
  type SmfEvent, type SmfTrack,
} from '../smf'

/**
 * The drum tab as a Standard MIDI File.
 *
 * All this module owns is the General MIDI percussion map and what a "note" is
 * for a drum — the file format itself is `src/lib/smf.ts`, shared with the bass
 * and guitar tabs.
 *
 * GM percussion lives on channel 10 (index 9), where the note number *is* the
 * kit piece rather than a pitch.
 */
const GM_CHANNEL = 9

export const GM_DRUM_NOTES: Record<DrumPieceId, number> = {
  'kick': 36,        // Bass Drum 1
  'snare': 38,       // Acoustic Snare
  'stick': 37,       // Side Stick
  'tom-hi': 48,      // Hi-Mid Tom
  'tom-lo': 45,      // Low Tom
  'tom-floor': 41,   // Low Floor Tom
  'hh-closed': 42,   // Closed Hi-Hat
  'hh-open': 46,     // Open Hi-Hat
  'hh-foot': 44,     // Pedal Hi-Hat
  'crash-edge': 49,  // Crash Cymbal 1
  'crash-body': 57,  // Crash Cymbal 2
  'crash-bell': 55,  // Splash — the closest GM has to a bell-struck crash
  'ride-edge': 59,   // Ride Cymbal 2
  'ride-body': 51,   // Ride Cymbal 1
  'ride-bell': 53,   // Ride Bell
}

/**
 * A drum note has no duration — the sample rings out on its own — but a MIDI
 * note still needs an off. A thirty-second note is short enough that no DAW
 * draws a bar-long block, and long enough that every sampler retriggers.
 */
const GATE_TICKS = PPQ / 8

export interface DrumMidiOptions {
  /**
   * Write the swing into the note positions. On by default: `track.swing` is a
   * performance direction this app understands and a DAW does not, so a swung
   * groove exported straight would come back wrong. Off writes the grid as the
   * chart shows it.
   */
  bakeSwing?: boolean
  /**
   * One MIDI track per kit piece (format 1) instead of all of them on one.
   * What you want when the file is going into a DAW to be mixed, rather than
   * into a notation program to be read.
   */
  splitByPiece?: boolean
}

/**
 * The hits that actually sound, at the times they actually sound — the mix
 * applied and the swing resolved, exactly as `drumAudio` schedules them.
 *
 * Exported because the WAV renderer needs the same list: a muted piece that is
 * silent in the app but present in the export would make the file disagree with
 * the thing it is a recording of.
 */
export function soundingHits(
  track: DrumTrack,
  bakeSwing = true,
): { hit: DrumHit; beat: number; velocity: number }[] {
  const solo = hasSolo(track.mix)
  const out: { hit: DrumHit; beat: number; velocity: number }[] = []
  for (const hit of track.hits) {
    const velocity = mixedVelocity(track.mix, hit.pieceId, hit.velocity, solo)
    if (velocity === null) continue
    const beat = hit.startBeat + (bakeSwing ? swingOffsetBeats(hit.startBeat, track.swing) : 0)
    out.push({ hit, beat, velocity })
  }
  out.sort((a, b) => a.beat - b.beat)
  return out
}

export function buildDrumMidi(track: DrumTrack, options: DrumMidiOptions = {}): Uint8Array {
  const { bakeSwing = true, splitByPiece = false } = options
  const sounding = soundingHits(track, bakeSwing)

  const byPiece = new Map<DrumPieceId, SmfEvent[]>()
  for (const { hit, beat, velocity } of sounding) {
    const note = GM_DRUM_NOTES[hit.pieceId]
    if (note == null) continue
    const startTick = Math.round(beat * PPQ)
    const events = noteEvents(GM_CHANNEL, note, velocity, startTick, startTick + GATE_TICKS)
    const bucket = byPiece.get(hit.pieceId)
    if (bucket) bucket.push(...events)
    else byPiece.set(hit.pieceId, [...events])
  }

  const endTick = Math.round(track.totalBars * track.beatsPerBar * PPQ)

  let tracks: SmfTrack[]
  if (splitByPiece && byPiece.size > 0) {
    // Kept in kit order rather than in the order pieces happen to be played,
    // so the lanes in the DAW read top-to-bottom like the grid does.
    tracks = DRUM_ROWS
      .filter(row => byPiece.has(row.id))
      .map(row => ({ name: row.label, events: byPiece.get(row.id)! }))
  } else {
    tracks = [{ name: track.name || 'Drums', events: [...byPiece.values()].flat() }]
  }

  return buildSmf({
    bpm: track.bpm,
    name: track.name || 'Drums',
    timeSignature: { numerator: track.beatsPerBar, denominator: 4 },
    tracks,
    endTick,
  })
}

export function exportDrumMidi(track: DrumTrack, options?: DrumMidiOptions): void {
  downloadMidi(buildDrumMidi(track, options), `${safeFileName(track.name, 'drum-tab')}.mid`)
}
