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

/** Milliseconds between strings in a strum — a pick crossing six strings, not a chord stab. */
const STRUM_SPREAD_MS = 26

const OPEN_ROWS = [0, 0, 0, 0, 0, 0]

function fretToFullNote(row: number, fret: number): string {
  const midiNote = (GUITAR_STRINGS[row]?.midiNote ?? 55) + fret
  return fretToNoteName(row, fret) + (Math.floor(midiNote / 12) - 1)
}

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
  display: 'flex', background: 'hsl(220 14% 92%)', borderRadius: 8, padding: 3, gap: 3,
}

export function GuitarInstrument() {
  const [sound, setSound] = useState<GuitarSound>('sf2')
  const [loadingSound, setLoadingSound] = useState(false)
  const [chord, setChord] = useState<Chord | null>(null)
  const [voicingIdx, setVoicingIdx] = useState(0)
  const [labelMode, setLabelMode] = useState<'notes' | 'frets'>('notes')
  const [activeRows, setActiveRows] = useState<(number | null)[]>(Array(6).fill(null))
  const [lastPlayed, setLastPlayed] = useState<PlayedNote | null>(null)
  const [size, setSize] = useState({ w: 900, h: 320 })

  const fbRef = useRef<HTMLDivElement>(null)
  const clearTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>(Array(6).fill(null))
  const strumTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const vibRef = useRef<Vib[]>(
    Array.from({ length: 6 }, () => ({ amp: 0, t0: -99, freq: 18 })),
  )

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
    strumTimers.current.forEach(t => clearTimeout(t))
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
  const shapeRows = useMemo(
    () => (voicing ? voicingToRows(voicing) : OPEN_ROWS),
    [voicing],
  )

  const geo = useMemo(() => {
    const base = fretsForWidth(size.w)
    // Widen the window rather than clip a barre chord sitting above it. The open
    // column always stays on screen: an open string is a note you can play.
    const needed = voicing ? voicingTopFret(voicing) + 1 : 0
    return computeNeckGeometry(size.w, size.h, { fretFrom: 0, fretTo: Math.min(15, Math.max(base, needed)) })
  }, [size.w, size.h, voicing])

  const play = useCallback((row: number, fret: number) => {
    if (fret < 0) return
    previewNote(row, fret, sound)

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
    setLastPlayed({ row, fret, noteName: fretToNoteName(row, fret), fullNote: fretToFullNote(row, fret) })

    clearTimers.current[row] = setTimeout(() => {
      setActiveRows(prev => {
        const next = [...prev]
        if (next[row] === fret) next[row] = null
        return next
      })
      clearTimers.current[row] = null
    }, 1100)
  }, [sound])

  /** Strum every string that is not muted. With no chord picked, that is all six open —
   *  which is what a guitar does when you sweep it without fretting anything. */
  const strum = useCallback((dir: 'down' | 'up') => {
    strumTimers.current.forEach(t => clearTimeout(t))
    strumTimers.current = []
    const rows = dir === 'down' ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5]
    let k = 0
    for (const row of rows) {
      const fret = shapeRows[row]
      if (fret < 0) continue
      strumTimers.current.push(setTimeout(() => play(row, fret), k * STRUM_SPREAD_MS))
      k++
    }
  }, [shapeRows, play])

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
    <div className="rounded-2xl border border-border bg-card overflow-hidden">

      {/* ---- Chord row ---- */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-muted/30 flex-wrap">
        <span className="hidden sm:inline text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chord</span>

        <select
          aria-label="Chord root"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm font-semibold text-foreground"
          value={rootIdx}
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
          disabled={!chord}
          onChange={e => {
            if (!chord) return
            setChordFrom(chord.root, chord.accidental, e.target.value as ChordQuality)
          }}
        >
          {STRUM_CHORD_TYPES.map(t => (
            <option key={t.quality} value={t.quality}>{t.label}</option>
          ))}
        </select>

        {voicings.length > 1 && (
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
            onClick={() => strum('down')}
            className="h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            title="Strum down"
          >
            ↓ Strum
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
          Nine buttons wrap to three lines on a 390px screen, which pushes the neck out
          of the first view — the exact problem the hero was just trimmed to fix. On a
          phone the row scrolls sideways in its own container instead; from sm up there
          is room to wrap. */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-muted/30 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Sound</span>
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

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <div style={SEG_GROUP}>
            <button type="button" style={segStyle(labelMode === 'notes')} onClick={() => setLabelMode('notes')}>Notes</button>
            <button type="button" style={segStyle(labelMode === 'frets')} onClick={() => setLabelMode('frets')}>Frets</button>
          </div>
          <a
            href="/tuner/"
            className="h-8 inline-flex items-center px-3 rounded-md border border-border bg-background text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
          >
            Tuner
          </a>
        </div>
      </div>

      {/* ---- Neck ---- */}
      <div style={{ height: 'clamp(230px, 42dvh, 380px)', display: 'flex' }}>
        <GuitarNeck
          geo={geo}
          fbRef={fbRef}
          shapeRows={shapeRows}
          hasShape={voicing !== null}
          activeRows={activeRows}
          highlightRows={[[], [], [], [], [], []]}
          vibRef={vibRef}
          labelMode={labelMode}
          onPlay={play}
        />
      </div>

      {/* The hint used to sit inside the neck. On a phone it wrapped to two lines
          straight across the strings, so it lives in its own band instead — where it
          can never cover the thing it is describing. */}
      <div className="px-4 py-1.5 border-t border-border bg-muted/40 text-center">
        <span className="text-[11px] text-muted-foreground">
          Drag across the strings to strum · tap a fret for one note
        </span>
      </div>

      {/* ---- Readout ---- */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 min-h-[52px] flex items-center gap-4">
        {chord && (
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
                {string.displayName} string · {lastPlayed.fret === 0 ? 'open' : `fret ${lastPlayed.fret}`}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {chord ? 'Press Strum, or drag across the strings' : 'Tap a fret to hear it, or pick a chord above'}
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
