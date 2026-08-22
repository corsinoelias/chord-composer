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
const ROWS: { id: DrumPieceId; label: string; defaultVel: number }[] = [
  { id: 'kick', label: 'Kick', defaultVel: 1 },
  { id: 'snare', label: 'Snare', defaultVel: 0.95 },
  { id: 'stick', label: 'Cross stick', defaultVel: 0.85 },
  { id: 'hh-closed', label: 'Hi-hat closed', defaultVel: 0.6 },
  { id: 'hh-open', label: 'Hi-hat open', defaultVel: 0.6 },
  { id: 'tom-hi', label: 'High tom', defaultVel: 0.9 },
  { id: 'tom-lo', label: 'Low tom', defaultVel: 0.9 },
  { id: 'tom-floor', label: 'Floor tom', defaultVel: 0.9 },
  { id: 'crash-edge', label: 'Crash', defaultVel: 0.95 },
  { id: 'ride-body', label: 'Ride', defaultVel: 0.8 },
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
  onSave: (pattern: BeatPattern) => void
  trigger: (id: DrumPieceId, vel: number) => void
  kit: DrumKitId
  onKitChange: (kit: DrumKitId) => void
}

export function BeatEditor({ open, onClose, initialPattern, onSave, trigger, kit, onKitChange }: BeatEditorProps) {
  const [name, setName] = useState(DEFAULT_NAME)
  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [grid, setGrid] = useState<boolean[][]>(blankGrid)
  const [vols, setVols] = useState<number[]>(defaultVols)
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)

  const gridRef = useRef(grid); gridRef.current = grid
  const volsRef = useRef(vols); volsRef.current = vols
  const bpmRef = useRef(bpm); bpmRef.current = bpm
  const stepTimerRef = useRef<number | null>(null)

  // (Re)initialize the draft whenever the editor opens — from the existing custom
  // beat if there is one, otherwise a blank grid ready to build on.
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
  }, [open, initialPattern])

  const stopPreview = useCallback(() => {
    if (stepTimerRef.current != null) {
      clearTimeout(stepTimerRef.current)
      stepTimerRef.current = null
    }
    setPlaying(false)
    setCurrentStep(-1)
  }, [])

  const startPreview = useCallback(() => {
    stopPreview()
    setPlaying(true)
    let step = 0
    const loop = () => {
      setCurrentStep(step)
      gridRef.current.forEach((row, i) => {
        if (row[step]) trigger(ROWS[i].id, volsRef.current[i])
      })
      step = (step + 1) % STEPS
      stepTimerRef.current = window.setTimeout(loop, 60000 / bpmRef.current / 4)
    }
    loop()
  }, [stopPreview, trigger])

  const togglePreview = useCallback(() => {
    if (playing) stopPreview(); else startPreview()
  }, [playing, startPreview, stopPreview])

  // Stop the preview loop whenever the panel closes (or unmounts).
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
    stopPreview()
    onSave(gridToPattern(name, bpm, grid, vols))
  }

  if (!open) return null

  return (
    <div
      onClick={handleClose}
      style={{ position: 'absolute', inset: 0, background: 'rgba(5,6,10,0.66)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#ffffff', border: '1px solid #e6e1f2', borderRadius: 16, padding: '22px 24px', width: 760, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', fontFamily: 'Helvetica, Arial, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#1d1830' }}>Beat editor</div>
          <button onClick={handleClose} style={{ border: '1px solid #d6cdeb', background: '#ffffff', color: '#3c3355', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>Close</button>
        </div>
        <div style={{ fontSize: 13, color: '#6d6685', marginBottom: 16, lineHeight: 1.5 }}>Build your own groove — tap a square to place a hit, then Save &amp; use to play it from the beat menu.</div>

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: '#6d6685', fontWeight: 600 }}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={DEFAULT_NAME}
              style={{ width: 140, padding: '7px 10px', border: '1px solid #d6cdeb', borderRadius: 8, fontSize: 13, color: '#1d1830' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 170 }}>
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
          <button
            onClick={togglePreview}
            style={{ padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: playing ? '#1d1830' : '#7442d6', color: '#ffffff', whiteSpace: 'nowrap' }}
          >
            {playing ? '■ Stop' : '▶ Preview'}
          </button>
          <button
            onClick={handleClear}
            style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #d6cdeb', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#ffffff', color: '#6d6685', whiteSpace: 'nowrap' }}
          >
            Clear
          </button>
          <button
            onClick={handleRandomize}
            style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #d6cdeb', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#ffffff', color: '#6d6685', whiteSpace: 'nowrap' }}
          >
            🎲 Randomize
          </button>
        </div>

        {/* Grid */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 660 }}>
            {/* Step position markers */}
            <div style={{ display: 'flex', gap: 4, margin: '0 0 8px 132px' }}>
              {Array.from({ length: STEPS }, (_, s) => (
                <div
                  key={s}
                  style={{
                    flex: '1 0 0', minWidth: 20, height: 4, borderRadius: 2,
                    marginLeft: s % 4 === 0 && s > 0 ? 8 : 0,
                    background: s === currentStep ? '#7442d6' : (s % 4 === 0 ? '#c9bdea' : '#e6e1f2'),
                    boxShadow: s === currentStep ? '0 0 8px #7442d6' : 'none',
                    transition: 'background 90ms',
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ROWS.map((row, rowIdx) => (
                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 108, textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#3c3355', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.label}
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.05} value={vols[rowIdx]}
                    onChange={e => setVol(rowIdx, Number(e.target.value))}
                    title="volume"
                    style={{ width: 16, accentColor: '#7442d6' }}
                  />
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    {grid[rowIdx].map((on, step) => (
                      <button
                        key={step}
                        onClick={() => toggleCell(rowIdx, step)}
                        // Stops the browser's default click→focus→scrollIntoView from
                        // yanking the grid's horizontal scroll (and the dialog's vertical
                        // scroll) when tapping a cell near an edge, without breaking Tab
                        // navigation (mousedown preventDefault only suppresses the focus
                        // that a mouse click would otherwise trigger).
                        onMouseDown={e => e.preventDefault()}
                        style={{
                          flex: '1 0 0', minWidth: 20, aspectRatio: '1 / 1', padding: 0,
                          marginLeft: step % 4 === 0 && step > 0 ? 8 : 0,
                          borderRadius: 5, cursor: 'pointer',
                          border: `1px solid ${on ? 'transparent' : '#d6cdeb'}`,
                          background: on ? '#7442d6' : (step === currentStep ? '#ece5fb' : '#f6f4fb'),
                          boxShadow: on && step === currentStep ? '0 0 10px #7442d6' : 'none',
                          transform: on && step === currentStep ? 'scale(1.1)' : 'scale(1)',
                          transition: 'background 90ms, transform 90ms',
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={handleSave}
            style={{ padding: '10px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: '#7442d6', color: '#ffffff' }}
          >
            Save &amp; use
          </button>
        </div>
      </div>
    </div>
  )
}
