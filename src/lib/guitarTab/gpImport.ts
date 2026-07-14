import type { GuitarNote, GuitarStringIndex, GuitarTrack, GuitarTechnique } from './types'

// Lazy-loads @coderline/alphatab only when user imports a .gp file.
// We only use the score importer (no renderer, no audio worker).
export async function parseGpFile(buffer: ArrayBuffer): Promise<Partial<GuitarTrack>> {
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

  // Pick first guitar track (or first track if none flagged as guitar)
  const track = score.tracks.find(t =>
    t.playbackInfo.primaryChannel >= 0 && t.playbackInfo.primaryChannel !== 9 // 9 = drums
  ) ?? score.tracks[0]

  if (!track) throw new Error('No playable tracks found in file.')

  const bpm = score.tempo ?? 120

  // startBeat/durationBeats below are in quarter-note units (ticks / 960), so beatsPerBar
  // must be converted to that same unit — using the raw numerator only works for x/4 time.
  // For 6/8 (num=6, den=8) a bar is 3 quarter notes, not 6, e.g. numerator * (4 / denominator).
  const firstMasterBar = score.masterBars[0]
  const beatsPerBar = firstMasterBar
    ? firstMasterBar.timeSignatureNumerator * (4 / firstMasterBar.timeSignatureDenominator)
    : 4

  const notes: GuitarNote[] = []

  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      // beat.playbackStart is relative to the start of its own bar (resets to 0 every
      // bar) — bar.masterBar.start is the absolute tick offset of the bar within the
      // whole score. Without adding it, every bar's notes collapse onto the same few
      // beat positions and overwrite each other in the grid.
      const barStartTicks = bar.masterBar.start
      for (const [voiceIndex, voice] of bar.voices.entries()) {
        if (voice.isEmpty) continue
        for (const beat of voice.beats) {
          if (beat.isEmpty) continue
          const startBeat = (barStartTicks + beat.playbackStart) / 960
          const durationBeats = Math.max(0.125, beat.playbackDuration / 960)

          for (const note of beat.notes) {
            // AlphaTab's Note.string is 1 = LOWEST string (low E), increasing toward the
            // highest string (per its own doc comment) — the opposite of our stringIndex
            // (0 = high e, 5 = low E). Confirmed in node_modules/@coderline/alphatab's
            // Note.string JSDoc; the previous "1 = high e" assumption here was backwards
            // and put every note on the mirror-image string.
            const si = 6 - note.string
            if (si < 0 || si > 5) continue
            if (note.fret < 0 || note.fret > 24) continue

            let technique: GuitarTechnique | undefined
            if (note.hammerPullOrigin) technique = 'h'
            else if (note.slideTarget || note.slideOrigin) technique = '/'

            notes.push({
              id: crypto.randomUUID(),
              stringIndex: si as GuitarStringIndex,
              fret: note.fret,
              startBeat,
              durationBeats,
              velocity: note.accentuated !== 0 ? 1.0 : 0.8,
              technique,
              muted: note.isDead || false,
              voice: voiceIndex === 0 ? 0 : 1,
            })
          }
        }
      }
    }
  }

  if (notes.length === 0) throw new Error('No guitar notes found in file.')

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
