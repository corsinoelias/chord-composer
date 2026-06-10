import React, { useState, useCallback, useRef } from 'react'
import { BassTabFretboard } from './BassTabFretboard'
import { previewNote } from '../../lib/bassTab/bassAudio'
import { type BassSound } from '../../lib/bassTab/types'
import { STRINGS, fretToNoteName } from '../../lib/bassTab/bassTheory'

const SOUNDS: { value: BassSound; label: string; desc: string }[] = [
  { value: 'fender', label: 'Fender', desc: 'Bright pick' },
  { value: 'finger', label: 'Finger', desc: 'Warm & round' },
  { value: 'slap',   label: 'Slap',   desc: 'Funky snap' },
  { value: 'muted',  label: 'Muted',  desc: 'Dry thump' },
]

const NOTE_FULL_NAMES: Record<string, string> = {
  'C':  'C',  'C#': 'C#', 'D':  'D',  'D#': 'D#',
  'E':  'E',  'F':  'F',  'F#': 'F#', 'G':  'G',
  'G#': 'G#', 'A':  'A',  'A#': 'A#', 'B':  'B',
}

function fretToFullNote(si: number, fret: number): string {
  const midiNote = (STRINGS[si]?.midiNote ?? 33) + fret
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(midiNote / 12) - 1
  return `${names[midiNote % 12]}${octave}`
}

interface PlayedNote {
  si: number
  fret: number
  note: string
  fullNote: string
}

export function BassInstrument() {
  const [sound, setSound] = useState<BassSound>('fender')
  const [activeFrets, setActiveFrets] = useState<(number | null)[]>([null, null, null, null])
  const [attackSignals, setAttackSignals] = useState<({ fret: number; v: number } | null)[]>([null, null, null, null])
  const [lastPlayed, setLastPlayed] = useState<PlayedNote | null>(null)
  // Per-string timers — index matches string index (0–3)
  const clearTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([null, null, null, null])

  const handleNoteClick = useCallback((si: number, fret: number) => {
    previewNote(si, fret, sound)

    // Cancel only the timer for THIS string, leave others untouched
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

    setLastPlayed({
      si,
      fret,
      note: fretToNoteName(si, fret),
      fullNote: fretToFullNote(si, fret),
    })

    // Clear the active dot after 1.2s — only this string
    clearTimers.current[si] = setTimeout(() => {
      setActiveFrets(prev => {
        const next = [...prev] as (number | null)[]
        if (next[si] === fret) next[si] = null
        return next
      })
      clearTimers.current[si] = null
    }, 1200)
  }, [sound])

  const string = lastPlayed !== null ? STRINGS[lastPlayed.si] : null

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
      <BassTabFretboard
        activeFrets={activeFrets}
        attackSignals={attackSignals}
        onNoteClick={handleNoteClick}
      />

      {/* Note display */}
      <div className="px-4 py-3 border-t border-border bg-muted/20 min-h-[52px] flex items-center gap-4">
        {lastPlayed && string ? (
          <>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: `${string.color}22`, border: `2px solid ${string.color}`, color: string.color }}
            >
              {lastPlayed.note}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{lastPlayed.fullNote}</span>
              <span className="text-xs text-muted-foreground">
                {string.displayName} string · Fret {lastPlayed.fret}
              </span>
            </div>
            <div className="ml-auto text-right hidden sm:block">
              <span className="text-xs text-muted-foreground">Sound</span>
              <p className="text-xs font-medium text-foreground capitalize">{sound}</p>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Tap a fret above to hear the note</p>
        )}
      </div>

    </div>
  )
}
