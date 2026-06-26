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
    throw new Error('Could not parse file — is it a valid .gp / .gpx / .gp7 / .musicxml?')
  }

  // Pick first guitar track (or first track if none flagged as guitar)
  const track = score.tracks.find(t =>
    t.playbackInfo.primaryChannel >= 0 && t.playbackInfo.primaryChannel !== 9 // 9 = drums
  ) ?? score.tracks[0]

  if (!track) throw new Error('No playable tracks found in file.')

  const bpm = score.tempo ?? 120
  const beatsPerBar = score.masterBars[0]?.timeSignatureNumerator ?? 4

  const notes: GuitarNote[] = []

  for (const staff of track.staves) {
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        if (voice.isEmpty) continue
        for (const beat of voice.beats) {
          if (beat.isEmpty) continue
          const startBeat = beat.playbackStart / 960
          const durationBeats = Math.max(0.125, beat.playbackDuration / 960)

          for (const note of beat.notes) {
            // AlphaTab string: 1 = high e, 6 = low E; our stringIndex: 0 = high e, 5 = low E
            const si = note.string - 1
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
