export interface SongToken {
  chord: string;    // e.g. "C", "Am7", "" if no chord on this syllable
  lyrics: string;   // text that goes under this chord
  duration: number; // beats (default 2). Encoded as [Am:4] in lines.
}

export interface SongSection {
  name: string;   // "Verse 1", "Chorus", "Bridge", etc.
  lines: string[]; // Each line uses [Chord:beats]lyrics notation
}

export interface Song {
  slug: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre: string[];
  key: string;
  capo?: number;
  bpm: number;
  style: string;
  description: string;
  tags: string[];
  relatedProgressions: string[];
  sections: SongSection[];
}

// Matches [Am], [Am:2], [Am:0.5]
const CHORD_TAG_RE = /^\[([^:\]]+)(?::(\d+(?:\.\d+)?))?\]$/;

// Parse "[Am:2]A thousand [F]generations" → [{chord:'Am', duration:2, lyrics:'A thousand '}, ...]
export function parseLyricLine(line: string): SongToken[] {
  if (!line.includes('[')) {
    return line.trim() ? [{ chord: '', lyrics: line, duration: 4 }] : [];
  }

  const parts = line.split(/(\[[^\]]+\])/);
  const tokens: SongToken[] = [];
  let pendingChord = '';
  let pendingDuration = 2;

  for (const part of parts) {
    const m = part.match(CHORD_TAG_RE);
    if (m) {
      if (pendingChord) tokens.push({ chord: pendingChord, lyrics: '', duration: pendingDuration });
      pendingChord = m[1];
      pendingDuration = m[2] ? parseFloat(m[2]) : 4;
    } else {
      tokens.push({ chord: pendingChord, lyrics: part, duration: pendingDuration });
      pendingChord = '';
      pendingDuration = 4;
    }
  }

  if (pendingChord) tokens.push({ chord: pendingChord, lyrics: '', duration: pendingDuration });
  return tokens;
}

// Extract chord names only — used for display / unique chord list
export function extractChordsFromSong(song: Song): string[] {
  const chords: string[] = [];
  for (const section of song.sections) {
    for (const line of section.lines) {
      for (const token of parseLyricLine(line)) {
        if (token.chord) chords.push(token.chord);
      }
    }
  }
  return chords;
}

// Extract chords with their durations — used for playback engine
export function extractChordsWithDuration(song: Song): { chord: string; duration: number }[] {
  const result: { chord: string; duration: number }[] = [];
  for (const section of song.sections) {
    for (const line of section.lines) {
      for (const token of parseLyricLine(line)) {
        if (token.chord) result.push({ chord: token.chord, duration: token.duration });
      }
    }
  }
  return result;
}

export const SONGS: Song[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Holy Forever — Chris Tomlin
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'holy-forever-chris-tomlin',
    title: 'Holy Forever',
    artist: 'Chris Tomlin',
    album: 'Always',
    year: 2022,
    genre: ['worship', 'contemporary christian'],
    key: 'C',
    capo: 1,
    bpm: 72,
    style: 'pop_basic',
    description:
      'Holy Forever by Chris Tomlin — chord chart with lyrics. Key of C (capo 1st fret sounds in Db). Play every section with interactive audio.',
    tags: ['worship', 'chris tomlin', 'contemporary christian', 'capo 1'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Intro',
        lines: [
          '[F]   [Am]  [G]   [C]   [Am]  [G]',
        ],
      },
      {
        name: 'Verse 1',
        lines: [
          '[C]A thousand generations [F]falling down in [C]worship',
          '[Am]To sing the song of [G]ages to the [F]Lamb',
          '[C]And all who\'ve gone before us and [F]all who will be[C]lieve',
          '[Am]Will sing the song of [G]ages to the [F]Lamb',
        ],
      },
      {
        name: 'Pre-chorus',
        lines: [
          '[F]Your name is the [Am]highest',
          '[G]Your name is the greatest',
          '[Am]Your name stands above them [F]all',
          '[F]All thrones and domi[Am]nions',
          '[G]All powers and positions',
          '[Am]Your name stands above them [Dm]all',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[F]Holy for[C]ever',
          '[Am]And all I say is [G]holy',
          '[F]Holy for[C]ever',
          '[Am]And all I say is [G]holy',
          '[F]Holy for[C]ever',
          '[Am]And all I say is [G]holy',
          '[F]Holy for[C]ever',
          '[Am]And all I say is [G]holy',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[C]The angels cry out [F]holy to the [C]Lord',
          '[Am]Singing glory be to [G]God the [F]Lord',
          '[C]And all creation [F]worships at your [C]feet',
          '[Am]Singing glory be to [G]God the [F]Lord',
        ],
      },
      {
        name: 'Bridge',
        lines: [
          '[F]You are [C]holy   [Am]You are [G]holy',
          '[F]You are [C]holy   [Am]You are [G]holy',
          '[F]You are [C]holy   [Am]You are [G]holy',
          '[F]You are [C]holy   [Am]You are [G]holy',
        ],
      },
      {
        name: 'Outro',
        lines: [
          '[F]Holy for[C]ever  [Am]   [G]',
          '[F]Holy for[C]ever  [Am]   [G]',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Autumn Leaves — Jazz standard (public domain)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'autumn-leaves-jazz-standard',
    title: 'Autumn Leaves',
    artist: 'Jazz Standard',
    album: 'Public Domain',
    year: 1945,
    genre: ['jazz', 'standard'],
    key: 'G',
    bpm: 100,
    style: 'pop_basic',
    description:
      'Autumn Leaves — classic jazz standard chord chart with lyrics. Key of G minor. Play the full ii–V–I progression through the entire song.',
    tags: ['jazz', 'jazz standard', 'autumn leaves', 'ii V I', 'public domain'],
    relatedProgressions: ['jazz', 'ii-v-i'],
    sections: [
      {
        name: 'A Section (×2)',
        lines: [
          '[Cm7]The falling [F7]leaves drift [Bbmaj7]by the [Ebmaj7]window',
          '[Am7b5]The autumn [D7]leaves of red and [Gm]gold',
          '[Cm7]I see your [F7]lips the summer [Bbmaj7]kisses [Ebmaj7]',
          '[Am7b5]The sunburned [D7]hands I used to [Gm]hold',
        ],
      },
      {
        name: 'B Section',
        lines: [
          '[Am7b5]Since you [D7]went away the days grow [Gm]long',
          '[Cm7]And soon I\'ll [F7]hear old winter\'s [Bbmaj7]song',
          '[Ebmaj7]But I [Am7b5]miss you most of [D7]all my darling',
          '[Gm]When [Cm]autumn [D7]leaves start to [Gm]fall',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Hallelujah — Leonard Cohen (public domain / widely covered)
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'hallelujah-leonard-cohen',
    title: 'Hallelujah',
    artist: 'Leonard Cohen',
    year: 1984,
    genre: ['folk', 'pop'],
    key: 'C',
    bpm: 68,
    style: 'pop_basic',
    description:
      'Hallelujah by Leonard Cohen — full chord chart with lyrics. One of the most covered songs of all time. Key of C major.',
    tags: ['hallelujah', 'leonard cohen', 'folk', 'pop', 'fingerpicking'],
    relatedProgressions: ['pop', 'sad'],
    sections: [
      {
        name: 'Verse 1',
        lines: [
          '[C]I\'ve heard there was a [Am]secret chord',
          '[C]That David played and it [Am]pleased the Lord',
          '[F]But you don\'t really [G]care for music, [C]do you? [G]',
          '[C]It goes like [F]this the [G]fourth, the [Am]fifth',
          '[F]The minor [G]fall, the [Am]major lift',
          '[G]The baffled king com[F]posing Halle[Am]lujah',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[F]Hallelujah, [Am]Hallelujah',
          '[F]Hallelujah, Halle[C]lu[G]jah',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[C]Your faith was strong but you [Am]needed proof',
          '[C]You saw her bathing [Am]on the roof',
          '[F]Her beauty and the [G]moonlight over[C]threw you [G]',
          '[C]She tied you to a [F]kitchen [G]chair',
          '[Am]She broke your throne and she [F]cut your [G]hair',
          '[G]And from your lips she drew the [F]Halle[Am]lujah',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[F]Hallelujah, [Am]Hallelujah',
          '[F]Hallelujah, Halle[C]lu[G]jah',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Wonderwall — Oasis
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'wonderwall-oasis',
    title: 'Wonderwall',
    artist: 'Oasis',
    album: '(What\'s the Story) Morning Glory?',
    year: 1995,
    genre: ['rock', 'britpop'],
    key: 'F#m',
    capo: 2,
    bpm: 87,
    style: 'pop_basic',
    description:
      'Wonderwall by Oasis — chord chart with lyrics. Key of F#m with capo on 2nd fret. One of the most searched guitar chord charts online.',
    tags: ['wonderwall', 'oasis', 'britpop', 'rock', 'capo 2', 'guitar'],
    relatedProgressions: ['rock', 'sad'],
    sections: [
      {
        name: 'Intro',
        lines: [
          '[Em7]   [G]   [Dsus4]   [A7sus4]',
        ],
      },
      {
        name: 'Verse 1',
        lines: [
          '[Em7]Today is [G]gonna be the day that they\'re gonna [Dsus4]throw it back to [A7sus4]you',
          '[Em7]By now you [G]should\'ve somehow real[Dsus4]ized what you [A7sus4]gotta do',
          '[Em7]I don\'t be[G]lieve that any[Dsus4]body feels the way I [A7sus4]do',
          '[Cadd9]About you [Dsus4]now [A7sus4]',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[Em7]Backbeat the [G]word was on the street that the [Dsus4]fire in your heart is [A7sus4]out',
          '[Em7]I\'m sure you\'ve [G]heard it all before but you [Dsus4]never really had a [A7sus4]doubt',
          '[Em7]I don\'t be[G]lieve that any[Dsus4]body feels the way I [A7sus4]do',
          '[Cadd9]About you [Dsus4]now [A7sus4]',
        ],
      },
      {
        name: 'Pre-chorus',
        lines: [
          '[Cadd9]And all the [Em7]roads we have to [G]walk are [A7sus4]winding',
          '[Cadd9]And all the [Em7]lights that lead us [G]there are [A7sus4]blinding',
          '[Cadd9]There are many [Em7]things that I would [G]like to say to you',
          '[Dsus4]But I don\'t know how',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          'Because [G]maybe [A7sus4]',
          '[Cadd9]You\'re gonna be the one that [Em7]saves me',
          '[G]And after [A7sus4]all',
          '[Cadd9]You\'re my Wonder[Em7]wall',
        ],
      },
    ],
  },
];

export function getSong(slug: string): Song | undefined {
  return SONGS.find(s => s.slug === slug);
}
