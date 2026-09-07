/**
 * Standard MIDI File writer — one for the whole repo.
 *
 * Before this there were three: `midiExporter.ts` (chords), `bassTab/exportTab.ts`
 * and `guitarTab/exportTab.ts`, each with its own `varLen`, its own header bytes
 * and its own idea of what a note-off at the same tick as a note-on should do.
 * The drum tab would have made a fourth, which is where copies stop being a
 * shortcut — so the format lives here and the instruments bring only what is
 * actually theirs: which MIDI note a string or a kit piece is.
 *
 * The binary format is written by hand (no dependency) for the same reason it
 * always was here: an SMF is a header, a length and a stream of delta-times.
 */

/** Ticks per quarter note. 480 is what every writer in the repo already used. */
export const PPQ = 480

export interface SmfEvent {
  /** Absolute ticks from the top of the file — deltas are computed on write. */
  tick: number
  /** Raw status + data bytes, e.g. `[0x90, 38, 100]`. */
  data: number[]
}

export interface SmfTrack {
  name?: string
  events: SmfEvent[]
}

export interface SmfOptions {
  bpm: number
  /**
   * One entry per MIDI track. A single track is written as format 0, several as
   * format 1 — which is what a DAW wants when each kit piece (or each guitar
   * voice) should land on its own lane.
   */
  tracks: SmfTrack[]
  ppq?: number
  /** Written as an `FF 58` meta event. Omitted entirely when not given. */
  timeSignature?: { numerator: number; denominator: number }
  /** Sequence name, on the first track. */
  name?: string
  /**
   * Where the file ends, in ticks. Without it the file ends on the last note,
   * which cuts a trailing rest — a four-bar loop whose last bar is empty comes
   * back three bars long.
   */
  endTick?: number
}

/** MIDI Variable Length Quantity. */
export function varLen(n: number): number[] {
  const value = Math.max(0, Math.round(n))
  const bytes: number[] = [value & 0x7f]
  let rest = value >>> 7
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80)
    rest >>>= 7
  }
  return bytes
}

function u32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]
}

function u16(v: number): number[] {
  return [(v >>> 8) & 0xff, v & 0xff]
}

/** `FF 03` track name. Non-ASCII is dropped rather than mis-encoded. */
function nameMeta(name: string): number[] {
  const bytes = [...name].map(c => c.charCodeAt(0)).filter(c => c > 0 && c < 128)
  return [0xff, 0x03, ...varLen(bytes.length), ...bytes]
}

/**
 * A note-on and its note-off, as the pair of events they are.
 *
 * `velocity` is 0-1 here, the range every track model in this repo stores, and
 * is clamped to at least 1 on the way out — a MIDI note-on with velocity 0 is a
 * note-off, so rounding a quiet ghost note down to zero would silently delete it.
 */
export function noteEvents(
  channel: number,
  note: number,
  velocity: number,
  startTick: number,
  endTick: number,
): SmfEvent[] {
  const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)))
  const on = 0x90 | (channel & 0x0f)
  const off = 0x80 | (channel & 0x0f)
  const end = Math.max(startTick + 1, endTick)
  return [
    { tick: startTick, data: [on, note & 0x7f, vel] },
    { tick: end, data: [off, note & 0x7f, 0] },
  ]
}

/** Program change on a channel, at tick 0. */
export function programChange(channel: number, program: number): SmfEvent {
  return { tick: 0, data: [0xc0 | (channel & 0x0f), program & 0x7f] }
}

/**
 * Events at the same tick, ordered so a note-off never lands after the note-on
 * that replaces it — otherwise a repeated note on the same pitch (a sixteenth
 * hi-hat, a tremolo) is cut off by its own predecessor and the DAW shows a gap.
 * Meta events sort first so the tempo is in force before anything sounds.
 */
function eventRank(data: number[]): number {
  if (data[0] === 0xff) return 0
  const status = data[0] & 0xf0
  if (status === 0x80) return 1
  if (status === 0xc0) return 2
  return 3
}

function encodeTrack(
  events: SmfEvent[],
  name: string | undefined,
  lead: number[],
): { bytes: number[]; lastTick: number } {
  const bytes: number[] = [...lead]
  if (name) bytes.push(0x00, ...nameMeta(name))

  const sorted = [...events].sort(
    (a, b) => a.tick - b.tick || eventRank(a.data) - eventRank(b.data),
  )

  let prev = 0
  for (const ev of sorted) {
    if (!ev.data.length) continue
    const tick = Math.max(prev, Math.round(ev.tick))
    bytes.push(...varLen(tick - prev), ...ev.data)
    prev = tick
  }
  return { bytes, lastTick: prev }
}

export function buildSmf(options: SmfOptions): Uint8Array {
  const ppq = options.ppq ?? PPQ
  const usPerBeat = Math.round(60_000_000 / Math.max(1, options.bpm))

  // Tempo and time signature belong to the whole file, so they go on the first
  // track — which in format 1 is the conductor track every DAW reads.
  const head: number[] = [
    0x00, 0xff, 0x51, 0x03,
    (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff,
  ]
  if (options.timeSignature) {
    const { numerator, denominator } = options.timeSignature
    // `dd` is the power of two: 4 → 2, 8 → 3.
    const dd = Math.max(0, Math.round(Math.log2(Math.max(1, denominator))))
    head.push(0x00, 0xff, 0x58, 0x04, numerator & 0xff, dd, 24, 8)
  }

  const tracks = options.tracks.length ? options.tracks : [{ events: [] }]
  const endTick = options.endTick

  const chunks = tracks.map((track, i) => {
    const { bytes: body, lastTick } = encodeTrack(
      track.events,
      i === 0 ? (track.name ?? options.name) : track.name,
      i === 0 ? head : [],
    )
    // Every track ends with its own end-of-track meta event, delayed to
    // `endTick` so a trailing empty bar stays part of the file.
    const tail = endTick != null ? Math.max(0, Math.round(endTick) - lastTick) : 0
    body.push(...varLen(tail), 0xff, 0x2f, 0x00)
    return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body]
  })

  const header = [
    0x4d, 0x54, 0x68, 0x64, ...u32(6),
    ...u16(chunks.length > 1 ? 1 : 0),
    ...u16(chunks.length),
    ...u16(ppq),
  ]

  return new Uint8Array([...header, ...chunks.flat()])
}

/** Filename-safe version of a track name, with a fallback for an empty one. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '_')
  return cleaned || fallback
}

export function downloadMidi(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.mid') ? filename : `${filename}.mid`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Reading ────────────────────────────────────────────────────────────────

export interface SmfNote {
  midi: number
  startTick: number
  endTick: number
  /** Raw MIDI velocity, 0-127. */
  velocity: number
  channel: number
  /** Index of the MTrk chunk it came from. */
  track: number
}

export interface ParsedSmf {
  notes: SmfNote[]
  ticksPerBeat: number
  bpm: number
  timeSignature?: { numerator: number; denominator: number }
  /**
   * The furthest tick any track reaches, end-of-track meta included.
   *
   * Not the same as where the last note is: a file whose final bar is empty
   * says so here and nowhere else, so a reader that measures by its last note
   * silently shortens the loop.
   */
  endTick: number
}

function readVarLenAt(data: Uint8Array, pos: number): [number, number] {
  let value = 0
  let read = 0
  for (;;) {
    const b = data[pos + read]
    read++
    value = (value << 7) | (b & 0x7f)
    if (!(b & 0x80)) break
  }
  return [value, read]
}

/**
 * A Standard MIDI File, as notes.
 *
 * The counterpart to `buildSmf`, and the same consolidation: this reader was
 * written three times over (the guitar tab's importer, the bass tab's, Virtual
 * Piano's), and the drum tab's would have been the fourth.
 *
 * It reports notes and nothing else interpretive — which channel is the melody,
 * what a drum note maps to, how a fret is chosen — because every caller answers
 * those differently. What it does own is the parts that are the *format*:
 * running status, note-on with velocity 0 meaning note-off, meta and sysex
 * lengths, and notes left open when a track ends.
 */
export function parseSmf(buf: ArrayBuffer): ParsedSmf {
  const data = new Uint8Array(buf)
  let pos = 0

  const read32 = () => {
    const v = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]
    pos += 4
    return v >>> 0
  }
  const read16 = () => { const v = (data[pos] << 8) | data[pos + 1]; pos += 2; return v }
  const readStr = (n: number) => {
    const s = String.fromCharCode(...data.slice(pos, pos + n))
    pos += n
    return s
  }

  if (readStr(4) !== 'MThd') throw new Error('Not a MIDI file')
  const headerLen = read32()
  read16()                       // format — the track loop handles 0, 1 and 2 alike
  const trackCount = read16()
  const division = read16()
  // SMPTE division encodes frames per second rather than ticks per beat, and
  // nothing here would know how to place a note on a beat grid from it.
  if (division & 0x8000) throw new Error('SMPTE time division is not supported')
  pos += Math.max(0, headerLen - 6)

  let bpm = 120
  let endTick = 0
  let timeSignature: { numerator: number; denominator: number } | undefined
  const notes: SmfNote[] = []

  for (let track = 0; track < trackCount; track++) {
    if (pos + 8 > data.length) break
    const chunkId = readStr(4)
    const chunkLen = read32()
    if (chunkId !== 'MTrk') { pos += chunkLen; continue }

    const end = pos + chunkLen
    let tick = 0
    let status = 0
    const open = new Map<number, { startTick: number; velocity: number; channel: number }>()

    const close = (note: number, at: number) => {
      const on = open.get(note)
      if (!on) return
      notes.push({
        midi: note, startTick: on.startTick, endTick: at,
        velocity: on.velocity, channel: on.channel, track,
      })
      open.delete(note)
    }

    while (pos < end) {
      const [delta, deltaLen] = readVarLenAt(data, pos)
      pos += deltaLen
      tick += delta

      let statusByte = data[pos]
      // Running status: a data byte here means "same status as last time".
      if (statusByte & 0x80) { status = statusByte; pos++ } else { statusByte = status }

      const type = statusByte & 0xf0
      const channel = statusByte & 0x0f

      if (type === 0x90) {
        const note = data[pos++]
        const velocity = data[pos++]
        // Note-on at velocity 0 is how most writers spell a note-off.
        if (velocity > 0) {
          // A second note-on for a pitch that is still ringing ends the first
          // one here. Without this the earlier note is simply overwritten and
          // lost, which is what a flam or a fast roll looks like in a file
          // whose gates are longer than the gap between strokes.
          close(note, tick)
          open.set(note, { startTick: tick, velocity, channel })
        } else close(note, tick)
      } else if (type === 0x80) {
        const note = data[pos++]
        pos++
        close(note, tick)
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        pos += 2
      } else if (type === 0xc0 || type === 0xd0) {
        pos += 1
      } else if (statusByte === 0xff) {
        const metaType = data[pos++]
        const [metaLen, metaLenBytes] = readVarLenAt(data, pos)
        pos += metaLenBytes
        if (metaType === 0x51 && metaLen === 3) {
          const usPerBeat = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2]
          if (usPerBeat > 0) bpm = Math.round(60_000_000 / usPerBeat)
        } else if (metaType === 0x58 && metaLen >= 2 && !timeSignature) {
          timeSignature = { numerator: data[pos], denominator: 2 ** data[pos + 1] }
        }
        pos += metaLen
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        const [sysexLen, sysexLenBytes] = readVarLenAt(data, pos)
        pos += sysexLenBytes + sysexLen
      } else {
        pos++
      }
    }

    // A track that ends without closing its notes is not rare; they end here.
    for (const [note] of open) close(note, tick)
    if (tick > endTick) endTick = tick
    pos = end
  }

  notes.sort((a, b) => a.startTick - b.startTick)
  return { notes, ticksPerBeat: division, bpm, timeSignature, endTick }
}
