import React, { useState, useCallback, useRef, useEffect } from 'react'
import { GuitarFretboard } from './GuitarFretboard'
import { previewNote, prepareSoundfont } from '../../lib/guitarTab/guitarAudio'
import { type GuitarSound } from '../../lib/guitarTab/types'
import { GUITAR_STRINGS, fretToNoteName } from '../../lib/guitarTab/guitarTheory'

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

function fretToFullNote(si: number, fret: number): string {
  const midiNote = (GUITAR_STRINGS[si]?.midiNote ?? 55) + fret
  return fretToNoteName(si, fret) + (Math.floor(midiNote / 12) - 1)
}

interface PlayedNote {
  si: number
  fret: number
  noteName: string
  fullNote: string
}

export function GuitarInstrument() {
  const [sound, setSound] = useState<GuitarSound>('sf2')
  const [activeFrets, setActiveFrets] = useState<(number | null)[]>(Array(6).fill(null))
  const [attackSignals, setAttackSignals] = useState<({ fret: number; v: number } | null)[]>(Array(6).fill(null))
  const [lastPlayed, setLastPlayed] = useState<PlayedNote | null>(null)
  const clearTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>(Array(6).fill(null))

  useEffect(() => {
    prepareSoundfont('sf2').catch(() => {})
  }, [])

  const handleNoteClick = useCallback((si: number, fret: number) => {
    previewNote(si, fret, sound)

    if (clearTimers.current[si] != null) {
      clearTimeout(clearTimers.current[si]!)
      clearTimers.current[si] = null
    }

    setActiveFrets(prev => {
      const next = [...prev] as (number | null)[]
      next[si] = fret
      return next
    })
    setAttackSignals(prev => {
      const next = [...prev] as ({ fret: number; v: number } | null)[]
      next[si] = { fret, v: Date.now() }
      return next
    })

    setLastPlayed({ si, fret, noteName: fretToNoteName(si, fret), fullNote: fretToFullNote(si, fret) })

    clearTimers.current[si] = setTimeout(() => {
      setActiveFrets(prev => {
        const next = [...prev] as (number | null)[]
        if (next[si] === fret) next[si] = null
        return next
      })
      clearTimers.current[si] = null
    }, 1200)
  }, [sound])

  const string = lastPlayed !== null ? GUITAR_STRINGS[lastPlayed.si] : null

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">

      {/* Sound picker */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Sound</span>
        {SOUNDS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSound(s.value)}
            className={[
              'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
              sound === s.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground hover:bg-accent/60 border border-border',
            ].join(' ')}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground hidden sm:block">
          Tap any fret to play
        </span>
      </div>

      {/* Fretboard */}
      <GuitarFretboard
        activeFrets={activeFrets}
        attackSignals={attackSignals}
        onNoteClick={handleNoteClick}
        placementHint={false}
      />

      {/* Note display */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 min-h-[52px] flex items-center gap-4">
        {lastPlayed && string ? (
          <>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: `${string.color}22`, border: `2px solid ${string.color}`, color: string.color }}
            >
              {lastPlayed.noteName}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{lastPlayed.fullNote}</span>
              <span className="text-xs text-muted-foreground">
                {string.displayName} string · Fret {lastPlayed.fret}
              </span>
            </div>
            <div className="ml-auto text-right hidden sm:block">
              <span className="text-xs text-muted-foreground">Sound</span>
              <p className="text-xs font-medium text-foreground">
                {SOUNDS.find(s => s.value === sound)?.label ?? sound}
              </p>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Tap a fret above to hear the note</p>
        )}
      </div>

    </div>
  )
}
