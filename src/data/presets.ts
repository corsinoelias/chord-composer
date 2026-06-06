import type { BassNote, BassTrack, BassSound, StringIndex } from '../lib/bassTab/types'

export interface Preset extends BassTrack {
  artist:       string
  bassist:      string   // session bassist credit
  genre:        string
  defaultSound: BassSound
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
type N = { si: 0|1|2|3; f: number; b: number; d: number }

/** Repeat a 1-bar pattern across totalBars */
function barRepeat(id: string, bpb: number, bars: number, pat: N[]): BassNote[] {
  return Array.from({ length: bars }, (_, bar) =>
    pat.map((p, i) => ({
      id:            `${id}-b${bar}-${i}`,
      stringIndex:   p.si as StringIndex,
      fret:          p.f,
      startBeat:     bar * bpb + p.b,
      durationBeats: p.d,
      velocity:      0.8,
    }))
  ).flat()
}

/** Repeat a multi-bar phrase (p.b = beat within phrase, 0-based) */
function phraseRepeat(id: string, bpb: number, bars: number, phraseBars: number, pat: N[]): BassNote[] {
  return Array.from({ length: Math.floor(bars / phraseBars) }, (_, ph) =>
    pat.map((p, i) => ({
      id:            `${id}-p${ph}-${i}`,
      stringIndex:   p.si as StringIndex,
      fret:          p.f,
      startBeat:     ph * phraseBars * bpb + p.b,
      durationBeats: p.d,
      velocity:      0.8,
    }))
  ).flat()
}

// ─── String / fret reference (standard bass tuning) ─────────────────────────
//  si=3  E string (E1): E=0  F=1  F#=2  G=3  G#=4  A=5  Bb=6  B=7  C=8  C#=9  D=10  Eb=11
//  si=2  A string (A1): A=0  Bb=1 B=2   C=3  C#=4  D=5  Eb=6  E=7  F=8  F#=9  G=10  Ab=11
//  si=1  D string (D2): D=0  Eb=1 E=2   F=3  F#=4  G=5  Ab=6  A=7  Bb=8 B=9   C=10
//  si=0  G string (G2): G=0  Ab=1 A=2   Bb=3 B=4   C=5  C#=6  D=7

// ─────────────────────────────────────────────────────────────────────────────
// 1 · BILLIE JEAN (1982) · Thriller · Nathan Watts
//   F# minor. 8 staccato 8th notes on D and A strings — no low E string.
//   Riff:  F#(D4)  C#(A4)  E(D2)  F#(D4)  E(D2)  C#(A4)  B(A2)  C#(A4)
//   Source: BigBassTabs Riff 1 — D:——4——2—4—2—— / A:———4———————4—2—4——
// ─────────────────────────────────────────────────────────────────────────────
const BILLIE_JEAN = barRepeat('billiejean', 4, 4, [
  { si: 1, f: 4, b: 0.0, d: 0.4 }, // F# (D str fret 4)
  { si: 2, f: 4, b: 0.5, d: 0.4 }, // C# (A str fret 4)
  { si: 1, f: 2, b: 1.0, d: 0.4 }, // E  (D str fret 2)
  { si: 1, f: 4, b: 1.5, d: 0.4 }, // F# (D str fret 4)
  { si: 1, f: 2, b: 2.0, d: 0.4 }, // E  (D str fret 2)
  { si: 2, f: 4, b: 2.5, d: 0.4 }, // C# (A str fret 4)
  { si: 2, f: 2, b: 3.0, d: 0.4 }, // B  (A str fret 2)
  { si: 2, f: 4, b: 3.5, d: 0.4 }, // C# (A str fret 4)
])

// ─────────────────────────────────────────────────────────────────────────────
// 2 · DON'T STOP 'TIL YOU GET ENOUGH (1979) · Off the Wall · Louis Johnson
//   E major. Open E pedal slap + G# chromatic + octave jump to E(A7).
//   Descends via F# → E → back to low E; ends with C#–B approach.
// ─────────────────────────────────────────────────────────────────────────────
const DONT_STOP = barRepeat('dontstop', 4, 4, [
  { si: 3, f: 0,  b: 0.0,  d: 0.2  }, // E  (E str open)
  { si: 3, f: 0,  b: 0.25, d: 0.2  }, // E
  { si: 3, f: 0,  b: 0.5,  d: 0.2  }, // E
  { si: 3, f: 4,  b: 0.75, d: 0.2  }, // G# (E str fret 4)
  { si: 2, f: 7,  b: 1.0,  d: 0.45 }, // E  (A str fret 7 — octave up)
  { si: 2, f: 9,  b: 1.5,  d: 0.2  }, // F# (A str fret 9)
  { si: 2, f: 7,  b: 1.75, d: 0.2  }, // E
  { si: 3, f: 0,  b: 2.0,  d: 0.2  }, // E  (back to low)
  { si: 3, f: 0,  b: 2.25, d: 0.2  }, // E
  { si: 3, f: 0,  b: 2.5,  d: 0.2  }, // E
  { si: 3, f: 4,  b: 2.75, d: 0.2  }, // G#
  { si: 2, f: 7,  b: 3.0,  d: 0.45 }, // E  (octave)
  { si: 2, f: 4,  b: 3.5,  d: 0.2  }, // C# (A str fret 4)
  { si: 2, f: 2,  b: 3.75, d: 0.2  }, // B  (A str fret 2)
])

// ─────────────────────────────────────────────────────────────────────────────
// 3 · OFF THE WALL (1979) · Off the Wall · Louis Johnson
//   C major. Low C (E str fret 8) → octave up (A str fret 3) → C–E–G triad.
// ─────────────────────────────────────────────────────────────────────────────
const OFF_THE_WALL = barRepeat('offthewall', 4, 4, [
  { si: 3, f: 8,  b: 0.0,  d: 0.4  }, // C  (E str fret 8 — low)
  { si: 3, f: 8,  b: 0.5,  d: 0.2  }, // C
  { si: 3, f: 10, b: 0.75, d: 0.2  }, // D  (passing)
  { si: 2, f: 3,  b: 1.0,  d: 0.45 }, // C  (A str fret 3 — octave up)
  { si: 2, f: 7,  b: 1.5,  d: 0.2  }, // E  (A str fret 7)
  { si: 2, f: 10, b: 1.75, d: 0.2  }, // G  (A str fret 10)
  { si: 2, f: 3,  b: 2.0,  d: 0.4  }, // C
  { si: 2, f: 5,  b: 2.5,  d: 0.2  }, // D  (passing up)
  { si: 2, f: 7,  b: 2.75, d: 0.2  }, // E
  { si: 3, f: 8,  b: 3.0,  d: 0.45 }, // C  (low octave)
  { si: 3, f: 8,  b: 3.5,  d: 0.4  }, // C
])

// ─────────────────────────────────────────────────────────────────────────────
// 4 · THRILLER (1982) · Thriller · Nathan Watts
//   C# minor. Sparse, dark groove entirely on A and D strings.
//   Riff:  C#(A4)–held  B(A2)  C#(A4)  E(D2)  F#(D4)  C#(A4)–held  [rest]
//   Source: BigBassTabs main riff — A:——4—2——4——— / D:————————2——4——
// ─────────────────────────────────────────────────────────────────────────────
const THRILLER = barRepeat('thriller', 4, 4, [
  { si: 2, f: 4, b: 0.0, d: 0.9  }, // C# (A str fret 4) — held ~1 beat
  { si: 2, f: 2, b: 1.0, d: 0.4  }, // B  (A str fret 2)
  { si: 2, f: 4, b: 1.5, d: 0.4  }, // C# (A str fret 4)
  { si: 1, f: 2, b: 2.0, d: 0.4  }, // E  (D str fret 2)
  { si: 1, f: 4, b: 2.5, d: 0.4  }, // F# (D str fret 4)
  { si: 2, f: 4, b: 3.0, d: 0.9  }, // C# (A str fret 4) — held, beat 4 = rest
])

// ─────────────────────────────────────────────────────────────────────────────
// 5 · WANNA BE STARTIN' SOMETHIN' (1982) · Thriller · Louis Johnson
//   D Dorian groove. 8 staccato 8th notes on A and E strings.
//   Riff:  D(A5)  D(A5)  E(A7)  E(A7)  E(A7)  B(E7-low)  D(A5)  E(A7)
//   Source: BigBassTabs — A:——5—5——7—7—7——5—7 / E:——————————————7——
// ─────────────────────────────────────────────────────────────────────────────
const WANNA_BE = barRepeat('wannabe', 4, 4, [
  { si: 2, f: 5, b: 0.0, d: 0.4 }, // D  (A str fret 5)
  { si: 2, f: 5, b: 0.5, d: 0.4 }, // D
  { si: 2, f: 7, b: 1.0, d: 0.4 }, // E  (A str fret 7)
  { si: 2, f: 7, b: 1.5, d: 0.4 }, // E
  { si: 2, f: 7, b: 2.0, d: 0.4 }, // E
  { si: 3, f: 7, b: 2.5, d: 0.4 }, // B  (E str fret 7 — low anchor)
  { si: 2, f: 5, b: 3.0, d: 0.4 }, // D
  { si: 2, f: 7, b: 3.5, d: 0.4 }, // E
])

// ─────────────────────────────────────────────────────────────────────────────
// 6 · BEAT IT (1982) · Thriller · session bassist
//   E minor rock groove. Quarter/8th note pattern — E pedal drives the verse;
//   G and A mark the power-chord changes.
// ─────────────────────────────────────────────────────────────────────────────
const BEAT_IT = barRepeat('beatit', 4, 4, [
  { si: 3, f: 0, b: 0.0, d: 0.45 }, // E  (open)
  { si: 3, f: 0, b: 0.5, d: 0.45 }, // E
  { si: 3, f: 0, b: 1.0, d: 0.45 }, // E
  { si: 3, f: 3, b: 1.5, d: 0.45 }, // G  (E str fret 3)
  { si: 3, f: 5, b: 2.0, d: 0.45 }, // A  (E str fret 5)
  { si: 3, f: 5, b: 2.5, d: 0.45 }, // A
  { si: 3, f: 3, b: 3.0, d: 0.45 }, // G
  { si: 3, f: 0, b: 3.5, d: 0.45 }, // E
])

// ─────────────────────────────────────────────────────────────────────────────
// 7 · SMOOTH CRIMINAL (1987) · Bad · Nathan Watts
//   A minor verse. 4 driving 16th-note A pedals (E str fret 5), then ascending
//   walk A→B→C on A string (frets 2–3), tail note G (E str fret 3).
//   Source: BigBassTabs — E:—555—3h5———3 / A:—————————2—0h2—33—3—2——
// ─────────────────────────────────────────────────────────────────────────────
const SMOOTH_CRIMINAL = barRepeat('smoothcriminal', 4, 4, [
  { si: 3, f: 5, b: 0.0,  d: 0.2  }, // A (E str fret 5) × 4 sixteenth pedal
  { si: 3, f: 5, b: 0.25, d: 0.2  }, // A
  { si: 3, f: 5, b: 0.5,  d: 0.2  }, // A
  { si: 3, f: 5, b: 0.75, d: 0.2  }, // A
  { si: 2, f: 2, b: 1.0,  d: 0.45 }, // B (A str fret 2)
  { si: 2, f: 2, b: 1.5,  d: 0.45 }, // B
  { si: 2, f: 3, b: 2.0,  d: 0.2  }, // C (A str fret 3)
  { si: 2, f: 3, b: 2.25, d: 0.2  }, // C
  { si: 2, f: 3, b: 2.5,  d: 0.2  }, // C
  { si: 2, f: 2, b: 2.75, d: 0.2  }, // B
  { si: 3, f: 3, b: 3.0,  d: 1.0  }, // G (E str fret 3) — tail, held to bar end
])

// ─────────────────────────────────────────────────────────────────────────────
// 8 · THE WAY YOU MAKE ME FEEL (1987) · Bad · Nathan Watts
//   A major. Low A pedal (E str fret 5) in 16ths, then ascending A–C#–D–E
//   line on A string; resolves back via E–D–A descent.
// ─────────────────────────────────────────────────────────────────────────────
const THE_WAY = barRepeat('theway', 4, 4, [
  { si: 3, f: 5, b: 0.0,  d: 0.2  }, // A  (E str fret 5 — low)
  { si: 3, f: 5, b: 0.25, d: 0.2  }, // A
  { si: 3, f: 5, b: 0.5,  d: 0.2  }, // A
  { si: 3, f: 5, b: 0.75, d: 0.2  }, // A
  { si: 2, f: 0, b: 1.0,  d: 0.2  }, // A  (A str open)
  { si: 2, f: 4, b: 1.25, d: 0.2  }, // C# (A str fret 4)
  { si: 2, f: 5, b: 1.5,  d: 0.2  }, // D  (A str fret 5)
  { si: 2, f: 7, b: 1.75, d: 0.2  }, // E  (A str fret 7)
  { si: 2, f: 0, b: 2.0,  d: 0.45 }, // A  (held)
  { si: 2, f: 0, b: 2.5,  d: 0.2  }, // A
  { si: 3, f: 5, b: 2.75, d: 0.2  }, // A  (low)
  { si: 2, f: 7, b: 3.0,  d: 0.45 }, // E  (A str fret 7)
  { si: 2, f: 5, b: 3.5,  d: 0.2  }, // D
  { si: 2, f: 0, b: 3.75, d: 0.2  }, // A
])

// ─────────────────────────────────────────────────────────────────────────────
// 9 · I WANT YOU BACK (1969) · Diana Ross Presents · Wilton Felder
//   A major (orig. Ab, +1 semitone for open-string convenience).
//   2-bar melodic phrase: bar 1 = ascending scale run + resolution;
//   bar 2 = triad arpeggio + scale pickup back to root.
// ─────────────────────────────────────────────────────────────────────────────
const I_WANT_YOU_BACK = phraseRepeat('iwantyouback', 4, 4, 2, [
  // ── Bar 1: scale run up + held E, then descent ──
  { si: 2, f: 0,  b: 0.0,  d: 0.2  }, // A
  { si: 2, f: 2,  b: 0.25, d: 0.2  }, // B
  { si: 2, f: 4,  b: 0.5,  d: 0.2  }, // C#
  { si: 2, f: 5,  b: 0.75, d: 0.2  }, // D
  { si: 2, f: 7,  b: 1.0,  d: 0.45 }, // E  (held)
  { si: 2, f: 5,  b: 1.5,  d: 0.2  }, // D
  { si: 2, f: 4,  b: 1.75, d: 0.2  }, // C#
  { si: 2, f: 2,  b: 2.0,  d: 0.45 }, // B
  { si: 2, f: 0,  b: 2.5,  d: 0.45 }, // A
  { si: 3, f: 5,  b: 3.0,  d: 0.45 }, // A  (E str fret 5 — low octave)
  { si: 3, f: 5,  b: 3.5,  d: 0.4  }, // A
  // ── Bar 2: triad arpeggio + pickup run ──
  { si: 2, f: 0,  b: 4.0,  d: 0.2  }, // A
  { si: 2, f: 4,  b: 4.25, d: 0.2  }, // C#
  { si: 2, f: 7,  b: 4.5,  d: 0.45 }, // E
  { si: 2, f: 4,  b: 5.0,  d: 0.2  }, // C#
  { si: 2, f: 0,  b: 5.25, d: 0.2  }, // A
  { si: 3, f: 5,  b: 5.5,  d: 0.45 }, // A  (low)
  { si: 2, f: 0,  b: 6.0,  d: 0.2  }, // A  (pickup run)
  { si: 2, f: 2,  b: 6.25, d: 0.2  }, // B
  { si: 2, f: 4,  b: 6.5,  d: 0.2  }, // C#
  { si: 2, f: 5,  b: 6.75, d: 0.2  }, // D
  { si: 2, f: 7,  b: 7.0,  d: 0.45 }, // E
  { si: 2, f: 4,  b: 7.5,  d: 0.2  }, // C#
  { si: 2, f: 0,  b: 7.75, d: 0.2  }, // A
])

// ─── Export ───────────────────────────────────────────────────────────────────
export const PRESETS: Preset[] = [
  {
    id: 'preset-billiejean',
    name: 'Billie Jean', artist: 'Michael Jackson', bassist: 'Nathan Watts',
    genre: 'Funk / Pop', bpm: 117, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'slap', notes: BILLIE_JEAN,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-dontstop',
    name: "Don't Stop 'Til You Get Enough", artist: 'Michael Jackson', bassist: 'Louis Johnson',
    genre: 'Disco Funk', bpm: 114, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'slap', notes: DONT_STOP,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-offthewall',
    name: 'Off the Wall', artist: 'Michael Jackson', bassist: 'Louis Johnson',
    genre: 'Funk / Soul', bpm: 100, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'slap', notes: OFF_THE_WALL,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-thriller',
    name: 'Thriller', artist: 'Michael Jackson', bassist: 'Nathan Watts',
    genre: 'Pop / R&B', bpm: 118, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: THRILLER,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-wannabe',
    name: "Wanna Be Startin' Somethin'", artist: 'Michael Jackson', bassist: 'Louis Johnson',
    genre: 'Funk / Pop', bpm: 126, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'slap', notes: WANNA_BE,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-beatit',
    name: 'Beat It', artist: 'Michael Jackson', bassist: 'session bassist',
    genre: 'Pop / Rock', bpm: 138, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: BEAT_IT,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-smoothcriminal',
    name: 'Smooth Criminal', artist: 'Michael Jackson', bassist: 'Nathan Watts',
    genre: 'Pop / R&B', bpm: 118, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: SMOOTH_CRIMINAL,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-theway',
    name: 'The Way You Make Me Feel', artist: 'Michael Jackson', bassist: 'Nathan Watts',
    genre: 'Funk / R&B', bpm: 120, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: THE_WAY,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-iwantyouback',
    name: 'I Want You Back', artist: 'The Jackson 5', bassist: 'Wilton Felder',
    genre: 'Funk / Soul', bpm: 98, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: I_WANT_YOU_BACK,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
]
