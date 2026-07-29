import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prepareSoundfont, playGuitarToneAtMidi } from '../../lib/guitarTab/guitarAudio'
import { loadPianoSamples, getPianoSample } from '../../lib/virtualPiano/pianoSamples'

import { ACCENT, TEXT, MUTED, FAINT, BORDER, BORDER_LIGHT, PILL_BG, CARD_BG } from './palette'

type Instrument = 'guitar' | 'piano' | 'ukulele'

// ── Chord theory ──────────────────────────────────────────────────────────
// Vive en src/lib/chordTheory.ts porque el identificador inverso
// (src/lib/chordIdentify.ts) necesita exactamente los mismos datos, y tenerlos duplicados
// garantizaba que las dos direcciones divergieran en cuanto alguien tocara un tipo.
import {
  DEG, ROOTS, LETPC, EN, LA, TUN, UKT, GMID, UMID,
  TYPES, GROUPS, G1, G2, G3, spell, nn, type ChordType,
} from '../../lib/chordTheory'

// ── Voicing data (chords.json) ──────────────────────────────────────────────
type ChordsDB = Record<string, Record<string, { p: string; f: string }[]>>
type ParsedVoicing = {
  v: number[]
  an: { fingers: Record<number, number>; barres: { finger: number; fret: number; from: number; to: number }[]; minF: number; maxF: number }
}

function parseVoicing(e: { p: string; f: string }, n: number): ParsedVoicing | null {
  const v = String(e.p).split(',').map(t => (t === 'x' ? -1 : parseInt(t, 10)))
  if (v.length !== n || v.some(isNaN)) return null
  const digits = String(e.f || '').replace(/[^0-9]/g, '')
  const fingers: Record<number, number> = {}
  let i = 0
  for (let s = 0; s < n; s++) if (v[s] > 0) { const d = digits[i++]; if (d && d !== '0') fingers[s] = +d }
  const groups: Record<string, number[]> = {}
  Object.keys(fingers).forEach(sk => {
    const s = +sk
    const k = fingers[s] + '@' + v[s]
    ;(groups[k] = groups[k] || []).push(s)
  })
  const barres: ParsedVoicing['an']['barres'] = []
  Object.keys(groups).forEach(k => {
    const ss = groups[k]
    if (ss.length > 1) {
      const [finger, fret] = k.split('@').map(Number)
      barres.push({ finger, fret, from: Math.min(...ss), to: Math.max(...ss) })
    }
  })
  const fr = v.filter(f => f > 0)
  return { v, an: { fingers, barres, minF: fr.length ? Math.min(...fr) : 0, maxF: fr.length ? Math.max(...fr) : 0 } }
}

type Geometry = { sw: number; fh: number; padL: number; padR: number; padT: number; padB: number; dotR: number }
type DiagramOpts = {
  lefty: boolean; showFingers: boolean; full: boolean; accent: string; tun: number[]
  noteFor?: (pc: number) => { t: string; root: boolean } | null
  activeS?: number | 'all' | null
}
type DiagramData = {
  w: number; h: number; gridTop: number; gridH: number; gridLeft: number; gridW: number
  strings: { x: number }[]
  frets: { y: number; h: number; bg: string }[]
  dots: { x: number; y: number; n: string; sc: number; bg: string; gl: string }[]
  tops: { x: number; y: number; t: string; sc: number; c: string }[]
  notes: { x: number; y: number; t: string; c: string }[]
  barres: { x: number; y: number; w: number; h: number; n: string; gl: string }[]
  baseLabel: string; baseY: number
}

function buildDiagram(vo: ParsedVoicing, g: Geometry, o: DiagramOpts): DiagramData {
  const v = vo.v, an = vo.an, L = o.lefty, N = v.length
  const X = (s: number) => g.padL + (L ? N - 1 - s : s) * g.sw
  const nut = an.maxF <= 4
  const base = nut ? 1 : an.minF
  const gw = (N - 1) * g.sw
  const d: DiagramData = {
    w: g.padL + gw + g.padR, h: g.padT + 4 * g.fh + g.padB,
    gridTop: g.padT, gridH: 4 * g.fh, gridLeft: g.padL, gridW: gw,
    strings: [], frets: [], dots: [], tops: [], notes: [], barres: [],
    baseLabel: nut ? '' : base + 'fr', baseY: g.padT + 0.5 * g.fh - (o.full ? 9 : 5),
  }
  for (let s = 0; s < N; s++) d.strings.push({ x: X(s) - (o.full ? 1 : 0.5) })
  for (let i = 0; i <= 4; i++) {
    const isNut = i === 0 && nut
    const th = isNut ? (o.full ? 5 : 3) : (o.full ? 2 : 1)
    d.frets.push({ y: g.padT + i * g.fh - th / 2, h: th, bg: isNut ? '#241d33' : '#b9b0cc' })
  }
  const inBarre = (s: number) => an.barres.some(b => v[s] === b.fret && s >= b.from && s <= b.to && an.fingers[s] === b.finger)
  for (let s = 0; s < N; s++) {
    const f = v[s]
    const on = o.activeS === 'all' || (o.activeS != null && o.activeS === s)
    if (f < 0) { d.tops.push({ x: X(s), y: g.padT - (o.full ? 18 : 9), t: '×', sc: 1, c: '#8a819e' }); continue }
    if (f === 0) {
      d.tops.push({ x: X(s), y: g.padT - (o.full ? 18 : 9), t: '○', sc: on ? 1.35 : 1, c: on ? o.accent || '#8a819e' : '#8a819e' })
    } else {
      const rel = f - base + 1, covered = inBarre(s)
      if (!covered) {
        d.dots.push({ x: X(s), y: g.padT + (rel - 0.5) * g.fh, n: o.showFingers ? String(an.fingers[s] || '') : '', sc: on ? 1.28 : 1, bg: o.accent || '#7C3AED', gl: on ? '0 0 0 6px ' + (o.accent || '#7C3AED') + '33' : 'none' })
      } else if (on && o.activeS !== 'all') {
        d.dots.push({ x: X(s), y: g.padT + (rel - 0.5) * g.fh, n: '', sc: 1.28, bg: o.accent || '#7C3AED', gl: '0 0 0 6px ' + (o.accent || '#7C3AED') + '33' })
      }
    }
    if (o.noteFor) {
      const info = o.noteFor((o.tun[s] + f) % 12)
      if (info) d.notes.push({ x: X(s), y: g.padT + 4 * g.fh + 12, t: info.t, c: info.root ? o.accent : '#6f6788' })
    }
  }
  an.barres.forEach(b => {
    const rel = b.fret - base + 1
    const xa = X(b.from), xb = X(b.to)
    const bon = o.activeS === 'all'
    d.barres.push({ x: Math.min(xa, xb) - g.dotR, y: g.padT + (rel - 0.5) * g.fh - g.dotR * 0.95, w: Math.abs(xb - xa) + 2 * g.dotR, h: g.dotR * 1.9, n: o.showFingers ? String(b.finger) : '', gl: bon ? '0 0 0 5px ' + (o.accent || '#7C3AED') + '33' : 'none' })
  })
  return d
}

// ── Audio ────────────────────────────────────────────────────────────────
function buildPianoVoice(ctx: AudioContext, dest: AudioNode, buf: AudioBuffer, t: number) {
  const src = ctx.createBufferSource()
  src.buffer = buf
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.85, t + 0.006)
  g.gain.setTargetAtTime(0.0001, t + 0.05, 1.1)
  src.connect(g); g.connect(dest)
  src.start(t)
  src.stop(t + 3.5)
}

type NoteEvent = { midi: number; id: number | string }

export function ChordFinderTool({ instrument, accent = ACCENT, showFingerNumbers = true }: { instrument: Instrument; accent?: string; showFingerNumbers?: boolean }) {
  const [rootIdx, setRootIdx] = useState(0)
  const [typeId, setTypeId] = useState('maj')
  const [typeTab, setTypeTab] = useState(0)
  const [notation, setNotation] = useState<'english' | 'latin'>('english')
  const [lefty, setLefty] = useState(false)
  const [posIdx, setPosIdx] = useState(0)
  const [activeId, setActiveId] = useState<number | string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [db, setDb] = useState<ChordsDB | null>(null)

  const isPiano = instrument === 'piano'
  const isGuitar = !isPiano

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const notesRef = useRef<NoteEvent[]>([])
  const pianoCtxRef = useRef<AudioContext | null>(null)
  const pianoGainRef = useRef<GainNode | null>(null)

  // Load voicing data. Split per instrument and dynamically imported — not a
  // top-level import — so each page's JS chunk only carries the tuning data
  // it actually uses: guitar never pulls in ukulele voicings, ukulele never
  // pulls in guitar's (roughly 2.7x bigger, 6-string vs 4-string), and piano
  // pulls in neither since it doesn't use voicing data at all.
  useEffect(() => {
    if (!isGuitar) return
    let cancelled = false
    const loader = instrument === 'ukulele'
      ? import('../../data/chordVoicingsUkulele.json')
      : import('../../data/chordVoicingsGuitar.json')
    loader.then(mod => { if (!cancelled) setDb(mod.default as ChordsDB) }).catch(() => {})
    return () => { cancelled = true }
  }, [isGuitar, instrument])

  // Preload real audio so the first Play press doesn't stall
  useEffect(() => {
    if (isPiano) {
      if (!pianoCtxRef.current) {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        const g = ctx.createGain(); g.gain.value = 0.9; g.connect(ctx.destination)
        pianoCtxRef.current = ctx; pianoGainRef.current = g
      }
      loadPianoSamples(pianoCtxRef.current).catch(() => {})
    } else if (instrument === 'guitar') {
      prepareSoundfont('sf2').catch(() => {})
    }
  }, [isPiano, instrument])

  const stop = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setActiveId(null)
    setPlaying(false)
  }, [])

  const playTone = useCallback((midi: number) => {
    if (isPiano) {
      const ctx = pianoCtxRef.current
      if (!ctx || !pianoGainRef.current) return
      if (ctx.state === 'suspended') ctx.resume()
      const buf = getPianoSample(midi)
      if (buf) buildPianoVoice(ctx, pianoGainRef.current, buf, ctx.currentTime + 0.01)
    } else {
      playGuitarToneAtMidi(midi, instrument === 'guitar' ? 'sf2' : 'nylon')
    }
  }, [isPiano, instrument])

  const play = useCallback(() => {
    if (playing) { stop(); return }
    const notes = notesRef.current
    if (!notes.length) return
    timersRef.current = []
    const gap = 0.5
    notes.forEach((n, i) => {
      timersRef.current.push(setTimeout(() => { playTone(n.midi); setActiveId(n.id) }, i * gap * 1000))
    })
    const tEnd = notes.length * gap + 0.15
    timersRef.current.push(setTimeout(() => {
      setActiveId('all')
      notes.forEach((n, i) => {
        timersRef.current.push(setTimeout(() => playTone(n.midi), i * 45))
      })
    }, tEnd * 1000))
    timersRef.current.push(setTimeout(() => { setActiveId(null); setPlaying(false) }, (tEnd + 1.5) * 1000))
    setPlaying(true)
  }, [playing, playTone, stop])

  // Space-bar shortcut — excludes BUTTON too (not just INPUT/SELECT/TEXTAREA)
  // so a focused button's own native Space-activation isn't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); play() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play])

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout)
    pianoCtxRef.current?.close().catch(() => {})
  }, [])

  // Reset position when root/type changes
  const setRoot = (i: number) => { setRootIdx(i); setPosIdx(0) }
  const setType = (id: string) => { setTypeId(id); setPosIdx(0) }

  const root = ROOTS[rootIdx]
  const li = root[0], acc = root[1]
  const rootPc = (((LETPC[li] + acc) % 12) + 12) % 12
  const type = TYPES.find(t => t.id === typeId)!
  const noteObjs = useMemo(() => type.degs.map(dt => { const n = spell(li, acc, dt); return { ...n, name: nn(n, notation) } }), [type, li, acc, notation])
  const rootName = nn({ l: li, a: acc }, notation)
  const chordName = rootName + type.suf
  const notesText = noteObjs.map(n => n.name).join(' – ')

  const chip = (label: string, active: boolean, onClick: () => void) => ({ label, active, onClick })
  const roots = ROOTS.map((r, i) => chip(nn({ l: r[0], a: r[1] }, notation), i === rootIdx, () => setRoot(i)))
  const typeTabs = GROUPS.map((g, i) => ({ label: g, active: i === typeTab, onClick: () => setTypeTab(i) }))
  const activeGroup = GROUPS[typeTab]
  const typeChips = TYPES.filter(t => t.group === activeGroup).map(t => chip(t.suf || 'maj', t.id === typeId, () => setType(t.id)))

  const noteFor = (pc: number) => { const n = noteObjs.find(x => x.pc === pc); return n ? { t: n.name, root: pc === rootPc } : null }

  let main: DiagramData | null = null
  let alts: { d: DiagramData; active: boolean; onClick: () => void; label: string }[] = []
  let voicingText = ''
  const notes: NoteEvent[] = []

  if (isGuitar) {
    const rootKey = EN[li] + (acc === -1 ? 'b' : acc === 1 ? '#' : '')
    const tuningKey = instrument === 'ukulele' ? 'GCEA' : 'EADGBE'
    const tun = instrument === 'ukulele' ? UKT : TUN
    const mid = instrument === 'ukulele' ? UMID : GMID
    const n = tuningKey === 'GCEA' ? 4 : 6
    const rawVs = db ? (db[tuningKey]?.[rootKey + type.k] || []) : []
    const vs = rawVs.map(e => parseVoicing(e, n)).filter((x): x is ParsedVoicing => x !== null)
    const pi = Math.min(posIdx, Math.max(0, vs.length - 1))
    if (vs.length) {
      main = buildDiagram(vs[pi], { sw: 42, fh: 50, padL: 46, padR: 22, padT: 50, padB: 34, dotR: 14 }, { lefty, showFingers: showFingerNumbers, noteFor, full: true, accent, tun, activeS: activeId as number | 'all' | null })
      const seq = lefty ? vs[pi].v.slice().reverse() : vs[pi].v
      voicingText = seq.map(f => (f < 0 ? 'x' : f)).join(' ')
      vs[pi].v.forEach((f, s) => { if (f >= 0) notes.push({ midi: mid[s] + f, id: s }) })
      alts = vs.map((vv, i) => ({
        d: buildDiagram(vv, { sw: 15, fh: 15, padL: 16, padR: 9, padT: 15, padB: 5, dotR: 4.5 }, { lefty, showFingers: false, full: false, accent, tun }),
        active: i === pi,
        onClick: () => setPosIdx(i),
        label: i === 0 ? 'Common' : 'Pos. ' + (i + 1),
      }))
    }
  }

  const WW = 34
  const whiteKeys: { x: number; w: number; bg: string; fg: string; gl: string; label: string }[] = []
  const blackKeys: { x: number; bg: string; gl: string; label: string }[] = []
  if (isPiano) {
    const semis = noteObjs.map(n => ({ semi: rootPc + n.semi, name: n.name, root: n.pc === rootPc }))
    semis.slice().sort((a, b) => a.semi - b.semi).forEach(x => notes.push({ midi: 48 + x.semi, id: x.semi }))
    const hl = (s: number) => semis.find(x => x.semi === s)
    const WSEM = [0, 2, 4, 5, 7, 9, 11]
    for (let i = 0; i < 21; i++) {
      const sm = Math.floor(i / 7) * 12 + WSEM[i % 7], h = hl(sm)
      const on = !!h && (activeId === sm || activeId === 'all')
      whiteKeys.push({
        x: i * WW + 1, w: WW - 2,
        bg: on ? accent : h ? (h.root ? accent : accent + '99') : '#ffffff',
        fg: h && (h.root || on) ? '#ffffff' : '#2d2148',
        gl: on ? '0 6px 16px ' + accent + '88' : 'none',
        label: h ? h.name : '',
      })
    }
    const BOFF = [0, 1, 3, 4, 5], BSEM = [1, 3, 6, 8, 10]
    for (let o = 0; o < 3; o++) for (let j = 0; j < 5; j++) {
      const sm = o * 12 + BSEM[j], h = hl(sm)
      const on = !!h && (activeId === sm || activeId === 'all')
      blackKeys.push({
        x: (o * 7 + BOFF[j]) * WW + WW - 10,
        bg: on ? accent : h ? (h.root ? accent : accent + 'C9') : '#241d33',
        gl: on ? '0 4px 14px ' + accent + 'AA' : '0 2px 3px rgba(20,10,40,0.35)',
        label: h ? h.name : '',
      })
    }
  }

  notesRef.current = notes
  const loading = isGuitar && !db

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: "'Hanken Grotesk', system-ui, sans-serif", color: TEXT }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ display: 'inline-flex', background: PILL_BG, borderRadius: 10, padding: 3 }}>
          <button onClick={() => setNotation('english')} style={{ border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, background: notation === 'english' ? '#fff' : 'transparent', color: notation === 'english' ? '#241d33' : '#6f6788', boxShadow: notation === 'english' ? '0 1px 3px rgba(30,20,60,0.18)' : 'none', whiteSpace: 'nowrap', cursor: 'pointer' }}>C D E</button>
          <button onClick={() => setNotation('latin')} style={{ border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, background: notation === 'latin' ? '#fff' : 'transparent', color: notation === 'latin' ? '#241d33' : '#6f6788', boxShadow: notation === 'latin' ? '0 1px 3px rgba(30,20,60,0.18)' : 'none', whiteSpace: 'nowrap', cursor: 'pointer' }}>Do Re Mi</button>
        </div>
        {isGuitar && (
          <button onClick={() => setLefty(l => !l)} style={{ border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: lefty ? accent : '#ffffff', color: lefty ? '#ffffff' : '#3c3452', whiteSpace: 'nowrap', cursor: 'pointer' }}>Left-handed</button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        {/* Root note / chord type panel */}
        <section style={{ flex: '0 1 330px', minWidth: 290, background: CARD_BG, border: `1px solid ${BORDER_LIGHT}`, borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 1px 4px rgba(40,25,80,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: FAINT }}>1 &middot; Root note</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {roots.map((r, i) => (
                <button key={i} onClick={r.onClick} style={{ border: `1.5px solid ${r.active ? accent : BORDER}`, background: r.active ? accent : '#ffffff', color: r.active ? '#ffffff' : '#3c3452', borderRadius: 10, height: 44, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{r.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: FAINT }}>2 &middot; Chord type</div>
            <div style={{ display: 'flex', background: PILL_BG, borderRadius: 10, padding: 3 }}>
              {typeTabs.map((tb, i) => (
                <button key={i} onClick={tb.onClick} style={{ flex: 1, border: 'none', borderRadius: 8, padding: '8px 4px', fontSize: 12, fontWeight: 600, background: tb.active ? '#fff' : 'transparent', color: tb.active ? '#241d33' : '#6f6788', boxShadow: tb.active ? '0 1px 3px rgba(30,20,60,0.18)' : 'none', whiteSpace: 'nowrap', cursor: 'pointer' }}>{tb.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {typeChips.map((t, i) => (
                <button key={i} onClick={t.onClick} style={{ border: `1.5px solid ${t.active ? accent : BORDER}`, background: t.active ? accent : '#ffffff', color: t.active ? '#ffffff' : '#3c3452', borderRadius: 10, padding: '9px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t.label}</button>
              ))}
            </div>
          </div>
        </section>

        {/* Chord display panel */}
        <section style={{ flex: '1 1 440px', minWidth: 340, background: CARD_BG, border: `1px solid ${BORDER_LIGHT}`, borderRadius: 18, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 1px 4px rgba(40,25,80,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 42, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1 }}>{chordName}</div>
              <div style={{ marginTop: 5, fontSize: 15, color: MUTED, fontWeight: 500 }}>{notesText}</div>
            </div>
            <button onClick={play} style={{ border: 'none', borderRadius: 12, padding: '13px 22px', fontSize: 15, fontWeight: 700, background: playing ? '#3c3452' : accent, color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(90,50,180,0.3)', cursor: 'pointer' }}>
              {playing ? '■ Stop' : '▶ Play chord'}
              <span style={{ opacity: 0.75, fontWeight: 600, fontSize: 11, border: '1px solid rgba(255,255,255,0.45)', borderRadius: 5, padding: '1px 6px' }}>Space</span>
            </button>
          </div>

          {isPiano && (
            <div style={{ overflowX: 'auto', paddingTop: 4 }}>
              <div style={{ position: 'relative', height: 176, width: 21 * WW }}>
                {whiteKeys.map((k, i) => (
                  <div key={i} style={{ position: 'absolute', top: 0, left: k.x, width: k.w, height: 172, background: k.bg, border: '1px solid #d8d2e4', borderRadius: '0 0 6px 6px', boxSizing: 'border-box', zIndex: 1, boxShadow: k.gl, transition: 'background 0.12s ease, box-shadow 0.12s ease' }}>
                    <div style={{ position: 'absolute', bottom: 7, left: 0, right: 0, textAlign: 'center', fontSize: 11, fontWeight: 700, color: k.fg }}>{k.label}</div>
                  </div>
                ))}
                {blackKeys.map((k, i) => (
                  <div key={i} style={{ position: 'absolute', top: 0, left: k.x, width: 20, height: 106, background: k.bg, borderRadius: '0 0 4px 4px', zIndex: 2, boxShadow: k.gl, transition: 'background 0.12s ease, box-shadow 0.12s ease' }}>
                    <div style={{ position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#ffffff' }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isGuitar && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 340 }}>
              {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
                    <div style={{ width: 258, height: 284, borderRadius: 14, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ width: 150, height: 14, borderRadius: 7, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />
                      <div style={{ width: 170, height: 14, borderRadius: 7, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />
                      <div style={{ width: 130, height: 14, borderRadius: 7, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ width: 98, height: 106, borderRadius: 12, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />
                    <div style={{ width: 98, height: 106, borderRadius: 12, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />
                    <div style={{ width: 98, height: 106, borderRadius: 12, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />
                  </div>
                </div>
              )}
              {main && (
                <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: main.w, height: main.h }}>
                    {main.strings.map((s, i) => <div key={i} style={{ position: 'absolute', left: s.x, top: main!.gridTop, width: 2, height: main!.gridH, background: '#4a415f' }} />)}
                    {main.frets.map((f, i) => <div key={i} style={{ position: 'absolute', left: main!.gridLeft, top: f.y, height: f.h, width: main!.gridW, background: f.bg }} />)}
                    {main.barres.map((br, i) => (
                      <div key={i} style={{ position: 'absolute', left: br.x, top: br.y, width: br.w, height: br.h, borderRadius: 99, background: accent, color: '#ffffff', display: 'flex', alignItems: 'center', paddingLeft: 10, boxSizing: 'border-box', fontSize: 12, fontWeight: 700, boxShadow: br.gl, transition: 'box-shadow 0.12s ease' }}>{br.n}</div>
                    ))}
                    {main.dots.map((d, i) => (
                      <div key={i} style={{ position: 'absolute', left: d.x, top: d.y, transform: `translate(-50%,-50%) scale(${d.sc})`, width: 28, height: 28, borderRadius: '50%', background: d.bg, boxShadow: d.gl, transition: 'transform 0.12s ease, box-shadow 0.12s ease', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{d.n}</div>
                    ))}
                    {main.tops.map((t, i) => (
                      <div key={i} style={{ position: 'absolute', left: t.x, top: t.y, transform: `translate(-50%,-50%) scale(${t.sc})`, transition: 'transform 0.12s ease, color 0.12s ease', fontSize: 15, fontWeight: 600, color: t.c }}>{t.t}</div>
                    ))}
                    {main.notes.map((n, i) => (
                      <div key={i} style={{ position: 'absolute', left: n.x, top: n.y, transform: 'translateX(-50%)', fontSize: 12, fontWeight: 700, color: n.c }}>{n.t}</div>
                    ))}
                    {main.baseLabel && <div style={{ position: 'absolute', left: 2, top: main.baseY, fontSize: 13, fontWeight: 600, color: '#6f6788' }}>{main.baseLabel}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 170 }}>
                    <div style={{ fontSize: 13, color: MUTED }}>Frets: <span style={{ fontWeight: 700, color: '#3c3452', letterSpacing: 2 }}>{voicingText}</span></div>
                    <div style={{ fontSize: 12, color: FAINT, lineHeight: 1.6 }}>Fingers: 1 index &middot; 2 middle<br />3 ring &middot; 4 pinky</div>
                    <div style={{ fontSize: 12, color: FAINT }}>&#215; don&apos;t play &middot; &#9675; open string</div>
                  </div>
                </div>
              )}
              {main && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: FAINT }}>Positions</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {alts.map((a, i) => (
                      <button key={i} onClick={a.onClick} style={{ border: `1.5px solid ${a.active ? accent : BORDER}`, background: a.active ? '#f4efff' : '#ffffff', borderRadius: 12, padding: '8px 8px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                        <div style={{ position: 'relative', width: a.d.w, height: a.d.h }}>
                          {a.d.strings.map((s, j) => <div key={j} style={{ position: 'absolute', left: s.x, top: a.d.gridTop, width: 1, height: a.d.gridH, background: '#7d7494' }} />)}
                          {a.d.frets.map((f, j) => <div key={j} style={{ position: 'absolute', left: a.d.gridLeft, top: f.y, height: f.h, width: a.d.gridW, background: f.bg }} />)}
                          {a.d.barres.map((br, j) => <div key={j} style={{ position: 'absolute', left: br.x, top: br.y, width: br.w, height: br.h, borderRadius: 99, background: accent }} />)}
                          {a.d.dots.map((d, j) => <div key={j} style={{ position: 'absolute', left: d.x, top: d.y, transform: 'translate(-50%,-50%)', width: 9, height: 9, borderRadius: '50%', background: accent }} />)}
                          {a.d.tops.map((t, j) => <div key={j} style={{ position: 'absolute', left: t.x, top: t.y, transform: 'translate(-50%,-50%)', fontSize: 8, color: FAINT }}>{t.t}</div>)}
                          {a.d.baseLabel && <div style={{ position: 'absolute', left: 0, top: a.d.baseY, fontSize: 8, fontWeight: 600, color: FAINT }}>{a.d.baseLabel}</div>}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>{a.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <style>{'@keyframes om-pulse{0%,100%{opacity:1}50%{opacity:0.5}}'}</style>
    </div>
  )
}
