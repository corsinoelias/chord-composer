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
