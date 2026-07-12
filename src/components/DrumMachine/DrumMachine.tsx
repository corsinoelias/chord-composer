import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useDrumSynth, TRACKS, KITS, type TrackId, type KitId } from '../../hooks/useDrumSynth'

const STEPS = 16
const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.12
const MIN_BPM = 60
const MAX_BPM = 200
const DEFAULT_BPM = 118

type ThemeId = 'studio' | 'retro' | 'pop'

type ThemeVars = CSSProperties & Record<string, string>

const THEMES: Record<ThemeId, { name: string; vars: ThemeVars }> = {
  studio: { name: 'Studio', vars: { '--bg': '#141519', '--panel': '#1d1f24', '--panel2': '#26282f', '--text': '#e9e7e2', '--muted': '#8b8e98', '--accent': '#e8804f', '--accent2': '#54b8c4', '--stepOff': '#2c2f37', '--stepCur': '#3a3f4a', '--border': '#33363f', '--shadow': '0 20px 50px rgba(0,0,0,0.45)' } },
  retro:  { name: 'Retro',  vars: { '--bg': '#d9d2c2', '--panel': '#efe9db', '--panel2': '#e4ddcc', '--text': '#2b261c', '--muted': '#7c7361', '--accent': '#d2542a', '--accent2': '#b8871a', '--stepOff': '#cbc2ad', '--stepCur': '#bdb49e', '--border': '#b4aa93', '--shadow': '0 20px 40px rgba(60,50,30,0.25)' } },
  pop:    { name: 'Pop',    vars: { '--bg': '#f3f1fa', '--panel': '#ffffff', '--panel2': '#f0edf8', '--text': '#26203a', '--muted': '#8a82a3', '--accent': '#7a5cff', '--accent2': '#ff5c8a', '--stepOff': '#e8e4f3', '--stepCur': '#d9d3ec', '--border': '#ded8ee', '--shadow': '0 20px 45px rgba(90,70,160,0.18)' } },
}

const PRESETS: Record<string, Record<TrackId, string>> = {
  Basic:      { kick: '1000100010001000', snare: '0000100000001000', clap: '0000000000000000', chh: '1010101010101010', ohh: '0000000000000000', tom: '0000000000000000', rim: '0000000000000000', cow: '0000000000000000' },
  Techno:     { kick: '1000100010001000', snare: '0000000000000000', clap: '0000100000001000', chh: '1010101010101010', ohh: '0010001000100010', tom: '0000000000000000', rim: '0000000010000000', cow: '0000000000000000' },
  'Hip-Hop':  { kick: '1000000100100010', snare: '0000100000001000', clap: '0000000000001000', chh: '1010101010101010', ohh: '0000001000000000', tom: '0000000000000000', rim: '0000000000000000', cow: '0000000000000000' },
  Funk:       { kick: '1000010000100100', snare: '0000100000101001', clap: '0000000000000000', chh: '1011101110111011', ohh: '0000000000000000', tom: '0000000000000000', rim: '0010000000100000', cow: '0000000000000000' },
  Clave:      { kick: '1000001010000010', snare: '0000000000000000', clap: '0000000000000000', chh: '1010101010101010', ohh: '0000000000000000', tom: '0000010000000100', rim: '0010100010010010', cow: '1001001000101000' },
  House:      { kick: '1000100010001000', snare: '0000000000000000', clap: '0000100000001000', chh: '0010001000100010', ohh: '0010001000100010', tom: '0000000000000000', rim: '0000000000100000', cow: '0000000000000000' },
  Trap:       { kick: '1000000000110000', snare: '0000000010000000', clap: '0000000010000000', chh: '1010101011101011', ohh: '0000000000000100', tom: '0000000000000000', rim: '0000000000000000', cow: '0000000000000000' },
  Breakbeat:  { kick: '1001000001001000', snare: '0000100100001010', clap: '0000000000000000', chh: '1010101010101010', ohh: '0000000000100000', tom: '0000000000000000', rim: '0000001000000000', cow: '0000000000000000' },
  Reggaeton:  { kick: '1000100010001000', snare: '0001001000010010', clap: '0000000000000000', chh: '1010101010101010', ohh: '0000000000000000', tom: '0000000000000000', rim: '0001001000010010', cow: '0000000000000000' },
  Bossa:      { kick: '1000001010000010', snare: '0000000000000000', clap: '0000000000000000', chh: '1010101010101010', ohh: '0000000000000000', tom: '0000000000000000', rim: '0010010000100100', cow: '0000000000000000' },
  Disco:      { kick: '1000100010001000', snare: '0000100000001000', clap: '0000100000001000', chh: '1010101010101010', ohh: '0010001000100010', tom: '0000000000000010', rim: '0000000000000000', cow: '0000000000000000' },
  Afrobeat:   { kick: '1000001000101000', snare: '0000000000000000', clap: '0000100000001000', chh: '1011101110111011', ohh: '0000000000000000', tom: '0000010000000110', rim: '0010010010010010', cow: '1000100010001000' },
}

const PRESET_NAMES = Object.keys(PRESETS)

function loadPreset(name: string): boolean[][] {
  const p = PRESETS[name] ?? PRESETS.Basic
  return TRACKS.map(t => (p[t.id] ?? '0'.repeat(STEPS)).split('').map(c => c === '1'))
}

export function DrumMachine() {
  const [playing, setPlaying]     = useState(false)
  const [bpm, setBpm]             = useState(DEFAULT_BPM)
  const [kit, setKit]             = useState<KitId>('analog')
  const [preset, setPreset]       = useState('Basic')
  const [theme, setTheme]         = useState<ThemeId>('pop')
  const [currentStep, setCurrentStep] = useState(-1)
  const [pattern, setPattern]     = useState<boolean[][]>(() => loadPreset('Basic'))
  const [vols, setVols]           = useState<number[]>([0.9, 0.8, 0.7, 0.55, 0.5, 0.75, 0.6, 0.5])
  const [mutes, setMutes]         = useState<boolean[]>(Array(TRACKS.length).fill(false))

  const bpmRef      = useRef(bpm)
  const patternRef  = useRef(pattern)
  const volsRef     = useRef(vols)
  const mutesRef    = useRef(mutes)
  bpmRef.current = bpm
  patternRef.current = pattern
  volsRef.current = vols
  mutesRef.current = mutes

  const stepRef       = useRef(0)
  const nextTimeRef   = useRef(0)
  const queueRef      = useRef<{ step: number; time: number }[]>([])
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef        = useRef<number | null>(null)

  const { ctxRef, ensureCtx, hit } = useDrumSynth(kit)

  const playStep = useCallback((step: number, t: number) => {
    const pat = patternRef.current
    TRACKS.forEach((tr, i) => {
      if (pat[i][step] && !mutesRef.current[i]) hit(tr.id, t, volsRef.current[i])
    })
  }, [hit])

  const schedule = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    const spb = 60 / bpmRef.current / 4
    while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const t = nextTimeRef.current
      playStep(stepRef.current, t)
      queueRef.current.push({ step: stepRef.current, time: t })
      stepRef.current = (stepRef.current + 1) % STEPS
      nextTimeRef.current += spb
    }
  }, [playStep])

  const stop = useCallback(() => {
    if (timerRef.current != null) clearInterval(timerRef.current)
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    timerRef.current = null
    queueRef.current = []
    setPlaying(false)
    setCurrentStep(-1)
  }, [])

  const start = useCallback(() => {
    ensureCtx()
    stepRef.current = 0
    nextTimeRef.current = ctxRef.current!.currentTime + 0.06
    queueRef.current = []
    timerRef.current = setInterval(schedule, LOOKAHEAD_MS)
    const tick = () => {
      const ctx = ctxRef.current
      if (ctx) {
        while (queueRef.current.length && queueRef.current[0].time <= ctx.currentTime) {
          const s = queueRef.current.shift()!.step
          setCurrentStep(s)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    setPlaying(true)
    rafRef.current = requestAnimationFrame(tick)
  }, [ensureCtx, schedule])

  const togglePlay = useCallback(() => {
    if (playing) stop(); else start()
  }, [playing, start, stop])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  useEffect(() => () => {
    stop()
  }, [stop])

  const applyPreset = (name: string) => {
    setPreset(name)
    setPattern(loadPreset(name))
  }

  const toggleCell = (trackIndex: number, step: number) => {
    setPattern(prev => {
      const next = prev.map(row => row.slice())
      next[trackIndex][step] = !next[trackIndex][step]
      return next
    })
  }

  const toggleMute = (trackIndex: number) => {
    setMutes(prev => {
      const next = prev.slice()
      next[trackIndex] = !next[trackIndex]
      return next
    })
  }

  const setVol = (trackIndex: number, v: number) => {
    setVols(prev => {
      const next = prev.slice()
      next[trackIndex] = v
      return next
    })
  }

  const themeVars = THEMES[theme].vars
  const glow = true

  return (
    <div
      style={{
        ...themeVars,
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: "'Space Grotesk', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 16px 56px',
        boxSizing: 'border-box',
        borderRadius: '20px',
        transition: 'background 200ms',
      }}
    >
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 1080, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 26, letterSpacing: 2 }}>PULSO·16</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: 0.4 }}>online drum machine</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(Object.keys(THEMES) as ThemeId[]).map(id => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              style={{
                background: id === theme ? 'var(--text)' : 'transparent',
                color: id === theme ? 'var(--bg)' : 'var(--muted)',
                border: `1px solid ${id === theme ? 'var(--text)' : 'var(--border)'}`,
                borderRadius: 999,
                padding: '6px 14px',
                cursor: 'pointer',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                letterSpacing: 0.5,
                transition: 'all 150ms',
              }}
            >
              {THEMES[id].name}
            </button>
          ))}
        </div>
      </div>

      {/* Panel */}
      <div style={{ width: '100%', maxWidth: 1080, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow)', padding: 20, boxSizing: 'border-box', transition: 'background 200ms' }}>

        {/* Transport */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
          <button
            onClick={togglePlay}
            aria-label={playing ? 'Stop' : 'Play'}
            style={{
              width: 56, height: 56, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: playing ? 'var(--text)' : 'var(--accent)',
              color: playing ? 'var(--bg)' : '#fff',
              fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: playing ? 'none' : '0 6px 18px -4px var(--accent)',
              transition: 'all 150ms',
            }}
          >
            {playing ? '■' : '▶'}
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>
              BPM · <span style={{ color: 'var(--text)' }}>{bpm}</span>
            </div>
            <input
              type="range" min={MIN_BPM} max={MAX_BPM} step={1} value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              style={{ width: 130, accentColor: 'var(--accent)' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>KIT</div>
            <select
              value={kit}
              onChange={e => setKit(e.target.value as KitId)}
              style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
            >
              {(Object.keys(KITS) as KitId[]).map(id => (
                <option key={id} value={id}>{KITS[id].name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>PRESET</div>
            <select
              value={preset}
              onChange={e => applyPreset(e.target.value)}
              style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
            >
              {PRESET_NAMES.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setPattern(TRACKS.map(() => Array(STEPS).fill(false)))}
            style={{ marginLeft: 'auto', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 1, cursor: 'pointer' }}
          >
            CLEAR
          </button>
        </div>

        {/* Grid */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 700 }}>
            <div style={{ display: 'flex', gap: 5, margin: '0 0 10px 176px' }}>
              {Array.from({ length: STEPS }, (_, s) => (
                <div
                  key={s}
                  style={{
                    flex: '1 0 0', minWidth: 22, height: 5, borderRadius: 3,
                    marginLeft: s % 4 === 0 && s > 0 ? 9 : 0,
                    background: s === currentStep ? 'var(--accent)' : (s % 4 === 0 ? 'var(--stepCur)' : 'var(--stepOff)'),
                    boxShadow: s === currentStep && glow ? '0 0 10px var(--accent)' : 'none',
                    transition: 'background 90ms',
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {TRACKS.map((tr, i) => {
                const muted = mutes[i]
                return (
                  <div key={tr.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      onClick={() => toggleMute(i)}
                      title="mute"
                      style={{
                        width: 84, textAlign: 'left', background: 'transparent', border: 'none',
                        padding: 0, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                        color: muted ? 'var(--border)' : 'var(--muted)',
                        textDecoration: muted ? 'line-through' : 'none',
                      }}
                    >
                      {tr.name}
                    </button>
                    <input
                      type="range" min={0} max={1} step={0.01} value={vols[i]}
                      onChange={e => setVol(i, Number(e.target.value))}
                      title="volume"
                      style={{ width: 72, accentColor: 'var(--accent)' }}
                    />
                    <div style={{ display: 'flex', gap: 5, flex: 1 }}>
                      {pattern[i].map((on, s) => {
                        const trackColor = `var(--${tr.accent})`
                        return (
                          <button
                            key={s}
                            onClick={() => toggleCell(i, s)}
                            style={{
                              flex: '1 0 0', minWidth: 22, aspectRatio: '1 / 1', padding: 0,
                              marginLeft: s % 4 === 0 && s > 0 ? 9 : 0,
                              borderRadius: 5, cursor: 'pointer',
                              border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                              background: on ? (muted ? 'var(--stepCur)' : trackColor) : (s === currentStep ? 'var(--stepCur)' : 'var(--stepOff)'),
                              boxShadow: on && s === currentStep && glow && !muted ? `0 0 14px ${trackColor}` : 'none',
                              transform: on && s === currentStep ? 'scale(1.12)' : 'scale(1)',
                              transition: 'background 90ms, box-shadow 90ms, transform 90ms',
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: 0.5 }}>
          SPACE = play/stop · click a track name to mute it
        </div>
      </div>
    </div>
  )
}
