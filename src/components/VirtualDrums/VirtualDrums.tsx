import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDrumEngine, type DrumEngine, type DrumKitId, type DrumPieceId } from '../../lib/virtualDrums/drumSynth'
import { buildKitSvg, SCENES } from '../../lib/virtualDrums/kitSvg'
import { BeatEditor } from './BeatEditor'

// Ported from the user's Claude Design project "Batería Virtual Interactiva"
// (Virtual Drums.dc.html) — same keymap, MIDI map, beat patterns, and
// record/playback behavior as the original.

const KEYS: Record<string, DrumPieceId> = {
  z: 'kick', v: 'kick', x: 'snare', c: 'snare',
  g: 'stick', b: 'stick',
  s: 'hh-closed', a: 'hh-closed', d: 'hh-open', f: 'hh-open',
  q: 'tom-hi', w: 'tom-lo', e: 'tom-floor',
  '1': 'crash-edge', r: 'crash-edge',
  '2': 'ride-body', t: 'ride-body',
  '3': 'ride-bell', y: 'ride-bell',
}

const MIDI_MAP: Record<number, DrumPieceId> = {
  35: 'kick', 36: 'kick', 38: 'snare', 40: 'snare', 37: 'stick',
  42: 'hh-closed', 44: 'hh-foot', 46: 'hh-open',
  49: 'crash-body', 57: 'crash-body', 55: 'crash-edge', 52: 'crash-edge',
  51: 'ride-body', 59: 'ride-edge', 53: 'ride-bell', 56: 'ride-bell',
  48: 'tom-hi', 50: 'tom-hi', 45: 'tom-lo', 47: 'tom-lo',
  41: 'tom-floor', 43: 'tom-floor',
}

export interface BeatEvent { t: number; id: DrumPieceId; v: number }
export interface BeatPattern { name: string; bpm: number; beats: number; ev: BeatEvent[] }

const PATTERNS: BeatPattern[] = [
  { name: 'Rock', bpm: 96, beats: 4, ev: [
    { t: 0, id: 'kick', v: 1 }, { t: 2, id: 'kick', v: 0.95 }, { t: 2.5, id: 'kick', v: 0.7 },
    { t: 1, id: 'snare', v: 0.95 }, { t: 3, id: 'snare', v: 0.95 },
    { t: 0, id: 'hh-closed', v: 0.85 }, { t: 0.5, id: 'hh-closed', v: 0.5 },
    { t: 1, id: 'hh-closed', v: 0.75 }, { t: 1.5, id: 'hh-closed', v: 0.5 },
    { t: 2, id: 'hh-closed', v: 0.85 }, { t: 2.5, id: 'hh-closed', v: 0.5 },
    { t: 3, id: 'hh-closed', v: 0.75 }, { t: 3.5, id: 'hh-closed', v: 0.5 },
  ] },
  { name: 'Funk', bpm: 102, beats: 4, ev: [
    { t: 0, id: 'kick', v: 1 }, { t: 0.75, id: 'kick', v: 0.8 }, { t: 2.5, id: 'kick', v: 0.9 },
    { t: 1, id: 'snare', v: 0.95 }, { t: 3, id: 'snare', v: 0.95 },
    { t: 1.75, id: 'snare', v: 0.25 }, { t: 2.25, id: 'snare', v: 0.25 }, { t: 3.75, id: 'snare', v: 0.3 },
    { t: 0, id: 'hh-closed', v: 0.8 }, { t: 0.5, id: 'hh-closed', v: 0.5 },
    { t: 1, id: 'hh-closed', v: 0.7 }, { t: 1.5, id: 'hh-closed', v: 0.5 },
    { t: 2, id: 'hh-closed', v: 0.8 }, { t: 2.5, id: 'hh-closed', v: 0.5 },
    { t: 3, id: 'hh-closed', v: 0.7 }, { t: 3.5, id: 'hh-open', v: 0.6 },
  ] },
  { name: 'Disco', bpm: 116, beats: 4, ev: [
    { t: 0, id: 'kick', v: 1 }, { t: 1, id: 'kick', v: 0.95 }, { t: 2, id: 'kick', v: 1 }, { t: 3, id: 'kick', v: 0.95 },
    { t: 1, id: 'snare', v: 0.9 }, { t: 3, id: 'snare', v: 0.9 },
    { t: 0.5, id: 'hh-open', v: 0.65 }, { t: 1.5, id: 'hh-open', v: 0.65 },
    { t: 2.5, id: 'hh-open', v: 0.65 }, { t: 3.5, id: 'hh-open', v: 0.65 },
    { t: 0, id: 'hh-closed', v: 0.4 }, { t: 1, id: 'hh-closed', v: 0.4 },
    { t: 2, id: 'hh-closed', v: 0.4 }, { t: 3, id: 'hh-closed', v: 0.4 },
  ] },
  { name: 'Hip-Hop', bpm: 88, beats: 4, ev: [
    { t: 0, id: 'kick', v: 1 }, { t: 0.75, id: 'kick', v: 0.75 }, { t: 2.5, id: 'kick', v: 0.9 },
    { t: 1, id: 'snare', v: 0.95 }, { t: 3, id: 'snare', v: 0.95 },
    { t: 0, id: 'hh-closed', v: 0.7 }, { t: 0.5, id: 'hh-closed', v: 0.45 },
    { t: 1, id: 'hh-closed', v: 0.6 }, { t: 1.5, id: 'hh-closed', v: 0.45 },
    { t: 2, id: 'hh-closed', v: 0.7 }, { t: 2.5, id: 'hh-closed', v: 0.45 },
    { t: 3, id: 'hh-closed', v: 0.6 }, { t: 3.75, id: 'hh-closed', v: 0.5 },
  ] },
  { name: 'Jazz Swing', bpm: 140, beats: 4, ev: [
    { t: 0, id: 'ride-body', v: 0.8 }, { t: 1, id: 'ride-body', v: 0.9 },
    { t: 1.67, id: 'ride-body', v: 0.55 }, { t: 2, id: 'ride-body', v: 0.8 },
    { t: 3, id: 'ride-body', v: 0.9 }, { t: 3.67, id: 'ride-body', v: 0.55 },
    { t: 1, id: 'hh-foot', v: 0.6 }, { t: 3, id: 'hh-foot', v: 0.6 },
    { t: 0, id: 'kick', v: 0.25 }, { t: 2, id: 'kick', v: 0.25 },
    { t: 2.67, id: 'snare', v: 0.3 },
  ] },
  { name: 'Reggaeton', bpm: 95, beats: 4, ev: [
    { t: 0, id: 'kick', v: 1 }, { t: 1, id: 'kick', v: 0.9 }, { t: 2, id: 'kick', v: 1 }, { t: 3, id: 'kick', v: 0.9 },
    { t: 0.75, id: 'stick', v: 0.85 }, { t: 1.5, id: 'stick', v: 0.85 },
    { t: 2.75, id: 'stick', v: 0.85 }, { t: 3.5, id: 'stick', v: 0.85 },
    { t: 0, id: 'hh-closed', v: 0.5 }, { t: 0.5, id: 'hh-closed', v: 0.35 },
    { t: 1, id: 'hh-closed', v: 0.5 }, { t: 1.5, id: 'hh-closed', v: 0.35 },
    { t: 2, id: 'hh-closed', v: 0.5 }, { t: 2.5, id: 'hh-closed', v: 0.35 },
    { t: 3, id: 'hh-closed', v: 0.5 }, { t: 3.5, id: 'hh-closed', v: 0.35 },
  ] },
]

const SHORTCUT_LIST = [
  { k: 'Z / V', n: 'Bass drum' },
  { k: 'X / C', n: 'Snare drum' },
  { k: 'G / B', n: 'Snare — cross stick' },
  { k: 'S / A', n: 'Hi-hat (closed)' },
  { k: 'D / F', n: 'Hi-hat (open)' },
  { k: 'Alt / Caps', n: 'Hi-hat (foot pedal)' },
  { k: 'Q', n: 'High tom' },
  { k: 'W', n: 'Low tom' },
  { k: 'E', n: 'Floor tom' },
  { k: '1 / R', n: 'Crash' },
  { k: '2 / T', n: 'Ride' },
  { k: '3 / Y', n: 'Bell (ride)' },
]

type AnimKind = 'drum' | 'cym' | 'hho' | 'hhc' | 'hhf'
const ANIM: Partial<Record<DrumPieceId, [string, AnimKind, number?]>> = {
  'kick': ['an-kick', 'drum'], 'snare': ['an-snare', 'drum'], 'stick': ['an-snare', 'drum'],
  'tom-hi': ['an-tomhi', 'drum'], 'tom-lo': ['an-tomlo', 'drum'], 'tom-floor': ['an-tomfloor', 'drum'],
  'crash-edge': ['an-crash', 'cym', 6], 'crash-body': ['an-crash', 'cym', 3.5], 'crash-bell': ['an-crash', 'cym', 1.4],
  'ride-edge': ['an-ride', 'cym', 4], 'ride-body': ['an-ride', 'cym', 2.2], 'ride-bell': ['an-ride', 'cym', 1],
  'hh-closed': ['an-hhtop', 'hhc'], 'hh-open': ['an-hhtop', 'hho'], 'hh-foot': ['an-hhtop', 'hhf'],
}

export function VirtualDrums() {
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 640)
  const [kit, setKit] = useState<DrumKitId>('acoustic')
  const [scene, setScene] = useState(2)
  const [labels, setLabels] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [hasRec, setHasRec] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [beatIdx, setBeatIdx] = useState(0)
  const [beatOn, setBeatOn] = useState(false)
  const [midiText, setMidiText] = useState('MIDI')
  const [midiOk, setMidiOk] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  // User-built beat, kept only for this session (not persisted) — appended after the
  // built-in PATTERNS so it shows up in the same dropdown once created.
  const [customPattern, setCustomPattern] = useState<BeatPattern | null>(null)
  // Live tempo override for whichever beat is selected — starts at that beat's own
  // bpm but can be dragged independently, same idea as the drum machine's BPM slider.
  const [beatBpm, setBeatBpm] = useState(PATTERNS[0].bpm)

  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<DrumEngine | null>(null)

  const kitRef = useRef(kit); kitRef.current = kit
  const recordingRef = useRef(recording); recordingRef.current = recording
  const playingRef = useRef(playing); playingRef.current = playing
  const beatIdxRef = useRef(beatIdx); beatIdxRef.current = beatIdx
  const beatOnRef = useRef(beatOn); beatOnRef.current = beatOn
  const beatBpmRef = useRef(beatBpm); beatBpmRef.current = beatBpm
  const countdownRef = useRef(countdown); countdownRef.current = countdown

  // Built-in beats plus the user's custom one (if created), appended at the end so
  // its index is stable while it exists. Kept in a ref too so the setTimeout-driven
  // startBeat loop always reads the latest patterns without needing to restart.
  const allPatterns = useMemo(() => (customPattern ? [...PATTERNS, customPattern] : PATTERNS), [customPattern])
  const allPatternsRef = useRef(allPatterns); allPatternsRef.current = allPatterns

  const eventsRef = useRef<{ t: number; id: DrumPieceId }[]>([])
  const recStartRef = useRef(0)
  const playTimersRef = useRef<number[]>([])
  const beatTimersRef = useRef<number[]>([])
  const cdTimerRef = useRef<number | null>(null)

  useEffect(() => {
    engineRef.current = createDrumEngine()
    engineRef.current.setVolume(0.9)
    engineRef.current.setReverb(0.25)
  }, [])

  // Narrow (portrait mobile) viewports get a shorter, mildly-cropped kit
  // instead of the wide "meet"-fitted stage — otherwise the 16:9 composition
  // letterboxes into a tall mostly-empty column with a tiny kit in the middle.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = () => setIsNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const animateHit = useCallback((id: DrumPieceId) => {
    const spec = ANIM[id]
    if (!spec) return
    const [elId, kind, amp = 0] = spec
    const root = containerRef.current
    if (!root) return
    const el = root.querySelector<SVGElement>('#' + elId)
    const fl = root.querySelector<SVGElement>('#fl-' + elId.slice(3))
    if (fl) fl.animate([{ opacity: 0.45 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' })
    if (!el) return
    if (kind === 'drum') {
      el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.97)' }, { transform: 'scale(1)' }],
        { duration: 130, easing: 'ease-out' },
      )
    } else if (kind === 'cym') {
      el.animate([
        { transform: 'rotate(0deg)' },
        { transform: `rotate(${-amp}deg)` },
        { transform: `rotate(${amp * 0.6}deg)` },
        { transform: `rotate(${-amp * 0.35}deg)` },
        { transform: 'rotate(0deg)' },
      ], { duration: 850, easing: 'ease-out' })
    } else if (kind === 'hho') {
      el.animate([
        { transform: 'translateY(0px) rotate(0deg)' },
        { transform: 'translateY(-10px) rotate(-2deg)' },
        { transform: 'translateY(-8px) rotate(1.5deg)' },
        { transform: 'translateY(0px) rotate(0deg)' },
      ], { duration: 550, easing: 'ease-out' })
    } else if (kind === 'hhc') {
      el.animate([
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-1.5deg)' },
        { transform: 'rotate(1deg)' }, { transform: 'rotate(0deg)' },
      ], { duration: 260, easing: 'ease-out' })
    } else if (kind === 'hhf') {
      el.animate([
        { transform: 'translateY(-6px)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0px)' },
      ], { duration: 200, easing: 'ease-out' })
    }
  }, [])

  const crowdReact = useCallback((id: DrumPieceId) => {
    const root = containerRef.current
    if (!root) return
    const figs = root.querySelectorAll<SVGElement>('.aud-fig')
    if (!figs.length) return
    const big = id.indexOf('crash') === 0 || id === 'kick'
    figs.forEach(f => {
      if (Math.random() > (big ? 0.8 : 0.3)) return
      const amp = 5 + Math.random() * (big ? 13 : 6)
      f.animate([
        { transform: 'translateY(0px)' },
        { transform: `translateY(${-amp}px)` },
        { transform: 'translateY(0px)' },
      ], { duration: 240 + Math.random() * 180, easing: 'ease-out' })
    })
    if (big) {
      root.querySelectorAll<SVGElement>('.aud-light').forEach(l => {
        if (Math.random() > 0.7) return
        l.animate([{ opacity: 0.25 }, { opacity: 0.95 }, { opacity: 0.25 }], { duration: 550, easing: 'ease-in-out' })
      })
    }
  }, [])

  const trigger = useCallback((id: DrumPieceId, vel: number, fromBeat?: boolean) => {
    engineRef.current?.play(kitRef.current, id, vel)
    animateHit(id)
    crowdReact(id)
    if (recordingRef.current && !fromBeat) {
      eventsRef.current.push({ t: performance.now() - recStartRef.current, id })
    }
  }, [animateHit, crowdReact])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'Alt' || e.key === 'CapsLock') { e.preventDefault(); trigger('hh-foot', 1); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const id = KEYS[e.key.toLowerCase()]
      if (!id) return
      e.preventDefault()
      trigger(id, 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trigger])

  // MIDI
  useEffect(() => {
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
    if (!nav.requestMIDIAccess) { setMidiText('MIDI not supported'); return }
    nav.requestMIDIAccess().then(acc => {
      const wire = () => {
        let n = 0
        acc.inputs.forEach(inp => {
          n++
          inp.onmidimessage = (msg) => {
            const data = msg.data
            if (!data) return
            const [st, note, vel] = data
            if ((st & 0xf0) === 0x90 && vel > 0) {
              const id = MIDI_MAP[note]
              if (id) trigger(id, Math.min(1, vel / 100))
            }
          }
        })
        setMidiText(n ? 'MIDI connected' : 'MIDI: no device')
        setMidiOk(n > 0)
      }
      wire()
      acc.onstatechange = wire
    }).catch(() => setMidiText('MIDI unavailable'))
  }, [trigger])

  const stopBeat = useCallback(() => {
    beatTimersRef.current.forEach(clearTimeout)
    beatTimersRef.current = []
    if (beatOnRef.current) setBeatOn(false)
  }, [])

  const startBeat = useCallback(() => {
    stopBeat()
    const pat = allPatternsRef.current[beatIdxRef.current] ?? PATTERNS[0]
    // spb (seconds per beat) is recomputed every bar from beatBpmRef, not baked in
    // once at start, so dragging the BPM slider takes effect without a restart.
    const loop = () => {
      const spb = 60000 / beatBpmRef.current
      pat.ev.forEach(ev => {
        beatTimersRef.current.push(window.setTimeout(() => trigger(ev.id, ev.v, true), ev.t * spb))
      })
      beatTimersRef.current.push(window.setTimeout(loop, pat.beats * spb))
    }
    setBeatOn(true)
    loop()
  }, [stopBeat, trigger])

  const stopPlayback = useCallback(() => {
    playTimersRef.current.forEach(clearTimeout)
    playTimersRef.current = []
    if (playingRef.current) setPlaying(false)
  }, [])

  useEffect(() => () => {
    if (cdTimerRef.current != null) clearTimeout(cdTimerRef.current)
    stopBeat()
    stopPlayback()
  }, [stopBeat, stopPlayback])

  const toggleBeat = useCallback(() => {
    if (beatOnRef.current) stopBeat(); else startBeat()
  }, [startBeat, stopBeat])

  const onBeatChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const i = parseInt(e.target.value, 10)
    setBeatIdx(i)
    beatIdxRef.current = i
    const pat = allPatternsRef.current[i]
    if (pat) setBeatBpm(pat.bpm)
    if (beatOnRef.current) startBeat()
  }, [startBeat])

  // Stop the live kit beat before the editor opens — otherwise its own preview
  // loop would overlap with the one already running underneath.
  const openEditor = useCallback(() => {
    if (beatOnRef.current) stopBeat()
    setEditorOpen(true)
  }, [stopBeat])

  // Custom beats never overwrite a built-in one — they're always appended at
  // PATTERNS.length, so saving again from the editor just replaces that one slot.
  const handleSaveCustomPattern = useCallback((pattern: BeatPattern) => {
    setCustomPattern(pattern)
    const idx = PATTERNS.length
    setBeatIdx(idx)
    beatIdxRef.current = idx
    setBeatBpm(pattern.bpm)
    setEditorOpen(false)
    if (beatOnRef.current) startBeat()
  }, [startBeat])

  const toggleRecord = useCallback(() => {
    if (countdownRef.current > 0) {
      if (cdTimerRef.current != null) clearTimeout(cdTimerRef.current)
      setCountdown(0)
      return
    }
    if (recordingRef.current) {
      setRecording(false)
      setHasRec(eventsRef.current.length > 0)
    } else {
      stopPlayback()
      eventsRef.current = []
      const step = (n: number) => {
        if (n === 0) {
          recStartRef.current = performance.now()
          setCountdown(0); setRecording(true); setPlaying(false)
          return
        }
        setCountdown(n); setPlaying(false)
        engineRef.current?.play(kitRef.current, 'hh-closed', n === 4 ? 0.95 : 0.55)
        cdTimerRef.current = window.setTimeout(() => step(n - 1), 500)
      }
      step(4)
    }
  }, [stopPlayback])

  const togglePlay = useCallback(() => {
    if (playingRef.current) { stopPlayback(); return }
    if (!eventsRef.current.length) return
    setPlaying(true); setRecording(false)
    const last = eventsRef.current[eventsRef.current.length - 1].t
    eventsRef.current.forEach(ev => {
      playTimersRef.current.push(window.setTimeout(() => trigger(ev.id, 1), ev.t))
    })
    playTimersRef.current.push(window.setTimeout(() => setPlaying(false), last + 400))
  }, [stopPlayback, trigger])

  const onKitDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as Element
    const el = target.closest ? target.closest('[data-hit]') : null
    if (!el) return
    let id = el.getAttribute('data-hit') as DrumPieceId
    const fam = id.split('-')[0]
    if (fam === 'crash' || fam === 'ride') {
      try {
        const svg = containerRef.current?.querySelector('svg')
        if (svg) {
          const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
          const C = fam === 'crash'
            ? { x: 452, y: 205, rx: 128, ry: 30 }
            : { x: 1215, y: 235, rx: 148, ry: 36 }
          const d = Math.sqrt(((pt.x - C.x) / C.rx) ** 2 + ((pt.y - C.y) / C.ry) ** 2)
          id = (fam + (d < 0.32 ? '-bell' : (d < 0.75 ? '-body' : '-edge'))) as DrumPieceId
        }
      } catch { /* keep element zone */ }
    }
    trigger(id, 1)
  }, [trigger])

  const svgMarkup = useMemo(
    () => buildKitSvg({ kit, scene: SCENES[scene], showLabels: labels, fit: isNarrow ? 'slice' : 'meet' }),
    [kit, scene, labels, isNarrow],
  )

  const recLabel = countdown > 0 ? 'Cancel' : (recording ? 'Stop rec' : 'Record')
  const beatLabel = beatOn ? '■ Stop' : '▶ Beat'
  const playLabel = playing ? '■ Stop' : '▶ Play'

  return (
    <div style={{ width: '100%', height: isNarrow ? 'auto' : 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', fontFamily: 'Helvetica, Arial, sans-serif', overflow: 'hidden', background: '#f6f4fb', position: 'relative', WebkitUserSelect: 'none', userSelect: 'none' }}>
      <style>{`
        @keyframes vdRecPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .vd-topbar-inner {
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
          padding-left: 16px;
          padding-right: 16px;
        }
        @media (min-width: 640px) {
          .vd-topbar-inner { padding-left: 24px; padding-right: 24px; }
        }
        @media (min-width: 1024px) {
          .vd-topbar-inner { padding-left: 32px; padding-right: 32px; }
        }
        .vd-settings-panel {
          position: absolute;
          top: calc(100% + 8px);
          right: 16px;
          width: 300px;
          max-width: calc(100vw - 24px);
        }
        @media (min-width: 640px) { .vd-settings-panel { right: 24px; } }
        @media (min-width: 1024px) { .vd-settings-panel { right: 32px; } }
        @media (max-width: 640px) {
          .vd-settings-panel {
            position: fixed;
            left: 12px;
            right: 12px;
            bottom: 12px;
            top: auto;
            width: auto;
            max-height: 70vh;
            overflow-y: auto;
          }
        }
      `}</style>

      {/* TOP BAR — only the controls people reach for immediately. Everything
          else (scene, labels, shortcuts, MIDI) lives behind Settings so this
          doesn't compete with the site navbar above it. The beat-loop picker
          gets its own row below (see BEAT BAR) instead of living here or in
          Settings — it's the easiest way for a new visitor to hear the kit
          and want to play along, so it needs its own breathing room, not a
          cramped pill squeezed between Record/Play/Settings.
          Inner content is capped at the same max-w-7xl the site navbar uses,
          so "Acoustic" lines up under the ChordSequence logo, not the
          viewport edge. */}
      <div style={{ background: '#f8f6fd' }}>
      <div className="vd-topbar-inner" style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 8, paddingBottom: 8, flexWrap: 'wrap', position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
          <div style={{ display: 'flex', border: '1px solid #d6cdeb', borderRadius: 999, overflow: 'hidden' }}>
            <button onClick={() => setKit('acoustic')} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: kit === 'acoustic' ? '#7442d6' : 'transparent', color: kit === 'acoustic' ? '#ffffff' : '#3c3355' }}>Acoustic</button>
            <button onClick={() => setKit('electronic')} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: kit === 'electronic' ? '#7442d6' : 'transparent', color: kit === 'electronic' ? '#ffffff' : '#3c3355' }}>Electronic</button>
          </div>
        </div>

        <h1 style={{ flex: '0 1 auto', margin: 0, fontSize: 15, fontWeight: 700, color: '#1d1830', letterSpacing: 0.3, whiteSpace: 'nowrap', textAlign: 'center' }}>Virtual Drums</h1>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={toggleRecord} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', border: `1px solid ${(recording || countdown > 0) ? '#e5484d' : '#d6cdeb'}`, borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: (recording || countdown > 0) ? '#fdeaea' : '#ffffff', color: '#1d1830', whiteSpace: 'nowrap' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#e5484d', animation: recording ? 'vdRecPulse 1s infinite' : 'none', display: 'inline-block' }} />
              {recLabel}
            </button>
            <button onClick={togglePlay} style={{ padding: '8px 14px', border: '1px solid #d6cdeb', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: '#ffffff', color: '#3c3355', opacity: (hasRec || playing) ? 1 : 0.4, whiteSpace: 'nowrap' }}>{playLabel}</button>
            <button
              onClick={() => setSettingsOpen(v => !v)}
              aria-expanded={settingsOpen}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: `1px solid ${settingsOpen ? '#7442d6' : '#d6cdeb'}`, borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: settingsOpen ? '#ece5fb' : '#ffffff', color: settingsOpen ? '#5a2fc0' : '#3c3355', whiteSpace: 'nowrap' }}
            >
              ⚙ Settings
            </button>
          </div>
        </div>

        {settingsOpen && (
          <>
            <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
            <div className="vd-settings-panel" style={{ background: '#ffffff', border: '1px solid #e6e1f2', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.18)', padding: 16, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#7442d6', textTransform: 'uppercase' }}>Settings</div>

              <button onClick={() => setScene(s => (s + 1) % SCENES.length)} style={{ width: '100%', textAlign: 'left', padding: '9px 14px', border: '1px solid #d6cdeb', borderRadius: 10, cursor: 'pointer', fontSize: 13, background: '#ffffff', color: '#3c3355' }}>Scene: {SCENES[scene].name} ▸</button>

              <button onClick={() => setLabels(v => !v)} style={{ width: '100%', textAlign: 'left', padding: '9px 14px', border: '1px solid #d6cdeb', borderRadius: 10, cursor: 'pointer', fontSize: 13, background: labels ? '#ece5fb' : '#ffffff', color: labels ? '#5a2fc0' : '#3c3355' }}>Key labels: {labels ? 'On' : 'Off'}</button>

              <button onClick={() => { setShortcutsOpen(true); setSettingsOpen(false) }} style={{ width: '100%', textAlign: 'left', padding: '9px 14px', border: '1px solid #d6cdeb', borderRadius: 10, cursor: 'pointer', fontSize: 13, background: '#ffffff', color: '#3c3355' }}>Show shortcuts</button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 2px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: midiOk ? '#46c46e' : '#b9b3c9', display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: '#6d6685' }}>{midiText}</span>
              </div>
            </div>
          </>
        )}
      </div>
      </div>

      {/* BEAT BAR — dedicated, roomy row for the built-in beat loops so it
          doesn't compete with Record/Play/Settings above or hide behind the
          Settings gear. Own background tint + top/bottom border makes it
          read as an inviting strip, not just another control. */}
      <div style={{ background: '#efe8fb', borderTop: '1px solid #e0d6f7', borderBottom: '1px solid #e0d6f7' }}>
        <div className="vd-topbar-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 10, paddingBottom: 10, flexWrap: 'wrap' }}>
          <button
            onClick={openEditor}
            style={{ padding: '9px 14px', border: '1px solid #d6cdeb', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: '#ffffff', color: '#5a2fc0', whiteSpace: 'nowrap' }}
          >
            🎵 Beat editor
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#5a2fc0', fontWeight: 600, whiteSpace: 'nowrap' }}>BPM · {beatBpm}</label>
            <input
              type="range" min={60} max={200} step={1} value={beatBpm}
              onChange={e => setBeatBpm(Number(e.target.value))}
              style={{ width: 90, accentColor: '#7442d6' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${beatOn ? '#7442d6' : '#d6cdeb'}`, borderRadius: 999, overflow: 'hidden', background: '#ffffff' }}>
            <select
              value={beatIdx}
              onChange={onBeatChange}
              style={{ appearance: 'none', padding: '9px 12px', border: 'none', background: beatOn ? '#ece5fb' : '#ffffff', color: '#3c3355', fontSize: 13, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
            >
              {allPatterns.map((p, i) => (
                <option key={p.name + i} value={i}>{i >= PATTERNS.length ? '✎ ' : ''}{p.name} · {p.bpm} bpm</option>
              ))}
            </select>
            <button onClick={toggleBeat} style={{ padding: '9px 16px', border: 'none', borderLeft: `1px solid ${beatOn ? '#7442d6' : '#d6cdeb'}`, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: beatOn ? '#7442d6' : '#f1edfa', color: beatOn ? '#ffffff' : '#5a2fc0', whiteSpace: 'nowrap' }}>{beatLabel}</button>
          </div>
          </div>
        </div>
      </div>

      {/* KIT */}
      <div
        ref={containerRef}
        onPointerDown={onKitDown}
        style={isNarrow
          ? { flex: 'none', width: '100%', aspectRatio: '29 / 20', display: 'flex', alignItems: 'stretch', justifyContent: 'center', background: SCENES[scene].wall, position: 'relative', touchAction: 'none' }
          : { flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'center', background: SCENES[scene].wall, position: 'relative', touchAction: 'none' }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {/* COUNTDOWN OVERLAY */}
      {countdown > 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 40 }}>
          <div style={{ width: 170, height: 170, borderRadius: '50%', background: 'rgba(10,12,16,0.82)', border: '4px solid #e5484d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 90, fontWeight: 700, color: '#ffffff', boxShadow: '0 12px 40px rgba(0,0,0,0.45)' }}>{countdown}</div>
        </div>
      )}

      {/* SHORTCUTS OVERLAY */}
      {shortcutsOpen && (
        <div onClick={() => setShortcutsOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(5,6,10,0.66)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e6e1f2', borderRadius: 16, padding: '28px 32px', width: 640, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#1d1830' }}>Keyboard shortcuts</div>
              <button onClick={() => setShortcutsOpen(false)} style={{ border: '1px solid #d6cdeb', background: '#ffffff', color: '#3c3355', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>Close</button>
            </div>
            <div style={{ fontSize: 13, color: '#6d6685', marginBottom: 18, lineHeight: 1.5 }}>Left hand plays snare and bass drum. Right hand plays cymbals and toms. On crash and ride, edge, body and bell each have their own sound. MIDI drum kits are supported — just plug in and play.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 28px' }}>
              {SHORTCUT_LIST.map(s => (
                <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }}>
                  <span style={{ display: 'inline-block', minWidth: 84, textAlign: 'center', padding: '5px 10px', border: '1px solid #d6cdeb', borderBottomWidth: 3, borderRadius: 7, background: '#f1edfa', color: '#1d1830', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'nowrap' }}>{s.k}</span>
                  <span style={{ fontSize: 14, color: '#4b4463' }}>{s.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BEAT EDITOR */}
      <BeatEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initialPattern={allPatterns[beatIdx] ?? null}
        onSave={handleSaveCustomPattern}
        trigger={(id, vel) => trigger(id, vel, true)}
        kit={kit}
        onKitChange={setKit}
      />
    </div>
  )
}
