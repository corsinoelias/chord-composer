// Ported from the user's Claude Design project "Piano virtual realista"
// (Virtual Piano.dc.html / songs.js) — same public-domain melody library.

export type PianoNote = [midi: number, startBeat: number, durationBeats: number]

export interface PianoSong {
  id: string
  name: string
  diff: 'Easy' | 'Medium' | 'Hard'
  tags: string[]
  bpm: number
  notes: PianoNote[]
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

// Format: "NOTE[:duration]" space-separated. Duration in beats (default 1). "r" = rest.
function parse(seq: string): PianoNote[] {
  const notes: PianoNote[] = []
  let t = 0
  for (const tok of seq.trim().split(/\s+/)) {
    const [head, durStr] = tok.split(':')
    const dur = durStr ? parseFloat(durStr) : 1
    if (head !== 'r') {
      const m = head.match(/^([A-G])(#?)(\d)$/)
      if (m) {
        const midi = 12 * (parseInt(m[3], 10) + 1) + NAMES[m[1]] + (m[2] ? 1 : 0)
        notes.push([midi, t, dur])
      }
    }
    t += dur
  }
  return notes
}

export const PIANO_SONGS: PianoSong[] = [
  {
    id: 'estrellita', name: 'Twinkle Twinkle Little Star', diff: 'Easy', tags: ['Children', 'Classical'], bpm: 100,
    notes: parse('C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2'),
  },
  {
    id: 'cumple', name: 'Happy Birthday', diff: 'Easy', tags: ['Celebration'], bpm: 120,
    notes: parse('G4:.5 G4:.5 A4 G4 C5 B4:2 G4:.5 G4:.5 A4 G4 D5 C5:2 G4:.5 G4:.5 G5 E5 C5 B4 A4:2 F5:.5 F5:.5 E5 C5 D5 C5:2'),
  },
  {
    id: 'oda', name: 'Ode to Joy (Beethoven)', diff: 'Easy', tags: ['Classical'], bpm: 120,
    notes: parse('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2'),
  },
  {
    id: 'martinillo', name: 'Frère Jacques', diff: 'Easy', tags: ['Children'], bpm: 120,
    notes: parse('C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2'),
  },
  {
    id: 'corderito', name: 'Mary Had a Little Lamb', diff: 'Easy', tags: ['Children'], bpm: 120,
    notes: parse('E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:2'),
  },
  {
    id: 'jingle', name: 'Jingle Bells', diff: 'Easy', tags: ['Christmas'], bpm: 140,
    notes: parse('E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2 E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 G4 G4 F4 D4 C4:2'),
  },
  {
    id: 'nochedepaz', name: 'Silent Night', diff: 'Medium', tags: ['Christmas'], bpm: 90,
    notes: parse('G4:1.5 A4:.5 G4 E4:3 G4:1.5 A4:.5 G4 E4:3 D5:2 D5 B4:3 C5:2 C5 G4:3 A4:2 A4 C5:1.5 B4:.5 A4 G4:1.5 A4:.5 G4 E4:3 A4:2 A4 C5:1.5 B4:.5 A4 G4:1.5 A4:.5 G4 E4:3 D5:2 D5 F5:1.5 D5:.5 B4 C5:3 E5:3 C5:1.5 G4:.5 E4 G4:1.5 F4:.5 D4 C4:3'),
  },
  {
    id: 'minuet', name: 'Minuet in G (Bach)', diff: 'Medium', tags: ['Classical', 'Baroque'], bpm: 110,
    notes: parse('D5 G4:.5 A4:.5 B4:.5 C5:.5 D5 G4 G4 E5 C5:.5 D5:.5 E5:.5 F#5:.5 G5 G4 G4 C5 D5:.5 C5:.5 B4:.5 A4:.5 B4 C5:.5 B4:.5 A4:.5 G4:.5 F#4 G4:.5 A4:.5 B4:.5 G4:.5 A4:3'),
  },
  {
    id: 'greensleeves', name: 'Greensleeves', diff: 'Medium', tags: ['Traditional'], bpm: 100,
    notes: parse('A4 C5:2 D5 E5:1.5 F5:.5 E5 D5:2 B4 G4:1.5 A4:.5 B4 C5:2 A4 A4:1.5 G#4:.5 A4 B4:2 G#4 E4:2 A4 C5:2 D5 E5:1.5 F5:.5 E5 D5:2 B4 G4:1.5 A4:.5 B4 C5:1.5 B4:.5 A4 G#4:1.5 F#4:.5 G#4 A4:3'),
  },
  {
    id: 'canon', name: 'Canon in D (Pachelbel)', diff: 'Medium', tags: ['Classical', 'Baroque'], bpm: 60,
    notes: parse('F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2 D5:2 C#5:2 B4:2 A4:2 G4:2 F#4:2 G4:2 E4:2'),
  },
  {
    id: 'furelise', name: 'Für Elise (Beethoven)', diff: 'Hard', tags: ['Classical'], bpm: 140,
    notes: parse('E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 B4:1.5 E4:.5 G#4:.5 B4:.5 C5:1.5 E4:.5 E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 B4:1.5 E4:.5 C5:.5 B4:.5 A4:2'),
  },
  {
    id: 'preludio', name: 'Prelude in C (Bach)', diff: 'Hard', tags: ['Classical', 'Baroque'], bpm: 76,
    notes: parse('C4:.5 E4:.5 G4:.5 C5:.5 E5:.5 G4:.5 C5:.5 E5:.5 C4:.5 E4:.5 G4:.5 C5:.5 E5:.5 G4:.5 C5:.5 E5:.5 C4:.5 D4:.5 A4:.5 D5:.5 F5:.5 A4:.5 D5:.5 F5:.5 C4:.5 D4:.5 A4:.5 D5:.5 F5:.5 A4:.5 D5:.5 F5:.5 B3:.5 D4:.5 G4:.5 D5:.5 F5:.5 G4:.5 D5:.5 F5:.5 B3:.5 D4:.5 G4:.5 D5:.5 F5:.5 G4:.5 D5:.5 F5:.5 C4:.5 E4:.5 G4:.5 C5:.5 E5:.5 G4:.5 C5:.5 E5:.5 C4:.5 E4:.5 G4:.5 C5:.5 E5:.5 G4:.5 C5:.5 E5:.5'),
  },
  {
    id: 'turca', name: 'Turkish March (Mozart)', diff: 'Hard', tags: ['Classical'], bpm: 130,
    notes: parse('B4:.5 A4:.5 G#4:.5 A4:.5 C5:2 D5:.5 C5:.5 B4:.5 C5:.5 E5:2 F5:.5 E5:.5 D#5:.5 E5:.5 B5:.5 A5:.5 G#5:.5 A5:.5 B5:.5 A5:.5 G#5:.5 A5:.5 C6:2 A5 C6 B5:.5 A5:.5 G5 A5 B5:.5 A5:.5 G5 A5 B5:.5 A5:.5 G5 F#5 E5:2'),
  },
]
