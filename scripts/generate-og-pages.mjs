import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import React from 'react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'og')
fs.mkdirSync(outDir, { recursive: true })

const interReg  = fs.readFileSync(path.join(root, 'public/fonts/Inter-Regular.woff')).buffer
const interBold = fs.readFileSync(path.join(root, 'public/fonts/Inter-Bold.woff')).buffer
const bravura   = fs.readFileSync(path.join(root, 'public/fonts/MusicFont.otf')).buffer

const FONTS = [
  { name: 'Inter',   data: interReg,  weight: 400, style: 'normal' },
  { name: 'Inter',   data: interBold, weight: 700, style: 'normal' },
  { name: 'Bravura', data: bravura,   weight: 400, style: 'normal' },
]

const PAGES = [
  {
    slug: 'home',
    title: 'Free Online Music Tools',
    tagline: 'Chord editor, virtual instruments, metronome, tuner and more — all in your browser.',
    tags: ['Free', 'No Install', 'No Account'],
  },
  {
    slug: 'editor',
    title: 'Chord Progression Editor',
    tagline: 'Build progressions with piano, bass, drums and guitar. Export to WAV.',
    tags: ['Piano', 'Bass', 'Guitar', 'Drums'],
  },
  {
    slug: 'bass-guitar',
    title: 'Virtual Bass Guitar',
    tagline: 'Play a 4-string bass with real samples — tab editor, presets, WAV export.',
    tags: ['4 Sounds', 'Tab Editor', 'Real Samples'],
  },
  {
    slug: 'guitar',
    title: 'Virtual Guitar',
    tagline: '8 sampled sounds: Steel, Nylon, Clean, Jazz, Muted, Distorted, Overdrive, Harmonics.',
    tags: ['8 Sounds', 'Tab Editor', 'Real Samples'],
  },
  {
    slug: 'instruments',
    title: 'Virtual Instruments',
    tagline: 'Free instruments you can play in your browser. No install, no account.',
    tags: ['Bass Guitar', 'Guitar', 'More coming'],
  },
  {
    slug: 'songs',
    title: 'Chord Charts & Songs',
    tagline: 'Find chord charts for thousands of songs — key, BPM, capo, and play-along.',
    tags: ['Key & BPM', 'Capo', 'Play Along'],
  },
  {
    slug: 'learn',
    title: 'Learn Music Theory',
    tagline: 'Guides on chords, progressions, scales and intervals — for all levels.',
    tags: ['Beginner Friendly', 'Free Guides'],
  },
  {
    slug: 'tools',
    title: 'Free Music Tools',
    tagline: 'Metronome, tuner, circle of fifths, key detector, chord transposer and more.',
    tags: ['Metronome', 'Tuner', 'Circle of Fifths'],
  },
  {
    slug: 'metronome',
    title: 'Online Metronome',
    tagline: 'Free browser metronome. Set BPM, tap tempo, and practice with subdivisions.',
    tags: ['Free', 'Tap Tempo', 'No Install'],
  },
  {
    slug: 'tuner',
    title: 'Online Guitar Tuner',
    tagline: 'Tune your guitar, bass or ukulele in your browser using your microphone.',
    tags: ['Guitar', 'Bass', 'Ukulele'],
  },
  {
    slug: 'bass-tab',
    title: 'Bass Tab Player',
    tagline: 'Draw, play and export bass lines. Pick, Finger, Slap and Synth sounds.',
    tags: ['Tab Editor', 'Real Samples', 'WAV Export'],
  },
  {
    slug: 'progressions',
    title: 'Chord Progressions',
    tagline: 'Explore progressions by genre — pop, rock, jazz, blues, worship and more.',
    tags: ['Pop', 'Rock', 'Jazz', 'Blues'],
  },
  {
    slug: 'chord-progression-generator',
    title: 'Chord Progression Generator',
    tagline: 'Generate chord progressions in any key and style. Listen instantly in your browser.',
    tags: ['AI Assisted', 'All Keys', 'Free'],
  },
]

const h = React.createElement

function staffLines() {
  return h('div', {
    style: { position: 'absolute', right: 0, top: 0, width: 440, height: '100%', display: 'flex', alignItems: 'center' }
  }, [
    h('div', {
      key: 'lines',
      style: { position: 'absolute', right: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 38 }
    }, [0,1,2,3,4].map(i => h('div', {
      key: i,
      style: { width: '100%', height: 4, background: 'rgba(124,58,237,0.1)', borderRadius: 2 }
    }))),
    h('div', {
      key: 'clef',
      style: { position: 'absolute', left: 20, fontSize: 260, lineHeight: 1, color: 'rgba(124,58,237,0.12)', fontFamily: 'Bravura', fontWeight: 400 }
    }, '𝄞'),
  ])
}

function topBar() {
  return h('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
  }, [
    h('div', { key: 'brand', style: { display: 'flex', alignItems: 'center', gap: 8 } }, [
      h('div', { key: 'dot', style: { width: 9, height: 9, borderRadius: '50%', background: '#7c3aed' } }),
      h('div', { key: 'name', style: { fontSize: 18, color: '#7c3aed', fontWeight: 700, letterSpacing: 2 } }, 'CHORD SEQUENCE'),
    ]),
    h('div', {
      key: 'url',
      style: { fontSize: 15, color: '#64748b', fontWeight: 500, border: '1px solid #e2e8f0', borderRadius: 20, padding: '5px 16px', background: '#ffffff' }
    }, 'chordsequence.com'),
  ])
}

function createPageElement({ title, tagline, tags }) {
  const titleFontSize = title.length > 32 ? 48 : title.length > 22 ? 56 : 64

  return h('div', {
    style: {
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: '#f8f7ff',
      padding: '44px 64px 48px',
      fontFamily: 'Inter',
      position: 'relative',
    }
  }, [
    staffLines(),
    topBar(),
    h('div', {
      key: 'content',
      style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }
    }, [
      h('div', {
        key: 'title',
        style: { fontSize: titleFontSize, fontWeight: 800, color: '#0f172a', lineHeight: 1.1, marginBottom: 18, letterSpacing: -1 }
      }, title),
      h('div', {
        key: 'tagline',
        style: { fontSize: 24, color: '#475569', fontWeight: 400, lineHeight: 1.45, marginBottom: 36 }
      }, tagline),
      h('div', {
        key: 'tags',
        style: { display: 'flex', gap: 10 }
      }, tags.map((t, i) => h('div', {
        key: i,
        style: {
          background: i === 0 ? 'rgba(124,58,237,0.1)' : '#ffffff',
          color: i === 0 ? '#7c3aed' : '#475569',
          border: i === 0 ? '1.5px solid rgba(124,58,237,0.3)' : '1.5px solid #e2e8f0',
          borderRadius: 20,
          padding: '8px 20px',
          fontSize: 17,
          fontWeight: i === 0 ? 700 : 400,
        }
      }, t))),
    ]),
  ])
}

let ok = 0
let skipped = 0

for (const page of PAGES) {
  const outPath = path.join(outDir, `page-${page.slug}.png`)
  if (fs.existsSync(outPath)) {
    console.log(`[og-pages] already exists: page-${page.slug}.png`)
    skipped++
    continue
  }
  try {
    const element = createPageElement(page)
    const svg = await satori(element, { width: 1200, height: 630, fonts: FONTS })
    const png = new Resvg(svg).render().asPng()
    fs.writeFileSync(outPath, png)
    console.log(`[og-pages] generated page-${page.slug}.png`)
    ok++
  } catch (err) {
    console.warn(`[og-pages] skipped page-${page.slug}: ${err.message}`)
  }
}

console.log(`[og-pages] done — ${ok} generated, ${skipped} skipped`)
