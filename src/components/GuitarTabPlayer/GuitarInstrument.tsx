import React, { useState, useCallback, useRef, useEffect, useMemo, type CSSProperties } from 'react'
import { GuitarNeck, type Vib } from './GuitarNeck'
import { previewNote, prepareSoundfont } from '../../lib/guitarTab/guitarAudio'
import { type GuitarSound } from '../../lib/guitarTab/types'
import { GUITAR_STRINGS, fretToNoteName } from '../../lib/guitarTab/guitarTheory'
import {
  computeNeckGeometry, fretsForWidth, voicingToRows, voicingTopFret,
} from '@/lib/guitar/neckGeometry'
import { getGuitarVoicing, getGuitarVoicings, type GuitarVoicing } from '@/data/guitarChords'
import {
  CHROMATIC_ROOTS, STRUM_CHORD_TYPES, chordLabel, chordNoteNames, makeChord,
} from '@/lib/guitarStrum/strumTheory'
import type { Chord, ChordQuality, RootNote, Accidental } from '@/lib/musicTheory'

const SOUNDS: { value: GuitarSound; label: string }[] = [
  { value: 'sf2',             label: 'Steel ★' },
  { value: 'sf2-nylon',       label: 'Nylon ★' },
  { value: 'sf2-clean',       label: 'Clean ★' },
  { value: 'sf2-jazz',        label: 'Jazz ★' },
  { value: 'sf2-muted',       label: 'Muted ★' },
  { value: 'sf2-distortion',  label: 'Distorted ★' },
  { value: 'sf2-overdrive',   label: 'Overdrive ★' },
  { value: 'sf2-harmonics',   label: 'Harmonics ★' },
  { value: 'synth',           label: 'Synth' },
]

/**
 * Alternate tunings are a per-string semitone offset applied at the audio boundary, not
 * a change to the engine: previewNote() only ever adds `fret` to the string's base MIDI
 * note, so handing it `fret + offset` gives the retuned pitch for free. That keeps
 * GUITAR_STRINGS — read from 21 places across the tab editor — untouched.
 *
 * Offsets are in this file's row order: index 0 = high e, index 5 = low E.
 */
const TUNINGS = [
  { id: 'standard', label: 'Standard', offsets: [0, 0, 0, 0, 0, 0],    labels: ['e', 'B', 'G', 'D', 'A', 'E'] },
  { id: 'drop-d',   label: 'Drop D',   offsets: [0, 0, 0, 0, 0, -2],   labels: ['e', 'B', 'G', 'D', 'A', 'D'] },
  { id: 'open-g',   label: 'Open G',   offsets: [-2, 0, 0, 0, -2, -2], labels: ['D', 'B', 'G', 'D', 'G', 'D'] },
  { id: 'dadgad',   label: 'DADGAD',   offsets: [-2, -2, 0, 0, 0, -2], labels: ['D', 'A', 'G', 'D', 'A', 'D'] },
]

const SUSTAIN: { label: string; secs: number }[] = [
  { label: 'Short', secs: 0.7 },
  { label: 'Medium', secs: 1.5 },
  { label: 'Long', secs: 2.6 },
]

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Milliseconds between strings in a strum — a pick crossing six strings, not a chord stab. */
const STRUM_SPREAD_MS = 26
/** Gap between marked notes on playback. The piano uses 450ms; a guitar reads quicker. */
const MARK_STEP_MS = 420

const OPEN_ROWS = [0, 0, 0, 0, 0, 0]

/**
 * Computer keyboard, mapped by physical key position (e.code) so it survives non-QWERTY
 * layouts: each keyboard row is a string and the columns are frets 0-9, which puts the
 * neck under the hand the same way round it appears on screen. Four rows only reach four
 * strings, so Shift slides the whole map down two — the bass strings are the ones a hand
 * reaches for last.
 */
const KEY_ROWS: string[][] = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
]
const KEY_LOOKUP = new Map<string, { kbRow: number; fret: number }>()
KEY_ROWS.forEach((codes, kbRow) => codes.forEach((code, fret) => KEY_LOOKUP.set(code, { kbRow, fret })))

interface PlayedNote {
  row: number
  fret: number
  noteName: string
  fullNote: string
}

/** Segmented control, matching the one on /tools/guitar-strumming-patterns/. */
function segStyle(on: boolean): CSSProperties {
  return {
    border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
    background: on ? '#fff' : 'transparent',
    color: on ? 'hsl(262 83% 52%)' : 'hsl(220 10% 42%)',
    boxShadow: on ? '0 1px 3px hsl(220 20% 10% / 0.12)' : 'none',
  }
}
const SEG_GROUP: CSSProperties = {
  display: 'flex', background: 'hsl(220 14% 92%)', borderRadius: 8, padding: 3, gap: 3, flexShrink: 0,
}

const CTRL = 'h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground shrink-0'

export function GuitarInstrument() {
  const [sound, setSound] = useState<GuitarSound>('sf2')
  const [loadingSound, setLoadingSound] = useState(false)
  const [chord, setChord] = useState<Chord | null>(null)
  const [voicingIdx, setVoicingIdx] = useState(0)
  const [labelMode, setLabelMode] = useState<'notes' | 'frets'>('notes')
  const [activeRows, setActiveRows] = useState<(number | null)[]>(Array(6).fill(null))
  const [lastPlayed, setLastPlayed] = useState<PlayedNote | null>(null)
  const [size, setSize] = useState({ w: 900, h: 320 })

  const [markMode, setMarkMode] = useState(false)
  const [marks, setMarks] = useState<string[]>([])
  const [highlight, setHighlight] = useState<number | null>(null)
  const [capo, setCapo] = useState(0)
  const [tuningId, setTuningId] = useState('standard')
  const [sustainIdx, setSustainIdx] = useState(1)
  const [lefty, setLefty] = useState(false)
  const [isFs, setIsFs] = useState(false)
  const [fauxFs, setFauxFs] = useState(false)

  const fbRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const clearTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>(Array(6).fill(null))
  const seqTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const vibRef = useRef<Vib[]>(Array.from({ length: 6 }, () => ({ amp: 0, t0: -99, freq: 18 })))

  const tuning = TUNINGS.find(t => t.id === tuningId) ?? TUNINGS[0]
  const isStandard = tuning.id === 'standard'

  useEffect(() => {
    prepareSoundfont('sf2').catch(() => {})
  }, [])

  // The panel drives the neck's fret count, so the cells never get narrower than a
  // thumb. ResizeObserver rather than a resize listener: full screen and an orientation
  // change both resize the element without always firing window resize first.
  useEffect(() => {
    const el = fbRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r) setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => () => {
    clearTimers.current.forEach(t => t && clearTimeout(t))
    seqTimers.current.forEach(t => clearTimeout(t))
  }, [])

  // Marks live in the hash, not a query string: it survives copying the address bar, and
  // it never reaches the server, so it cannot spawn indexable URL variants of a page
  // whose canonical we care about.
  useEffect(() => {
    const m = (location.hash.match(/n=([\d,-]+)/) || [])[1]
    if (!m) return
    const parsed = m.split(',').filter(x => /^[0-5]-\d{1,2}$/.test(x))
    if (parsed.length) setMarks(parsed)
  }, [])

  const syncHash = useCallback((next: string[]) => {
    const base = location.pathname + location.search
    history.replaceState(null, '', next.length ? `${base}#n=${next.join(',')}` : base)
  }, [])

  // Every curated shape for the chord, easiest first, falling back to the single
  // algorithmic one for qualities the database has no entry for.
  const voicings: GuitarVoicing[] = useMemo(() => {
    if (!chord) return []
    const curated = getGuitarVoicings(chord)
    if (curated.length) return curated
    const single = getGuitarVoicing(chord)
    return single ? [single] : []
  }, [chord])

  const voicing = voicings[voicingIdx] ?? null
  const shapeRows = useMemo(() => (voicing ? voicingToRows(voicing) : OPEN_ROWS), [voicing])

  const geo = useMemo(() => {
    const base = fretsForWidth(size.w)
    // Widen the window rather than clip a barre chord sitting above it. The open
    // column always stays on screen: an open string is a note you can play.
    const needed = voicing ? voicingTopFret(voicing) + 1 : 0
    return computeNeckGeometry(size.w, size.h, {
      fretFrom: 0,
      fretTo: Math.min(15, Math.max(base, needed)),
      stringLabels: tuning.labels,
    })
  }, [size.w, size.h, voicing, tuning])

  /** The fret to hand the audio engine: the drawn fret, shifted by the tuning. */
  const soundingFret = useCallback((row: number, fret: number) => fret + tuning.offsets[row], [tuning])
  const noteAt = useCallback(
    (row: number, fret: number) => fretToNoteName(row, soundingFret(row, fret) + capo),
    [soundingFret, capo],
  )

  const play = useCallback((row: number, fret: number) => {
    if (fret < 0) return
    previewNote(row, soundingFret(row, fret), sound, capo, SUSTAIN[sustainIdx].secs)

    vibRef.current[row] = {
      amp: 6 + row * 1.2,
      t0: performance.now() / 1000,
      freq: 13 + (5 - row) * 2.2,
    }

    if (clearTimers.current[row] != null) {
      clearTimeout(clearTimers.current[row]!)
      clearTimers.current[row] = null
    }
    setActiveRows(prev => {
      const next = [...prev]
      next[row] = fret
      return next
    })
    const midi = (GUITAR_STRINGS[row]?.midiNote ?? 55) + soundingFret(row, fret) + capo
    setLastPlayed({
      row,
      fret,
      noteName: noteAt(row, fret),
      fullNote: noteAt(row, fret) + (Math.floor(midi / 12) - 1),
    })

    clearTimers.current[row] = setTimeout(() => {
      setActiveRows(prev => {
        const next = [...prev]
        if (next[row] === fret) next[row] = null
        return next
      })
      clearTimers.current[row] = null
    }, 1100)
  }, [sound, capo, sustainIdx, soundingFret, noteAt])

  const playRef = useRef(play)
  playRef.current = play

  const clearSeq = () => {
    seqTimers.current.forEach(t => clearTimeout(t))
    seqTimers.current = []
  }

  /** Strum every string that is not muted. With no chord picked, that is all six open —
   *  which is what a guitar does when you sweep it without fretting anything. */
  const strum = useCallback((dir: 'down' | 'up') => {
    clearSeq()
    const rows = dir === 'down' ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5]
    let k = 0
    for (const row of rows) {
      const fret = shapeRows[row]
      if (fret < 0) continue
      seqTimers.current.push(setTimeout(() => playRef.current(row, fret), k * STRUM_SPREAD_MS))
      k++
    }
  }, [shapeRows])

  const playMarks = useCallback((list: string[]) => {
    clearSeq()
    list.forEach((m, i) => {
      const [row, fret] = m.split('-').map(Number)
      seqTimers.current.push(setTimeout(() => playRef.current(row, fret), i * MARK_STEP_MS))
    })
  }, [])

  /** One button, one rule: play what is marked, and if nothing is marked, play the
   *  strings. Bound to the space bar too, the way the piano binds it. */
  const primaryPlay = useCallback(() => {
    if (marks.length) playMarks(marks)
    else strum('down')
  }, [marks, playMarks, strum])

  const toggleMark = useCallback((row: number, fret: number) => {
    const key = `${row}-${fret}`
    setMarks(prev => {
      const next = prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
      syncHash(next)
      return next
    })
  }, [syncHash])

  const handleNeckPlay = useCallback((row: number, fret: number) => {
    if (markMode) toggleMark(row, fret)
    play(row, fret)
  }, [markMode, toggleMark, play])

  // ---- computer keyboard ----
  const live = useRef({ primaryPlay, strum, play, markMode, toggleMark, fauxFs })
  live.current = { primaryPlay, strum, play, markMode, toggleMark, fauxFs }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      // The panel is full of selects and buttons; typing into one of them is not playing.
      if (t && /INPUT|SELECT|TEXTAREA/.test(t.tagName)) return

      if (e.code === 'Escape' && live.current.fauxFs) { setFauxFs(false); return }
      if (e.code === 'Space') { e.preventDefault(); live.current.primaryPlay(); return }
      if (e.code === 'ArrowDown') { e.preventDefault(); live.current.strum('down'); return }
      if (e.code === 'ArrowUp') { e.preventDefault(); live.current.strum('up'); return }

      const hit = KEY_LOOKUP.get(e.code)
      if (!hit) return
      e.preventDefault()
      const row = hit.kbRow + (e.shiftKey ? 2 : 0)
      if (row > 5) return
      if (live.current.markMode) live.current.toggleMark(row, hit.fret)
      live.current.play(row, hit.fret)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- full screen ----
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (fauxFs) { setFauxFs(false); return }
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return }
    // iOS Safari has no Element.requestFullscreen, so cover the viewport ourselves
    // rather than leave the button dead on half the phones that will press it.
    const el = stageRef.current
    const p = el?.requestFullscreen ? el.requestFullscreen() : Promise.reject()
    Promise.resolve(p).catch(() => setFauxFs(true))
  }, [fauxFs])

  const immersive = isFs || fauxFs

  const highlightRows = useMemo(() => {
    const out: number[][] = [[], [], [], [], [], []]
    if (highlight === null) return out
    for (let row = 0; row < 6; row++) {
      for (let fret = geo.fretFrom; fret <= geo.fretTo; fret++) {
        if (NOTE_NAMES.indexOf(noteAt(row, fret)) === highlight) out[row].push(fret)
      }
    }
    return out
  }, [highlight, geo.fretFrom, geo.fretTo, noteAt])

  const markRows = useMemo(() => {
    const out: number[][] = [[], [], [], [], [], []]
    for (const m of marks) {
      const [row, fret] = m.split('-').map(Number)
      if (row >= 0 && row < 6) out[row].push(fret)
    }
    return out
  }, [marks])

  const pickSound = useCallback((value: GuitarSound) => {
    setSound(value)
    if (value === 'synth') return
    setLoadingSound(true)
    prepareSoundfont(value).catch(() => {}).finally(() => setLoadingSound(false))
  }, [])

  const setChordFrom = useCallback((root: RootNote, accidental: Accidental, quality: ChordQuality) => {
    setChord(makeChord(root, accidental, quality))
    setVoicingIdx(0)
  }, [])

  const rootIdx = chord
    ? CHROMATIC_ROOTS.findIndex(r => r.root === chord.root && r.accidental === chord.accidental)
    : -1
  const quality: ChordQuality = chord?.quality ?? 'maj'
  const string = lastPlayed !== null ? GUITAR_STRINGS[lastPlayed.row] : null

  return (
    <div
      ref={stageRef}
      className={`rounded-2xl border border-border bg-card overflow-hidden${immersive ? ' cs-guitar--fs' : ''}`}
      style={fauxFs ? { position: 'fixed', inset: 0, zIndex: 1000, borderRadius: 0 } : undefined}
    >
      <style>{`
        /* Only in full screen. The panel then covers the viewport, so swallowing the
           gesture is right — there is nothing left to scroll to. Outside full screen the
           page below the guitar has to stay reachable, which is exactly the bug that made
           /piano/ unscrollable on a phone. */
        .cs-guitar--fs { touch-action: none; display: flex; flex-direction: column; }
        .cs-guitar--fs .cs-guitar-neck { flex: 1 1 auto; height: auto !important; }
        @media (hover: none) and (pointer: coarse) { .cs-guitar-keyhint { display: none; } }
      `}</style>

      {/* ---- Chord row ---- */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-muted/30 flex-wrap">
        <span className="hidden sm:inline text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chord</span>

        <select
          aria-label="Chord root"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground disabled:opacity-40"
          value={rootIdx}
          disabled={!isStandard}
          onChange={e => {
            const i = Number(e.target.value)
            if (i < 0) { setChord(null); return }
            setChordFrom(CHROMATIC_ROOTS[i].root, CHROMATIC_ROOTS[i].accidental, quality)
          }}
        >
          <option value={-1}>None</option>
          {CHROMATIC_ROOTS.map((r, i) => (
            <option key={i} value={i}>{r.root}{r.accidental}</option>
          ))}
        </select>

        <select
          aria-label="Chord type"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground disabled:opacity-40"
          value={quality}
          disabled={!chord || !isStandard}
          onChange={e => {
            if (!chord) return
            setChordFrom(chord.root, chord.accidental, e.target.value as ChordQuality)
          }}
        >
          {STRUM_CHORD_TYPES.map(t => (
            <option key={t.quality} value={t.quality}>{t.label}</option>
          ))}
        </select>

        {voicings.length > 1 && isStandard && (
          <button
            type="button"
            onClick={() => setVoicingIdx(i => (i + 1) % voicings.length)}
            className="h-9 px-3 rounded-md border border-border bg-background text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
            title="Try the next shape for this chord"
          >
            Shape {voicingIdx + 1}/{voicings.length}
          </button>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={primaryPlay}
            className="h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            title={marks.length ? 'Play the marked notes (space bar)' : 'Strum down (space bar)'}
          >
            {marks.length ? `▸ Play ${marks.length}` : '↓ Strum'}
          </button>
          <button
            type="button"
            onClick={() => strum('up')}
            className="h-9 w-9 rounded-md border border-border bg-background text-sm font-semibold text-foreground hover:border-primary/50 transition-colors"
            title="Strum up"
            aria-label="Strum up"
          >
            ↑
          </button>
        </div>
      </div>

      {/* ---- Sound row ----
          Nine buttons wrap to three lines on a 390px screen, which pushes the neck out of
          the first view. On a phone the row scrolls sideways in its own container
          instead; from sm up there is room to wrap. */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-muted/30 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1 shrink-0">Sound</span>
        {SOUNDS.map(s => (
          <button
            key={s.value}
            onClick={() => pickSound(s.value)}
            className={[
              'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors shrink-0',
              sound === s.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-border',
            ].join(' ')}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ---- Tools row ---- */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-border bg-muted/20 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible">
        <button
          type="button"
          onClick={() => setMarkMode(v => !v)}
          className={`h-8 px-3 rounded-md text-xs font-semibold shrink-0 transition-colors ${
            markMode
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-background text-foreground hover:border-primary/50'
          }`}
          title="Tap frets to mark them, then press Play"
        >
          Mark
        </button>
        {marks.length > 0 && (
          <button
            type="button"
            onClick={() => { setMarks([]); syncHash([]) }}
            className="h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
          >
            Clear {marks.length}
          </button>
        )}

        <select
          aria-label="Highlight a note across the neck"
          className={CTRL}
          value={highlight === null ? '' : highlight}
          onChange={e => setHighlight(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">Highlight none</option>
          {NOTE_NAMES.map((n, i) => (
            <option key={n} value={i}>Every {n}</option>
          ))}
        </select>

        <select aria-label="Capo" className={CTRL} value={capo} onChange={e => setCapo(Number(e.target.value))}>
          <option value={0}>No capo</option>
          {[1, 2, 3, 4, 5, 6, 7].map(f => <option key={f} value={f}>Capo {f}</option>)}
        </select>

        <select
          aria-label="Tuning"
          className={CTRL}
          value={tuningId}
          onChange={e => { setTuningId(e.target.value); if (e.target.value !== 'standard') setChord(null) }}
        >
          {TUNINGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <div style={SEG_GROUP}>
          {SUSTAIN.map((s, i) => (
            <button key={s.label} type="button" style={segStyle(sustainIdx === i)} onClick={() => setSustainIdx(i)}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={SEG_GROUP}>
          <button type="button" style={segStyle(labelMode === 'notes')} onClick={() => setLabelMode('notes')}>Notes</button>
          <button type="button" style={segStyle(labelMode === 'frets')} onClick={() => setLabelMode('frets')}>Frets</button>
        </div>

        <button
          type="button"
          onClick={() => setLefty(v => !v)}
          className={`h-8 px-3 rounded-md text-xs font-semibold shrink-0 transition-colors ${
            lefty
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-background text-foreground hover:border-primary/50'
          }`}
          title="Mirror the neck for a left-handed player"
        >
          Lefty
        </button>

        <button type="button" onClick={toggleFullscreen} className={`${CTRL} hover:border-primary/50 transition-colors`}>
          {immersive ? 'Exit full screen' : 'Full screen'}
        </button>

        <a href="/tuner/" className={`${CTRL} inline-flex items-center hover:border-primary/50 transition-colors`}>
          Tuner
        </a>
      </div>

      {!isStandard && (
        <p className="px-4 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/10">
          Chord shapes are written for standard tuning, so they sit out while you are in {tuning.label}.
        </p>
      )}

      {/* ---- Neck ---- */}
      <div className="cs-guitar-neck" style={{ height: 'clamp(230px, 42dvh, 380px)', display: 'flex' }}>
        <GuitarNeck
          geo={geo}
          fbRef={fbRef}
          shapeRows={shapeRows}
          hasShape={voicing !== null && isStandard}
          activeRows={activeRows}
          highlightRows={highlightRows}
          markRows={markRows}
          vibRef={vibRef}
          labelMode={labelMode}
          lefty={lefty}
          onPlay={handleNeckPlay}
        />
      </div>

      {/* The hint used to sit inside the neck. On a phone it wrapped to two lines straight
          across the strings, so it lives in its own band instead — where it can never
          cover the thing it is describing. */}
      <div className="px-4 py-1.5 border-t border-border bg-muted/40 text-center">
        <span className="text-[11px] text-muted-foreground">
          {markMode
            ? 'Tap frets to mark them · press Play or the space bar to hear them back'
            : 'Drag across the strings to strum · tap a fret for one note'}
        </span>
        <span className="cs-guitar-keyhint hidden sm:inline text-[11px] text-muted-foreground">
          {' · '}your keyboard rows are the strings — hold Shift for the bass two
        </span>
      </div>

      {/* ---- Readout ---- */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 min-h-[52px] flex items-center gap-4">
        {chord && isStandard && (
          <div className="flex flex-col shrink-0">
            <span className="text-sm font-bold text-foreground">{chordLabel(chord)}</span>
            <span className="text-xs text-muted-foreground">{chordNoteNames(chord)}</span>
          </div>
        )}
        {lastPlayed && string ? (
          <>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: `${string.color}22`, border: `2px solid ${string.color}`, color: string.color }}
            >
              {lastPlayed.noteName}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{lastPlayed.fullNote}</span>
              <span className="text-xs text-muted-foreground">
                {tuning.labels[lastPlayed.row]} string · {lastPlayed.fret === 0 ? 'open' : `fret ${lastPlayed.fret}`}
                {capo > 0 ? ` · capo ${capo}` : ''}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {chord && isStandard ? 'Press Play, or drag across the strings' : 'Tap a fret to hear it, or pick a chord above'}
          </p>
        )}
        <div className="ml-auto text-right hidden sm:block">
          <span className="text-xs text-muted-foreground">Sound</span>
          <p className="text-xs font-medium text-foreground">
            {loadingSound ? 'Loading…' : SOUNDS.find(s => s.value === sound)?.label ?? sound}
          </p>
        </div>
      </div>

    </div>
  )
}
