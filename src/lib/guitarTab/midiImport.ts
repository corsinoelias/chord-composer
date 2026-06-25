import type { GuitarNote, GuitarTrack, GuitarStringIndex } from './types'
import { DEFAULT_TRACK } from './types'

// Open MIDI note for each string (standard tuning): e B G D A E
const OPEN_MIDI = [64, 59, 55, 50, 45, 40]
const MAX_FRET  = 24

// Guitar MIDI range — anything outside this cannot be played on a standard guitar
const GUITAR_MIDI_MIN = 40  // low E open
const GUITAR_MIDI_MAX = 88  // ~high e fret 24

// Maximum notes to import (keeps the player usable)
const MAX_NOTES = 400

// ── MIDI parser ───────────────────────────────────────────────────────────────

interface RawNote {
  midi: number
  startTick: number
  endTick: number
  velocity: number
  channel: number
  trackIdx: number
}

function readVarLen(buf: Uint8Array, pos: number): [number, number] {
  let value = 0; let bytesRead = 0
  while (true) {
    const b = buf[pos + bytesRead]; bytesRead++
    value = (value << 7) | (b & 0x7f)
    if (!(b & 0x80)) break
  }
  return [value, bytesRead]
}

function parseMidi(buf: ArrayBuffer): { notes: RawNote[]; ticksPerBeat: number; bpm: number } {
  const data = new Uint8Array(buf)
  let pos = 0

  function read32() { const v = (data[pos]<<24)|(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3]; pos+=4; return v }
  function read16() { const v = (data[pos]<<8)|data[pos+1]; pos+=2; return v }
  function readStr(n: number) { const s = String.fromCharCode(...data.slice(pos, pos+n)); pos+=n; return s }

  if (readStr(4) !== 'MThd') throw new Error('Not a MIDI file')
  const hdrLen    = read32()
  const _format   = read16()  // 0 = single, 1 = multi-sync, 2 = multi-async
  const numTracks = read16()
  const division  = read16()
  if (division & 0x8000) throw new Error('SMPTE time not supported')
  const ticksPerBeat = division
  pos += Math.max(0, hdrLen - 6)

  let bpm = 120
  const rawNotes: RawNote[] = []

  for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
    if (pos + 8 > data.length) break
    const chunkId  = readStr(4)
    const chunkLen = read32()
    if (chunkId !== 'MTrk') { pos += chunkLen; continue }

    const trackEnd = pos + chunkLen
    let tick = 0
    let runningStatus = 0
    // Per-pitch tracking: Map<midiNote, { startTick, velocity, channel }>
    const openNotes = new Map<number, { startTick: number; velocity: number; channel: number }>()

    while (pos < trackEnd) {
      const [delta, dLen] = readVarLen(data, pos); pos += dLen; tick += delta

      let statusByte = data[pos]
      if (statusByte & 0x80) { runningStatus = statusByte; pos++ }
      else                   { statusByte = runningStatus }

      const type    = statusByte & 0xf0
      const channel = statusByte & 0x0f

      if (type === 0x90) {
        const note = data[pos++]; const vel = data[pos++]
        if (vel > 0) {
          openNotes.set(note, { startTick: tick, velocity: vel, channel })
        } else {
          // NoteOn with vel=0 is NoteOff
          const on = openNotes.get(note)
          if (on) {
            rawNotes.push({ midi: note, startTick: on.startTick, endTick: tick, velocity: on.velocity, channel: on.channel, trackIdx })
            openNotes.delete(note)
          }
        }
      } else if (type === 0x80) {
        const note = data[pos++]; pos++
        const on = openNotes.get(note)
        if (on) {
          rawNotes.push({ midi: note, startTick: on.startTick, endTick: tick, velocity: on.velocity, channel: on.channel, trackIdx })
          openNotes.delete(note)
        }
      } else if (type === 0xa0) { pos += 2
      } else if (type === 0xb0) { pos += 2
      } else if (type === 0xc0) { pos += 1
      } else if (type === 0xd0) { pos += 1
      } else if (type === 0xe0) { pos += 2
      } else if (statusByte === 0xff) {
        const metaType = data[pos++]
        const [metaLen, mLen] = readVarLen(data, pos); pos += mLen
        if (metaType === 0x51 && metaLen === 3) {
          const us = (data[pos]<<16)|(data[pos+1]<<8)|data[pos+2]
          bpm = Math.round(60_000_000 / us)
        }
        pos += metaLen
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        const [sLen, sBytes] = readVarLen(data, pos); pos += sBytes + sLen
      } else {
        pos++
      }
    }

    for (const [note, on] of openNotes) {
      rawNotes.push({ midi: note, startTick: on.startTick, endTick: tick, velocity: on.velocity, channel: on.channel, trackIdx })
    }
    pos = trackEnd
  }

  return { notes: rawNotes, ticksPerBeat, bpm }
}

// ── Channel / track selection ─────────────────────────────────────────────────

function pickBestNotes(rawNotes: RawNote[]): RawNote[] {
  // 1. Filter drums (MIDI channel 9) and out-of-range notes
  const filtered = rawNotes.filter(
    n => n.channel !== 9 && n.midi >= GUITAR_MIDI_MIN && n.midi <= GUITAR_MIDI_MAX
  )
  if (!filtered.length) return []

  // 2. Group by (trackIdx, channel) — each combination is a "voice"
  const voiceMap = new Map<string, RawNote[]>()
  for (const n of filtered) {
    const key = `${n.trackIdx}:${n.channel}`
    if (!voiceMap.has(key)) voiceMap.set(key, [])
    voiceMap.get(key)!.push(n)
  }

  // 3. Pick the voice with the most notes in guitar range — likely the melody/lead
  let bestVoice: RawNote[] = []
  let bestScore = -1
  for (const [, notes] of voiceMap) {
    // Score: note count, bonus for notes in mid-range (e.g. 52–76, typical guitar melody)
    const score = notes.length + notes.filter(n => n.midi >= 52 && n.midi <= 76).length * 0.1
    if (score > bestScore) { bestScore = score; bestVoice = notes }
  }

  // 4. If the best voice has very few notes but multiple voices exist with similar size,
  //    merge the top voices (e.g. chordal playing split across two channels)
  const sortedVoices = [...voiceMap.values()].sort((a, b) => b.length - a.length)
  if (sortedVoices.length > 1 && sortedVoices[1].length >= bestVoice.length * 0.5) {
    // Merge top 2 voices (for chord parts often split across channels)
    const merged = [...sortedVoices[0], ...sortedVoices[1]]
      .sort((a, b) => a.startTick - b.startTick)
    return merged
  }

  return bestVoice
}

// ── Guitar fingering: MIDI note → { stringIndex, fret } ─────────────────────

function validPositions(midiNote: number): Array<{ si: GuitarStringIndex; fret: number }> {
  const result: Array<{ si: GuitarStringIndex; fret: number }> = []
  for (let si = 0; si < 6; si++) {
    const fret = midiNote - OPEN_MIDI[si]
    if (fret >= 0 && fret <= MAX_FRET) result.push({ si: si as GuitarStringIndex, fret })
  }
  return result
}

function assignStrings(rawNotes: RawNote[], ticksPerBeat: number): GuitarNote[] {
  const sorted = [...rawNotes].sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)

  const stringBusy     = new Array(6).fill(0)   // endTick of last note per string
  const stringLastFret = new Array(6).fill(0)    // last fret used per string

  const result: GuitarNote[] = []

  for (const raw of sorted) {
    const positions = validPositions(raw.midi)
    if (!positions.length) continue

    const scored = positions.map(p => {
      const busy     = stringBusy[p.si] > raw.startTick
      const fretJump = Math.abs(p.fret - stringLastFret[p.si])

      let score = 0
      if (busy) score += 1000          // heavy penalty for overlap
      score += p.fret * 2              // prefer lower frets
      score += fretJump                // prefer minimal position shift
      if (p.si > 2) score -= 5         // slight bass-string preference for lower notes
      return { ...p, score }
    })

    scored.sort((a, b) => a.score - b.score)
    const best = scored[0]

    const startBeat     = raw.startTick / ticksPerBeat
    const durationBeats = Math.max(0.25, (raw.endTick - raw.startTick) / ticksPerBeat)

    result.push({
      id:            crypto.randomUUID(),
      stringIndex:   best.si,
      fret:          best.fret,
      startBeat:     Math.round(startBeat * 4) / 4,       // snap to 1/16
      durationBeats: Math.round(durationBeats * 4) / 4,
      velocity:      raw.velocity / 127,
    })

    stringBusy[best.si]     = raw.endTick
    stringLastFret[best.si] = best.fret
  }

  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MidiImportResult {
  track: GuitarTrack
  noteCount: number
  skipped: number
  totalRaw: number
}

export function importMidiFile(buf: ArrayBuffer, name?: string): MidiImportResult {
  const { notes, ticksPerBeat, bpm } = parseMidi(buf)
  const totalRaw = notes.length

  // Pick the best melodic voice (skips drums, picks dominant channel)
  const selected = pickBestNotes(notes)
  const skipped  = totalRaw - selected.length

  // Cap note count to keep the player performant
  const capped = selected.slice(0, MAX_NOTES)

  const guitarNotes = assignStrings(capped, ticksPerBeat)

  const beatsPerBar = 4
  const maxBeat     = guitarNotes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0)
  const totalBars   = Math.max(4, Math.ceil(maxBeat / beatsPerBar))

  const track: GuitarTrack = {
    ...DEFAULT_TRACK,
    id:         crypto.randomUUID(),
    name:       name ?? 'Imported MIDI',
    bpm:        Math.max(40, Math.min(300, bpm)),
    beatsPerBar,
    totalBars,
    notes:      guitarNotes,
    capo:       0,
  }

  return { track, noteCount: guitarNotes.length, skipped, totalRaw }
}
