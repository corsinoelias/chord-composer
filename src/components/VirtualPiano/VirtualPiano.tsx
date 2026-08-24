import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadPianoSamples } from '../../lib/virtualPiano/pianoSamples'
import { keyXFrac } from '../../lib/virtualPiano/pianoKeyLayout'
import { getMySongs, saveMySong } from '../../lib/virtualPiano/mySongs'
import {
  buildMidiFile, buildVoice, download, parseMidiFile, renderRecordingToWav,
  type InstrumentId, type RecEvent, type Voice,
} from '../../lib/virtualPiano/pianoAudio'
import { usePianoTransport, type TransportNote, type TransportSong } from './usePianoTransport'
import { PlayerBar } from './PlayerBar'
import { SongsPanel } from './SongsPanel'
import { SettingsDrawer } from './SettingsDrawer'
import { RecordPanel } from './RecordPanel'
import { PianoVisualizer, type Burst } from './PianoVisualizer'
import { PianoKeys } from './PianoKeys'
import { STAGE_H_PAD, TEAL, TEXT_DIM, TEXT_HI, TEXT_MED, VIOLET, VIOLET_2, ghostBtn, optionStyle, pillBtn } from './pianoTheme'

// Ported from the user's Claude Design project "Piano virtual realista"
// (Virtual Piano.dc.html) — audio synthesis, recording, marks, and MIDI
// in/out are original to that port. The stage layout (full-height dark hero
// with a falling-notes visualizer, transport bar below the keyboard, song
// library) and the transport/My Songs system were redesigned afterward —
// see the piano redesign plan discussed in chat for the reasoning behind
// each piece; the component-level comments below cover the "why" that
// wouldn't be obvious from the code alone.

type LabelMode = 'none' | 'notes' | 'keys'
type Notation = 'latina' | 'anglo'
type RecState = 'idle' | 'count' | 'rec' | 'done'

const WS = [0, 2, 4, 5, 7, 9, 11]
const ROW = 'QWERTYUIOP'

// Minimum comfortable white-key width used to pick auto octave count. Floor
// is always 2 octaves (14 white keys) even on the narrowest phone — never 1,
// per the "at least 2 octaves must fit" requirement. Ceiling is 4, which is
// also what a normal desktop width resolves to — a wide monitor doesn't get
// more than that automatically; use the Settings density override for that.
function computeAutoOct(width: number): number {
  return Math.max(2, Math.min(4, Math.floor(width / (7 * 34))))
}

// Widens the black key's touch target on the cramped 2-octave mobile layout.
// Single source of truth used by both the rendered keys and the falling-note
// visualizer/burst positions (via keyXFrac) — they must all agree or notes
// visibly drift off their key.
function blackKeyWidthFactor(nOct: number): number {
  return nOct <= 2 ? 0.74 : 0.62
}

export function VirtualPiano() {
  const [baseOctave, setBaseOctave] = useState(3)
  const [nOct, setNOct] = useState(4)
  const [octOverride, setOctOverride] = useState<number | null>(null)
  const [instrument, setInstrument] = useState<InstrumentId>('acoustic')
  const [volume, setVolume] = useState(0.8)
  const [labelMode, setLabelMode] = useState<LabelMode>('none')
  const [notation, setNotation] = useState<Notation>('latina')
  const [active, setActive] = useState<Record<number, boolean>>({})
  const [marked, setMarked] = useState<number[]>([])
  const [markMode, setMarkMode] = useState(false)
  const [recState, setRecState] = useState<RecState>('idle')
  const [recSecs, setRecSecs] = useState(0)
  const [recPanelOpen, setRecPanelOpen] = useState(false)
  const [recordingSaved, setRecordingSaved] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [songsOpen, setSongsOpen] = useState(false)
  const [mySongsVersion, setMySongsVersion] = useState(0)
  const [midiName, setMidiName] = useState('')
  const [isFs, setIsFs] = useState(false)
  const [fauxFs, setFauxFs] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [freePlayDimmed, setFreePlayDimmed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const baseOctaveRef = useRef(baseOctave); baseOctaveRef.current = baseOctave
  const nOctRef = useRef(nOct); nOctRef.current = nOct
  const octOverrideRef = useRef(octOverride); octOverrideRef.current = octOverride
  const instrumentRef = useRef(instrument); instrumentRef.current = instrument
  const volumeRef = useRef(volume); volumeRef.current = volume
  const activeRef = useRef(active); activeRef.current = active
  const markedRef = useRef(marked); markedRef.current = marked
  const markModeRef = useRef(markMode); markModeRef.current = markMode
  const recStateRef = useRef(recState); recStateRef.current = recState
  const fauxFsRef = useRef(fauxFs); fauxFsRef.current = fauxFs
  const settingsOpenRef = useRef(settingsOpen); settingsOpenRef.current = settingsOpen
  const songsOpenRef = useRef(songsOpen); songsOpenRef.current = songsOpen

  const stageRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const voicesRef = useRef<Record<number, Voice>>({})
  const markTimeoutsRef = useRef<number[]>([])
  const recEventsRef = useRef<RecEvent[]>([])
  const heldCodesRef = useRef<Record<string, number>>({})
  const ptrRef = useRef(false)
  const recStartRef = useRef(0)
  const countTimerRef = useRef<number | null>(null)
  const recTimerRef = useRef<number | null>(null)
  const heroTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const burstsRef = useRef<Burst[]>([])
  const prevTransportSongRef = useRef<TransportSong | null>(null)

  const resize = useCallback(() => {
    if (octOverrideRef.current !== null) return
    const nOctNew = computeAutoOct(window.innerWidth)
    if (nOctNew !== nOctRef.current) {
      setNOct(nOctNew)
      setBaseOctave(b => Math.min(b, 7 - nOctNew))
    }
  }, [])

  const setDensity = useCallback((n: number | null) => {
    if (n === null) {
      setOctOverride(null)
      const nOctNew = computeAutoOct(window.innerWidth)
      setNOct(nOctNew)
      setBaseOctave(b => Math.min(b, 7 - nOctNew))
    } else {
      setOctOverride(n)
      setNOct(n)
      setBaseOctave(b => Math.min(b, 7 - n))
    }
  }, [])

  const ensureCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AC()
      const master = ctx.createGain()
      master.gain.value = volumeRef.current
      const comp = ctx.createDynamicsCompressor()
      master.connect(comp)
      comp.connect(ctx.destination)
      ctxRef.current = ctx
      masterRef.current = master
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  // Hides the hero title while something is actively happening (free play or
  // a loaded song) so the falling-notes visualizer isn't fighting with the
  // marketing copy. When no song is loaded, free play triggers a fade-out
  // that reverts ~8s after the last note (see pingHero calls in noteOn and
  // the "song closed" effect below).
  const pingHero = useCallback(() => {
    setFreePlayDimmed(true)
    if (heroTimerRef.current) clearTimeout(heroTimerRef.current)
    heroTimerRef.current = window.setTimeout(() => setFreePlayDimmed(false), 8000)
  }, [])

  const releaseAllVoices = useCallback(() => {
    const ctx = ctxRef.current
    Object.keys(voicesRef.current).forEach(m => {
      const v = voicesRef.current[+m]
      if (v && ctx) v.release(ctx.currentTime)
    })
    voicesRef.current = {}
    setActive({})
  }, [])

  const noteOn = useCallback((midi: number, vel = 0.9) => {
    if (midi < 12 || midi > 108) return
    const ctx = ensureCtx()
    const t = ctx.currentTime
    if (voicesRef.current[midi]) voicesRef.current[midi].release(t)
    voicesRef.current[midi] = buildVoice(ctx, masterRef.current as GainNode, instrumentRef.current, midi, t, vel)
    if (recStateRef.current === 'rec') {
      recEventsRef.current.push({ midi, vel, inst: instrumentRef.current, tOn: performance.now() / 1000 - recStartRef.current, tOff: null })
    }
    if (transportRef.current?.song && transportRef.current.practice) transportRef.current.registerHit(midi)
    if (!transportRef.current?.song) pingHero()
    setActive(a => ({ ...a, [midi]: true }))
  }, [ensureCtx, pingHero])

  const noteOff = useCallback((midi: number) => {
    const v = voicesRef.current[midi]
    if (v) { v.release((ctxRef.current as AudioContext).currentTime); delete voicesRef.current[midi] }
    if (recStateRef.current === 'rec') {
      const evs = recEventsRef.current
      for (let i = evs.length - 1; i >= 0; i--) {
        if (evs[i].midi === midi && evs[i].tOff === null) { evs[i].tOff = performance.now() / 1000 - recStartRef.current; break }
      }
    }
    setActive(a => { const next = { ...a }; delete next[midi]; return next })
  }, [])

  // Spawns/ends the visualizer's "reverse waterfall" bar for a key press —
  // called only at real user-input sites (pointer/keyboard/MIDI), NOT from
  // noteOn/noteOff themselves, so a song playing itself doesn't also draw a
  // rising bar on top of its own falling note.
  const spawnLiveBurst = useCallback((midi: number) => {
    const pos = keyXFrac(midi, baseOctaveRef.current, nOctRef.current, blackKeyWidthFactor(nOctRef.current))
    if (pos) burstsRef.current.push({ midi, xFrac: pos[0], wFrac: pos[1], black: pos[2], onAt: performance.now(), offAt: null })
  }, [])
  const endLiveBurst = useCallback((midi: number) => {
    for (let i = burstsRef.current.length - 1; i >= 0; i--) {
      if (burstsRef.current[i].midi === midi && burstsRef.current[i].offAt === null) { burstsRef.current[i].offAt = performance.now(); break }
    }
  }, [])

  // The transport hook drives song playback through these same noteOn/noteOff
  // functions — a song's notes sound exactly like the player's own key
  // presses (including feeding the recorder if you're recording over a
  // song, and lighting up keys), so there's one audio path, not two.
  const transport = usePianoTransport({ onNoteOn: noteOn, onNoteOff: noteOff })
  const transportRef = useRef(transport); transportRef.current = transport

  useEffect(() => {
    if (prevTransportSongRef.current && !transport.song) pingHero()
    prevTransportSongRef.current = transport.song
  }, [transport.song, pingHero])

  const whiteMidi = useCallback((i: number) => {
    const oct = baseOctaveRef.current + Math.floor(i / 7)
    return 12 * (oct + 1) + WS[i % 7]
  }, [])

  const codeToMidi = useCallback((code: string): number | null => {
    if (code.startsWith('Key')) {
      const i = ROW.indexOf(code[3])
      if (i >= 0) return whiteMidi(i)
    }
    if (code.startsWith('Digit')) {
      const dgt = +code[5]
      const wi = (dgt === 0 ? 10 : dgt) - 2
      if (wi >= 0 && [0, 1, 3, 4, 5].includes(wi % 7)) return whiteMidi(wi) + 1
    }
    return null
  }, [whiteMidi])

  const toggleMarkNote = useCallback((midi: number) => {
    setMarked(prev => {
      const next = prev.includes(midi) ? prev.filter(m => m !== midi) : [...prev, midi]
      history.replaceState(null, '', next.length ? '#m=' + next.join(',') : location.pathname + location.search)
      return next
    })
  }, [])

  const doPlayMarks = useCallback(() => {
    const seq = [...markedRef.current]
    ensureCtx()
    seq.forEach((midi, i) => {
      markTimeoutsRef.current.push(window.setTimeout(() => noteOn(midi, 0.85), i * 450))
      markTimeoutsRef.current.push(window.setTimeout(() => noteOff(midi), i * 450 + 380))
    })
  }, [ensureCtx, noteOn, noteOff])

  const fitSong = useCallback((notes: { midi: number }[]) => {
    if (!notes.length) return
    const midis = notes.map(n => n.midi)
    const lo = Math.min(...midis)
    let base = Math.floor(lo / 12) - 1
    const hi = Math.max(...midis)
    const span = 12 * (nOctRef.current + 0.5)
    while (12 * (base + 1) + span < hi && base < 6) base++
    setBaseOctave(Math.max(1, Math.min(6, base)))
  }, [])

  const playSong = useCallback((song: TransportSong, opts: { practice?: boolean } = {}) => {
    releaseAllVoices()
    fitSong(song.notes)
    ensureCtx()
    transport.load(song, { practice: opts.practice, autoplay: true })
    setSongsOpen(false)
  }, [releaseAllVoices, fitSong, ensureCtx, transport])

  const doLoadMidi = useCallback(() => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.mid,.midi,audio/midi'
    inp.onchange = async () => {
      const file = inp.files?.[0]
      if (!file) return
      try {
        const parsed = parseMidiFile(new Uint8Array(await file.arrayBuffer()), file.name)
        if (!parsed.notes.length) throw new Error('no notes')
        const spb = 60 / parsed.bpm
        const notes: TransportNote[] = parsed.notes.map(([midi, start, dur]) => ({ midi, time: start * spb, dur: dur * spb }))
        playSong({ name: parsed.name, bpm: parsed.bpm, notes })
        const alreadySaved = getMySongs().some(s => s.source === 'midi' && s.name === parsed.name)
        if (!alreadySaved) {
          saveMySong({ name: parsed.name, source: 'midi', bpm: parsed.bpm, notes })
          setMySongsVersion(v => v + 1)
          showToast(`Added "${parsed.name}" to My Songs`)
        }
      } catch {
        showToast('Could not read that MIDI file')
      }
    }
    inp.click()
  }, [playSong, showToast])

  const doDlWav = useCallback(async () => {
    const evs = recEventsRef.current
    if (!evs.length) return
    download(await renderRecordingToWav(evs, volumeRef.current), 'piano-recording.wav')
  }, [])

  const doDlMidi = useCallback(() => {
    const evs = recEventsRef.current
    if (!evs.length) return
    download(buildMidiFile(evs), 'piano-recording.mid')
  }, [])

  const recDuration = useCallback(() => {
    const evs = recEventsRef.current
    if (!evs.length) return '0:00'
    const t = Math.round(Math.max(...evs.map(e => e.tOff ?? 0)))
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
  }, [])

  const recordingToTransportNotes = useCallback((): TransportNote[] =>
    recEventsRef.current.map(ev => ({ midi: ev.midi, time: ev.tOn, dur: Math.max((ev.tOff ?? ev.tOn) - ev.tOn, 0.12) })), [])

  const handlePlayRecording = useCallback(() => {
    if (!recEventsRef.current.length) return
    playSong({ name: 'Your recording', bpm: 120, notes: recordingToTransportNotes() })
    setRecPanelOpen(false)
  }, [playSong, recordingToTransportNotes])

  const handleSaveRecording = useCallback((name: string) => {
    if (!recEventsRef.current.length) return
    const id = saveMySong({ name, source: 'recording', bpm: 120, notes: recordingToTransportNotes() })
    if (id) {
      setRecordingSaved(true)
      setMySongsVersion(v => v + 1)
    } else {
      showToast('Could not save — storage is full')
    }
  }, [recordingToTransportNotes, showToast])

  const doToggleRecord = useCallback(() => {
    const st = recStateRef.current
    if (st === 'idle') {
      setRecordingSaved(false)
      let n = 4
      setRecState('count'); setCountdown(n)
      countTimerRef.current = window.setInterval(() => {
        n--
        if (n > 0) { setCountdown(n); return }
        if (countTimerRef.current != null) clearInterval(countTimerRef.current)
        recEventsRef.current = []
        recStartRef.current = performance.now() / 1000
        recTimerRef.current = window.setInterval(() => {
          const secs = Math.floor(performance.now() / 1000 - recStartRef.current)
          if (secs >= 300) doToggleRecord()
          else setRecSecs(secs)
        }, 1000)
        setRecState('rec'); setRecSecs(0)
      }, 800)
    } else if (st === 'count') {
      if (countTimerRef.current != null) clearInterval(countTimerRef.current)
      setRecState('idle')
    } else if (st === 'rec') {
      if (recTimerRef.current != null) clearInterval(recTimerRef.current)
      const now = performance.now() / 1000 - recStartRef.current
      recEventsRef.current.forEach(ev => { if (ev.tOff === null) ev.tOff = now })
      const hasNotes = recEventsRef.current.length > 0
      setRecState(hasNotes ? 'done' : 'idle')
      if (hasNotes) setRecPanelOpen(true)
    } else if (st === 'done') {
      setRecPanelOpen(true)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (fauxFsRef.current) { setFauxFs(false); return }
    if (document.fullscreenElement) { document.exitFullscreen(); return }
    // Fullscreen the whole stage (hero + visualizer + keyboard + player bar),
    // not just the keyboard — the falling-notes practice view is the point.
    const el = stageRef.current
    const p = el?.requestFullscreen ? el.requestFullscreen() : Promise.reject()
    Promise.resolve(p).catch(() => setFauxFs(true))
  }, [])

  const keyDownHandler = useCallback((e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return
    if (e.code === 'Escape' && fauxFsRef.current) { setFauxFs(false); return }
    if (e.code === 'Escape' && (settingsOpenRef.current || songsOpenRef.current)) { setSettingsOpen(false); setSongsOpen(false); return }
    if (e.code === 'Space') {
      e.preventDefault()
      if (transportRef.current.song) transportRef.current.togglePlay()
      else if (markedRef.current.length) doPlayMarks()
      return
    }
    const midi = codeToMidi(e.code)
    if (midi !== null && !heldCodesRef.current[e.code]) {
      heldCodesRef.current[e.code] = midi
      if (markModeRef.current) toggleMarkNote(midi)
      noteOn(midi)
      spawnLiveBurst(midi)
    }
  }, [codeToMidi, doPlayMarks, noteOn, spawnLiveBurst, toggleMarkNote])

  const keyUpHandler = useCallback((e: KeyboardEvent) => {
    const midi = heldCodesRef.current[e.code]
    if (midi !== undefined) { delete heldCodesRef.current[e.code]; noteOff(midi); endLiveBurst(midi) }
  }, [noteOff, endLiveBurst])

  useEffect(() => {
    // Captured once — markTimeoutsRef.current is a stable array that only
    // ever gets pushed to (never reassigned), so this reference stays valid
    // and satisfies the exhaustive-deps ref-in-cleanup rule.
    const markTimeouts = markTimeoutsRef.current
    const onResize = () => resize()
    const onPtrDown = () => { ptrRef.current = true }
    const onPtrUp = () => { ptrRef.current = false }
    const onFsChange = () => setIsFs(!!document.fullscreenElement)
    window.addEventListener('keydown', keyDownHandler)
    window.addEventListener('keyup', keyUpHandler)
    window.addEventListener('resize', onResize)
    window.addEventListener('pointerdown', onPtrDown, true)
    window.addEventListener('pointerup', onPtrUp, true)
    document.addEventListener('fullscreenchange', onFsChange)
    resize()
    const m = (location.hash.match(/m=([\d,]+)/) || [])[1]
    if (m) setMarked(m.split(',').map(Number).filter(n => n >= 12 && n <= 108))

    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
    if (nav.requestMIDIAccess) {
      nav.requestMIDIAccess().then(acc => {
        const hook = () => {
          let name = ''
          acc.inputs.forEach(inp => {
            name = inp.name ?? ''
            inp.onmidimessage = (msg) => {
              const data = msg.data
              if (!data) return
              const [st, note, vel] = data
              const cmd = st & 0xf0
              if (cmd === 0x90 && vel > 0) { noteOn(note, vel / 127); spawnLiveBurst(note) }
              else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) { noteOff(note); endLiveBurst(note) }
            }
          })
          setMidiName(name)
        }
        hook()
        acc.onstatechange = hook
      }).catch(() => {})
    }

    const win = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void }
    const startPreload = () => loadPianoSamples(ensureCtx())
    const idleId = win.requestIdleCallback ? win.requestIdleCallback(startPreload) : window.setTimeout(startPreload, 1)

    return () => {
      if (win.requestIdleCallback && win.cancelIdleCallback) win.cancelIdleCallback(idleId)
      else clearTimeout(idleId)
      window.removeEventListener('keydown', keyDownHandler)
      window.removeEventListener('keyup', keyUpHandler)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointerdown', onPtrDown, true)
      window.removeEventListener('pointerup', onPtrUp, true)
      document.removeEventListener('fullscreenchange', onFsChange)
      markTimeouts.forEach(clearTimeout)
      releaseAllVoices()
      // Null out after close() — a dev-mode double-mount (React StrictMode)
      // or HMR remount otherwise finds a truthy-but-closed ctxRef.current
      // and ensureCtx() reuses it instead of creating a fresh one, throwing
      // "Cannot close a closed AudioContext" on the next unmount.
      if (ctxRef.current) { ctxRef.current.close(); ctxRef.current = null }
      masterRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const keyHandlers = useCallback((midi: number) => ({
    down: (e: React.PointerEvent) => {
      e.preventDefault()
      try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* not captured */ }
      if (markModeRef.current) toggleMarkNote(midi)
      noteOn(midi)
      spawnLiveBurst(midi)
    },
    up: () => { if (activeRef.current[midi]) { noteOff(midi); endLiveBurst(midi) } },
    enter: () => { if (ptrRef.current) { noteOn(midi); spawnLiveBurst(midi) } },
  }), [toggleMarkNote, noteOn, noteOff, spawnLiveBurst, endLiveBurst])

  const octDown = useCallback(() => setBaseOctave(b => Math.max(1, b - 1)), [])
  const octUp = useCallback(() => setBaseOctave(b => Math.min(6, b + 1)), [])

  // ---------- derived render values ----------
  const blackWidthFactor = blackKeyWidthFactor(nOct)

  const mm = Math.floor(recSecs / 60), ss = String(recSecs % 60).padStart(2, '0')
  const recLabel = recState === 'count' ? `Ready? ${countdown}…`
    : recState === 'rec' ? `■ Stop ${mm}:${ss}`
    : recState === 'done' ? '● Recording ready' : '● Record'
  const recBtnStyle: React.CSSProperties = {
    ...pillBtn(recState !== 'idle'),
    ...(recState === 'rec' ? { background: '#c0392b', borderColor: '#c0392b', animation: 'pianoRecBlink 1.4s infinite' } : {}),
    ...(recState === 'count' ? { animation: 'pianoRecBlink 0.8s infinite' } : {}),
  }
  const hasMarks = marked.length > 0
  const fsLabel = (isFs || fauxFs) ? 'Exit full screen' : 'Full screen'
  const midiText = midiName ? 'MIDI: ' + midiName : 'MIDI: no device'
  const midiConnected = !!midiName
  const octLabel = `C${baseOctave}–C${baseOctave + nOct}`

  const heroDimmed = !!transport.song || freePlayDimmed
  const eyebrowText = transport.song
    ? (transport.posSec < 0 ? `Get ready: ${transport.song.name}`
      : transport.practice ? `Practice: ${transport.song.name}` : `Playing: ${transport.song.name}`)
    : 'Free play'

  const shortcutRows = [
    { label: 'Black keys', keys: ['2', '3', '·', '5', '6', '7', '·', '9', '0'] },
    { label: 'White keys', keys: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'] },
  ]

  const faqs = [
    { q: 'Can I use a real MIDI keyboard?', a: 'Yes — connect a MIDI keyboard and use Chrome or Edge. It is detected automatically and its name appears in the badge at the top of the page. Anything you play on it sounds here and can be recorded too, with velocity sensitivity.' },
    { q: 'Does it work on phones and tablets?', a: 'Yes — the piano always shows at least two full octaves, even on a small phone, and supports multi-touch so you can play chords with several fingers. You can also force a specific key density in Settings.' },
    { q: 'What is Practice mode?', a: 'Load any song from the library or your own recordings, turn on Practice, and play along — notes fall toward the keys and you’re scored on hits vs. misses instead of the song playing itself.' },
    { q: 'WAV or MIDI — which download should I pick?', a: 'WAV is a finished audio file — share it or listen anywhere. MIDI stores the notes themselves, so you can open it in any music software (GarageBand, Ableton, MuseScore…) to edit the notes or change the instrument.' },
    { q: 'Where do my recordings go?', a: 'Save a recording (or an opened .mid file) to "My Songs" and it stays in your browser — no account needed — ready to play, practice, rename or download again any time you come back.' },
    { q: 'How do I share my marked notes?', a: 'Marks are saved in the page address as you make them — just copy the URL from your browser and send it. Whoever opens it sees the same keys marked and can play them with the space bar.' },
  ]

  return (
    <div style={{ background: '#F5F2FA', color: '#2B2438', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @keyframes pianoRecBlink { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        .vp-root input[type=range] { accent-color: ${VIOLET}; }
        .vp-root ::-webkit-scrollbar { height: 8px; width: 8px; }
        .vp-root ::-webkit-scrollbar-thumb { background: #D9D0E8; border-radius: 4px; }
        .vp-root details > summary { cursor: pointer; list-style: none; }
        .vp-root details > summary::-webkit-details-marker { display: none; }
        .vp-root a { color: #7C3AED; }
        .vp-root a:hover { color: #9A6BF5; }
        .vp-stage { touch-action: none; }
        .vp-hero-copy { transition: opacity 400ms ease; }
        .vp-tbtn .vp-lbl { }
        @media (hover: none) and (pointer: coarse) {
          .vp-keymap-hint { display: none; }
        }
        @media (max-width: 600px) {
          .vp-toolbar { gap: 6px; padding: 8px 8px 4px; }
          .vp-tool-group { padding: 5px; gap: 3px; }
          .vp-tbtn { padding: 8px 9px; }
          .vp-tbtn .vp-lbl { display: none; }
          .vp-midi-badge .vp-lbl { display: none; }
          .vp-hero-copy p { display: none; }
        }
        @media (orientation: landscape) and (max-height: 560px) {
          .vp-keyboard-frame { height: min(56dvh, 190px) !important; }
          .vp-keymap-hint { display: none; }
        }
      `}</style>
      <div className="vp-root">

      {/* ---------- Stage: dark full-height hero + visualizer + keyboard ---------- */}
      <section
        ref={stageRef}
        className="vp-stage"
        style={{
          position: 'relative', minHeight: 'calc(100dvh - 64px)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          background: 'radial-gradient(120% 90% at 15% -10%, rgba(124,92,255,.30), transparent 55%), radial-gradient(90% 70% at 100% 0%, rgba(95,227,201,.14), transparent 50%), linear-gradient(180deg, #141020 0%, #1d1830 55%, #251f3d 100%)',
          ...(fauxFs ? { position: 'fixed', inset: 0, zIndex: 1000, minHeight: '100dvh' } as React.CSSProperties : {}),
        }}
      >
        {toast && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20, background: 'rgba(20,16,32,.85)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '8px 16px', fontSize: 12.5, color: TEXT_HI, whiteSpace: 'nowrap', boxShadow: '0 10px 30px rgba(0,0,0,.35)' }}>
            {toast}
          </div>
        )}

        {/* Toolbar */}
        <div className="vp-toolbar" style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '14px 16px 6px' }}>
          <div className="vp-tool-group" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.10)', padding: 6, borderRadius: 14 }}>
            <button className="vp-tbtn" onClick={doToggleRecord} title="Record" style={{ ...tbtnStyle(recState !== 'idle'), ...(recState === 'rec' ? { background: '#ff5d7a', borderColor: '#ff5d7a', animation: 'pianoRecBlink 1.4s infinite' } : {}) }}>
              <IconRecord /><span className="vp-lbl">{recLabel}</span>
            </button>
            <button className="vp-tbtn" onClick={() => setMarkMode(v => !v)} title="Mark" style={tbtnStyle(markMode)}>
              <IconMark /><span className="vp-lbl">Mark</span>
            </button>
            {hasMarks && (
              <>
                <button className="vp-tbtn" onClick={doPlayMarks} title="Play marks" style={tbtnStyle(true)}>▸<span className="vp-lbl">&nbsp;Play</span></button>
                <button onClick={() => { setMarked([]); history.replaceState(null, '', location.pathname + location.search) }} style={ghostBtn()}>Clear marks</button>
              </>
            )}
            <button className="vp-tbtn" onClick={() => setSongsOpen(true)} title="Songs" style={tbtnStyle(songsOpen)}>
              <IconSongs /><span className="vp-lbl">Songs</span>
            </button>
            <button className="vp-tbtn" onClick={doLoadMidi} title="Open MIDI file" style={tbtnStyle(false)}>
              <IconOpenMidi /><span className="vp-lbl">Open MIDI…</span>
            </button>
            <div className="vp-midi-badge" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: midiConnected ? TEAL : TEXT_DIM, padding: '8px 12px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: midiConnected ? TEAL : '#5c5578', boxShadow: midiConnected ? '0 0 0 3px rgba(95,227,201,.22)' : 'none' }} />
              <span className="vp-lbl">{midiText}</span>
            </div>
          </div>

          <div className="vp-tool-group" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.10)', padding: 6, borderRadius: 14 }}>
            <select
              value={instrument}
              onChange={(e) => setInstrument(e.target.value as InstrumentId)}
              title="Instrument"
              style={{ fontFamily: 'inherit', background: 'transparent', color: TEXT_HI, border: 'none', padding: '8px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <option style={optionStyle} value="acoustic">Acoustic Piano</option>
              <option style={optionStyle} value="piano">Classic Piano</option>
              <option style={optionStyle} value="epiano">Electric Piano</option>
              <option style={optionStyle} value="organ">Organ</option>
              <option style={optionStyle} value="synth">Synthesizer</option>
              <option style={optionStyle} value="strings">Strings</option>
              <option style={optionStyle} value="musicbox">Music Box</option>
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 2 }}>
              <button onClick={octDown} aria-label="Lower octave" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', color: TEXT_HI, fontSize: 15, cursor: 'pointer' }}>−</button>
              <span style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 12, color: TEXT_MED, padding: '0 9px', whiteSpace: 'nowrap' }}>Octave {octLabel}</span>
              <button onClick={octUp} aria-label="Raise octave" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', color: TEXT_HI, fontSize: 15, cursor: 'pointer' }}>+</button>
            </div>
            <button className="vp-tbtn" onClick={toggleFullscreen} title={fsLabel} style={tbtnStyle(isFs || fauxFs)}>
              <IconFullscreen /><span className="vp-lbl">{fsLabel}</span>
            </button>
            <button className="vp-tbtn" onClick={() => setSettingsOpen(true)} title="Settings" style={tbtnStyle(settingsOpen)}>
              <IconSettings /><span className="vp-lbl">Settings</span>
            </button>
          </div>
        </div>

        {/* Visualizer / hero — canvas fills the whole hero, falling notes travel
            straight down into the keyboard below with nothing interrupting the
            path (this is why the player bar lives BELOW the keyboard, not here). */}
        <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 120, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', padding: '8px 10px' }}>
          <PianoVisualizer transport={transport} baseOctave={baseOctave} nOct={nOct} burstsRef={burstsRef} blackWidthFactor={blackWidthFactor} />
          <div className="vp-hero-copy" style={{ position: 'relative', zIndex: 3, maxWidth: 640, pointerEvents: 'none', opacity: heroDimmed ? 0 : 1, padding: '0 6px' }}>
            <p style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: VIOLET_2, margin: '0 0 10px' }}>{eyebrowText}</p>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600, fontSize: 'clamp(30px, 6vw, 56px)', lineHeight: 1.04, margin: '0 0 12px', color: '#faf8ff' }}>
              Play the piano,<br />right here.
            </h1>
            <p style={{ fontSize: 'clamp(13px, 1.8vw, 16px)', color: '#c8c1e4', margin: 0, maxWidth: '46ch', lineHeight: 1.55 }}>
              A fully playable piano with a real sampled acoustic sound plus six synthesized instruments. Click, tap, or use your computer keyboard — every key lights up as you play.
            </p>
          </div>
        </div>

        {/* Keyboard dock — horizontal padding must equal the visualizer
            canvas's own left/right inset (STAGE_H_PAD) or falling notes
            drift off their key; see pianoTheme.ts. */}
        <div style={{ position: 'relative', zIndex: 5, flexShrink: 0, padding: `0 ${STAGE_H_PAD}px ${STAGE_H_PAD}px` }}>
          <p className="vp-keymap-hint" style={{ textAlign: 'center', fontSize: 12, color: TEXT_DIM, padding: '9px 12px 4px', maxWidth: 900, margin: '0 auto' }}>
            The <b style={{ color: '#e7e1fb', fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }}>Q W E R T Y U I O P</b> row plays the white keys and the number row <b style={{ color: '#e7e1fb', fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }}>2 3 · 5 6 7 · 9 0</b> plays the black keys — hold several at once to play chords.
          </p>
          <div className="vp-keyboard-frame" style={{ position: 'relative', height: 'clamp(140px, 30dvh, 240px)', borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(180deg,#0d0a16,#050409)', boxShadow: '0 20px 60px rgba(20,16,32,.35), inset 0 0 0 1px rgba(255,255,255,.06)', touchAction: 'none' }}>
            <PianoKeys
              baseOctave={baseOctave}
              nOct={nOct}
              active={active}
              marked={marked}
              labelMode={labelMode}
              notation={notation}
              blackWidthFactor={blackWidthFactor}
              whiteMidi={whiteMidi}
              keyHandlers={keyHandlers}
            />
          </div>

          <PlayerBar transport={transport} onClose={() => transport.close()} />
        </div>
      </section>

      {/* ---------- About / SEO content (light section, below the fold) ---------- */}
      <section style={{ maxWidth: 860, width: '100%', margin: '30px auto 50px auto', padding: '0 24px' }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 24, fontWeight: 700, margin: '0 0 8px 0', letterSpacing: -0.4 }}>Play the piano, right in your browser</h2>
        <p style={{ color: '#6E6482', fontSize: 15, lineHeight: 1.7, margin: '0 0 8px 0' }}>Virtual Piano is a fully playable piano with a real sampled acoustic piano plus six synthesized sounds — classic and electric piano, organ, synth, strings and music box. Every key lights up and moves when you play it. Play by clicking the keys, with your computer keyboard, or by plugging in a real piano or keyboard over MIDI.</p>
        <p style={{ color: '#6E6482', fontSize: 15, lineHeight: 1.7, margin: '0 0 28px 0' }}>A fun way to practice is to pick a song from the library and play along in Practice mode — notes fall toward the keys and you're scored on your hits — or record yourself and listen back. Save any recording or opened .mid file to My Songs to come back to it later.</p>

        <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px 0' }}>What you can do</h3>
        <ul style={{ color: '#6E6482', fontSize: 14, lineHeight: 1.9, margin: '0 0 28px 0', paddingLeft: 22 }}>
          <li><b style={{ color: '#4C3B70' }}>Record</b> up to 5 minutes (with a 4-3-2-1 countdown), save it to My Songs, and download it as WAV or MIDI.</li>
          <li><b style={{ color: '#4C3B70' }}>Learn songs</b> from the library, sorted by difficulty, with a full transport — play, pause, scrub, loop a section, and slow it down to 50%.</li>
          <li><b style={{ color: '#4C3B70' }}>Practice</b> any song yourself with falling notes and a live hit/miss score.</li>
          <li><b style={{ color: '#4C3B70' }}>Open any .mid file</b>, watch it played back, and it's saved to My Songs automatically so you don't have to re-open it next time.</li>
          <li><b style={{ color: '#4C3B70' }}>Mark keys</b> to build a sequence and play it with the space bar — marks live in the page address so you can share them.</li>
          <li><b style={{ color: '#4C3B70' }}>Customize everything</b> in Settings: instrument, volume, key density, key labels, Do-Re-Mi vs C-D-E naming, base octave — plus full-screen practice mode.</li>
        </ul>

        <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px 0' }}>Keyboard layout</h3>
        <p style={{ color: '#6E6482', fontSize: 14, lineHeight: 1.7, margin: '0 0 12px 0' }}>The keys map to your computer keyboard just like their physical position on the piano:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 12px 0' }}>
          {shortcutRows.map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#8A7FA0', minWidth: 84 }}>{row.label}</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {row.keys.map((k, idx) => k === '·'
                  ? <span key={idx} style={{ color: '#C4B9D8', alignSelf: 'center' }}>·</span>
                  : row.label === 'Black keys'
                    ? <kbd key={idx} style={{ background: '#131110', border: '1px solid #D9D0E8', borderRadius: 6, padding: '5px 10px', fontSize: 13, fontFamily: 'inherit', color: '#cfc7b9' }}>{k}</kbd>
                    : <kbd key={idx} style={{ background: '#f5f0e6', border: '1px solid #a49c8e', borderRadius: 6, padding: '5px 10px', fontSize: 13, fontFamily: 'inherit', color: '#33302a' }}>{k}</kbd>
                )}
              </div>
            </div>
          ))}
        </div>
        <p style={{ color: '#6E6482', fontSize: 14, lineHeight: 1.7, margin: '0 0 28px 0' }}>Hold several keys at once to play chords. Shift the range with the Octave − / + buttons, and turn on «Shortcuts» key labels in Settings to see the mapping on the piano itself.</p>

        <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px 0' }}>Questions &amp; answers</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {faqs.map(f => (
            <div key={f.q} style={{ background: '#FFFFFF', border: '1px solid #E3DCEF', borderRadius: 12, padding: '16px 18px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 15, fontWeight: 600 }}>{f.q}</h3>
              <p style={{ color: '#6E6482', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Panels portalled to document.body: the piano's own DOM position sits
          inside a `z-index: 1` grid-item wrapper (piano/index.astro's
          skeleton/island stacking trick), which caps any z-index used here
          below the site's sticky Navbar (z-50). Rendering outside that
          subtree via a portal is what lets these paint above the nav. */}
      {songsOpen && createPortal(
        <SongsPanel
          open={songsOpen}
          onClose={() => setSongsOpen(false)}
          onPlay={(song, opts) => playSong(song, opts)}
          onOpenMidi={doLoadMidi}
          refreshKey={mySongsVersion}
        />,
        document.body,
      )}

      {settingsOpen && createPortal(
        <SettingsDrawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          volume={volume}
          onVolumeChange={(v) => { if (masterRef.current) masterRef.current.gain.value = v; setVolume(v) }}
          octOverride={octOverride}
          onSetDensity={setDensity}
          labelMode={labelMode}
          onSetLabelMode={setLabelMode}
          notation={notation}
          onSetNotation={setNotation}
          octLabel={octLabel}
          onOctDown={octDown}
          onOctUp={octUp}
          instrument={instrument}
          onSetInstrument={setInstrument}
        />,
        document.body,
      )}

      {recPanelOpen && createPortal(
        <RecordPanel
          open={recPanelOpen}
          onClose={() => setRecPanelOpen(false)}
          duration={recDuration()}
          onPlay={handlePlayRecording}
          onDownloadWav={doDlWav}
          onDownloadMidi={doDlMidi}
          onSave={handleSaveRecording}
          onNewRecording={() => { releaseAllVoices(); setRecState('idle'); setRecSecs(0); setRecPanelOpen(false); setRecordingSaved(false) }}
          saved={recordingSaved}
        />,
        document.body,
      )}
      </div>
    </div>
  )
}

function tbtnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, background: active ? VIOLET : 'transparent',
    border: '1px solid ' + (active ? VIOLET : 'transparent'), color: '#eae5fb',
    padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

function IconRecord() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7" /></svg>
}
function IconMark() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l5 5v13H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
}
function IconSongs() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l11-2v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.6" /><circle cx="17" cy="16" r="3" stroke="currentColor" strokeWidth="1.6" /></svg>
}
function IconOpenMidi() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
}
function IconFullscreen() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function IconSettings() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
}
