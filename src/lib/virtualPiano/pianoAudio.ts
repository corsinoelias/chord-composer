// Synthesis, WAV/MIDI encode-decode and file download for the Virtual Piano.
// Extracted from VirtualPiano.tsx so the transport hook, recorder and the
// component itself can all import it without one another.

import { getPianoSample } from './pianoSamples'

export type InstrumentId = 'acoustic' | 'piano' | 'epiano' | 'organ' | 'synth' | 'strings' | 'musicbox'

export interface Voice { release: (t: number) => void }

export interface RecEvent { midi: number; vel: number; inst: InstrumentId; tOn: number; tOff: number | null }

// [midi, startBeat, durationBeats] — matches PianoNote from pianoSongs.ts
export type NoteTuple = [midi: number, startBeat: number, durationBeats: number]

export interface PlayableSong { name: string; bpm: number; notes: NoteTuple[] }

function buildSampleVoice(ctx: BaseAudioContext, dest: AudioNode, buf: AudioBuffer, t: number, vel: number): Voice {
  const peak = 0.32 * vel
  const source = ctx.createBufferSource()
  source.buffer = buf
  const gainNode = ctx.createGain()
  source.connect(gainNode)
  gainNode.connect(dest)
  gainNode.gain.setValueAtTime(0.0001, t)
  gainNode.gain.linearRampToValueAtTime(peak, t + 0.01)
  source.start(t)
  return {
    release: (rt: number) => {
      gainNode.gain.cancelScheduledValues(rt)
      gainNode.gain.setValueAtTime(gainNode.gain.value, rt)
      gainNode.gain.linearRampToValueAtTime(0.0001, rt + 0.28)
      try { source.stop(rt + 0.35) } catch { /* already stopped */ }
    },
  }
}

export function buildVoice(ctx: BaseAudioContext, dest: AudioNode, inst: InstrumentId, midi: number, t: number, vel: number): Voice {
  if (inst === 'acoustic') {
    const buf = getPianoSample(midi)
    if (buf) return buildSampleVoice(ctx, dest, buf, t, vel)
    inst = 'piano' // sample not loaded yet (or genuinely missing) — fall through to synthesis
  }

  const f = 440 * Math.pow(2, (midi - 69) / 12)
  const out = ctx.createGain()
  out.connect(dest)
  const oscs: OscillatorNode[] = []
  const mk = (type: OscillatorType, freq: number, g: number) => {
    const o = ctx.createOscillator()
    o.type = type; o.frequency.value = freq
    const gn = ctx.createGain(); gn.gain.value = g
    o.connect(gn); gn.connect(out); o.start(t)
    oscs.push(o)
    return o
  }
  const env = out.gain
  const peak = 0.32 * vel
  env.setValueAtTime(0.0001, t)
  let relTime = 0.3
  if (inst === 'piano') {
    mk('triangle', f, 1); mk('sine', f * 2, 0.28); mk('sine', f * 3.001, 0.08)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800 + 3500 * vel
    out.disconnect(); out.connect(lp); lp.connect(dest)
    env.linearRampToValueAtTime(peak, t + 0.006)
    env.setTargetAtTime(peak * 0.12, t + 0.006, 1.4)
    relTime = 0.25
  } else if (inst === 'epiano') {
    mk('sine', f, 1); mk('sine', f * 3, 0.14)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2
    const lg = ctx.createGain(); lg.gain.value = 0.12 * peak
    lfo.connect(lg); lg.connect(env); lfo.start(t); oscs.push(lfo)
    env.linearRampToValueAtTime(peak, t + 0.004)
    env.setTargetAtTime(peak * 0.2, t + 0.004, 1.1)
    relTime = 0.2
  } else if (inst === 'organ') {
    mk('sine', f, 0.5); mk('sine', f * 2, 0.34); mk('sine', f * 3, 0.18); mk('sine', f * 4, 0.12)
    env.linearRampToValueAtTime(peak, t + 0.03)
    relTime = 0.09
  } else if (inst === 'synth') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4
    lp.frequency.setValueAtTime(250, t)
    lp.frequency.exponentialRampToValueAtTime(2600 + 2000 * vel, t + 0.09)
    out.disconnect(); out.connect(lp); lp.connect(dest)
    mk('sawtooth', f * Math.pow(2, -0.06 / 12), 0.5); mk('sawtooth', f * Math.pow(2, 0.06 / 12), 0.5)
    env.linearRampToValueAtTime(peak, t + 0.01)
    env.setTargetAtTime(peak * 0.65, t + 0.01, 0.4)
    relTime = 0.22
  } else if (inst === 'strings') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200
    out.disconnect(); out.connect(lp); lp.connect(dest)
    mk('sawtooth', f, 0.34); mk('sawtooth', f * Math.pow(2, 0.09 / 12), 0.34); mk('sawtooth', f * Math.pow(2, -0.09 / 12), 0.34)
    env.linearRampToValueAtTime(peak * 0.9, t + 0.35)
    relTime = 0.5
  } else { // musicbox
    mk('sine', f, 1); mk('sine', f * 4.2, 0.22); mk('sine', f * 7.9, 0.06)
    env.linearRampToValueAtTime(peak, t + 0.003)
    env.setTargetAtTime(0.0001, t + 0.003, 0.45)
    relTime = 0.12
  }
  return {
    release: (rt: number) => {
      env.cancelScheduledValues(rt)
      env.setTargetAtTime(0.0001, rt, relTime / 3)
      oscs.forEach(o => { try { o.stop(rt + relTime * 2 + 0.1) } catch { /* already stopped */ } })
    },
  }
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export function encodeWav(buf: AudioBuffer): Blob {
  const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate
  const bytes = 44 + n * ch * 2
  const ab = new ArrayBuffer(bytes)
  const dv = new DataView(ab)
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true)
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true)
  dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * ch * 2, true)
  let off = 44
  const chans: Float32Array[] = []
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c))
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chans[c][i]))
    dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2
  }
  return new Blob([ab], { type: 'audio/wav' })
}

export function parseMidiFile(d: Uint8Array, name: string): PlayableSong {
  let p = 0
  const u32 = () => (d[p++] << 24) | (d[p++] << 16) | (d[p++] << 8) | d[p++]
  const u16 = () => (d[p++] << 8) | d[p++]
  if (u32() !== 0x4d546864) throw new Error('bad header')
  u32(); u16()
  const nTracks = u16()
  const div = u16()
  let uspb = 500000
  const raw: { tick: number; midi: number; on: boolean; vel: number }[] = []
  for (let tr = 0; tr < nTracks; tr++) {
    if (u32() !== 0x4d54726b) throw new Error('bad track')
    const len = u32()
    const end = p + len
    let tick = 0, run = 0
    while (p < end) {
      let v = 0, b
      do { b = d[p++]; v = (v << 7) | (b & 0x7f) } while (b & 0x80)
      tick += v
      let st = d[p]
      if (st & 0x80) { p++; run = st } else st = run
      const cmd = st & 0xf0
      if (cmd === 0x90 || cmd === 0x80) {
        const note = d[p++], vel = d[p++]
        raw.push({ tick, midi: note, on: cmd === 0x90 && vel > 0, vel: vel / 127 })
      } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) p += 2
      else if (cmd === 0xc0 || cmd === 0xd0) p += 1
      else if (st === 0xff) {
        const type = d[p++]
        let l = 0; do { b = d[p++]; l = (l << 7) | (b & 0x7f) } while (b & 0x80)
        if (type === 0x51) uspb = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2]
        p += l
      } else if (st === 0xf0 || st === 0xf7) {
        let l = 0; do { b = d[p++]; l = (l << 7) | (b & 0x7f) } while (b & 0x80)
        p += l
      } else break
    }
    p = end
  }
  const bpm = 60000000 / uspb
  const beats = (t: number) => t / div
  const open: Record<number, { tick: number }> = {}
  const notes: NoteTuple[] = []
  raw.sort((a, b) => a.tick - b.tick)
  raw.forEach(ev => {
    if (ev.on) open[ev.midi] = ev
    else if (open[ev.midi]) {
      const o = open[ev.midi]
      notes.push([ev.midi, beats(o.tick), Math.max(beats(ev.tick - o.tick), 0.1)])
      delete open[ev.midi]
    }
  })
  return { name: name.replace(/\.midi?$/i, ''), bpm, notes }
}

const MIDI_PROGRAM: Record<InstrumentId, number> = { acoustic: 0, piano: 0, epiano: 4, organ: 19, synth: 81, strings: 48, musicbox: 10 }

/** Builds a single-track Standard MIDI File (format 0) from recorder events. */
export function buildMidiFile(evs: RecEvent[]): Blob {
  const div = 480, uspb = 500000 // 120 bpm
  const list: { t: number; b: number[] }[] = []
  evs.forEach(ev => {
    const tick = (s: number) => Math.round(s * 1e6 / uspb * div)
    list.push({ t: tick(ev.tOn), b: [0x90, ev.midi, Math.round(ev.vel * 127)] })
    list.push({ t: tick(ev.tOff ?? ev.tOn), b: [0x80, ev.midi, 0] })
  })
  list.sort((a, b) => a.t - b.t)
  const bytes: number[] = []
  const vlq = (v: number) => { const st = [v & 0x7f]; while ((v >>= 7)) st.push((v & 0x7f) | 0x80); return st.reverse() }
  bytes.push(0, 0xc0 | 0, MIDI_PROGRAM[evs[0].inst] || 0)
  let last = 0
  list.forEach(ev => { bytes.push(...vlq(ev.t - last), ...ev.b); last = ev.t })
  bytes.push(0, 0xff, 0x2f, 0)
  const track = [77, 84, 114, 107, (bytes.length >> 24) & 255, (bytes.length >> 16) & 255, (bytes.length >> 8) & 255, bytes.length & 255, ...bytes]
  const head = [77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, div >> 8, div & 255]
  return new Blob([new Uint8Array([...head, ...track])], { type: 'audio/midi' })
}

export async function renderRecordingToWav(evs: RecEvent[], volume: number): Promise<Blob> {
  const dur = Math.max(...evs.map(e => e.tOff ?? e.tOn)) + 2
  const sr = 44100
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr)
  const master = ctx.createGain()
  master.gain.value = volume
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp); comp.connect(ctx.destination)
  evs.forEach(ev => {
    const v = buildVoice(ctx, master, ev.inst, ev.midi, ev.tOn + 0.05, ev.vel)
    v.release((ev.tOff ?? ev.tOn) + 0.05)
  })
  const buf = await ctx.startRendering()
  return encodeWav(buf)
}
