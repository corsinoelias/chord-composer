export interface SongToken {
  chord: string;    // e.g. "C", "Am7", "" if no chord on this syllable
  lyrics: string;   // text that goes under this chord
  duration: number; // beats (default 2). Encoded as [Am:4] in lines.
}

export interface AudioRange {
  startSec: number;
  endSec: number;
}

export interface SongSection {
  name: string;   // "Verse 1", "Chorus", "Bridge", etc.
  lines: string[]; // Each line uses [Chord:beats]lyrics notation
  repeatCount?: number; // how many times the section plays back-to-back. Default 1 (no repeat).
  // Which slice of the song's shared audioTrack (if any) plays under this section.
  audioRange?: AudioRange;
}

export interface Song {
  slug: string;
  lastModified?: string; // ISO date (YYYY-MM-DD) this entry was last actually edited
  title: string;
  artist: string;
  // Songwriter/composer, when different from the performing artist (covers). Falls back
  // to `artist` wherever composer is displayed or serialized as JSON-LD.
  composerName?: string;
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
  // Vocal/reference recording shared by the whole song — a single file, sliced per
  // section (or as one continuous span) via audioRange/audioWholeRange. `path` is the
  // Supabase Storage object path (needed to delete/replace the file; irrelevant for
  // read-only playback).
  audioTrack?: { url: string; path: string };
  audioWholeRange?: AudioRange;
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
    lastModified: '2026-06-01',
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
    lastModified: '2026-06-01',
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
    lastModified: '2026-06-01',
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
    lastModified: '2026-06-23',
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

  // ─────────────────────────────────────────────────────────────────────────
  // Oceans (Where Feet May Fail) — Hillsong United
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'oceans-hillsong-united',
    lastModified: '2026-07-18',
    title: 'Oceans (Where Feet May Fail)',
    artist: 'Hillsong United',
    album: 'Zion',
    year: 2013,
    genre: ['worship', 'contemporary christian'],
    key: 'D',
    bpm: 72,
    style: 'folk_strum',
    description:
      'Oceans (Where Feet May Fail) by Hillsong United — chord chart with lyrics. Key of D. Play the iconic worship anthem section by section with interactive audio.',
    tags: ['worship', 'hillsong united', 'contemporary christian', 'oceans'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Verse 1',
        lines: [
          '[Bm:3]You call [A:1]me out upon the [D]waters',
          'The great [A]unknown where feet may [G]fail',
          '[Bm:3]And there [A:1]I find You [D]in the mystery',
          'In oceans [A]deep my faith will [G]stand',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[Bm:3]Your grace [A:1]abounds in deepest [D]waters',
          'Your sovereign [A]hand will be my [G]guide',
          '[Bm:3]Where feet [A:1]may fail and fear [D]surrounds me',
          'You\'ve never [A]failed and You won\'t start [G]now',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[G:2]I will [D:2]call upon [A]Your Name',
          '[G:2]And keep my [D:2]eyes [A]above the waves, when oceans rise',
          '[G:2]My soul will [D:2]rest in Your [A]embrace',
          'For I [G:2]am [A:2]Yours and You are [Bm]mine',
        ],
      },
      {
        name: 'Bridge',
        lines: [
          '[Bm]Spirit lead me where my [G]trust is without borders',
          'Let me [D]walk upon the waters',
          '[A]Wherever You would call me',
          '[Bm]Take me deeper than my [G]feet could ever wander',
          'And my [D]faith will be made stronger',
          'In the [A]presence of my Saviour',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Way Maker — Leeland
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'way-maker-leeland',
    lastModified: '2026-06-23',
    title: 'Way Maker',
    artist: 'Leeland',
    album: 'Way Maker',
    year: 2019,
    genre: ['worship', 'contemporary christian'],
    key: 'A',
    bpm: 96,
    style: 'pop_basic',
    description:
      'Way Maker by Leeland — chord chart with lyrics. Key of A (I–V–vi–IV). Play every section with interactive audio. Originally written by Sinach.',
    tags: ['worship', 'leeland', 'sinach', 'contemporary christian', 'way maker'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Verse 1',
        lines: [
          '[A]You are here moving in our [E]midst',
          'I worship [F#m]You, I worship [D]You',
          '[A]You are here working in this [E]place',
          'I worship [F#m]You, I worship [D]You',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[A]Way maker, miracle [E]worker',
          'Promise [F#m]keeper, light in the [D]darkness',
          '[A]My God, that is who You [E]are',
          '[F#m]That is who You [D]are',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[A]You are here touching every [E]heart',
          'I worship [F#m]You, I worship [D]You',
          '[A]You are here healing every [E]heart',
          'I worship [F#m]You, I worship [D]You',
        ],
      },
      {
        name: 'Bridge',
        lines: [
          '[A]Even when I don\'t see it You\'re work[E]ing',
          'Even when I don\'t feel it You\'re [F#m]working',
          '[D]You never stop, You never stop working',
          '[A]You never stop, You never stop [E]working',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Goodness of God — Bethel Music / Jenn Johnson
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'goodness-of-god-bethel-music',
    lastModified: '2026-06-23',
    title: 'Goodness of God',
    artist: 'Bethel Music',
    album: 'Victory',
    year: 2019,
    genre: ['worship', 'contemporary christian'],
    key: 'C',
    bpm: 68,
    style: 'folk_strum',
    description:
      'Goodness of God by Bethel Music — chord chart with lyrics. Key of C. Play this beloved worship anthem with interactive audio and full chord-over-lyrics.',
    tags: ['worship', 'bethel music', 'jenn johnson', 'contemporary christian', 'goodness of god'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Verse 1',
        lines: [
          '[C]I love You, Lord',
          '[G]Oh Your mercy never fails me',
          '[Am]All my days I\'ve been held in Your [F]hands',
          '[C]From the moment that I wake up',
          '[G]Until I lay my head',
          '[Am]Oh I will sing of the goodness of [F]God',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[C]All my life You have been faith[G]ful',
          '[Am]All my life You have been so, so [F]good',
          '[C]With every breath that I am [G]able',
          '[Am]Oh I will sing of the goodness of [F]God',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[C]I love Your voice',
          '[G]You have led me through the fire',
          '[Am]And in the darkest night You are [F]close like no other',
          '[C]I\'ve known You as a Father',
          '[G]I\'ve known You as a Friend',
          '[Am]And I have lived in the goodness of [F]God',
        ],
      },
      {
        name: 'Bridge',
        lines: [
          '[Am]Your goodness is running after, it\'s running after [F]me',
          '[C]Your goodness is running after, it\'s running after [G]me',
          '[Am]With my life laid down I\'m surrendered now I give You every[F]thing',
          '[C]\'Cause Your goodness is running after, it\'s running after [G]me',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Reckless Love — Cory Asbury
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'reckless-love-cory-asbury',
    lastModified: '2026-06-23',
    title: 'Reckless Love',
    artist: 'Cory Asbury',
    album: 'Reckless Love',
    year: 2017,
    genre: ['worship', 'contemporary christian'],
    key: 'C',
    bpm: 68,
    style: 'folk_strum',
    description:
      'Reckless Love by Cory Asbury — chord chart with lyrics. Key of C. Play the full worship song with interactive chord audio and complete lyrics.',
    tags: ['worship', 'cory asbury', 'contemporary christian', 'reckless love'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Verse 1',
        lines: [
          '[Am]Before I spoke a [F]word You were singing over [C]me',
          '[G]You have been so, so [Am]good to me',
          '[Am]Before I took a [F]breath You breathed Your life in [C]me',
          '[G]You have been so, so [Am]kind to me',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[C]Oh the overwhelming, never-ending, [G]reckless love of God',
          '[Am]Oh it chases me down, fights \'til I\'m [F]found, leaves the ninety-nine',
          '[C]And I couldn\'t earn it, and I don\'t deserve it',
          '[G]Still You give Yourself [Am]away',
          '[F]Oh the overwhelming, never-ending, [C]reckless love of God',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[Am]When I was Your [F]foe still Your love fought [C]for me',
          '[G]You have been so, so [Am]good to me',
          '[Am]When I felt no [F]worth You paid it all for [C]me',
          '[G]You have been so, so [Am]kind to me',
        ],
      },
      {
        name: 'Bridge',
        lines: [
          '[Am]There\'s no shadow You won\'t [F]light up',
          '[C]Mountain You won\'t climb up [G]coming after me',
          '[Am]There\'s no wall You won\'t kick [F]down',
          '[C]Lie You won\'t tear down [G]coming after me',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10,000 Reasons (Bless the Lord) — Matt Redman
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: '10000-reasons-matt-redman',
    lastModified: '2026-06-23',
    title: '10,000 Reasons (Bless the Lord)',
    artist: 'Matt Redman',
    album: '10,000 Reasons',
    year: 2011,
    genre: ['worship', 'contemporary christian'],
    key: 'G',
    bpm: 73,
    style: 'folk_strum',
    description:
      '10,000 Reasons (Bless the Lord) by Matt Redman — chord chart with lyrics. Key of G. Grammy-winning worship anthem with full interactive chord audio.',
    tags: ['worship', 'matt redman', 'contemporary christian', '10000 reasons', 'bless the lord'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Chorus',
        lines: [
          '[G]Bless the [D]Lord oh my [Em7]soul, oh my [C]soul',
          '[G]Worship His [D]holy [G]name',
          '[C]Sing like never be[G]fore, oh my [Em7]soul',
          'I\'ll wor[C]ship Your holy [D]name',
        ],
      },
      {
        name: 'Verse 1',
        lines: [
          'The [G]sun comes up it\'s a new [D]day dawning',
          'It\'s [Em7]time to sing Your [C]song again',
          'What[G]ever may pass and what[D]ever lies before me',
          '[Em7]Let me be singing when the [C]evening [D]comes',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          'You\'re [G]rich in love and You\'re [D]slow to anger',
          'Your [Em7]name is great and Your [C]heart is kind',
          'For [G]all Your goodness I will keep on [D]singing',
          'Ten thou[Em7]sand reasons for my [C]heart to [D]find',
        ],
      },
      {
        name: 'Verse 3',
        lines: [
          'And [G]on that day when my [D]strength is failing',
          'The [Em7]end draws near and my [C]time has come',
          'Still [G]my soul will sing Your [D]praise unending',
          'Ten thou[Em7]sand years and then for[C]ever[D]more',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // What A Beautiful Name — Hillsong Worship
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'what-a-beautiful-name-hillsong-worship',
    lastModified: '2026-06-23',
    title: 'What A Beautiful Name',
    artist: 'Hillsong Worship',
    album: 'Let There Be Light',
    year: 2016,
    genre: ['worship', 'contemporary christian'],
    key: 'D',
    capo: 1,
    bpm: 68,
    style: 'folk_strum',
    description:
      'What A Beautiful Name by Hillsong Worship — chord chart with lyrics. Key of D (capo 1st fret sounds in Eb). Play the Grammy-winning anthem with interactive audio.',
    tags: ['worship', 'hillsong worship', 'contemporary christian', 'what a beautiful name'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Verse 1',
        lines: [
          '[D]You were the Word at the [A]beginning',
          '[Bm]One with God the Lord Most [G]High',
          '[D]Your hidden glory in cre[A]ation',
          '[Bm]Now revealed in You our [G]Christ',
        ],
      },
      {
        name: 'Pre-chorus',
        lines: [
          '[D]What a beautiful [A]name it is',
          '[Bm]What a beautiful name it [G]is',
          'The name of [D]Jesus Christ my [A]King',
          '[Bm]What a beautiful name it [G]is',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[D]What a beautiful [A]name it is',
          'Nothing com[G]pares to this',
          '[D]What a beautiful name it [A]is',
          'The name of [G]Jesus',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[D]You didn\'t want heaven with[A]out us',
          '[Bm]So Jesus You brought heaven [G]down',
          '[D]My sin was great Your love was [A]greater',
          '[Bm]What could separate us [G]now',
        ],
      },
      {
        name: 'Bridge',
        lines: [
          '[Bm]Death could not hold You, the veil tore be[G]fore You',
          '[D]You silence the boast of sin and [A]grave',
          '[Bm]The heavens are roaring the praise of Your [G]glory',
          '[D]For You are raised to [A]life again',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Build My Life — Pat Barrett
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'build-my-life-pat-barrett',
    lastModified: '2026-06-23',
    title: 'Build My Life',
    artist: 'Pat Barrett',
    album: 'Build My Life',
    year: 2016,
    genre: ['worship', 'contemporary christian'],
    key: 'G',
    bpm: 74,
    style: 'folk_strum',
    description:
      'Build My Life by Pat Barrett — chord chart with lyrics. Key of G. Play this modern worship anthem with interactive audio and full chord-over-lyrics.',
    tags: ['worship', 'pat barrett', 'housefires', 'contemporary christian', 'build my life'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Verse 1',
        lines: [
          '[G]Worthy of every [Em]song we could ever [C]sing',
          '[D]Worthy of all the [G]praise we could ever [Em]bring',
          '[C]Worthy of every [D]breath we could ever [G]breathe',
          '[Em]We live for You, [C]we live for [D]You',
        ],
      },
      {
        name: 'Verse 2',
        lines: [
          '[G]Jesus the name a[Em]bove every other [C]name',
          '[D]Jesus the only [G]one who could ever [Em]save',
          '[C]Worthy of every [D]breath we could ever [G]breathe',
          '[Em]We live for You, [C]we live for [D]You',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[G]Holy, there is no one like [D]You',
          '[Em]There is none beside [C]You',
          '[G]Open up my eyes in wonder and [D]show me who You are',
          '[Em]And fill me with Your [C]heart',
          '[G]And lead me in Your love to [D]those around me',
        ],
      },
      {
        name: 'Bridge',
        lines: [
          '[G]I will build my life u[Em]pon Your love',
          'It is a [C]firm foundation',
          '[G]I will put my trust in [D]You alone',
          '[Em]And I will not be [C]shaken',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Great Are You Lord — All Sons & Daughters
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'great-are-you-lord-all-sons-daughters',
    lastModified: '2026-06-23',
    title: 'Great Are You Lord',
    artist: 'All Sons & Daughters',
    album: 'Season One',
    year: 2012,
    genre: ['worship', 'contemporary christian'],
    key: 'G',
    bpm: 76,
    style: 'folk_strum',
    description:
      'Great Are You Lord by All Sons & Daughters — chord chart with lyrics. Key of G. Play this anthemic worship song with interactive audio and full lyrics.',
    tags: ['worship', 'all sons and daughters', 'contemporary christian', 'great are you lord'],
    relatedProgressions: ['worship', 'pop'],
    sections: [
      {
        name: 'Verse',
        lines: [
          '[G]You give life, You are [D]love',
          '[Em7]You bring light to the dark[Csus2]ness',
          '[G]You give hope, You restore [D]every heart that is broken',
          '[Em7]Great are You, [Csus2]Lord',
        ],
      },
      {
        name: 'Chorus',
        lines: [
          '[G]It\'s Your breath in our [D]lungs',
          '[Em7]So we pour out our [Csus2]praise',
          '[G]We pour out our [D]praise',
          '[Em7]We pour out our [Csus2]praise to You [G]only',
        ],
      },
      {
        name: 'Bridge',
        lines: [
          '[Bm7]All the earth will shout Your [G]praise',
          '[D]Our hearts will cry, these bones will [A]sing',
          '[Bm7]Great are You, [G]Lord',
        ],
      },
    ],
  },
];

export function getSong(slug: string): Song | undefined {
  return SONGS.find(s => s.slug === slug);
}
