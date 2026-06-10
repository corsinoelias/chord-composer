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

/** One-shot note list (no phrase repeat) — for songs with variation between phrases */
function rawNotes(id: string, pat: N[]): BassNote[] {
  return pat.map((p, i) => ({
    id:            `${id}-${i}`,
    stringIndex:   p.si as StringIndex,
    fret:          p.f,
    startBeat:     p.b,
    durationBeats: p.d,
    velocity:      0.8,
  }))
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
//   Eb minor. 2-bar phrase × 2: Eb3 root → F#2–Bb2 low run → Gb3 accent
//   → Eb3 held → F3 → Eb3–Db3 tail. 4 bars total.
//   Source: Samplab MIDI transcription (+12 transpose applied).
// ─────────────────────────────────────────────────────────────────────────────
const BEAT_IT = rawNotes('beatit', [
  // ── Phrase 1 (bars 1–2) ────────────────────────────────────────────────
  { si: 1, f:  1, b:  0.000, d: 0.969 }, // D#3/Eb3 (D str fret 1)
  { si: 3, f:  2, b:  0.969, d: 0.448 }, // F#2     (E str fret 2)
  { si: 2, f:  1, b:  1.492, d: 0.448 }, // A#2/Bb2 (A str fret 1)
  { si: 1, f:  4, b:  1.940, d: 0.521 }, // F#3     (D str fret 4)
  { si: 1, f:  1, b:  2.462, d: 1.492 }, // D#3     held
  { si: 1, f:  3, b:  3.956, d: 0.969 }, // F3      (D str fret 3)
  { si: 1, f:  1, b:  5.002, d: 0.448 }, // D#3
  { si: 2, f:  4, b:  5.525, d: 0.448 }, // C#3/Db3 (A str fret 4)
  { si: 2, f:  4, b:  6.496, d: 0.448 }, // C#3/Db3
  // ── Phrase 2 (bars 3–4) ────────────────────────────────────────────────
  { si: 1, f:  1, b:  7.987, d: 1.044 }, // D#3
  { si: 3, f:  2, b:  9.033, d: 0.448 }, // F#2
  { si: 2, f:  1, b:  9.556, d: 0.448 }, // A#2/Bb2
  { si: 1, f:  4, b: 10.004, d: 0.521 }, // F#3
  { si: 1, f:  1, b: 10.527, d: 1.492 }, // D#3     held
  { si: 1, f:  3, b: 12.021, d: 0.969 }, // F3
  { si: 1, f:  1, b: 13.067, d: 0.448 }, // D#3
  { si: 2, f:  4, b: 13.587, d: 0.448 }, // C#3/Db3
])

// ─────────────────────────────────────────────────────────────────────────────
// 7 · SMOOTH CRIMINAL (1987) · Bad · Nathan Watts
//   A minor. 2-bar verse phrase × 2 = 4 bars.
//   Bar 1: 4× A open (16ths) → G2 passing (E str fret 3) → A open → B2 B2
//           (8ths) → A open B2 (16ths).
//   Bar 2: C3 C3 (16ths) → B2 C3 B2 G2 → A open tail.
//   Source: Songsterr SVG tab (measures 10–11).
// ─────────────────────────────────────────────────────────────────────────────
const SMOOTH_CRIMINAL = phraseRepeat('smoothcriminal', 4, 4, 2, [
  // ── Bar 1: A minor pedal groove ────────────────────────────────────────
  { si: 2, f: 0, b: 0.00, d: 0.2  }, // A2 open × 4 sixteenth pedal
  { si: 2, f: 0, b: 0.25, d: 0.2  },
  { si: 2, f: 0, b: 0.50, d: 0.2  },
  { si: 2, f: 0, b: 0.75, d: 0.2  },
  { si: 3, f: 3, b: 1.00, d: 0.2  }, // G2 (E str fret 3) passing tone
  { si: 2, f: 0, b: 1.25, d: 0.2  }, // A2 return
  { si: 2, f: 2, b: 1.50, d: 0.45 }, // B2 (A str fret 2) 8th
  { si: 2, f: 2, b: 2.00, d: 0.45 }, // B2 8th
  { si: 2, f: 0, b: 2.50, d: 0.2  }, // A2 16th
  { si: 2, f: 2, b: 2.75, d: 0.2  }, // B2 16th
  // ── Bar 2: C–B movement ────────────────────────────────────────────────
  { si: 2, f: 3, b: 4.00, d: 0.2  }, // C3 (A str fret 3) × 2 sixteenth
  { si: 2, f: 3, b: 4.25, d: 0.2  },
  { si: 2, f: 2, b: 5.00, d: 0.2  }, // B2
  { si: 2, f: 3, b: 5.25, d: 0.2  }, // C3
  { si: 2, f: 2, b: 5.50, d: 0.2  }, // B2
  { si: 3, f: 3, b: 5.75, d: 0.2  }, // G2 (E str fret 3)
  { si: 2, f: 0, b: 6.50, d: 0.9  }, // A2 open — quarter tail
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

// ─────────────────────────────────────────────────────────────────────────────
// 11 · VENCIÓ · Marcos Witt
//   C# minor. Driving praise groove: C#3 root → E3–F#3 run → A2 anchor
//   → B2 approach → C#3 resolve. 4-bar phrase with slight variation in bar 3.
//   Source: Samplab MIDI transcription (+12 transpose applied).
// ─────────────────────────────────────────────────────────────────────────────
const VENCIO = rawNotes('vencio', [
  { si: 2, f:  4, b:  0.000, d: 0.825 }, // C#3
  { si: 1, f:  2, b:  0.894, d: 0.687 }, // E3
  { si: 1, f:  4, b:  1.650, d: 0.481 }, // F#3
  { si: 2, f:  0, b:  1.994, d: 0.619 }, // A2
  { si: 1, f:  4, b:  2.131, d: 0.275 }, // F#3
  { si: 1, f:  2, b:  2.406, d: 0.550 }, // E3
  { si: 2, f:  4, b:  2.890, d: 0.481 }, // C#3
  { si: 2, f:  2, b:  3.440, d: 0.412 }, // B2
  { si: 2, f:  4, b:  3.852, d: 0.962 }, // C#3
  { si: 2, f:  0, b:  4.746, d: 0.275 }, // A2
  { si: 1, f:  2, b:  4.952, d: 0.687 }, // E3
  { si: 2, f:  0, b:  5.640, d: 1.169 }, // A2
  { si: 1, f:  4, b:  5.708, d: 0.275 }, // F#3
  { si: 1, f:  4, b:  6.123, d: 0.275 }, // F#3
  { si: 1, f:  2, b:  6.398, d: 0.550 }, // E3
  { si: 2, f:  4, b:  6.879, d: 0.481 }, // C#3
  { si: 2, f:  2, b:  7.429, d: 0.412 }, // B2
  { si: 2, f:  4, b:  7.842, d: 0.962 }, // C#3
  { si: 2, f:  0, b:  8.806, d: 0.206 }, // A2
  { si: 1, f:  2, b:  8.875, d: 0.756 }, // E3
  { si: 2, f:  0, b:  9.631, d: 1.169 }, // A2
  { si: 1, f:  4, b:  9.769, d: 0.344 }, // F#3
  { si: 1, f:  4, b: 10.112, d: 0.275 }, // F#3
  { si: 1, f:  2, b: 10.387, d: 0.550 }, // E3
  { si: 2, f:  4, b: 10.937, d: 0.481 }, // C#3
  { si: 2, f:  2, b: 11.419, d: 0.481 }, // B2
  { si: 0, f:  9, b: 11.419, d: 0.412 }, // E4  (octave accent)
  { si: 2, f:  4, b: 11.902, d: 1.031 }, // C#3
  { si: 1, f:  2, b: 13.002, d: 0.687 }, // E3
  { si: 2, f:  0, b: 13.690, d: 0.756 }, // A2
  { si: 1, f:  4, b: 13.758, d: 0.412 }, // F#3
  { si: 1, f:  4, b: 14.171, d: 0.275 }, // F#3
  { si: 2, f:  0, b: 14.448, d: 0.550 }, // A2
  { si: 1, f:  2, b: 14.448, d: 0.550 }, // E3
  { si: 2, f:  4, b: 14.998, d: 0.481 }, // C#3
  { si: 2, f:  2, b: 15.479, d: 0.481 }, // B2
  { si: 2, f:  4, b: 16.029, d: 0.894 }, // C#3
])

// ─────────────────────────────────────────────────────────────────────────────
// 12 · FIESTA EN EL DESIERTO · Montesanto
//   A major. Syncopated praise groove: A2–C#3 call-response, D#3–E3 chromatic
//   approach, B2 anchor → G#2–C3 movement, resolves to G3.
//   Source: Samplab MIDI transcription (+12 transpose applied).
// ─────────────────────────────────────────────────────────────────────────────
const FIESTA = rawNotes('fiesta', [
  { si: 2, f:  0, b:  0.000, d: 0.969 }, // A2
  { si: 2, f:  4, b:  0.896, d: 1.044 }, // C#3
  { si: 2, f:  0, b:  1.867, d: 0.521 }, // A2
  { si: 2, f:  4, b:  2.387, d: 0.448 }, // C#3
  { si: 1, f:  1, b:  2.835, d: 0.521 }, // D#3
  { si: 1, f:  2, b:  3.358, d: 0.521 }, // E3
  { si: 2, f:  2, b:  3.881, d: 0.969 }, // B2
  { si: 1, f:  1, b:  4.852, d: 1.044 }, // D#3
  { si: 2, f:  2, b:  5.898, d: 0.448 }, // B2
  { si: 1, f:  1, b:  6.421, d: 0.448 }, // D#3
  { si: 1, f:  2, b:  6.869, d: 0.448 }, // E3
  { si: 1, f:  4, b:  7.392, d: 0.448 }, // F#3
  { si: 3, f:  4, b:  7.840, d: 1.044 }, // G#2  (E str fret 4)
  { si: 2, f:  3, b:  8.958, d: 0.896 }, // C3
  { si: 3, f:  4, b:  9.854, d: 0.521 }, // G#2
  { si: 2, f:  3, b: 10.377, d: 0.448 }, // C3
  { si: 2, f:  4, b: 10.900, d: 0.448 }, // C#3
  { si: 1, f:  1, b: 11.348, d: 0.521 }, // D#3
  { si: 2, f:  4, b: 11.871, d: 0.969 }, // C#3
  { si: 1, f:  2, b: 12.842, d: 0.969 }, // E3
  { si: 2, f:  4, b: 13.887, d: 0.448 }, // C#3
  { si: 1, f:  2, b: 14.335, d: 0.521 }, // E3
  { si: 1, f:  4, b: 14.858, d: 0.521 }, // F#3
  { si: 0, f:  0, b: 15.381, d: 0.373 }, // G3
])

// ─────────────────────────────────────────────────────────────────────────────
// 10 · LE FREAK (1978) · C'est Chic · Bernard Edwards
//   A minor. 2-bar disco-funk phrase, moderate ♩ = 120.
//   Bar 1: A root (E5) → chromatic run E-open/F#/G → C octave pair (A3×2)
//           → A return (E5) → G/A 16th tail.
//   Bar 2: D pair (A5×2) → chuck E-open / G / A → C pair → E-open / G resolve.
//   Source: SVG score (BigBassTabs-style notation, 2 staves)
// ─────────────────────────────────────────────────────────────────────────────
const LE_FREAK = phraseRepeat('lefreak', 4, 8, 2, [
  // ── Bar 1 ──────────────────────────────────────────────────────────────────
  { si: 3, f: 5,  b: 0.0,  d: 1.0  }, // A  (E str fret 5) — root, quarter
  { si: 3, f: 0,  b: 1.0,  d: 0.25 }, // E  open
  { si: 3, f: 2,  b: 1.25, d: 0.25 }, // F# (E str fret 2)
  { si: 3, f: 3,  b: 1.5,  d: 0.5  }, // G  (E str fret 3)
  { si: 2, f: 3,  b: 2.0,  d: 0.5  }, // C  (A str fret 3)
  { si: 2, f: 3,  b: 2.5,  d: 0.5  }, // C
  { si: 3, f: 5,  b: 3.0,  d: 0.5  }, // A  (E str fret 5)
  { si: 3, f: 3,  b: 3.5,  d: 0.25 }, // G
  { si: 3, f: 5,  b: 3.75, d: 0.25 }, // A
  // ── Bar 2 ──────────────────────────────────────────────────────────────────
  { si: 2, f: 5,  b: 4.0,  d: 0.5  }, // D  (A str fret 5)
  { si: 2, f: 5,  b: 4.5,  d: 0.5  }, // D
  { si: 3, f: 0,  b: 5.0,  d: 0.25 }, // E  open chuck
  { si: 3, f: 3,  b: 5.25, d: 0.25 }, // G
  { si: 3, f: 5,  b: 5.5,  d: 0.5  }, // A
  { si: 2, f: 3,  b: 6.0,  d: 0.5  }, // C
  { si: 2, f: 3,  b: 6.5,  d: 0.5  }, // C
  { si: 3, f: 0,  b: 7.0,  d: 0.5  }, // E  open
  { si: 3, f: 3,  b: 7.5,  d: 0.5  }, // G
])

// ─────────────────────────────────────────────────────────────────────────────
// 13 · COME TOGETHER (1969) · Abbey Road · Paul McCartney
//   D minor feel. Signature descending D riff on A string with chromatic walkup.
//   A string: D=fret5, E=fret7, F=fret8, F#=fret9, G=fret10, C=fret3, B=fret2
// ─────────────────────────────────────────────────────────────────────────────
const COME_TOGETHER = barRepeat('cometogether', 4, 4, [
  { si: 2, f: 5,  b: 0.0,  d: 0.5  }, // D
  { si: 2, f: 5,  b: 0.5,  d: 0.5  }, // D
  { si: 2, f: 5,  b: 1.0,  d: 0.5  }, // D
  { si: 2, f: 7,  b: 1.5,  d: 0.25 }, // E
  { si: 2, f: 8,  b: 1.75, d: 0.25 }, // F
  { si: 2, f: 9,  b: 2.0,  d: 0.5  }, // F#
  { si: 2, f: 10, b: 2.5,  d: 0.5  }, // G
  { si: 2, f: 3,  b: 3.0,  d: 0.5  }, // C
  { si: 2, f: 2,  b: 3.5,  d: 0.5  }, // B
])

// ─────────────────────────────────────────────────────────────────────────────
// 14 · SEVEN NATION ARMY (2003) · Elephant · Jack White
//   E minor. Iconic riff played on A string (using octave pedal live).
//   A string: E=fret7, G=fret10, D=fret5, C=fret3, B=fret2
// ─────────────────────────────────────────────────────────────────────────────
const SEVEN_NATION_ARMY = barRepeat('sevennationarmy', 4, 4, [
  { si: 2, f: 7,  b: 0.0,  d: 0.5  }, // E
  { si: 2, f: 7,  b: 0.5,  d: 0.25 }, // E
  { si: 2, f: 10, b: 0.75, d: 0.5  }, // G
  { si: 2, f: 7,  b: 1.25, d: 0.5  }, // E
  { si: 2, f: 5,  b: 1.75, d: 0.5  }, // D
  { si: 2, f: 3,  b: 2.25, d: 0.5  }, // C
  { si: 2, f: 2,  b: 2.75, d: 1.25 }, // B (held)
])

// ─────────────────────────────────────────────────────────────────────────────
// 15 · ANOTHER ONE BITES THE DUST (1980) · The Game · John Deacon
//   E minor. Hypnotic E pedal with rhythmic G# decoration.
//   E string: E=open, G#=fret4
// ─────────────────────────────────────────────────────────────────────────────
const ANOTHER_ONE = barRepeat('anotherone', 4, 4, [
  { si: 3, f: 0, b: 0.0,  d: 0.5  }, // E open
  { si: 3, f: 0, b: 0.5,  d: 0.5  }, // E
  { si: 3, f: 0, b: 1.0,  d: 0.5  }, // E
  { si: 3, f: 0, b: 1.5,  d: 0.5  }, // E
  { si: 3, f: 0, b: 2.0,  d: 1.0  }, // E (quarter)
  { si: 3, f: 4, b: 3.0,  d: 0.25 }, // G#
  { si: 3, f: 0, b: 3.25, d: 0.25 }, // E
  { si: 3, f: 4, b: 3.5,  d: 0.25 }, // G#
  { si: 3, f: 0, b: 3.75, d: 0.25 }, // E
])

// ─────────────────────────────────────────────────────────────────────────────
// 16 · HYSTERIA (2003) · Absolution · Chris Wolstenholme
//   E minor. Relentless 16th-note driving riff.
//   A string: E=fret7, F#=fret9, G=fret10, D=fret5, C#=fret4
// ─────────────────────────────────────────────────────────────────────────────
const HYSTERIA = barRepeat('hysteria', 4, 4, [
  { si: 2, f: 7,  b: 0.0,  d: 0.25 }, // E
  { si: 2, f: 7,  b: 0.25, d: 0.25 }, // E
  { si: 2, f: 7,  b: 0.5,  d: 0.25 }, // E
  { si: 2, f: 7,  b: 0.75, d: 0.25 }, // E
  { si: 2, f: 7,  b: 1.0,  d: 0.25 }, // E
  { si: 2, f: 7,  b: 1.25, d: 0.25 }, // E
  { si: 2, f: 9,  b: 1.5,  d: 0.25 }, // F#
  { si: 2, f: 10, b: 1.75, d: 0.25 }, // G
  { si: 2, f: 7,  b: 2.0,  d: 0.25 }, // E
  { si: 2, f: 7,  b: 2.25, d: 0.25 }, // E
  { si: 2, f: 7,  b: 2.5,  d: 0.25 }, // E
  { si: 2, f: 9,  b: 2.75, d: 0.25 }, // F#
  { si: 2, f: 7,  b: 3.0,  d: 0.5  }, // E (8th)
  { si: 2, f: 5,  b: 3.5,  d: 0.25 }, // D
  { si: 2, f: 4,  b: 3.75, d: 0.25 }, // C#
])

// ─────────────────────────────────────────────────────────────────────────────
// 17 · HIGHER GROUND (1989) · Mother's Milk · Flea (orig. Stevie Wonder 1974)
//   C minor. Slap octave groove.
//   A string: C=fret3, Eb=fret6, Bb=fret1
//   G string: C octave=fret5
// ─────────────────────────────────────────────────────────────────────────────
const HIGHER_GROUND = barRepeat('higherground', 4, 4, [
  { si: 2, f: 3,  b: 0.0,  d: 0.25 }, // C
  { si: 0, f: 5,  b: 0.25, d: 0.25 }, // C octave (G str fret 5)
  { si: 2, f: 3,  b: 0.5,  d: 0.25 }, // C
  { si: 0, f: 5,  b: 0.75, d: 0.25 }, // C octave
  { si: 2, f: 3,  b: 1.0,  d: 0.25 }, // C
  { si: 2, f: 3,  b: 1.25, d: 0.25 }, // C
  { si: 2, f: 6,  b: 1.5,  d: 0.25 }, // Eb
  { si: 2, f: 3,  b: 1.75, d: 0.25 }, // C
  { si: 2, f: 3,  b: 2.0,  d: 0.5  }, // C
  { si: 0, f: 5,  b: 2.5,  d: 0.25 }, // C octave
  { si: 2, f: 3,  b: 2.75, d: 0.25 }, // C
  { si: 2, f: 3,  b: 3.0,  d: 0.25 }, // C
  { si: 2, f: 1,  b: 3.25, d: 0.25 }, // Bb
  { si: 2, f: 3,  b: 3.5,  d: 0.5  }, // C
])

// ─────────────────────────────────────────────────────────────────────────────
// 18 · SEPTEMBER (1978) · The Best of Earth Wind & Fire Vol.1 · Verdine White
//   D major. Funky 2-bar groove — bar 1 on D, bar 2 resolves on A.
//   A string: D=fret5, E=fret7, F#=fret9, A=open
//   E string: A=fret5, B=fret7, C#=fret9
// ─────────────────────────────────────────────────────────────────────────────
const SEPTEMBER = phraseRepeat('september', 4, 8, 2, [
  // ── Bar 1 · D groove ───────────────────────────────────────────────────────
  { si: 2, f: 5,  b: 0.0,  d: 0.25 }, // D
  { si: 2, f: 5,  b: 0.25, d: 0.25 }, // D
  { si: 2, f: 7,  b: 0.5,  d: 0.25 }, // E
  { si: 2, f: 5,  b: 0.75, d: 0.25 }, // D
  { si: 2, f: 5,  b: 1.0,  d: 0.5  }, // D
  { si: 2, f: 9,  b: 1.5,  d: 0.5  }, // F#
  { si: 2, f: 12, b: 2.0,  d: 0.5  }, // A (A str fret 12)
  { si: 2, f: 9,  b: 2.5,  d: 0.5  }, // F#
  { si: 2, f: 7,  b: 3.0,  d: 0.5  }, // E
  { si: 2, f: 5,  b: 3.5,  d: 0.5  }, // D
  // ── Bar 2 · A resolve ──────────────────────────────────────────────────────
  { si: 3, f: 5,  b: 4.0,  d: 0.25 }, // A (E str fret 5)
  { si: 3, f: 5,  b: 4.25, d: 0.25 }, // A
  { si: 3, f: 7,  b: 4.5,  d: 0.25 }, // B (E str fret 7)
  { si: 3, f: 5,  b: 4.75, d: 0.25 }, // A
  { si: 3, f: 5,  b: 5.0,  d: 0.5  }, // A
  { si: 3, f: 9,  b: 5.5,  d: 0.5  }, // C# (E str fret 9)
  { si: 2, f: 0,  b: 6.0,  d: 0.5  }, // A open
  { si: 3, f: 9,  b: 6.5,  d: 0.5  }, // C#
  { si: 3, f: 7,  b: 7.0,  d: 0.5  }, // B
  { si: 3, f: 5,  b: 7.5,  d: 0.5  }, // A
])

// ─────────────────────────────────────────────────────────────────────────────
// 19 · GIVE IT AWAY (1991) · Blood Sugar Sex Magik · Flea
//   E minor. Slap-driven E open pedal with F# neighbor note funk.
//   E string: E=open, F#=fret2
// ─────────────────────────────────────────────────────────────────────────────
const GIVE_IT_AWAY = barRepeat('giveitaway', 4, 4, [
  { si: 3, f: 0, b: 0.0,  d: 0.25 }, // E open
  { si: 3, f: 0, b: 0.25, d: 0.25 }, // E
  { si: 3, f: 0, b: 0.5,  d: 0.25 }, // E
  { si: 3, f: 2, b: 0.75, d: 0.25 }, // F#
  { si: 3, f: 0, b: 1.0,  d: 0.5  }, // E
  { si: 3, f: 2, b: 1.5,  d: 0.25 }, // F#
  { si: 3, f: 0, b: 1.75, d: 0.25 }, // E
  { si: 3, f: 0, b: 2.0,  d: 0.25 }, // E
  { si: 3, f: 0, b: 2.25, d: 0.25 }, // E
  { si: 3, f: 0, b: 2.5,  d: 0.5  }, // E
  { si: 3, f: 0, b: 3.0,  d: 0.25 }, // E
  { si: 3, f: 2, b: 3.25, d: 0.25 }, // F#
  { si: 3, f: 0, b: 3.5,  d: 0.25 }, // E
  { si: 3, f: 2, b: 3.75, d: 0.25 }, // F#
])

// ─────────────────────────────────────────────────────────────────────────────
// 20 · LONGVIEW (1994) · Dookie · Mike Dirnt
//   D major. Melodic walking bass intro.
//   A string: D=fret5, E=fret7, C=fret3, B=fret2, A=open
// ─────────────────────────────────────────────────────────────────────────────
const LONGVIEW = barRepeat('longview', 4, 4, [
  { si: 2, f: 5, b: 0.0,  d: 0.5  }, // D
  { si: 2, f: 5, b: 0.5,  d: 0.5  }, // D
  { si: 2, f: 5, b: 1.0,  d: 0.5  }, // D
  { si: 2, f: 7, b: 1.5,  d: 0.5  }, // E
  { si: 2, f: 5, b: 2.0,  d: 0.25 }, // D
  { si: 2, f: 3, b: 2.25, d: 0.25 }, // C
  { si: 2, f: 2, b: 2.5,  d: 0.5  }, // B
  { si: 2, f: 0, b: 3.0,  d: 1.0  }, // A open
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
    genre: 'Pop / Rock', bpm: 140, beatsPerBar: 4, totalBars: 4,
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
  {
    id: 'preset-lefreak',
    name: 'Le Freak', artist: 'Chic', bassist: 'Bernard Edwards',
    genre: 'Disco Funk', bpm: 120, beatsPerBar: 4, totalBars: 8,
    defaultSound: 'slap', notes: LE_FREAK,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-vencio',
    name: 'Venció', artist: 'Marcos Witt', bassist: 'session bassist',
    genre: 'Worship', bpm: 129, beatsPerBar: 4, totalBars: 5,
    defaultSound: 'electric', notes: VENCIO,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-fiesta',
    name: 'Fiesta en el Desierto', artist: 'Montesanto', bassist: 'session bassist',
    genre: 'Worship', bpm: 140, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: FIESTA,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-cometogether',
    name: 'Come Together', artist: 'The Beatles', bassist: 'Paul McCartney',
    genre: 'Rock', bpm: 82, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: COME_TOGETHER,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-sevennationarmy',
    name: 'Seven Nation Army', artist: 'The White Stripes', bassist: 'Jack White',
    genre: 'Rock', bpm: 124, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: SEVEN_NATION_ARMY,
    sections: [{ name: 'Riff', startBar: 0 }],
  },
  {
    id: 'preset-anotheronebitesthedust',
    name: 'Another One Bites the Dust', artist: 'Queen', bassist: 'John Deacon',
    genre: 'Rock / Funk', bpm: 110, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'electric', notes: ANOTHER_ONE,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-hysteria',
    name: 'Hysteria', artist: 'Muse', bassist: 'Chris Wolstenholme',
    genre: 'Alternative Rock', bpm: 96, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'fender', notes: HYSTERIA,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-higherground',
    name: 'Higher Ground', artist: 'Red Hot Chili Peppers', bassist: 'Flea',
    genre: 'Funk Rock', bpm: 126, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'slap', notes: HIGHER_GROUND,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-september',
    name: 'September', artist: 'Earth, Wind & Fire', bassist: 'Verdine White',
    genre: 'Funk / Soul', bpm: 126, beatsPerBar: 4, totalBars: 8,
    defaultSound: 'electric', notes: SEPTEMBER,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-giveitaway',
    name: 'Give It Away', artist: 'Red Hot Chili Peppers', bassist: 'Flea',
    genre: 'Funk Rock', bpm: 110, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'slap', notes: GIVE_IT_AWAY,
    sections: [{ name: 'Verse', startBar: 0 }],
  },
  {
    id: 'preset-longview',
    name: 'Longview', artist: 'Green Day', bassist: 'Mike Dirnt',
    genre: 'Punk Rock', bpm: 100, beatsPerBar: 4, totalBars: 4,
    defaultSound: 'fender', notes: LONGVIEW,
    sections: [{ name: 'Intro', startBar: 0 }],
  },
]
