import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { DrumKitId, DrumPieceId } from '../../lib/virtualDrums/drumSynth'
import type { BeatPattern } from './VirtualDrums'

const STEPS = 16
const MIN_BPM = 60
const MAX_BPM = 200
const DEFAULT_BPM = 100
const DEFAULT_NAME = 'My Beat'

// Subset of the kit's pieces exposed as editable rows — one representative
// sound per family (e.g. crash-edge for crash, ride-body for ride) instead of
// every zone, so the grid stays a reasonable size to build a beat in.
const ROWS: { id: DrumPieceId; label: string; shortLabel: string; defaultVel: number }[] = [
  { id: 'kick', label: 'Kick', shortLabel: 'Kick', defaultVel: 1 },
  { id: 'snare', label: 'Snare', shortLabel: 'Snare', defaultVel: 0.95 },
  { id: 'stick', label: 'Cross stick', shortLabel: 'X-stick', defaultVel: 0.85 },
  { id: 'hh-closed', label: 'Hi-hat closed', shortLabel: 'HH cl.', defaultVel: 0.6 },
  { id: 'hh-open', label: 'Hi-hat open', shortLabel: 'HH op.', defaultVel: 0.6 },
  { id: 'tom-hi', label: 'High tom', shortLabel: 'Tom hi', defaultVel: 0.9 },
  { id: 'tom-lo', label: 'Low tom', shortLabel: 'Tom lo', defaultVel: 0.9 },
  { id: 'tom-floor', label: 'Floor tom', shortLabel: 'Floor', defaultVel: 0.9 },
  { id: 'crash-edge', label: 'Crash', shortLabel: 'Crash', defaultVel: 0.95 },
  { id: 'ride-body', label: 'Ride', shortLabel: 'Ride', defaultVel: 0.8 },
]

function blankGrid(): boolean[][] {
  return ROWS.map(() => Array(STEPS).fill(false))
}

// Per-row odds that a given 16th-note step gets a hit when randomizing. Kick and
// snare are biased toward the strong beats (steps 0/4/8/12, backbeat on 4 & 12) so
// a random roll still reads as a beat instead of noise; hi-hat stays dense and even;
// everything else stays sparse.
function stepDensity(id: DrumPieceId, step: number): number {
  const onBeat = step % 4 === 0
  switch (id) {
    case 'kick': return onBeat ? 0.55 : 0.1
    case 'snare': return (step === 4 || step === 12) ? 0.85 : 0.06
    case 'stick': return 0.1
    case 'hh-closed': return step % 2 === 0 ? 0.65 : 0.4
    case 'hh-open': return 0.08
    case 'tom-hi': case 'tom-lo': case 'tom-floor': return 0.06
    case 'crash-edge': return step === 0 ? 0.25 : 0.02
    case 'ride-body': return 0.15
    default: return 0.1
  }
}

function randomGrid(): boolean[][] {
  return ROWS.map(row => Array.from({ length: STEPS }, (_, step) => Math.random() < stepDensity(row.id, step)))
}

function defaultVols(): number[] {
  return ROWS.map(r => r.defaultVel)
}

// A pattern built by this editor is always 1 bar (4 beats) at sixteenth-note
// resolution, so grid<->ev conversion is a fixed step = t*4 mapping.
function patternToGrid(pattern: BeatPattern): { grid: boolean[][]; vols: number[] } {
  const grid = blankGrid()
  const vols = defaultVols()
  pattern.ev.forEach(ev => {
    const rowIdx = ROWS.findIndex(r => r.id === ev.id)
    const step = Math.round(ev.t * 4)
    if (rowIdx === -1 || step < 0 || step >= STEPS) return
    grid[rowIdx][step] = true
    vols[rowIdx] = ev.v
  })
  return { grid, vols }
}

function gridToPattern(name: string, bpm: number, grid: boolean[][], vols: number[]): BeatPattern {
  const ev: BeatPattern['ev'] = []
  grid.forEach((row, rowIdx) => {
    row.forEach((on, step) => {
      if (on) ev.push({ t: step / 4, id: ROWS[rowIdx].id, v: vols[rowIdx] })
    })
  })
  return { name: name.trim() || DEFAULT_NAME, bpm, beats: 4, ev }
}

interface BeatEditorProps {
  open: boolean
  onClose: () => void
  initialPattern: BeatPattern | null
  // `resume` tells the caller whether anything was audibly playing right before
  // Save (the main kit beat, synced, or this editor's own draft preview) — either
  // way the caller should keep the (now updated) beat going; otherwise stay stopped.
  onSave: (pattern: BeatPattern, resume: boolean) => void
  trigger: (id: DrumPieceId, vel: number) => void
  kit: DrumKitId
  onKitChange: (kit: DrumKitId) => void
  // Whether the main kit's beat loop is currently running underneath the editor.
  mainPlaying: boolean
  // Current 0-15 step of the main beat loop (or -1). Polled while synced instead
  // of running a second scheduler, so only one thing is ever driving the audio.
  getMainStep: () => number
  onStopMain: () => void
}

export function BeatEditor({
  open, onClose, initialPattern, onSave, trigger, kit, onKitChange,
  mainPlaying, getMainStep, onStopMain,
}: BeatEditorProps) {
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  const [name, setName] = useState(DEFAULT_NAME)
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [grid, setGrid] = useState<boolean[][]>(blankGrid)
  const [vols, setVols] = useState<number[]>(defaultVols)
  const [playing, setPlaying] = useState(false) // this editor's own draft preview
  const [localStep, setLocalStep] = useState(-1)
  const [syncedStep, setSyncedStep] = useState(-1)
  const [page, setPage] = useState(0)

  const gridRef = useRef(grid); gridRef.current = grid
  const volsRef = useRef(vols); volsRef.current = vols
  const bpmRef = useRef(bpm); bpmRef.current = bpm
  const stepTimerRef = useRef<number | null>(null)
  const syncRafRef = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = () => setIsNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // (Re)initialize the draft whenever the editor opens — from the currently
  // selected beat (built-in or custom) if there is one, otherwise a blank grid.
  useEffect(() => {
    if (!open) return
    if (initialPattern) {
      const { grid: g, vols: v } = patternToGrid(initialPattern)
      setName(initialPattern.name)
      setBpm(initialPattern.bpm)
      setGrid(g)
      setVols(v)
    } else {
      setName(DEFAULT_NAME)
      setBpm(DEFAULT_BPM)
      setGrid(blankGrid())
      setVols(defaultVols())
    }
    setPage(0)
  }, [open, initialPattern])

  const stopPreview = useCallback(() => {
    if (stepTimerRef.current != null) {
      clearTimeout(stepTimerRef.current)
      stepTimerRef.current = null
    }
    setPlaying(false)
    setLocalStep(-1)
  }, [])

  const startPreview = useCallback(() => {
    if (mainPlaying) onStopMain()
    stopPreview()
    setPlaying(true)
    let step = 0
    const loop = () => {
      setLocalStep(step)
      gridRef.current.forEach((row, i) => {
        if (row[step]) trigger(ROWS[i].id, volsRef.current[i])
      })
      step = (step + 1) % STEPS
      stepTimerRef.current = window.setTimeout(loop, 60000 / bpmRef.current / 4)
    }
    loop()
  }, [mainPlaying, onStopMain, stopPreview, trigger])

  // Synced = the main kit beat is already running and we haven't started our own
  // draft preview over it. Only one of the two ever drives sound at a time.
  const isSyncedWithMain = mainPlaying && !playing
  const isPlayingAny = playing || mainPlaying
  const displayStep = playing ? localStep : (isSyncedWithMain ? syncedStep : -1)

  const togglePlayback = useCallback(() => {
    if (playing) { stopPreview(); return }
    if (mainPlaying) { onStopMain(); return }
    startPreview()
  }, [playing, mainPlaying, onStopMain, startPreview, stopPreview])

  // While synced, poll the main loop's playhead each frame so the grid's step
  // highlight tracks what's actually playing — no second scheduler is started.
  useEffect(() => {
    if (!open || !isSyncedWithMain) {
      if (syncRafRef.current != null) { cancelAnimationFrame(syncRafRef.current); syncRafRef.current = null }
      return
    }
    const poll = () => {
      setSyncedStep(getMainStep())
      syncRafRef.current = requestAnimationFrame(poll)
    }
    syncRafRef.current = requestAnimationFrame(poll)
    return () => {
      if (syncRafRef.current != null) { cancelAnimationFrame(syncRafRef.current); syncRafRef.current = null }
    }
  }, [open, isSyncedWithMain, getMainStep])

  // Stop only this editor's own draft preview when the panel closes (or unmounts)
  // — the main kit beat is never touched here, so it keeps playing if it already was.
  useEffect(() => {
    if (!open) stopPreview()
  }, [open, stopPreview])
  useEffect(() => () => stopPreview(), [stopPreview])

  const toggleCell = (rowIdx: number, step: number) => {
    setGrid(prev => {
      const next = prev.map(row => row.slice())
      next[rowIdx][step] = !next[rowIdx][step]
      if (next[rowIdx][step]) trigger(ROWS[rowIdx].id, volsRef.current[rowIdx])
      return next
    })
  }

  const setVol = (rowIdx: number, v: number) => {
    setVols(prev => {
      const next = prev.slice()
      next[rowIdx] = v
      return next
    })
  }

  const handleClear = () => setGrid(blankGrid())
  const handleRandomize = () => setGrid(randomGrid())

  const handleClose = () => {
    stopPreview()
    onClose()
  }

  const handleSave = () => {
    const resume = isPlayingAny
    stopPreview()
    onSave(gridToPattern(name, bpm, grid, vols), resume)
  }

  // Paging: half a bar (8 steps) per page on phones — keeps pads finger-sized
  // without a horizontal scrollbar; a full bar at once on wider screens.
  const pageSize = isNarrow ? 8 : STEPS
  const totalPages = Math.max(1, Math.ceil(STEPS / pageSize))
  const viewPage = Math.min(page, totalPages - 1)
  const pageStart = viewPage * pageSize
  const visibleSteps = Array.from({ length: Math.min(pageSize, STEPS - pageStart) }, (_, i) => pageStart + i)

  // Follow the playhead across pages while something is audibly playing.
  useEffect(() => {
    if (displayStep < 0) return
    const p = Math.floor(displayStep / pageSize)
    setPage(prev => (prev !== p ? p : prev))
  }, [displayStep, pageSize])

  if (!open) return null

  const playStopBtn = (
    <button
      onClick={togglePlayback}
      style={{
        padding: isNarrow ? '11px 18px' : '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: 700, background: isPlayingAny ? '#1d1830' : '#7442d6', color: '#ffffff',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {isPlayingAny ? '■ Stop' : '▶ Preview'}
    </button>
  )

  return (
    <div
      onClick={handleClose}
      style={{ position: 'absolute', inset: 0, background: 'rgba(5,6,10,0.66)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: isNarrow ? 'stretch' : 'center', justifyContent: 'center', zIndex: 50 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff',
          border: isNarrow ? 'none' : '1px solid #e6e1f2',
          borderRadius: isNarrow ? 0 : 16,
          padding: isNarrow ? '14px 12px 0' : '22px 24px',
          width: isNarrow ? '100%' : 760,
          maxWidth: isNarrow ? 'none' : '94vw',
          height: isNarrow ? '100dvh' : 'auto',
          maxHeight: isNarrow ? 'none' : '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 19, fontWeight: 700, color: '#1d1830', whiteSpace: 'nowrap' }}>Beat editor</span>
            {isSyncedWithMain && <span style={{ fontSize: 11, fontWeight: 700, color: '#7442d6', whiteSpace: 'nowrap' }}>● SYNCED</span>}
            {playing && <span style={{ fontSize: 11, fontWeight: 700, color: '#7442d6', whiteSpace: 'nowrap' }}>● PREVIEW</span>}
          </div>
          <button onClick={handleClose} style={{ border: '1px solid #d6cdeb', background: '#ffffff', color: '#3c3355', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>Close</button>
        </div>
        {!isNarrow && (
          <div style={{ fontSize: 13, color: '#6d6685', margin: '4px 0 16px', lineHeight: 1.5, flexShrink: 0 }}>
            Build your own groove — tap a square to place a hit, then Save &amp; use to play it from the beat menu.
            {isSyncedWithMain && ' The kit is already jamming below — this shows what’s playing live.'}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isNarrow ? 10 : 14, margin: isNarrow ? '12px 0' : '0 0 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#6d6685', fontWeight: 600 }}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={DEFAULT_NAME}
              style={{ width: isNarrow ? 120 : 140, padding: '7px 10px', border: '1px solid #d6cdeb', borderRadius: 8, fontSize: 13, color: '#1d1830' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: isNarrow ? 130 : 170, flex: isNarrow ? '1 0 130px' : undefined }}>
            <label style={{ fontSize: 12, color: '#6d6685', fontWeight: 600, whiteSpace: 'nowrap' }}>BPM · {bpm}</label>
            <input
              type="range" min={MIN_BPM} max={MAX_BPM} step={1} value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#7442d6' }}
            />
          </div>
          <div style={{ display: 'flex', border: '1px solid #d6cdeb', borderRadius: 999, overflow: 'hidden' }}>
            <button onClick={() => onKitChange('acoustic')} style={{ padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: kit === 'acoustic' ? '#7442d6' : 'transparent', color: kit === 'acoustic' ? '#ffffff' : '#3c3355' }}>Acoustic</button>
            <button onClick={() => onKitChange('electronic')} style={{ padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: kit === 'electronic' ? '#7442d6' : 'transparent', color: kit === 'electronic' ? '#ffffff' : '#3c3355' }}>Electronic</button>
          </div>
          {!isNarrow && playStopBtn}
          <button
            onClick={handleClear}
            style={{ padding: isNarrow ? '9px 14px' : '8px 14px', borderRadius: 999, border: '1px solid #d6cdeb', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#ffffff', color: '#6d6685', whiteSpace: 'nowrap' }}
          >
            Clear
          </button>
          <button
            onClick={handleRandomize}
            style={{ padding: isNarrow ? '9px 14px' : '8px 14px', borderRadius: 999, border: '1px solid #d6cdeb', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#ffffff', color: '#6d6685', whiteSpace: 'nowrap' }}
          >
            🎲 Randomize
          </button>
        </div>

        {/* Grid — the scrollable middle section so header/controls/footer stay put */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: isNarrow ? 'hidden' : 'auto' }}>
          <div style={{ display: 'flex', gap: isNarrow ? 6 : 4, margin: `0 0 8px ${isNarrow ? 74 : 132}px` }}>
            {visibleSteps.map(s => (
              <div
                key={s}
                style={{
                  flex: '1 0 0', minWidth: isNarrow ? 34 : 20, height: 4, borderRadius: 2,
                  marginLeft: s % 4 === 0 && s > pageStart ? (isNarrow ? 10 : 8) : 0,
                  background: s === displayStep ? '#7442d6' : (s % 4 === 0 ? '#c9bdea' : '#e6e1f2'),
                  boxShadow: s === displayStep ? '0 0 8px #7442d6' : 'none',
                  transition: 'background 90ms',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: isNarrow ? 8 : 6 }}>
            {ROWS.map((row, rowIdx) => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: isNarrow ? 62 : 108, textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#3c3355', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {isNarrow ? row.shortLabel : row.label}
                </div>
                {!isNarrow && (
                  <input
                    type="range" min={0} max={1} step={0.05} value={vols[rowIdx]}
                    onChange={e => setVol(rowIdx, Number(e.target.value))}
                    title="volume"
                    style={{ width: 16, accentColor: '#7442d6' }}
                  />
                )}
                <div style={{ display: 'flex', gap: isNarrow ? 6 : 4, flex: 1 }}>
                  {visibleSteps.map(step => {
                    const on = grid[rowIdx][step]
                    return (
                      <button
                        key={step}
                        onClick={() => toggleCell(rowIdx, step)}
                        // Stops the browser's default click→focus→scrollIntoView from
                        // yanking the grid's scroll position when tapping a cell near an
                        // edge (mousedown preventDefault only suppresses the focus a
                        // mouse click would trigger — Tab navigation still works).
                        onMouseDown={e => e.preventDefault()}
                        style={{
                          flex: '1 0 0', minWidth: isNarrow ? 34 : 20, aspectRatio: '1 / 1', padding: 0,
                          marginLeft: step % 4 === 0 && step > pageStart ? (isNarrow ? 10 : 8) : 0,
                          borderRadius: isNarrow ? 8 : 5, cursor: 'pointer',
                          border: `1px solid ${on ? 'transparent' : '#d6cdeb'}`,
                          background: on ? '#7442d6' : (step === displayStep ? '#ece5fb' : '#f6f4fb'),
                          boxShadow: on && step === displayStep ? '0 0 10px #7442d6' : 'none',
                          transform: on && step === displayStep ? 'scale(1.08)' : 'scale(1)',
                          transition: 'background 90ms, transform 90ms',
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Page dots — mobile only, when the bar is split across pages */}
        {isNarrow && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '8px 0', flexShrink: 0 }}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                onMouseDown={e => e.preventDefault()}
                aria-label={`Page ${i + 1}`}
                style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: i === viewPage ? '#7442d6' : '#d6cdeb' }}
              />
            ))}
          </div>
        )}

        {/* Footer — sticky action bar on mobile so Preview/Save stay reachable
            without scrolling; a simple right-aligned row on desktop. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: isNarrow ? 'stretch' : 'flex-end',
            gap: 10, flexShrink: 0,
            padding: isNarrow ? '10px 0 14px' : '18px 0 0',
            borderTop: isNarrow ? '1px solid #e6e1f2' : 'none',
          }}
        >
          {isNarrow && playStopBtn}
          <button
            onClick={handleSave}
            style={{ padding: isNarrow ? '11px 20px' : '10px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: '#7442d6', color: '#ffffff', flex: isNarrow ? 1 : undefined }}
          >
            Save &amp; use
          </button>
        </div>
      </div>
    </div>
  )
}
