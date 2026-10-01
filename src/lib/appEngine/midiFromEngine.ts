/**
 * The song as a Standard MIDI File, every track of it — the app's MidiExport
 * (lib/core/data/midi_export.dart), ported line for line.
 *
 * It reads what the engine is told (songToEngine's commands), not the song: those already say
 * which part each section plays, its fill, its silences, lengths, registers and sounds, so the
 * file is what is heard. It walks the arrangement the way the engine's sequencer does and
 * writes down what it would have played: a drum track on channel 10 and one per melodic track.
 */
import { DRUM_ROWS, type EngineCommand } from './commands';

const TICKS_PER_BEAT = 480;
/** A step is a sixteenth in every meter. */
const TICKS_PER_STEP = TICKS_PER_BEAT / 4;
const MAX_BARS = 4;
const MAX_STEPS_PER_BAR = 20;
const MAX_STEPS = MAX_STEPS_PER_BAR * MAX_BARS;
const PHRASE_BARS = 8;
const FIRST_SCALE_DEGREE = 8;
const NOTE_FLOOR = 24;
const NOTE_CEILING = 108;
const GM_PERC_FIRST = 100;
const MELODIC = ['piano', 'guitar', 'bass', 'synth'] as const;
type Melodic = (typeof MELODIC)[number];
/** The order a fill's lanes come in (kFillRows): the kit, then every melodic track. */
const FILL_LANES = [...DRUM_ROWS, 'piano', 'guitar', 'bass', 'synth'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** General MIDI drums: the lanes are roles, so each maps to the canonical note for it. */
const DRUM_NOTES: Record<string, number> = {
  kick: 36, snare: 38, hihat: 42, rim: 37, hihatOpen: 46, hihatFoot: 44, ride: 51,
  tom1: 50, tom2: 47, floorTom: 43, crash: 49, clap: 39,
};

/** The app's chord formulas (chord_theory.dart). */
const CHORD_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10],
  dim: [0, 3, 6], aug: [0, 4, 8], sus4: [0, 5, 7], m9: [0, 3, 7, 10, 14], '9': [0, 4, 7, 10, 14],
  '6': [0, 4, 7, 9], sus2: [0, 2, 7], add9: [0, 4, 7, 14], m7b5: [0, 3, 6, 10], m11: [0, 3, 7, 10, 17],
  '5': [0, 7], '11': [0, 4, 7, 10, 14, 17], '13': [0, 4, 7, 10, 14, 21], maj9: [0, 4, 7, 11, 14],
  maj13: [0, 4, 7, 11, 14, 21], min6: [0, 3, 7, 9], min13: [0, 3, 7, 10, 14, 21], minMaj7: [0, 3, 7, 11],
  '6/9': [0, 4, 7, 9, 14], '7sus4': [0, 5, 7, 10], '7b5': [0, 4, 6, 10], '7b9': [0, 4, 7, 10, 13],
  '9sus4': [0, 5, 7, 10, 14], aug9: [0, 4, 8, 10, 14], dim7: [0, 3, 6, 9], aug7: [0, 4, 8, 10],
  '7#9': [0, 4, 7, 10, 15], '7#5': [0, 4, 8, 10], '9b5': [0, 4, 6, 10, 14], '9#5': [0, 4, 8, 10, 14],
  'maj7#11': [0, 4, 7, 11, 18], add11: [0, 4, 7, 17], maj11: [0, 4, 7, 11, 14, 17], minadd9: [0, 3, 7, 14],
};
const intervalsOf = (type: string) => CHORD_INTERVALS[type] ?? CHORD_INTERVALS.maj;
/** The scale a step's scale degrees are counted in (scaleOfChord). */
function scaleOfChord(type: string): number[] {
  if (type.startsWith('min') || type === 'm9' || type === 'm11') return [0, 2, 3, 5, 7, 8, 10, 12];
  if (type === '7') return [0, 2, 4, 5, 7, 9, 10, 12];
  if (type === 'dim') return [0, 2, 3, 5, 6, 8, 9, 12];
  if (type === 'aug') return [0, 2, 4, 5, 8, 9, 11, 12];
  return [0, 2, 4, 5, 7, 9, 11, 12];
}

// ── A packed step (packStep in the app) ──
const alterOf = (bits: number) => (bits === 1 ? -1 : bits === 2 ? 1 : 0);
const velocityOf = (p: number) => (p & 0xff) / 255;
const degreeOf = (p: number) => (p >> 8) & 0xf;
const octaveOf = (p: number) => ((p >> 12) & 0xf) - 8;
const degree2Of = (p: number) => (p >> 16) & 0xf;
const octave2Of = (p: number) => ((p >> 20) & 0xf) - 8;
const accentOf = (p: number) => ((p >> 24) & 1) === 1;
const alter1Of = (p: number) => alterOf((p >> 25) & 0x3);
const alter2Of = (p: number) => alterOf((p >> 27) & 0x3);
/** A hit's own percussion tone, or null when it plays its row's sound. */
const toneOf = (p: number) => { const t = (p >> 16) & 0xff; return t >= 1 && t <= 127 ? t : null; };
const mod = (n: number, m: number) => ((n % m) + m) % m;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Chord { root: number; type: string; steps: number; bass: number }
interface Fill { from: number; lanes: Map<string, number[]> }
/** One engine section, as the commands left it, on the bank it plays. */
interface Part {
  loop: number;
  infinite: boolean;
  chords: Chord[];
  rows: Map<string, number[]>;
  bars: Map<string, number>;
  fill: Fill | null;
  silent: Set<string>;
  lengths: Map<string, number>;
  lows: Map<string, number>;
  programs: Map<string, number>;
  drumSounds: Map<string, number>;
}
interface Note { at: number; duration: number; note: number; velocity: number }

/** The sections the commands describe, each on the variation it plays, and the song's meter, tempo and swing. */
function readCommands(commands: EngineCommand[]) {
  let stepsPerBar = 16;
  let stepsPerBeat = 4;
  let bpm = 120;
  let swing = 1;
  const meta = new Map<number, { loop: number; infinite: boolean; chords: Chord[] }>();
  const bankOf = new Map<number, number>();
  // Everything per section and bank, keyed `${section}|${bank}|…`.
  const steps = new Map<string, number[]>();
  const bars = new Map<string, number>();
  const fills = new Map<string, Fill>();
  const programs = new Map<string, number>();
  const drumSounds = new Map<string, number>();
  const silent = new Map<number, Set<string>>();
  const lengths = new Map<number, Map<string, number>>();
  const lows = new Map<number, Map<string, number>>();
  let order: number[] = [];

  for (const c of commands as unknown as [string, ...unknown[]][]) {
    switch (c[0]) {
      case 'setMeter': stepsPerBar = c[1] as number; stepsPerBeat = c[2] as number; break;
      case 'setBpm': bpm = c[1] as number; break;
      case 'setSwing': swing = c[1] as number; break;
      case 'beginArrangement': order = Array.from({ length: c[1] as number }, (_, i) => i); meta.clear(); break;
      case 'section': meta.set(c[1] as number, { loop: c[2] as number, infinite: !!c[3], chords: [] }); break;
      case 'chord': {
        const m = meta.get(c[1] as number);
        if (m) m.chords[c[2] as number] = {
          root: NOTE_NAMES.indexOf(c[3] as string), type: c[4] as string,
          steps: Math.round(((c[5] as number) * stepsPerBeat) / 2), bass: c[6] as number,
        };
        break;
      }
      case 'setVariation': bankOf.set(c[1] as number, c[2] as number); break;
      case 'clearTrack': {
        const prefix = `${c[1]}|${c[3] ?? 0}|${c[2]}|`;
        for (const key of [...steps.keys()]) if (key.startsWith(prefix)) steps.delete(key);
        break;
      }
      case 'setStep': {
        const key = `${c[1]}|${c[6] ?? 0}|${c[2]}|${c[3]}`;
        const lane = steps.get(key) ?? new Array(MAX_STEPS).fill(0);
        lane[c[4] as number] = c[5] as number;
        steps.set(key, lane);
        break;
      }
      case 'setPatternBars': bars.set(`${c[1]}|${c[4] ?? 0}|${c[2]}`, c[3] as number); break;
      case 'setFill': {
        const mask = c[3] as number;
        const all = Array.from(c[4] as ArrayLike<number>);
        const lanes = new Map<string, number[]>();
        FILL_LANES.forEach((lane, i) => {
          if (mask & (1 << i)) lanes.set(lane, all.slice(i * MAX_STEPS_PER_BAR, (i + 1) * MAX_STEPS_PER_BAR));
        });
        const key = `${c[1]}|${c[5] ?? 0}`;
        if (lanes.size) fills.set(key, { from: c[2] as number, lanes }); else fills.delete(key);
        break;
      }
      case 'setProgram': programs.set(`${c[1]}|${c[4] ?? 0}|${c[2]}`, c[3] as number); break;
      case 'setDrumSound': drumSounds.set(`${c[1]}|${c[4] ?? 0}|${c[2]}`, c[3] as number); break;
      case 'setSilence': {
        const set = silent.get(c[1] as number) ?? new Set<string>();
        if (c[3]) set.add(c[2] as string); else set.delete(c[2] as string);
        silent.set(c[1] as number, set);
        break;
      }
      case 'setNoteLength': {
        const map = lengths.get(c[1] as number) ?? new Map<string, number>();
        map.set(c[2] as string, c[3] as number);
        lengths.set(c[1] as number, map);
        break;
      }
      case 'voicing': {
        const map = lows.get(c[1] as number) ?? new Map<string, number>();
        map.set(c[2] as string, c[3] as number);
        lows.set(c[1] as number, map);
        break;
      }
    }
  }

  const parts: Part[] = [];
  for (const s of order) {
    const m = meta.get(s);
    if (!m) continue;
    const bank = bankOf.get(s) ?? 0;
    // B's own when it has one; what B does not set, it takes from A (a -1 sound follows A).
    const pick = <T>(map: Map<string, T>, rest: string, follows?: (v: T) => boolean): T | undefined => {
      const own = map.get(`${s}|${bank}|${rest}`);
      if (own !== undefined && !(follows?.(own))) return own;
      return map.get(`${s}|0|${rest}`);
    };
    const rows = new Map<string, number[]>();
    for (const [key, lane] of steps) {
      const [sec, b, track, row] = key.split('|');
      if (Number(sec) === s && Number(b) === bank) rows.set(track === 'drums' ? row : track, lane);
    }
    const partBars = new Map<string, number>();
    for (const track of ['drums', ...MELODIC]) partBars.set(track, pick(bars, track) ?? 1);
    const partPrograms = new Map<string, number>();
    for (const track of MELODIC) { const p = pick(programs, track, (v) => v < 0); if (p !== undefined) partPrograms.set(track, p); }
    const partDrums = new Map<string, number>();
    for (const row of DRUM_ROWS) { const d = pick(drumSounds, row, (v) => v < 0); if (d !== undefined) partDrums.set(row, d); }
    parts.push({
      loop: m.loop, infinite: m.infinite, chords: m.chords.filter(Boolean),
      rows, bars: partBars, fill: fills.get(`${s}|${bank}`) ?? null,
      silent: silent.get(s) ?? new Set(), lengths: lengths.get(s) ?? new Map(), lows: lows.get(s) ?? new Map(),
      programs: partPrograms, drumSounds: partDrums,
    });
  }
  return { parts, stepsPerBar, stepsPerBeat, bpm, swing };
}

/** The notes one step plays, mirroring chordTone and voiceChord in the engine (MidiExport._notesFor). */
function notesFor(chord: Chord, packed: number, low: number, invert: boolean): number[] {
  const degree = degreeOf(packed);
  if (degree === 0 || chord.root < 0) return [];
  const intervals = intervalsOf(chord.type);
  const root = chord.root;
  const rootNote = low + mod(root % 12 - low, 12);
  const stack = (interval: number) => rootNote + interval;
  const hasBass = chord.bass >= 0;

  if (degree === 1) {
    let chosen = intervals.map(stack);
    if (invert && !hasBass && intervals.length > 1 && intervals[intervals.length - 1] < 12) {
      const narrowest = (sorted: number[]) => {
        let gap = 127;
        for (let i = 1; i < sorted.length; i++) gap = Math.min(gap, sorted[i] - sorted[i - 1]);
        return gap;
      };
      const rootGap = narrowest(intervals);
      let best = [...chosen].sort((a, b) => a - b);
      for (let k = 1; k < intervals.length; k++) {
        const bottomClass = (root + intervals[k]) % 12;
        const bottom = low + mod(bottomClass - low, 12);
        const candidate = intervals
          .map((iv) => bottom + (iv < intervals[k] ? mod(iv - intervals[k], 12) : iv - intervals[k]))
          .sort((a, b) => a - b);
        const gap = narrowest(candidate);
        if (gap < 2 && gap < rootGap) continue;
        if (candidate[0] < best[0]) best = candidate;
      }
      chosen = best;
    }
    const set = new Set(chosen);
    if (hasBass && set.size < 5) set.add(low + mod(chord.bass % 12 - low, 12));
    return [...set].sort((a, b) => a - b);
  }

  const shift = octaveOf(packed) * 12;
  const scaleClass = hasBass ? chord.bass : root;
  const scaleRoot = low + mod(scaleClass % 12 - low, 12);
  const scale = scaleOfChord(chord.type);
  const toneFor = (which: number) => (which >= FIRST_SCALE_DEGREE
    ? scaleRoot + scale[clamp(which - FIRST_SCALE_DEGREE, 0, 7)]
    : which === 7 ? rootNote + 12 : stack(intervals[clamp(which - 2, 0, intervals.length - 1)]));
  const result = [clamp(toneFor(degree) + alter1Of(packed) + shift, NOTE_FLOOR, NOTE_CEILING)];
  const second = degree2Of(packed);
  if (second !== 0 && second !== 1) {
    const note = clamp(toneFor(second) + alter2Of(packed) + octave2Of(packed) * 12, NOTE_FLOOR, NOTE_CEILING);
    if (note !== result[0]) result.push(note);
  }
  return result;
}

const velocity = (value: number, accent: boolean) => Math.round(clamp(accent ? value * 1.3 : value, 0.05, 1) * 127);

/** [commands] (songToEngine's) as a Standard MIDI File, format 1: a tempo track and one per instrument. */
export function midiFromEngine(commands: EngineCommand[], name: string): Uint8Array {
  const { parts, stepsPerBar, stepsPerBeat, bpm, swing } = readCommands(commands);
  const events: Record<string, Note[]> = { drums: [], piano: [], guitar: [], bass: [], synth: [] };
  const changes: Record<string, [number, number][]> = { piano: [], guitar: [], bass: [], synth: [] };
  const swingScale = (step: number) => (step % stepsPerBeat < stepsPerBeat / 2 ? (2 * swing) / (swing + 1) : 2 / (swing + 1));

  // The pattern phase runs on across chords and sections, as the engine's step counter does.
  let step = 0;
  let tick = 0;
  let crashIn = false;
  for (const part of parts) {
    if (!part.chords.length) continue;
    for (const track of MELODIC) {
      const program = part.programs.get(track) ?? 0;
      const list = changes[track];
      if (!list.length || list[list.length - 1][1] !== program) list.push([tick, program]);
    }
    const passSteps = part.chords.reduce((n, c) => n + c.steps, 0);
    let bar = 0;
    let sectionBar = 0;
    let first = true;
    const opensOnCrash = crashIn;
    const fill = part.fill;
    const fillDrums = !!fill && [...fill.lanes.keys()].some((k) => !(MELODIC as readonly string[]).includes(k));
    crashIn = !!fill && fillDrums && !part.infinite && !fill.lanes.has('crash');
    for (let pass = 0; pass < part.loop; pass++) {
      const leadsOut = !part.infinite && pass === part.loop - 1;
      let intoPass = 0;
      for (const chord of part.chords) {
        for (let held = 0; held < chord.steps; held++) {
          if (!first && step % stepsPerBar === 0) { bar = (bar + 1) % MAX_BARS; sectionBar++; }
          const crash = first && opensOnCrash;
          first = false;
          const remaining = passSteps - intoPass++;
          const wayOut = leadsOut && remaining <= stepsPerBar;
          const phrase = !(leadsOut && remaining <= 2 * stepsPerBar) && (sectionBar + 1) % PHRASE_BARS === 0;
          collect(part, chord, wayOut ? stepsPerBar - remaining : phrase ? step % stepsPerBar : -1,
            crash, step % stepsPerBar, bar, stepsPerBar, tick, events);
          tick += Math.round(TICKS_PER_STEP * swingScale(step));
          step++;
        }
      }
    }
  }

  const tracks = [
    conductor(name, bpm, stepsPerBar, stepsPerBeat),
    track('Drums', 9, [], events.drums),
    ...MELODIC.map((t, i) => track(t[0].toUpperCase() + t.slice(1), i, changes[t], events[t])),
  ];
  const out = new Writer();
  out.ascii('MThd'); out.uint32(6); out.uint16(1); out.uint16(tracks.length); out.uint16(TICKS_PER_BEAT);
  for (const t of tracks) out.bytes(t);
  return out.take();
}

/** What one step of one part writes, drums and melodic tracks alike (MidiExport._collect). */
function collect(part: Part, chord: Chord, fillStep: number, crash: boolean, step: number, bar: number,
  stepsPerBar: number, tick: number, events: Record<string, Note[]>) {
  const at = (track: string) => {
    const bars = part.bars.get(track) ?? 1;
    const index = (bars <= 1 ? 0 : bar % bars) * stepsPerBar + step;
    return index < MAX_STEPS ? index : step;
  };
  const fill = part.fill;
  const filling = !!fill && fillStep >= fill.from && fillStep < MAX_STEPS_PER_BAR;

  if (!part.silent.has('drums')) {
    if (crash) events.drums.push({ at: tick, duration: TICKS_PER_STEP, note: DRUM_NOTES.crash, velocity: velocity(0.85, false) });
    const where = at('drums');
    for (const row of DRUM_ROWS) {
      // A piece left out of this section is not in it, however much it has written.
      if (part.silent.has(row)) continue;
      const fromFill = filling && fill!.lanes.has(row);
      const lane = fromFill ? fill!.lanes.get(row) : part.rows.get(row);
      const index = fromFill ? fillStep : where;
      const packed = lane && lane.length > index ? lane[index] : 0;
      const v = velocityOf(packed);
      if (v <= 0) continue;
      const sound = part.drumSounds.get(row);
      const note = toneOf(packed)
        ?? (row.startsWith('perc') ? (sound !== undefined && sound >= GM_PERC_FIRST ? (sound - GM_PERC_FIRST) % 128 : null) : DRUM_NOTES[row]);
      if (note == null) continue;
      events.drums.push({ at: tick, duration: TICKS_PER_STEP, note, velocity: velocity(v, accentOf(packed)) });
    }
  }

  for (const track of MELODIC as readonly Melodic[]) {
    if (part.silent.has(track)) continue;
    const fromFill = filling && fill!.lanes.has(track);
    const where = fromFill ? fillStep : at(track);
    const lane = fromFill ? fill!.lanes.get(track) : part.rows.get(track);
    const packed = lane && lane.length > where ? lane[where] : 0;
    const v = velocityOf(packed);
    if (v <= 0) continue;
    const low = part.lows.get(track) ?? 60;
    const length = part.lengths.get(track) ?? 0;
    for (const note of notesFor(chord, packed, low, track !== 'bass')) {
      events[track].push({
        at: tick,
        // A held note runs until the next on its lane, where the writer trims it.
        duration: length > 0 ? clamp(Math.round(length * TICKS_PER_STEP), 1, 1 << 24) : TICKS_PER_STEP * 4,
        note,
        velocity: velocity(v, accentOf(packed)),
      });
    }
  }
}

function conductor(name: string, bpm: number, stepsPerBar: number, stepsPerBeat: number): Uint8Array {
  const t = new Writer();
  const title = [...new TextEncoder().encode(name)];
  t.varint(0); t.bytes([0xff, 0x03]); t.varint(title.length); t.bytes(title);
  t.varint(0);
  const micros = Math.round(60000000 / bpm);
  t.bytes([0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]);
  // The meter: a beat of four steps is a quarter, of two an eighth.
  const unit = stepsPerBeat === 2 ? 8 : 4;
  const beats = Math.round(stepsPerBar / (16 / unit));
  // Compound meters click on the dotted quarter, as the app's.
  const beatsPerPulse = unit === 8 && beats % 3 === 0 ? 3 : 1;
  t.varint(0);
  t.bytes([0xff, 0x58, 0x04, beats, unit === 8 ? 3 : 2, ((24 * 4) / unit) * beatsPerPulse, 8]);
  return chunk(t);
}

function track(name: string, channel: number, programs: [number, number][], notes: Note[]): Uint8Array {
  // A note stops when the same note starts again on the track: the engine retriggers.
  const ordered = [...notes].sort((a, b) => a.at - b.at);
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      if (ordered[j].note !== ordered[i].note || ordered[j].at <= ordered[i].at) continue;
      const gap = ordered[j].at - ordered[i].at;
      if (gap < ordered[i].duration) ordered[i] = { ...ordered[i], duration: gap };
      break;
    }
  }
  // Instruments before notes, so a note at a sound change is played by the new sound.
  const moments = new Map<number, { program?: number; note?: number; velocity?: number }[]>();
  const add = (at: number, e: { program?: number; note?: number; velocity?: number }) => {
    const list = moments.get(at) ?? [];
    list.push(e);
    moments.set(at, list);
  };
  for (const [at, program] of programs) add(at, { program });
  for (const n of ordered) { add(n.at, { note: n.note, velocity: n.velocity }); add(n.at + n.duration, { note: n.note, velocity: 0 }); }

  const t = new Writer();
  const title = [...new TextEncoder().encode(name)];
  t.varint(0); t.bytes([0xff, 0x03]); t.varint(title.length); t.bytes(title);
  let last = 0;
  for (const at of [...moments.keys()].sort((a, b) => a - b)) {
    for (const e of moments.get(at)!) {
      t.varint(at - last);
      last = at;
      if (e.program !== undefined) t.bytes([0xc0 | channel, e.program & 0x7f]);
      else t.bytes([((e.velocity ?? 0) > 0 ? 0x90 : 0x80) | channel, e.note! & 0x7f, (e.velocity ?? 0) & 0x7f]);
    }
  }
  t.varint(0); t.bytes([0xff, 0x2f, 0x00]);
  return chunk(t);
}

function chunk(t: Writer): Uint8Array {
  const body = t.take();
  const out = new Writer();
  out.ascii('MTrk'); out.uint32(body.length); out.bytes(body);
  return out.take();
}

class Writer {
  private data: number[] = [];
  ascii(s: string) { for (const ch of s) this.data.push(ch.charCodeAt(0)); }
  bytes(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.data.push(b[i]); }
  uint16(v: number) { this.data.push((v >> 8) & 0xff, v & 0xff); }
  uint32(v: number) { this.data.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff); }
  /** MIDI's variable-length quantity: seven bits a byte, the high bit set on all but the last. */
  varint(v: number) {
    const buf = [v & 0x7f];
    let rest = v >>> 7;
    while (rest > 0) { buf.unshift((rest & 0x7f) | 0x80); rest >>>= 7; }
    this.data.push(...buf);
  }
  take() { return Uint8Array.from(this.data); }
}
