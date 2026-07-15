import type { BassNote, BassTrack, StringIndex } from './types'

// Lazy-loads @coderline/alphatab only when the user imports a .gp file.
// We only use the score importer (no renderer, no audio worker).
export async function parseGpFile(buffer: ArrayBuffer): Promise<Partial<BassTrack>> {
  let at: typeof import('@coderline/alphatab')
  try {
    at = await import('@coderline/alphatab')
  } catch {
    throw new Error('Could not load .gp parser. Check your internet connection.')
  }

  const settings = new at.Settings()

  let score: InstanceType<typeof at.model.Score>
  try {
    score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer), settings)
  } catch {
    throw new Error('Could not parse file — is it a valid .gp / .gpx / .gp7?')
  }

  // Prefer a track that is unambiguously a 4-string bass (tuning length), then fall back
  // to name/GM-program heuristics, then to the first playable (non-drum) track — a guitar
  // track imported this way will still map onto 4 strings, just possibly the wrong ones.
  const isDrumOrMuted = (t: (typeof score.tracks)[number]) => t.playbackInfo.primaryChannel < 0 || t.playbackInfo.primaryChannel === 9
  const isBassTrack = (t: (typeof score.tracks)[number]) =>
    !isDrumOrMuted(t) && (
      t.staves[0]?.tuning.length === 4 ||
      /bass|bajo/i.test(t.name) ||
      (t.playbackInfo.program >= 32 && t.playbackInfo.program <= 39)
    )

  const track = score.tracks.find(isBassTrack)
    ?? score.tracks.find(t => !isDrumOrMuted(t))
    ?? score.tracks[0]

  if (!track) throw new Error('No playable tracks found in file.')

  const stringCount = track.staves[0]?.tuning.length || 4
  const bpm = score.tempo ?? 120

  // startBeat/durationBeats below are in quarter-note units (ticks / 960), so beatsPerBar
  // must be converted to that same unit — using the raw numerator only works for x/4 time.
  const firstMasterBar = score.masterBars[0]
  const beatsPerBar = firstMasterBar
    ? firstMasterBar.timeSignatureNumerator * (4 / firstMasterBar.timeSignatureDenominator)
    : 4

  const notes: BassNote[] = []

  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      const barStartTicks = bar.masterBar.start
      for (const voice of bar.voices) {
        if (voice.isEmpty) continue
        for (const beat of voice.beats) {
          if (beat.isEmpty) continue
          const startBeat = (barStartTicks + beat.playbackStart) / 960
          const durationBeats = Math.max(0.125, beat.playbackDuration / 960)

          for (const note of beat.notes) {
            // Same string-numbering convention as guitar (1 = lowest string, increasing
            // toward the highest), generalized to the track's own string count instead of
            // guitar's fixed 6 — a 5/6-string bass track's extra low/high strings are
            // dropped rather than folded onto the wrong string.
            const si = stringCount - note.string
            if (si < 0 || si > 3) continue
            if (note.fret < 0 || note.fret > 24) continue

            notes.push({
              id: crypto.randomUUID(),
              stringIndex: si as StringIndex,
              fret: note.fret,
              startBeat,
              durationBeats,
              velocity: note.accentuated !== 0 ? 1.0 : 0.8,
            })
          }
        }
      }
    }
  }

  if (notes.length === 0) throw new Error('No bass notes found in file.')

  const totalBeats = notes.reduce((mx, n) => Math.max(mx, n.startBeat + n.durationBeats), 0)
  const totalBars = Math.max(4, Math.ceil(totalBeats / beatsPerBar))

  return {
    name: [score.title, score.artist].filter(Boolean).join(' — ') || track.name || 'Imported Tab',
    bpm,
    beatsPerBar,
    totalBars,
    notes,
  }
}
