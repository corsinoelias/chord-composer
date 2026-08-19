import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChordAudio, type NoteEvent } from './useChordAudio'
import { useContainerWidth } from './useContainerWidth'
import { ACCENT, TEXT, MUTED, FAINT, BORDER, BORDER_LIGHT, PILL_BG, CARD_BG } from './palette'
import { useIsMobile } from '../../hooks/use-mobile'
import { ROOTS, GROUPS, TYPES, LETPC, TUN, UKT, GMID, UMID, spell, nn } from '../../lib/chordTheory'
import {
  buildDiagram, voicingsFor, rootKeyOf, rootIdxForPc, pcOfRoot, defName,
  matchChords, matchShape, nameFor, parseChordQuery, searchSuggestions,
  type ChordsDB, type DiagramData, type NamedNote, type Notation, type Instrument,
} from './chordFinderLogic'

// Buscador de acordes en dos direcciones.
//
// "Name → notes" parte del nombre y dibuja la digitacion; "Notes → name" parte de lo que
// tienes bajo los dedos y devuelve el nombre. Son un solo componente y no dos porque el
// interes esta en pasar de uno a otro sin perder nada: al cambiar de modo se transfiere el
// acorde, de forma que puedes buscar un Cmaj7, saltar al diapason y mover un dedo para ver
// en que se convierte.

type Mode = 'build' | 'identify'

// ── Diapason del identificador ─────────────────────────────────────────────
// Espaciado logaritmico real (cada traste es un 2^(-1/12) del resto de cuerda), no trastes
// de ancho fijo. Es lo que hace que el mastil se reconozca de un vistazo como un mastil.

const FN = 15
const SC = (n: number) => 1 - Math.pow(2, -n / 12)
const NUT_W = 9, BOARD_Y = 14
/** Tablero a tamano de escritorio: los 15 trastes en 820px. */
const BOARD_MAX = 820
/** 77 de cuerdas al aire + tablero + 14 de aire a la derecha. */
const FB_NATURAL_W = 77 + BOARD_MAX + 14

type FbMetrics = {
  f0: number; visible: number; openX: number; nutX: number; boardX: number
  boardPx: number; sp: number; compact: boolean
  fx: (n: number) => number
}

/**
 * Medidas del diapason para el ancho disponible.
 *
 * El mastil entero mide 911px y no hay movil que lo aguante. Encogerlo dejaria las celdas de
 * traste en 10px, asi que en su lugar se muestra una VENTANA de trastes que ocupa todo el
 * ancho: las proporciones logaritmicas se mantienen dentro de la ventana —que es lo que hace
 * que siga leyendose como un mastil— y el espaciado entre cuerdas se decide aparte, de modo
 * que estrechar la pantalla nunca aplasta las cuerdas unas contra otras.
 *
 * A partir de ~900px la ventana es el mastil completo y las medidas coinciden exactamente con
 * las de siempre.
 */
function fretsVisible(total: number) {
  const w = Math.max(240, total)
  return w < 420 ? 5 : w < 620 ? 7 : w < 900 ? 10 : FN
}

function fretMetrics(total: number, fretWin: number, strings: number): FbMetrics {
  const w = Math.max(240, total)
  const compact = w < 420
  const visible = fretsVisible(w)
  const f0 = Math.min(Math.max(0, Math.round(fretWin)), FN - visible)
  const openX = compact ? 20 : 34
  const nutX = compact ? 44 : 68
  const boardX = nutX + NUT_W
  const boardPx = Math.min(w - boardX - (compact ? 8 : 14), BOARD_MAX)
  const base = SC(f0)
  const k = boardPx / (SC(f0 + visible) - base)
  return {
    f0, visible, openX, nutX, boardX, boardPx, compact,
    // Con la ventana entera las seis cuerdas caben holgadas; en movil se separan para que
    // cada celda sea un objetivo de dedo y no de raton.
    sp: strings === 4 ? 34 : compact ? 34 : 27,
    fx: (n: number) => boardX + (SC(n) - base) * k,
  }
}

// ── Teclado ────────────────────────────────────────────────────────────────

/** Tecla blanca a tamano de escritorio: tres octavas en 714px. */
const KEY_W_MAX = 34
const PIANO_OCTAVES = 3
const PIANO_NATURAL_W = 21 * KEY_W_MAX

type PianoMetrics = {
  ww: number; bw: number; bwId: number; oct: number; o0: number; w: number
  label: number; blabel: number
}

/**
 * La misma idea que en el mastil: cuando no caben las tres octavas se muestran dos y la tecla
 * se estrecha hasta llenar el ancho. La ALTURA no se toca, que es lo que hace que una blanca
 * de 21px siga siendo comoda de pulsar — un piano de movil se ve asi.
 */
function pianoMetrics(total: number, octWin: number): PianoMetrics {
  const w = Math.max(210, total)
  const oct = w >= 21 * 26 ? PIANO_OCTAVES : 2
  const ww = Math.min(KEY_W_MAX, w / (7 * oct))
  return {
    ww, oct,
    o0: oct >= PIANO_OCTAVES ? 0 : Math.min(Math.max(0, octWin), PIANO_OCTAVES - oct),
    bw: Math.max(12, Math.round(ww * 0.588)),
    bwId: Math.max(13, Math.round(ww * 0.647)),
    w: ww * 7 * oct,
    label: Math.max(8, Math.round(ww * 0.324)),
    blabel: Math.max(7, Math.round(ww * 0.265)),
  }
}

const INTERVALS = [
  'unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
  'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th',
]

const HOVER_CSS = `
@keyframes om-pulse{0%,100%{opacity:1}50%{opacity:0.5}}
/* El anillo late para que se vea de un golpe QUE posiciones son la nota senalada,
   incluso cuando son tres repartidas por el mastil. */
@keyframes cf-ping{0%,100%{box-shadow:0 0 0 3px var(--cf-glow)}50%{box-shadow:0 0 0 9px var(--cf-glow-soft)}}
.cf-hit{animation:cf-ping 1.1s ease-in-out infinite}
/* Solo donde hay raton de verdad: en tactil el :hover se queda pegado despues de un toque
   y deja celdas del mastil iluminadas sin motivo. */
@media (hover:hover){
  .cf-b:hover{border-color:var(--cf-accent)!important}
  .cf-bright:hover{filter:brightness(1.08)}
  .cf-cell:hover{background:rgba(255,255,255,0.14)!important}
  .cf-clear:hover{color:#3c3452!important}
}
.cf-tap{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
/* Tiras que se desplazan a lo ancho cuando no caben (capo, familias de acordes). */
.cf-strip{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.cf-strip::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion:reduce){.cf-hit{animation:none;box-shadow:0 0 0 5px var(--cf-glow)}}
`

type Seg = { label: string; onClick: () => void; bg: string; fg: string; sh: string }
const seg = (label: string, active: boolean, onClick: () => void): Seg => ({
  label, onClick,
  bg: active ? '#ffffff' : 'transparent',
  fg: active ? TEXT : MUTED,
  sh: active ? '0 1px 3px rgba(30,20,60,0.18)' : 'none',
})

const segStyle = (s: Seg, extra?: React.CSSProperties): React.CSSProperties => ({
  border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
  background: s.bg, color: s.fg, boxShadow: s.sh, whiteSpace: 'nowrap', ...extra,
})

/** Lo que el identificador acaba concluyendo, para poder llevarlo al otro modo. */
type Candidate = {
  name: string
  notes: NamedNote[]
  tid: string
  rootPc: number
  posIdx: number
  shapeLabel: string
  note: string
}

export function ChordFinderTool({
  instrument,
  accent = ACCENT,
  showFingerNumbers = true,
  showModeSwitch = true,
  initialRoot = 0,
  initialType = 'maj',
  initialMode = 'build',
}: {
  instrument: Instrument
  accent?: string
  showFingerNumbers?: boolean
  showModeSwitch?: boolean
  initialRoot?: number
  initialType?: string
  initialMode?: Mode
}) {
  const isPiano = instrument === 'piano'
  const N = instrument === 'ukulele' ? 4 : 6
  const tun = instrument === 'ukulele' ? UKT : TUN
  const mid = instrument === 'ukulele' ? UMID : GMID
  const tuningKey = instrument === 'ukulele' ? 'GCEA' : 'EADGBE'

  const [rootIdx, setRootIdx] = useState(initialRoot)
  const [typeId, setTypeId] = useState(initialType)
  const [typeTab, setTypeTab] = useState(0)
  const [notation, setNotation] = useState<Notation>('english')
  const [lefty, setLefty] = useState(false)
  const [posIdx, setPosIdx] = useState(0)
  const [capo, setCapoState] = useState(0)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [pick, setPick] = useState(0)
  const [sel, setSel] = useState<number[]>([])
  const [fretSel, setFretSel] = useState<number[] | null>(null)
  const [query, setQuery] = useState('')
  const [querySel, setQuerySel] = useState(0)
  const [queryFocus, setQueryFocus] = useState(false)
  const [midiState, setMidiState] = useState<'off' | 'connecting' | 'on' | 'none' | 'denied' | 'unsupported'>('off')
  const [midiName, setMidiName] = useState('')
  const [db, setDb] = useState<ChordsDB | null>(null)
  // Nota senalada, como clase de altura. Va en un solo sitio para que el vaiven funcione en
  // las dos direcciones: la marca un circulo de "Notes in chord" o una posicion del
  // diagrama, y la leen las dos.
  const [hoverPc, setHoverPc] = useState<number | null>(null)
  /** Primer traste de la ventana visible del mastil. Ver `fretMetrics`. */
  const [fretWin, setFretWin] = useState(0)
  /** Primera octava visible del teclado cuando no caben las tres. */
  const [octWin, setOctWin] = useState(0)

  const isIdentify = mode === 'identify'
  const isBuild = !isIdentify
  const showBuildPiano = isPiano && isBuild
  const showBuildFret = !isPiano && isBuild

  // El resaltado cruzado (senalar una nota y verla encenderse en el instrumento) va con
  // hover. En tactil no hay hover: el toque lo enciende y lo deja pegado hasta que tocas
  // otra cosa. Ahi se apaga entero y el toque se queda solo con lo suyo, sonar la nota.
  const isMobile = useIsMobile()
  const canHover = !isMobile
  const hoverProps = useCallback(
    (pc: number | null) => (canHover ? { onMouseEnter: () => setHoverPc(pc), onMouseLeave: () => setHoverPc(null) } : null),
    [canHover],
  )

  // Con los dos paneles apilados el resultado cae debajo del pliegue: elegir un acorde del
  // desplegable y no ver lo que sale no es elegir nada.
  const outPanelRef = useRef<HTMLElement | null>(null)
  const revealResult = useCallback(() => {
    if (!isMobile) return
    requestAnimationFrame(() => outPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [isMobile])

  const { play: playNotes, playNote, stop, playing, activeId } = useChordAudio(instrument)
  const notesRef = useRef<NoteEvent[]>([])
  const play = useCallback(() => playNotes(notesRef.current), [playNotes])

  /** Suena la nota de una cuerda concreta del diagrama. */
  const pluckString = useCallback((s: number) => {
    const hit = notesRef.current.find(n => n.id === s)
    if (hit) playNote(hit.midi)
  }, [playNote])

  /** Suena una nota del acorde por su clase de altura; si cae en varias cuerdas, la mas grave. */
  const pluckPc = useCallback((pc: number | null) => {
    if (pc == null) return
    const hits = notesRef.current.filter(n => (((n.midi % 12) + 12) % 12) === pc).sort((a, b) => a.midi - b.midi)
    if (hits.length) playNote(hits[0].midi)
  }, [playNote])
  const queryElRef = useRef<HTMLInputElement | null>(null)
  const lastIdentRef = useRef<{ cur: Candidate | null; pcs: number[] }>({ cur: null, pcs: [] })

  // Los tres lienzos se dibujan con coordenadas absolutas, asi que cada uno se recalcula a
  // partir del hueco que tiene: no hay CSS que los adapte solo.
  const [fbBoxRef, fbBoxW] = useContainerWidth<HTMLDivElement>(FB_NATURAL_W)
  const [buildPianoRef, buildPianoW] = useContainerWidth<HTMLDivElement>(PIANO_NATURAL_W)
  const [identPianoRef, identPianoW] = useContainerWidth<HTMLDivElement>(PIANO_NATURAL_W)
  const [diagBoxRef, diagBoxW] = useContainerWidth<HTMLDivElement>(0)

  const fbVisible = useMemo(() => fretsVisible(fbBoxW), [fbBoxW])
  const fbM = useMemo(() => fretMetrics(fbBoxW, fretWin, N), [fbBoxW, fretWin, N])
  const buildPianoM = useMemo(() => pianoMetrics(buildPianoW, 0), [buildPianoW])
  const identPianoM = useMemo(() => pianoMetrics(identPianoW, octWin), [identPianoW, octWin])

  // Las digitaciones se cargan por instrumento y bajo demanda — no como import de nivel
  // superior — para que el chunk de cada pagina lleve solo su afinacion: la guitarra nunca
  // arrastra las del ukelele, el ukelele nunca las de guitarra (unas 2,7 veces mayores), y
  // el piano no carga ninguna porque no las usa.
  useEffect(() => {
    if (isPiano) return
    let cancelled = false
    const loader = instrument === 'ukulele'
      ? import('../../data/chordVoicingsUkulele.json')
      : import('../../data/chordVoicingsGuitar.json')
    loader.then(mod => { if (!cancelled) setDb(mod.default as ChordsDB) }).catch(() => {})
    return () => { cancelled = true }
  }, [isPiano, instrument])

  // Las preferencias se leen despues del montaje, no al inicializar el estado: la isla se
  // renderiza tambien en el servidor, donde no hay localStorage, y leerlo durante el render
  // rompe la hidratacion.
  useEffect(() => {
    try {
      const n = localStorage.getItem('chordfinder_notation')
      const l = localStorage.getItem('chordfinder_lefty')
      if (n === 'latin' || n === 'english') setNotation(n)
      if (l) setLefty(l === '1')
    } catch { /* modo privado o cookies bloqueadas */ }
  }, [])

  const pickNotation = useCallback((n: Notation) => {
    try { localStorage.setItem('chordfinder_notation', n) } catch { /* ignora */ }
    setNotation(n)
  }, [])

  const toggleHand = useCallback(() => {
    setLefty(v => {
      const next = !v
      try { localStorage.setItem('chordfinder_lefty', next ? '1' : '0') } catch { /* ignora */ }
      return next
    })
  }, [])

  // Space toca el acorde, / salta al buscador. Se excluye BUTTON ademas de los campos de
  // texto: con un boton enfocado, Space es su propia activacion nativa y robarsela deja
  // los acordes y los tipos inservibles con el teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement && document.activeElement.tagName) || ''
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(tag)) return
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); play() }
      if (e.key === '/' && !e.repeat && queryElRef.current) {
        e.preventDefault()
        queryElRef.current.focus()
        queryElRef.current.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [play])

  // ── Estado del diapason ──────────────────────────────────────────────────
  // Los trastes se guardan ABSOLUTOS, no relativos al capo: es lo que se lee en el mastil,
  // y evita que mover el capo reinterprete en silencio los puntos ya puestos.
  const fs = useMemo(
    () => (fretSel && fretSel.length === N ? fretSel : new Array<number>(N).fill(-1)),
    [fretSel, N],
  )

  const setFret = useCallback((s: number, fr: number) => {
    stop()
    setFretSel(prev => {
      const cur = prev && prev.length === N ? prev.slice() : new Array<number>(N).fill(-1)
      cur[s] = cur[s] === fr ? -1 : fr
      return cur
    })
    setPick(0)
  }, [stop, N])

  // Al subir el capo, lo que quedaba por debajo ya no se puede pisar: esas cuerdas pasan a
  // sonar al aire sobre el capo, que es lo que ocurre de verdad.
  const setCapo = useCallback((c: number) => {
    stop()
    setFretSel(prev => {
      const cur = prev && prev.length === N ? prev.slice() : new Array<number>(N).fill(-1)
      for (let i = 0; i < N; i++) if (cur[i] > 0 && cur[i] <= c) cur[i] = 0
      return cur
    })
    setCapoState(c)
    setPick(0)
  }, [stop, N])

  const toggleKey = useCallback((sm: number) => {
    stop()
    setSel(prev => (prev.indexOf(sm) >= 0 ? prev.filter(x => x !== sm) : prev.concat([sm]).sort((a, b) => a - b)))
    setPick(0)
  }, [stop])

  /** Sube o baja la forma entera por el mastil, capo incluido. */
  const shiftShape = useCallback((delta: number) => {
    stop()
    const cur = fs.slice()
    const fretted: number[] = [], opens: number[] = []
    cur.forEach((f, i) => { if (f > capo) fretted.push(i); else if (f === 0) opens.push(i) })
    if (!fretted.length && !opens.length) return
    const hasOpen = opens.length > 0
    let nextCapo = capo
    if (delta > 0) {
      // Sin capo, una forma con cuerdas al aire solo puede subir poniendo uno: es
      // literalmente para lo que sirve.
      if (capo > 0) { nextCapo = Math.min(9, capo + 1); if (nextCapo === capo) return }
      else if (hasOpen) nextCapo = 1
    } else {
      if (capo > 0) nextCapo = capo - 1
      else if (hasOpen) return
    }
    const d = nextCapo !== capo ? nextCapo - capo : delta
    if (!d) return
    const next = cur.slice()
    let ok = true
    fretted.forEach(i => {
      const v = cur[i] + d
      if (v > FN || v <= nextCapo) ok = false
      else next[i] = v
    })
    if (!ok) return
    setCapoState(nextCapo)
    setFretSel(next)
    setPick(0)
  }, [stop, fs, capo])

  /** En modo build, Lower/Higher mueven capo y fundamental a la vez: la forma no cambia. */
  const shiftBuild = useCallback((delta: number) => {
    stop()
    const nextCapo = delta > 0 ? Math.min(9, capo + 1) : capo - 1
    if (nextCapo < 0 || nextCapo === capo) return
    const i = rootIdxForPc(pcOfRoot(rootIdx) + (nextCapo - capo))
    setCapoState(nextCapo)
    if (i >= 0) setRootIdx(i)
    setPosIdx(0)
  }, [stop, capo, rootIdx])

  const clearSel = useCallback(() => {
    stop()
    setSel([])
    setFretSel(new Array<number>(N).fill(-1))
    setPick(0)
  }, [stop, N])

  // ── MIDI ─────────────────────────────────────────────────────────────────
  // Solo tiene sentido en piano: un teclado no se corresponde con una forma de mastil.
  const midiAccessRef = useRef<MIDIAccess | null>(null)
  const heldRef = useRef<Record<number, 1>>({})
  // Al soltar todas las teclas, el siguiente acorde empieza de cero en vez de acumularse
  // sobre el anterior. Sin esto, tocar dos acordes seguidos daba la union de los dos.
  const freezeRef = useRef(false)

  const handleMidi = useCallback((ev: MIDIMessageEvent) => {
    const d = ev.data as Uint8Array | null
    if (!d || d.length < 3) return
    const cmd = d[0] & 0xf0, note = d[1], vel = d[2]
    const on = cmd === 0x90 && vel > 0
    const off = cmd === 0x80 || (cmd === 0x90 && vel === 0)
    if (!on && !off) return
    // El diagrama son 3 octavas desde C3: lo que se toque fuera se pliega dentro.
    let sm = note - 48
    while (sm < 0) sm += 12
    while (sm > 35) sm -= 12
    if (on) {
      const fresh = freezeRef.current
      freezeRef.current = false
      heldRef.current[sm] = 1
      stop()
      setSel(prev => (fresh ? [sm] : [...new Set(prev.concat([sm]))].sort((a, b) => a - b)))
      setPick(0)
      setMode('identify')
    } else {
      delete heldRef.current[sm]
      if (!Object.keys(heldRef.current).length) freezeRef.current = true
    }
  }, [stop])

  const bindMidi = useCallback((acc: MIDIAccess) => {
    const names: string[] = []
    acc.inputs.forEach(i => { i.onmidimessage = handleMidi; names.push(i.name || 'MIDI device') })
    setMidiState(names.length ? 'on' : 'none')
    setMidiName(names.join(', '))
  }, [handleMidi])

  const connectMidi = useCallback(() => {
    if (midiState === 'on') {
      midiAccessRef.current?.inputs.forEach(i => { i.onmidimessage = null })
      heldRef.current = {}
      freezeRef.current = false
      setMidiState('off')
      setMidiName('')
      return
    }
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }
    if (!nav.requestMIDIAccess) { setMidiState('unsupported'); return }
    setMidiState('connecting')
    nav.requestMIDIAccess().then(acc => {
      midiAccessRef.current = acc
      acc.onstatechange = () => { if (midiState !== 'off') bindMidi(acc) }
      bindMidi(acc)
    }).catch(() => setMidiState('denied'))
  }, [midiState, bindMidi])

  useEffect(() => () => {
    midiAccessRef.current?.inputs.forEach(i => { i.onmidimessage = null })
  }, [])

  // ── Datos del acorde en construccion ─────────────────────────────────────
  const root = ROOTS[rootIdx]
  const li = root[0], acc = root[1]
  const rootPc = pcOfRoot(rootIdx)
  const type = TYPES.find(t => t.id === typeId) || TYPES[0]
  const noteObjs: NamedNote[] = useMemo(
    () => type.degs.map(dt => { const n = spell(li, acc, dt); return { ...n, name: nn(n, notation) } }),
    [type, li, acc, notation],
  )
  const chordName = nn({ l: li, a: acc }, notation) + type.suf

  // ── Cambio de modo llevandose el acorde ──────────────────────────────────
  const goIdentify = useCallback(() => {
    stop()
    if (isPiano) {
      setSel([...new Set(type.degs.map(dt => spell(li, acc, dt).pc))].sort((a, b) => a - b))
    } else {
      // Con capo, la forma que se pisa es la de otra fundamental; el diapason la quiere en
      // trastes absolutos, asi que hay que volver a sumarle el capo.
      let shapeLi = li, shapeAcc = acc
      if (capo) {
        const i = rootIdxForPc(rootPc - capo)
        shapeLi = ROOTS[i][0]; shapeAcc = ROOTS[i][1]
      }
      const vs = voicingsFor(db, rootKeyOf(shapeLi, shapeAcc), type, tuningKey)
      const pi = Math.min(posIdx, Math.max(0, vs.length - 1))
      const v = vs.length ? vs[pi].v.slice() : new Array<number>(N).fill(-1)
      setFretSel(v.map(f => (f < 0 ? -1 : f === 0 ? 0 : f + capo)))
    }
    setPick(0)
    setMode('identify')
  }, [stop, isPiano, type, li, acc, capo, rootPc, db, tuningKey, posIdx, N])

  const goBuild = useCallback(() => {
    stop()
    const ID = lastIdentRef.current
    if (!ID.cur || ID.pcs.length < 3) { setMode('build'); return }
    const t = TYPES.find(x => x.id === ID.cur!.tid)
    if (!t) { setMode('build'); return }
    const rIdx = rootIdxForPc(ID.cur.rootPc)
    if (rIdx >= 0) setRootIdx(rIdx)
    setTypeId(t.id)
    setTypeTab(GROUPS.indexOf(t.group))
    setPosIdx(ID.cur.posIdx || 0)
    setMode('build')
  }, [stop])

  // ── Modo build ───────────────────────────────────────────────────────────
  const noteFor = useCallback(
    (pc: number) => { const n = noteObjs.find(x => x.pc === pc); return n ? { t: n.name, root: pc === rootPc } : null },
    [noteObjs, rootPc],
  )

  let main: DiagramData | null = null
  let alts: { d: DiagramData; bd: string; bg: string; onClick: () => void; label: string }[] = []
  let voicingText = ''
  let capoInfo: { label: string; note: string } | null = null
  const notes: NoteEvent[] = []

  if (showBuildFret) {
    let shapeLi = li, shapeAcc = acc
    if (capo) {
      const i = rootIdxForPc(rootPc - capo)
      shapeLi = ROOTS[i][0]; shapeAcc = ROOTS[i][1]
    }
    const vs = voicingsFor(db, rootKeyOf(shapeLi, shapeAcc), type, tuningKey)
    const pi = Math.min(posIdx, Math.max(0, vs.length - 1))
    if (capo && vs.length) {
      const shapeName = nn({ l: shapeLi, a: shapeAcc }, notation) + type.suf
      capoInfo = { label: shapeName + ' shape', note: 'Capo ' + capo + ' → sounds as ' + chordName + '  ·  frets counted from the capo' }
    } else if (capo) {
      capoInfo = { label: 'No shape found', note: 'Try another capo position or chord type.' }
    }
    if (vs.length) {
      main = buildDiagram(vs[pi], { sw: 42, fh: 50, padL: 46, padR: 22, padT: 50, padB: 34, dotR: 14 },
        { lefty, showFingers: showFingerNumbers, noteFor, full: true, accent, tun, capo, activeS: activeId, hoverPc })
      const sequence = lefty ? vs[pi].v.slice().reverse() : vs[pi].v
      voicingText = sequence.map(f => (f < 0 ? 'x' : f)).join(' ')
      vs[pi].v.forEach((f, s) => { if (f >= 0) notes.push({ midi: mid[s] + (f > 0 ? f + capo : capo), id: s }) })
      alts = vs.map((vv, i) => ({
        d: buildDiagram(vv, { sw: 15, fh: 15, padL: 16, padR: 9, padT: 15, padB: 5, dotR: 4.5 },
          { lefty, showFingers: false, full: false, accent, tun }),
        bd: i === pi ? accent : BORDER,
        bg: i === pi ? '#f4efff' : '#ffffff',
        onClick: () => setPosIdx(i),
        label: i === 0 ? 'Common' : 'Pos. ' + (i + 1),
      }))
    }
  }

  type BuildKey = { x: number; w: number; bg: string; fg: string; gl: string; label: string; pc: number | null; hit: boolean; sm: number }
  const buildWhite: BuildKey[] = []
  const buildBlack: BuildKey[] = []
  if (showBuildPiano) {
    // Aqui la ventana siempre arranca en Do3: el acorde mas amplio del catalogo es una
    // trecena, 21 semitonos, y con dos octavas a la vista entra entero.
    const { ww: WW, bw: BW, oct: OCT } = buildPianoM
    const semis = noteObjs.map(n => ({ semi: rootPc + n.semi, name: n.name, root: n.pc === rootPc, pc: n.pc }))
    semis.slice().sort((a, b) => a.semi - b.semi).forEach(x => notes.push({ midi: 48 + x.semi, id: x.semi }))
    const hl = (s: number) => semis.find(x => x.semi === s)
    const WSEM = [0, 2, 4, 5, 7, 9, 11]
    for (let i = 0; i < 7 * OCT; i++) {
      const sm = Math.floor(i / 7) * 12 + WSEM[i % 7], h = hl(sm)
      const on = !!h && (activeId === sm || activeId === 'all')
      // Solo se enciende si la tecla ya es del acorde: el diagrama muestra el acorde en
      // una posicion concreta, y encender los Do de las otras dos octavas insinuaria que
      // hay que tocarlos.
      const hit = !!h && hoverPc === h.pc
      // Todas las teclas del acorde con el mismo tono. El morado lleno queda para la nota
      // que suena o la que se esta senalando, que es informacion de ahora, no de jerarquia.
      buildWhite.push({
        x: i * WW + 1, w: WW - 2,
        bg: on || hit ? accent : h ? accent + '99' : '#ffffff',
        fg: h && (on || hit) ? '#ffffff' : '#2d2148',
        gl: on ? '0 6px 16px ' + accent + '88' : 'none',
        label: h ? h.name : '', pc: h ? h.pc : null, hit, sm,
      })
    }
    const BOFF = [0, 1, 3, 4, 5], BSEM = [1, 3, 6, 8, 10]
    for (let o = 0; o < OCT; o++) for (let j = 0; j < 5; j++) {
      const sm = o * 12 + BSEM[j], h = hl(sm)
      const on = !!h && (activeId === sm || activeId === 'all')
      const hit = !!h && hoverPc === h.pc
      buildBlack.push({
        x: (o * 7 + BOFF[j] + 1) * WW - BW / 2, w: BW,
        bg: on || hit ? accent : h ? accent + 'C9' : '#241d33',
        fg: '#ffffff',
        gl: on ? '0 4px 14px ' + accent + 'AA' : '0 2px 3px rgba(20,10,40,0.35)',
        label: h ? h.name : '', pc: h ? h.pc : null, hit, sm,
      })
    }
  }

  // ── Modo identify ────────────────────────────────────────────────────────
  const ident = useMemo(() => {
    if (!isIdentify) return null

    const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y)
    const cap = isPiano ? 0 : capo
    const keySel = sel.slice().sort((a, b) => a - b)
    // Una cuerda "al aire" con capo puesto suena EN el capo, no en la cejuela.
    const sv = fs.map(x => (x < 0 ? -1 : Math.max(x, cap)))

    let pcs: number[], count: number
    const playable: NoteEvent[] = []
    if (isPiano) {
      pcs = uniq(keySel.map(s => ((s % 12) + 12) % 12))
      keySel.forEach(s => playable.push({ midi: 48 + s, id: s }))
      count = keySel.length
    } else {
      const on: { s: number; fr: number }[] = []
      sv.forEach((fr, s) => { if (fr >= 0) on.push({ s, fr }) })
      pcs = uniq(on.map(o => (tun[o.s] + o.fr) % 12))
      on.slice().sort((a, b) => (mid[a.s] + a.fr) - (mid[b.s] + b.fr))
        .forEach(o => playable.push({ midi: mid[o.s] + o.fr, id: o.s }))
      count = on.length
    }

    const names: Candidate[] = []
    // Primero se pregunta al catalogo de digitaciones: si la forma esta fichada podemos
    // decir ademas si es la estandar, la tercera posicion o una cejilla movida — algo que
    // el analisis de notas por si solo nunca sabria.
    if (!isPiano && count >= 3) {
      const m = matchShape(sv.map(x => (x < 0 ? -1 : x - cap)), db, tuningKey)
      if (m) {
        m.hits.forEach(h => {
          const snd = nameFor(h.li, h.acc, h.tid, m.moved + cap, notation)
          if (names.some(n => n.name === snd.name)) return
          const shp = nameFor(h.li, h.acc, h.tid, m.moved, notation)
          const base = nameFor(h.li, h.acc, h.tid, 0, notation).name
          names.push({
            name: snd.name, notes: snd.notes, tid: h.tid, posIdx: h.pi,
            rootPc: ((((LETPC[h.li] + h.acc + m.moved + cap) % 12) + 12) % 12),
            shapeLabel: cap ? shp.name + ' shape' : '',
            note: m.moved
              ? 'same shape as ' + base + ', moved ' + m.moved + (Math.abs(m.moved) === 1 ? ' fret' : ' frets')
              : (h.pi === 0 ? 'standard shape' : 'shape ' + (h.pi + 1) + ' of ' + h.n),
          })
        })
      }
    }
    matchChords(pcs, notation).forEach(c => {
      if (names.some(n => n.name === c.name)) return
      names.push({
        name: c.name, notes: c.notes, tid: c.tid, rootPc: c.rootPc, posIdx: 0, shapeLabel: '',
        note: (!isPiano && count >= 3 && !names.length) ? 'non-standard voicing' : c.note,
      })
    })

    const pk = Math.min(pick, Math.max(0, names.length - 1))
    const cur = names.length ? names[pk] : null

    const spelled: Record<number, string> = {}
    if (cur) cur.notes.forEach(n => { spelled[n.pc] = n.name })
    const label = (pc: number) => spelled[pc] || defName(pc, notation)

    let resultName = '—', resultKicker = 'Chord', resultColor = '#c9c1da'
    let resultSub = isPiano
      ? 'Click the keys you are playing and the chord name appears here.'
      : 'Click a fret on each string you are playing — the circle by the nut plays it open.'
    if (pcs.length === 1) {
      resultName = label(pcs[0]); resultColor = TEXT; resultKicker = 'Single note'
      resultSub = 'Add at least two more notes to name a chord.'
    } else if (pcs.length === 2) {
      const d = (pcs[1] - pcs[0] + 12) % 12
      resultName = defName(pcs[0], notation) + ' + ' + defName(pcs[1], notation)
      resultColor = TEXT; resultKicker = 'Interval'
      resultSub = INTERVALS[d] + (d === 7 ? ' — also called a power chord' : ' — add one more note to form a chord')
    } else if (cur) {
      resultName = cur.name; resultColor = TEXT
      resultKicker = names.length > 1 ? 'Chord · best match' : 'Chord'
      resultSub = cur.notes.map(n => n.name).join(' – ') + (cur.note ? '  ·  ' + cur.note : '')
      if (!isPiano) {
        const fr = sv.filter(x => x > cap)
        if (fr.length && Math.max(...fr) - Math.min(...fr) > 4) resultSub += '  ·  big stretch'
      }
    } else if (pcs.length >= 3) {
      resultName = 'Not a standard chord'; resultColor = TEXT; resultKicker = 'No match'
      resultSub = pcs.map(p => defName(p, notation)).join(' – ') + ' — try removing a note.'
    }

    // Teclado del identificador
    const iWhite: { x: number; w: number; bg: string; bd: string; fg: string; gl: string; label: string; sm: number }[] = []
    const iBlack: { x: number; bg: string; fg: string; gl: string; label: string; sm: number }[] = []
    if (isPiano) {
      const { ww, bwId, oct, o0 } = identPianoM
      const WS = [0, 2, 4, 5, 7, 9, 11]
      for (let i = o0 * 7; i < (o0 + oct) * 7; i++) {
        const sm = Math.floor(i / 7) * 12 + WS[i % 7], on = keySel.indexOf(sm) >= 0
        const act = on && (activeId === sm || activeId === 'all')
        iWhite.push({
          sm, x: (i - o0 * 7) * ww + 1, w: ww - 2,
          bg: act ? '#5B21B6' : on ? accent : '#ffffff',
          bd: on ? accent : '#d8d2e4',
          fg: on ? '#ffffff' : '#b9b0cc',
          gl: act ? '0 6px 16px ' + accent + '88' : 'none',
          label: on ? label(sm % 12) : defName(sm % 12, notation),
        })
      }
      const BOFF = [0, 1, 3, 4, 5], BSEM = [1, 3, 6, 8, 10]
      for (let o = o0; o < o0 + oct; o++) for (let j = 0; j < 5; j++) {
        const sm = o * 12 + BSEM[j], on = keySel.indexOf(sm) >= 0
        const act = on && (activeId === sm || activeId === 'all')
        iBlack.push({
          sm, x: ((o - o0) * 7 + BOFF[j] + 1) * ww - bwId / 2,
          bg: act ? '#5B21B6' : on ? accent : '#241d33',
          fg: '#ffffff',
          gl: act ? '0 4px 14px ' + accent + 'AA' : '0 2px 3px rgba(20,10,40,0.35)',
          label: on ? label(sm % 12) : '',
        })
      }
    }

    // Diapason
    let fb: FretboardData | null = null
    if (!isPiano) {
      // Todo lo que sigue se dibuja SOLO para la ventana de trastes visible: `fx` ya mapea
      // ese tramo sobre el ancho disponible, asi que fuera de [f0, f0+visible] las
      // coordenadas no significan nada.
      const { fx, f0, visible, openX, nutX, boardX, boardPx, sp: SP } = fbM
      const fLast = f0 + visible
      const showNut = f0 === 0
      const boardH = N * SP
      const yOf = (i: number) => BOARD_Y + SP / 2 + i * SP
      const order: number[] = []
      for (let i = N - 1; i >= 0; i--) order.push(i)
      if (lefty) order.reverse()
      const GAUGE = N === 4 ? [1.7, 2, 1.8, 1.4] : [3, 2.6, 2.2, 1.8, 1.5, 1.2]

      const strings: FretboardData['strings'] = []
      const labels: FretboardData['labels'] = []
      const opens: FretboardData['opens'] = []
      const cells: FretboardData['cells'] = []
      const dots: FretboardData['dots'] = []
      const wires: { x: number }[] = []
      const inlays: { x: number; y: number }[] = []
      const nums: { x: number; t: string }[] = []
      let capoActive = false

      for (let n = f0 + 1; n <= fLast; n++) {
        wires.push({ x: fx(n) - 1 })
        const cx = (fx(n - 1) + fx(n)) / 2
        nums.push({ x: cx, t: String(n) })
        if ([3, 5, 7, 9, 15].indexOf(n) >= 0) inlays.push({ x: cx, y: BOARD_Y + boardH / 2 })
        if (n === 12) { inlays.push({ x: cx, y: BOARD_Y + boardH / 3 }); inlays.push({ x: cx, y: BOARD_Y + 2 * boardH / 3 }) }
      }

      order.forEach((s, i) => {
        const y = yOf(i), g = GAUGE[s], act = activeId === s || activeId === 'all'
        strings.push({ y, t: g, o: -g / 2 })
        labels.push({ y, t: defName(tun[s], notation) })
        const isOpen = fs[s] === 0, fretted = fs[s] > cap
        // Antes de tocar nada no se dibujan cruces: seis "no toques esta cuerda" es un
        // estado vacio que parece un error en vez de una invitacion.
        const blank = !isOpen && !fretted && !count
        if (isOpen && cap && act) capoActive = true
        opens.push({
          s, x: openX, y,
          t: (isOpen && act) ? label((tun[s] + cap) % 12) : (fretted || blank ? '' : (isOpen ? '○' : '×')),
          bd: fretted ? PILL_BG : (isOpen ? accent : (blank ? PILL_BG : BORDER)),
          bg: (isOpen && act) ? '#5B21B6' : (isOpen ? accent : (fretted || blank ? '#f7f5fb' : '#ffffff')),
          fg: isOpen ? '#ffffff' : '#c9c1da',
          gl: (isOpen && act) ? '0 0 0 6px ' + accent + '66' : 'none',
          sc: (isOpen && act) ? 1.15 : 1,
          op: (fretted || blank) ? 0.4 : 1,
          pe: fretted ? 'none' : 'auto',
          disabled: fretted,
        })
        for (let n = Math.max(cap, f0) + 1; n <= fLast; n++) {
          cells.push({ s, n, x: fx(n - 1) + 1, y: y - SP / 2, w: fx(n) - fx(n - 1) - 2, h: SP })
        }
        if (fs[s] > cap && fs[s] > f0 && fs[s] <= fLast) {
          const n = fs[s]
          dots.push({
            x: (fx(n - 1) + fx(n)) / 2, y, t: label((tun[s] + n) % 12),
            bg: act ? '#F5F0FF' : accent,
            gl: act ? '0 0 0 6px ' + accent + '66' : '0 2px 6px rgba(0,0,0,0.4)',
          })
        }
      })

      // La cejilla solo existe dentro de la ventana; si el capo queda por detras, el tramo
      // visible esta entero por encima de el y no hay nada que oscurecer.
      const capoIn = cap > f0 && cap <= fLast
      const dimW = Math.min(Math.max(fx(cap) - boardX, 0), boardPx)
      fb = {
        w: fx(fLast) + (fLast === FN ? 14 : 8), h: BOARD_Y + boardH + 30,
        boardW: boardPx, boardH, boardX, nutX, openX, showNut,
        stringW: fx(fLast) - (showNut ? nutX : boardX), stringX: showNut ? nutX : boardX,
        numY: BOARD_Y + boardH + 8,
        strings, labels, opens, cells, dots, wires, inlays, nums,
        capo: capoIn
          ? {
            x: fx(cap - 1) + 2, y: BOARD_Y - 5, w: Math.max(fx(cap) - fx(cap - 1) - 5, 9), h: boardH + 10,
            gl: capoActive ? '0 0 0 6px ' + accent + '55, 0 3px 10px rgba(0,0,0,0.5)' : '0 2px 7px rgba(0,0,0,0.5)',
          }
          : null,
        dim: cap && dimW > 0 ? { x: boardX, w: dimW, y: BOARD_Y, h: boardH } : null,
      }
    }

    const candAlts = names
      .map((c, i) => ({ name: c.name, note: c.note, i }))
      .filter(c => c.i !== pk)

    return {
      cur, pcs, pk, names, playable, count, fb, iWhite, iBlack,
      resultName, resultSub, resultKicker, resultColor,
      shapeBadge: cur ? cur.shapeLabel : '',
      candAlts,
      hasAlts: candAlts.length > 0 && pcs.length >= 3,
      pickerLabel: count
        ? 'Your notes · ' + count + (isPiano ? ' selected' : ' strings')
        : (isPiano ? 'Click the keys you are playing' : 'Click the frets you are holding'),
      hasShifted: !isPiano && count > 0,
    }
  }, [isIdentify, isPiano, capo, sel, fs, tun, mid, db, tuningKey, notation, pick, activeId, accent, lefty, N, fbM, identPianoM])

  if (ident) {
    lastIdentRef.current = { cur: ident.cur, pcs: ident.pcs }
    notesRef.current = ident.playable
  } else {
    notesRef.current = notes
  }

  // Cuando la ventana no da para el mastil entero, se mueve sola hasta donde esta la accion
  // al cambiar de capo, de forma o de modo: nadie quiere mirar un tramo vacio con sus dedos
  // fuera de cuadro. Solo se mueve si hace falta — si el traste ya se ve, se queda quieta.
  useEffect(() => {
    if (fbVisible >= FN) return
    const pressed = fs.filter(f => f > capo)
    const target = pressed.length ? Math.max(...pressed) : capo
    setFretWin(prev => {
      const cur = Math.min(Math.max(0, prev), FN - fbVisible)
      if (!target) return 0
      if (target > cur && target <= cur + fbVisible) return cur
      return Math.min(Math.max(0, target - Math.ceil(fbVisible / 2)), FN - fbVisible)
    })
  }, [capo, fs, mode, fbVisible])

  // Lo mismo con el teclado: por MIDI pueden llegar notas de una octava que no esta a la
  // vista, y ver el nombre del acorde sin ver ninguna tecla encendida desconcierta.
  const pianoOct = identPianoM.oct
  useEffect(() => {
    if (pianoOct >= PIANO_OCTAVES || !sel.length) return
    setOctWin(prev => {
      const cur = Math.min(Math.max(0, prev), PIANO_OCTAVES - pianoOct)
      const oct = (s: number) => Math.floor(s / 12)
      if (sel.some(s => oct(s) >= cur && oct(s) < cur + pianoOct)) return cur
      return Math.min(Math.max(0, oct(Math.min(...sel))), PIANO_OCTAVES - pianoOct)
    })
  }, [sel, pianoOct])

  // ── Buscador por nombre ──────────────────────────────────────────────────
  const qRaw = query
  const qParsed = qRaw.trim() ? parseChordQuery(qRaw) : null

  let queryHint = '', queryHintColor = FAINT
  if (qRaw.trim() && !qParsed) {
    queryHint = 'Not a chord we recognise — try C, Am, Cmaj7, F#m7b5, sol7.'
    queryHintColor = '#a4406b'
  } else if (qParsed && qParsed.typeId === undefined) {
    queryHint = 'Root ' + qParsed.rootName + ' found, but "' + qParsed.unknown + '" is not a chord type we have — pick one below.'
    queryHintColor = '#a4406b'
  } else if (qParsed) {
    const bits: string[] = []
    if (qParsed.hadSlash) bits.push('we name chords by their notes, so the bass note is ignored')
    if (qParsed.enh) bits.push('shown as ' + qParsed.name + ' (same notes)')
    queryHint = bits.join(' · ')
  }

  const withMeta = useCallback((rIdx: number, id: string) => {
    const t = TYPES.find(x => x.id === id)!
    const [l, a] = ROOTS[rIdx]
    return {
      id: t.id, rootIdx: rIdx, label: nn({ l, a }, notation) + t.suf,
      notes: t.degs.map(d => nn(spell(l, a, d), notation)).join(' – '),
      group: t.group,
    }
  }, [notation])

  let sugList: ReturnType<typeof withMeta>[] = []
  let suggestHeader = ''
  if (qRaw.trim() && qParsed) {
    sugList = searchSuggestions(qRaw, notation).map(s => withMeta(qParsed.rootIdx, s.id))
  } else if (!qRaw.trim()) {
    sugList = ([[0, 'maj'], [9, 'm'], [7, 'maj'], [2, 'maj'], [4, 'm'], [0, 'maj7']] as [number, string][])
      .map(p => withMeta(p[0], p[1]))
    suggestHeader = 'Common chords'
  }
  const qSel = Math.min(querySel, Math.max(0, sugList.length - 1))

  const loadType = useCallback((rIdx: number, id: string) => {
    const t = TYPES.find(x => x.id === id)
    if (!t) return
    setRootIdx(rIdx)
    setTypeId(t.id)
    setTypeTab(GROUPS.indexOf(t.group))
    setPosIdx(0)
  }, [])

  const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    setQuerySel(0)
    setQueryFocus(true)
    // Se aplica mientras se escribe: en cuanto lo tecleado es un acorde completo, el
    // diagrama ya lo esta mostrando sin tener que confirmar nada.
    const r = v.trim() ? parseChordQuery(v) : null
    if (r && r.typeId) {
      loadType(r.rootIdx, r.typeId)
      setMode('build')
      if (r.latin) pickNotation('latin')
    }
  }

  const onQueryKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = sugList.length
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); setQuerySel(s => Math.min(s + 1, n - 1)); setQueryFocus(true); return }
    if (e.key === 'ArrowUp' && n) { e.preventDefault(); setQuerySel(s => Math.max(s - 1, 0)); setQueryFocus(true); return }
    if (e.key === 'Enter' && n) {
      e.preventDefault()
      const p = sugList[qSel]
      loadType(p.rootIdx, p.id)
      setQueryFocus(false)
      queryElRef.current?.blur()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (queryFocus && n) setQueryFocus(false)
      else { setQuery(''); setQuerySel(0) }
    }
  }

  // ── Controles ────────────────────────────────────────────────────────────
  const modeTabs = [seg('Name → notes', isBuild, goBuild), seg('Notes → name', isIdentify, goIdentify)]
  const notations = [
    seg('C D E', notation === 'english', () => pickNotation('english')),
    seg('Do Re Mi', notation === 'latin', () => pickNotation('latin')),
  ]
  const roots = ROOTS.map((r, i) => ({
    label: nn({ l: r[0], a: r[1] }, notation), active: i === rootIdx,
    onClick: () => { setRootIdx(i); setPosIdx(0) },
  }))
  const typeTabs = GROUPS.map((g, i) => seg(g, i === typeTab, () => setTypeTab(i)))
  const typeChips = TYPES.filter(t => t.group === GROUPS[typeTab]).map(t => ({
    label: t.suf || 'maj', active: t.id === typeId,
    onClick: () => { setTypeId(t.id); setPosIdx(0) },
  }))
  const capoBuildBtns = [seg('Off', capo === 0, () => { setCapoState(0); setPosIdx(0) })]
  for (let c = 1; c <= 9; c++) capoBuildBtns.push(seg(String(c), capo === c, () => { setCapoState(c); setPosIdx(0) }))
  const capoIdentBtns = [seg('Off', capo === 0, () => setCapo(0))]
  for (let c = 1; c <= 9; c++) capoIdentBtns.push(seg(String(c), capo === c, () => setCapo(c)))
  const capoBtn: React.CSSProperties = isMobile
    ? { minWidth: 40, padding: '10px 8px', fontSize: 13, flex: '0 0 auto' }
    : { minWidth: 32, padding: '7px 8px', fontSize: 12.5, flex: '0 0 auto' }

  // ── Ventana del mastil ───────────────────────────────────────────────────
  const fbWindowed = !isPiano && isIdentify && fbM.visible < FN
  // Si hay notas puestas fuera del tramo visible la flecha se tine: sin eso, mover el mastil
  // parece que no lleva a ningun sitio.
  const fretsBelow = fbWindowed && fs.some(f => f > capo && f <= fbM.f0)
  const fretsAbove = fbWindowed && fs.some(f => f > fbM.f0 + fbM.visible)
  const pianoWindowed = isPiano && isIdentify && identPianoM.oct < PIANO_OCTAVES
  const octBelow = pianoWindowed && sel.some(s => s < identPianoM.o0 * 12)
  const octAbove = pianoWindowed && sel.some(s => s >= (identPianoM.o0 + identPianoM.oct) * 12)
  const winBtn = (off: boolean, hot: boolean): React.CSSProperties => ({
    border: `1.5px solid ${hot ? accent : BORDER}`, borderRadius: 10, width: 48, height: 40,
    background: '#ffffff', color: off ? '#c9c1da' : hot ? accent : '#3c3452',
    fontSize: 13, fontWeight: 700, padding: 0, cursor: off ? 'default' : 'pointer',
    opacity: off ? 0.45 : 1, flex: '0 0 auto',
  })

  const loading = showBuildFret && !db
  const positionsLabel = capoInfo && capoInfo.label ? 'Positions · ' + capoInfo.label + 's' : 'Positions'

  const midiLabel = midiState === 'on' ? 'Disconnect MIDI'
    : midiState === 'connecting' ? 'Connecting…' : 'Connect MIDI keyboard'
  const midiStatus = midiState === 'on' ? 'Listening to ' + (midiName || 'MIDI') + ' — play a chord and we name it'
    : midiState === 'unsupported' ? 'Web MIDI is not available in this browser — try Chrome or Edge on desktop.'
    : midiState === 'denied' ? 'Permission denied — allow MIDI access to use your keyboard.'
    : midiState === 'none' ? 'No MIDI devices found — connect one and press the button again.' : ''
  const midiStatusColor = (midiState === 'unsupported' || midiState === 'denied' || midiState === 'none') ? '#a4406b' : MUTED

  // El diagrama mide 278px en guitarra y 194 en ukelele; en un movil de 360 quedan unos 270
  // utiles, asi que hoy se sale por poco. Ajustado al hueco CRECE en movil en vez de
  // encogerse, y en escritorio —donde cabe al lado de la leyenda— se queda como siempre.
  const diagScale = !main || diagBoxW <= 0 || diagBoxW >= main.w + 180
    ? 1
    : Math.max(0.8, Math.min(1.3, diagBoxW / main.w))

  const kicker: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: FAINT }
  const card: React.CSSProperties = {
    background: CARD_BG, border: `1px solid ${BORDER_LIGHT}`, borderRadius: 18,
    boxShadow: '0 1px 4px rgba(40,25,80,0.05)',
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16,
      fontFamily: "'Hanken Grotesk', system-ui, sans-serif", color: TEXT,
      '--cf-accent': accent,
      '--cf-glow': accent + '66',
      '--cf-glow-soft': accent + '00',
    } as React.CSSProperties}>
      <style>{HOVER_CSS}</style>

      {/* Barra de controles. En movil el conmutador de modo pasa a ocupar su propia fila
          entera: es el control principal de la herramienta, no un ajuste secundario. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
        {showModeSwitch && (
          <div style={{ display: 'flex', background: PILL_BG, borderRadius: 10, padding: 3, marginRight: isMobile ? undefined : 'auto', width: isMobile ? '100%' : undefined }}>
            {modeTabs.map((m, i) => (
              <button key={i} type="button" className="cf-tap" onClick={m.onClick} style={segStyle(m, { padding: '11px 16px', fontSize: 13.5, flex: isMobile ? 1 : undefined })}>{m.label}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'inline-flex', background: PILL_BG, borderRadius: 10, padding: 3 }}>
          {notations.map((b, i) => (
            <button key={i} type="button" className="cf-tap" onClick={b.onClick} style={segStyle(b, { padding: isMobile ? '10px 16px' : '7px 14px', fontSize: 13 })}>{b.label}</button>
          ))}
        </div>
        {!isPiano && (
          <button
            type="button" className="cf-tap" onClick={toggleHand} aria-pressed={lefty}
            style={{
              border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: isMobile ? '11px 16px' : '8px 14px', fontSize: 13,
              fontWeight: 600, background: lefty ? accent : '#ffffff', color: lefty ? '#ffffff' : '#3c3452',
              whiteSpace: 'nowrap', cursor: 'pointer',
            }}
          >Left-handed</button>
        )}
      </div>

      {isBuild && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          {/* Panel de entrada: buscar, fundamental, tipo */}
          <section style={{ ...card, flex: '1 1 330px', minWidth: 0, padding: isMobile ? 16 : 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={kicker}>Search by name</span>
                {/* El atajo se anuncia solo donde hay teclado fisico. */}
                {!isMobile && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#a79eba', border: `1px solid ${BORDER_LIGHT}`, borderRadius: 5, padding: '1px 5px' }}>/</span>}
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', marginTop: -7, width: 14, height: 14, pointerEvents: 'none' }}>
                  <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="#a79eba" strokeWidth="1.6" aria-hidden="true">
                    <circle cx="5.8" cy="5.8" r="4.2" /><path d="M9 9l4 4" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  ref={queryElRef} value={query}
                  onChange={onQueryChange} onKeyDown={onQueryKey}
                  onFocus={() => setQueryFocus(true)} onBlur={() => setQueryFocus(false)}
                  placeholder="Cmaj7, F#m7b5, sol7, do menor…"
                  aria-label="Search a chord by name"
                  style={{
                    border: `1.5px solid ${queryFocus ? accent : BORDER}`, borderRadius: 10,
                    padding: '11px 34px', fontSize: 14, fontFamily: 'inherit', color: TEXT,
                    background: '#ffffff', outline: 'none', width: '100%', boxSizing: 'border-box',
                    boxShadow: queryFocus ? `0 0 0 3px ${accent}22` : 'none',
                    transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
                  }}
                />
                {!!qRaw && (
                  <button
                    type="button" className="cf-clear cf-tap" aria-label="Clear search"
                    // `pointerdown` y no `mousedown`: en tactil el mousedown sintetico llega
                    // tarde y el preventDefault puede tragarse el toque entero.
                    onPointerDown={e => { e.preventDefault(); setQuery(''); setQuerySel(0); setQueryFocus(true); queryElRef.current?.focus() }}
                    style={{
                      position: 'absolute', right: isMobile ? 3 : 7, top: '50%',
                      marginTop: isMobile ? -17 : -11, width: isMobile ? 34 : 22, height: isMobile ? 34 : 22,
                      border: 'none', background: 'transparent', color: '#a79eba', fontSize: 15,
                      lineHeight: 1, borderRadius: '50%', padding: 0, cursor: 'pointer',
                    }}
                  >×</button>
                )}
                {sugList.length > 0 && queryFocus && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 30,
                    background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 12,
                    boxShadow: '0 14px 32px rgba(30,20,60,0.18)', overflow: 'hidden',
                  }}>
                    {suggestHeader && (
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#a79eba', padding: '9px 12px 4px' }}>{suggestHeader}</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 5, maxHeight: isMobile ? '42vh' : 250, overflowY: 'auto' }}>
                      {sugList.map((s, i) => (
                        <button
                          // La lista de acordes habituales repite tipo con distinta
                          // fundamental (C, Am, G, D…), asi que el id por si solo no es unico.
                          key={s.rootIdx + '-' + s.id} type="button" className="cf-tap"
                          onPointerDown={e => { e.preventDefault(); loadType(s.rootIdx, s.id); setQuerySel(i); setQueryFocus(false); queryElRef.current?.blur(); revealResult() }}
                          {...(canHover ? { onMouseEnter: () => setQuerySel(i) } : null)}
                          style={{
                            border: 'none', background: i === qSel ? accent : 'transparent', borderRadius: 8,
                            padding: isMobile ? '11px 10px' : '8px 10px', display: 'flex', gap: 10, alignItems: 'center',
                            textAlign: 'left', width: '100%', cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 700, color: i === qSel ? '#ffffff' : TEXT, minWidth: isMobile ? 56 : 70 }}>{s.label}</span>
                          <span style={{ fontSize: 12, color: FAINT, flex: 1 }}>{s.notes}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#a79eba', background: '#f4f1fa', borderRadius: 99, padding: '2px 7px', whiteSpace: 'nowrap' }}>{s.group}</span>
                        </button>
                      ))}
                    </div>
                    {!isMobile && (
                      <div style={{ display: 'flex', gap: 12, borderTop: '1px solid #f2eefa', padding: '7px 12px', fontSize: 10.5, color: '#a79eba' }}>
                        <span>↑↓ move</span><span>↵ select</span><span>esc close</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {queryHint && <div style={{ fontSize: 12.5, color: queryHintColor }}>{queryHint}</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={kicker}>1 · Root note</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {roots.map((r, i) => (
                  <button
                    key={i} type="button" className="cf-b cf-tap" onClick={r.onClick} aria-pressed={r.active}
                    style={{
                      border: `1.5px solid ${r.active ? accent : BORDER}`, background: r.active ? accent : '#ffffff',
                      color: r.active ? '#ffffff' : '#3c3452', borderRadius: 10, height: isMobile ? 48 : 44,
                      fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'border-color 0.1s ease',
                    }}
                  >{r.label}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={kicker}>2 · Chord type</div>
              {/* Cinco familias de acordes con `flex:1` se comprimen hasta ser ilegibles en un
                  panel estrecho; antes que recortarlas, que se desplacen. */}
              <div className="cf-strip" style={{ display: 'flex', background: PILL_BG, borderRadius: 10, padding: 3 }}>
                {typeTabs.map((tb, i) => (
                  <button key={i} type="button" className="cf-tap" onClick={tb.onClick} style={segStyle(tb, { flex: isMobile ? '0 0 auto' : 1, padding: isMobile ? '10px 12px' : '8px 4px', fontSize: 12 })}>{tb.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {typeChips.map((t, i) => (
                  <button
                    key={i} type="button" className="cf-b cf-tap" onClick={t.onClick} aria-pressed={t.active}
                    style={{
                      border: `1.5px solid ${t.active ? accent : BORDER}`, background: t.active ? accent : '#ffffff',
                      color: t.active ? '#ffffff' : '#3c3452', borderRadius: 10, padding: '9px 13px',
                      minHeight: isMobile ? 44 : undefined, minWidth: isMobile ? 44 : undefined,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'border-color 0.1s ease',
                    }}
                  >{t.label}</button>
                ))}
              </div>
            </div>
          </section>

          {/* Panel de salida: nombre, capo, diagrama, posiciones */}
          <section ref={outPanelRef} style={{ ...card, flex: '1 1 440px', minWidth: 0, padding: isMobile ? '18px 16px' : '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 'clamp(30px, 9vw, 42px)', fontWeight: 700, letterSpacing: '-1px', lineHeight: 1 }}>{chordName}</div>
                {/* Los circulos son la bisagra entre la teoria y el instrumento: senalar uno
                    enciende esa nota alli donde caiga, que puede ser en tres cuerdas
                    distintas o en tres octavas del teclado. */}
                <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>Notes in chord:</span>
                  {noteObjs.map((n, i) => {
                    const hot = hoverPc === n.pc
                    const isRoot = n.pc === rootPc
                    return (
                      <button
                        key={i} type="button" className="cf-tap"
                        {...hoverProps(n.pc)}
                        onFocus={() => canHover && setHoverPc(n.pc)} onBlur={() => canHover && setHoverPc(null)}
                        onClick={() => pluckPc(n.pc)}
                        aria-label={isRoot ? `${n.name}, root note — hear it` : `${n.name} — hear it`}
                        style={{
                          width: isMobile ? 40 : 34, height: isMobile ? 40 : 34, borderRadius: '50%', padding: 0, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                          // Todas las notas se pintan igual: el morado queda reservado a lo
                          // que esta pasando ahora mismo, no a lo que es mas importante.
                          border: `1.5px solid ${hot ? accent : BORDER}`,
                          background: hot ? accent : '#ffffff',
                          color: hot ? '#ffffff' : '#3c3452',
                          transform: hot ? 'scale(1.12)' : 'scale(1)',
                          boxShadow: hot ? `0 0 0 5px ${accent}33` : 'none',
                          transition: 'transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease, color 0.12s ease',
                        }}
                      >{n.name}</button>
                    )
                  })}
                </div>
              </div>
              <button
                type="button" className="cf-bright cf-tap" onClick={play}
                style={{
                  border: 'none', borderRadius: 12, padding: '13px 22px', fontSize: 15, fontWeight: 700,
                  background: playing ? '#3c3452' : accent, color: '#ffffff',
                  display: isMobile ? 'flex' : 'inline-flex', width: isMobile ? '100%' : undefined,
                  alignItems: 'center', justifyContent: 'center', gap: 9, whiteSpace: 'nowrap', cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(90,50,180,0.3)', transition: 'background 0.15s ease',
                }}
              >
                {playing ? '■ Stop' : '▶ Play chord'}
                {!isMobile && <span style={{ opacity: 0.75, fontWeight: 600, fontSize: 11, border: '1px solid rgba(255,255,255,0.45)', borderRadius: 5, padding: '1px 6px' }}>Space</span>}
              </button>
            </div>

            {showBuildFret && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={kicker}>Capo</span>
                <div className="cf-strip" style={{ display: 'flex', background: PILL_BG, borderRadius: 10, padding: 3, gap: 2, maxWidth: '100%' }}>
                  {capoBuildBtns.map((cb, i) => (
                    <button key={i} type="button" className="cf-tap" onClick={cb.onClick} style={segStyle(cb, capoBtn)}>{cb.label}</button>
                  ))}
                </div>
                {capoInfo && (<>
                  <span style={{ fontSize: 13, fontWeight: 600, color: MUTED, background: '#f2edfa', borderRadius: 99, padding: '5px 11px' }}>{capoInfo.label}</span>
                  <span style={{ fontSize: 12.5, color: FAINT }}>{capoInfo.note}</span>
                </>)}
                <div style={{ display: 'flex', gap: 8, marginLeft: isMobile ? undefined : 'auto', width: isMobile ? '100%' : undefined }}>
                  <button type="button" className="cf-b cf-tap" onClick={() => shiftBuild(-1)} style={{ border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: isMobile ? '11px 12px' : '7px 12px', flex: isMobile ? 1 : undefined, fontSize: 12.5, fontWeight: 600, background: '#ffffff', color: '#3c3452', whiteSpace: 'nowrap', cursor: 'pointer', transition: 'border-color 0.1s ease' }}>◀ Lower</button>
                  <button type="button" className="cf-b cf-tap" onClick={() => shiftBuild(1)} style={{ border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: isMobile ? '11px 12px' : '7px 12px', flex: isMobile ? 1 : undefined, fontSize: 12.5, fontWeight: 600, background: '#ffffff', color: '#3c3452', whiteSpace: 'nowrap', cursor: 'pointer', transition: 'border-color 0.1s ease' }}>Higher ▶</button>
                </div>
              </div>
            )}

            {showBuildPiano && (
              <div ref={buildPianoRef} style={{ paddingTop: 4, touchAction: 'manipulation', overflowX: 'hidden' }}>
                <div style={{ position: 'relative', height: 176, width: buildPianoM.w }}>
                  {buildWhite.map((k, i) => (
                    <div
                      key={i} className={k.hit ? 'cf-hit' : undefined}
                      {...hoverProps(k.pc)}
                      onClick={() => { if (k.pc != null) playNote(48 + k.sm) }}
                      style={{ position: 'absolute', top: 0, left: k.x, width: k.w, height: 172, background: k.bg, border: '1px solid #d8d2e4', borderRadius: '0 0 6px 6px', boxSizing: 'border-box', zIndex: 1, boxShadow: k.gl, transition: 'background 0.12s ease, box-shadow 0.12s ease', cursor: k.pc != null ? 'pointer' : 'default' }}
                    >
                      <div style={{ position: 'absolute', bottom: 7, left: 0, right: 0, textAlign: 'center', fontSize: buildPianoM.label, fontWeight: 700, color: k.fg }}>{k.label}</div>
                    </div>
                  ))}
                  {buildBlack.map((k, i) => (
                    <div
                      key={i} className={k.hit ? 'cf-hit' : undefined}
                      {...hoverProps(k.pc)}
                      onClick={() => { if (k.pc != null) playNote(48 + k.sm) }}
                      style={{ position: 'absolute', top: 0, left: k.x, width: k.w, height: 106, background: k.bg, borderRadius: '0 0 4px 4px', zIndex: 2, boxShadow: k.gl, transition: 'background 0.12s ease, box-shadow 0.12s ease', cursor: k.pc != null ? 'pointer' : 'default' }}
                    >
                      <div style={{ position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center', fontSize: buildPianoM.blabel, fontWeight: 700, color: k.fg }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showBuildFret && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 340 }}>
                {loading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 30, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ width: '100%', maxWidth: 258, height: 284, borderRadius: 14, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[150, 170, 130].map(w => <div key={w} style={{ width: w, maxWidth: '100%', height: 14, borderRadius: 7, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {[0, 1, 2].map(i => <div key={i} style={{ width: 98, height: 106, borderRadius: 12, background: PILL_BG, animation: 'om-pulse 1.4s ease-in-out infinite' }} />)}
                    </div>
                  </div>
                )}
                {main && (
                  <div ref={diagBoxRef} style={{ display: 'flex', gap: 30, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ width: main.w * diagScale, height: main.h * diagScale, flex: '0 0 auto' }}>
                    <div style={{ position: 'relative', width: main.w, height: main.h, transform: diagScale === 1 ? undefined : `scale(${diagScale})`, transformOrigin: 'top left' }}>
                      {main.strings.map((s, i) => <div key={i} style={{ position: 'absolute', left: s.x, top: main!.gridTop, width: 2, height: main!.gridH, background: '#4a415f' }} />)}
                      {main.frets.map((f, i) => <div key={i} style={{ position: 'absolute', left: main!.gridLeft, top: f.y, height: f.h, width: main!.gridW, background: f.bg }} />)}
                      {/* La pildora no intercepta el raton: quien manda son las zonas de
                          cada cuerda que hay encima, porque una cejilla se ve como una pieza
                          pero suena como varias notas distintas. */}
                      {main.barres.map((br, i) => (
                        <div key={i} style={{ position: 'absolute', left: br.x, top: br.y, width: br.w, height: br.h, borderRadius: 99, background: accent, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', fontSize: 12, fontWeight: 700, lineHeight: 1, boxShadow: br.gl, transition: 'box-shadow 0.12s ease', pointerEvents: 'none' }}>{br.n}</div>
                      ))}
                      {main.dots.map((d, i) => d.ghost ? (
                        // La zona ocupa su trozo de pildora, asi que toda la cejilla responde.
                        <div
                          key={i} className="cf-tap"
                          {...hoverProps(d.pc)}
                          onClick={() => pluckString(d.s)}
                          style={{ position: 'absolute', left: d.hitX, top: d.y, width: d.hitW, height: 30, marginTop: -15, zIndex: 2, cursor: 'pointer' }}
                        >
                          <div
                            className={d.hl ? 'cf-hit' : undefined}
                            style={{ position: 'absolute', left: d.x - d.hitX, top: '50%', transform: `translate(-50%,-50%) scale(${d.sc})`, width: 28, height: 28, borderRadius: '50%', boxSizing: 'border-box', border: d.hl ? '2px solid #ffffff' : 'none', transition: 'transform 0.12s ease' }}
                          />
                        </div>
                      ) : (
                        <div
                          key={i} className={d.hl ? 'cf-hit cf-tap' : 'cf-tap'}
                          {...hoverProps(d.pc)}
                          onClick={() => pluckString(d.s)}
                          style={{ position: 'absolute', left: d.x, top: d.y, transform: `translate(-50%,-50%) scale(${d.sc})`, width: 28, height: 28, borderRadius: '50%', background: d.bg, boxShadow: d.gl, transition: 'transform 0.12s ease, box-shadow 0.12s ease', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, lineHeight: 1, cursor: 'pointer', zIndex: 1 }}
                        >{d.n}</div>
                      ))}
                      {main.tops.map((t, i) => (
                        <div
                          key={i} className={t.hl ? 'cf-hit cf-tap' : 'cf-tap'}
                          {...hoverProps(t.pc)}
                          onClick={() => pluckString(t.s)}
                          style={{ position: 'absolute', left: t.x, top: t.y, transform: `translate(-50%,-50%) scale(${t.sc})`, transition: 'transform 0.12s ease, color 0.12s ease', fontSize: 15, fontWeight: 600, color: t.c, borderRadius: '50%', cursor: t.pc != null ? 'pointer' : 'default' }}
                        >{t.t}</div>
                      ))}
                      {main.notes.map((n, i) => (
                        <div
                          key={i} className="cf-tap"
                          {...hoverProps(n.pc)}
                          onClick={() => pluckPc(n.pc)}
                          style={{ position: 'absolute', left: n.x, top: n.y, transform: `translateX(-50%) scale(${n.hl ? 1.25 : 1})`, transformOrigin: 'top center', fontSize: 12, fontWeight: 700, color: n.c, cursor: 'pointer', transition: 'transform 0.12s ease, color 0.12s ease' }}
                        >{n.t}</div>
                      ))}
                      {main.baseLabel && <div style={{ position: 'absolute', left: 2, top: main.baseY, fontSize: 13, fontWeight: 600, color: MUTED }}>{main.baseLabel}</div>}
                    </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: MUTED }}>Frets: <span style={{ fontWeight: 700, color: '#3c3452', letterSpacing: 2 }}>{voicingText}</span></div>
                      <div style={{ fontSize: 12, color: FAINT, lineHeight: 1.6 }}>Fingers: 1 index · 2 middle<br />3 ring · 4 pinky</div>
                      <div style={{ fontSize: 12, color: FAINT }}>× don&apos;t play · ○ open string</div>
                    </div>
                  </div>
                )}
                {main && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={kicker}>{positionsLabel}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {alts.map((a, i) => (
                        <button key={i} type="button" className="cf-b cf-tap" onClick={a.onClick} style={{ border: `1.5px solid ${a.bd}`, background: a.bg, borderRadius: 12, padding: '8px 8px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', transition: 'border-color 0.1s ease' }}>
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
      )}

      {ident && (
        <section style={{ ...card, padding: isMobile ? 16 : 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={kicker}>{ident.resultKicker}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 'clamp(30px, 9vw, 44px)', fontWeight: 700, letterSpacing: '-1.2px', lineHeight: 1.05, color: ident.resultColor }}>{ident.resultName}</div>
                {ident.shapeBadge && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: MUTED, background: '#f2edfa', borderRadius: 99, padding: '5px 11px' }}>{ident.shapeBadge}</span>
                )}
              </div>
              <div style={{ fontSize: 15, color: MUTED, fontWeight: 500 }}>{ident.resultSub}</div>
            </div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}>
              <button type="button" className="cf-bright cf-tap" onClick={play} style={{ border: 'none', borderRadius: 12, padding: '13px 20px', fontSize: 15, fontWeight: 700, background: playing ? '#3c3452' : accent, color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: isMobile ? 1 : undefined, gap: 9, whiteSpace: 'nowrap', cursor: 'pointer', boxShadow: '0 4px 14px rgba(90,50,180,0.28)', transition: 'background 0.15s ease' }}>{playing ? '■ Stop' : '▶ Play chord'}</button>
              <button type="button" className="cf-b cf-tap" onClick={clearSel} style={{ border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '13px 20px', fontSize: 15, fontWeight: 600, background: '#ffffff', color: '#3c3452', whiteSpace: 'nowrap', cursor: 'pointer', transition: 'border-color 0.1s ease' }}>Clear</button>
            </div>
          </div>

          {ident.hasAlts && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={kicker}>Also known as</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ident.candAlts.map(c => (
                  <button key={c.i} type="button" className="cf-b cf-tap" onClick={() => setPick(c.i)} style={{ border: `1.5px solid ${BORDER}`, background: '#ffffff', color: '#3c3452', borderRadius: 10, padding: isMobile ? '11px 14px' : '9px 14px', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'border-color 0.1s ease' }}>
                    {c.name} <span style={{ fontSize: 11.5, fontWeight: 500, color: FAINT }}>{c.note}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={kicker}>{ident.pickerLabel}</div>

            {ident.fb && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={kicker}>Capo</span>
                  <div className="cf-strip" style={{ display: 'flex', background: PILL_BG, borderRadius: 10, padding: 3, gap: 2, maxWidth: '100%' }}>
                    {capoIdentBtns.map((cb, i) => (
                      <button key={i} type="button" className="cf-tap" onClick={cb.onClick} style={segStyle(cb, capoBtn)}>{cb.label}</button>
                    ))}
                  </div>
                </div>

                {fbWindowed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button" className="cf-b cf-tap" onClick={() => setFretWin(fbM.f0 - 1)}
                      disabled={fbM.f0 <= 0} aria-label="Show lower frets"
                      style={winBtn(fbM.f0 <= 0, fretsBelow)}
                    >◀</button>
                    <span style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: MUTED }}>
                      {fbM.f0 === 0 ? `Nut – fret ${fbM.f0 + fbM.visible}` : `Frets ${fbM.f0 + 1}–${fbM.f0 + fbM.visible}`}
                    </span>
                    <button
                      type="button" className="cf-b cf-tap" onClick={() => setFretWin(fbM.f0 + 1)}
                      disabled={fbM.f0 >= FN - fbM.visible} aria-label="Show higher frets"
                      style={winBtn(fbM.f0 >= FN - fbM.visible, fretsAbove)}
                    >▶</button>
                  </div>
                )}

                <div ref={fbBoxRef} style={{ position: 'relative', width: '100%', height: ident.fb.h, touchAction: 'manipulation' }}>
                  <div style={{ position: 'absolute', left: ident.fb.boardX, top: BOARD_Y, width: ident.fb.boardW, height: ident.fb.boardH, background: 'linear-gradient(180deg,#57351f,#3a2317 60%,#472c1b)', boxShadow: 'inset 0 2px 7px rgba(0,0,0,0.45)', borderRadius: ident.fb.showNut ? '0 5px 5px 0' : 5 }} />
                  {ident.fb.inlays.map((il, i) => (
                    <div key={i} style={{ position: 'absolute', left: il.x, top: il.y, width: 11, height: 11, margin: '-5.5px 0 0 -5.5px', borderRadius: '50%', background: '#efe9dd', opacity: 0.42 }} />
                  ))}
                  {ident.fb.wires.map((w, i) => (
                    <div key={i} style={{ position: 'absolute', left: w.x, top: BOARD_Y, width: 2, height: ident.fb!.boardH, background: 'linear-gradient(90deg,#7c828c,#e8ebf0,#7c828c)' }} />
                  ))}
                  {ident.fb.showNut && (
                    <div style={{ position: 'absolute', left: ident.fb.nutX, top: BOARD_Y, width: NUT_W, height: ident.fb.boardH, background: 'linear-gradient(90deg,#f3ebda,#c9baa0)', borderRadius: '2px 0 0 2px' }} />
                  )}
                  {ident.fb.dim && (
                    <div style={{ position: 'absolute', left: ident.fb.dim.x, top: ident.fb.dim.y, width: ident.fb.dim.w, height: ident.fb.dim.h, background: 'rgba(12,6,20,0.42)' }} />
                  )}
                  {ident.fb.strings.map((s, i) => (
                    <div key={i} style={{ position: 'absolute', left: ident.fb!.stringX, top: s.y, width: ident.fb!.stringW, height: s.t, marginTop: s.o, background: 'linear-gradient(180deg,#fbfbfd,#8f8fa0)' }} />
                  ))}
                  {ident.fb.capo && (
                    <div style={{ position: 'absolute', left: ident.fb.capo.x, top: ident.fb.capo.y, width: ident.fb.capo.w, height: ident.fb.capo.h, borderRadius: 5, background: 'linear-gradient(180deg,#33333b,#15151a)', boxShadow: ident.fb.capo.gl, transition: 'box-shadow 0.15s ease' }} />
                  )}
                  {ident.fb.cells.map((c, i) => (
                    <button
                      key={i} type="button" className="cf-cell cf-tap"
                      onClick={() => setFret(c.s, c.n)}
                      aria-label={`String ${c.s + 1}, fret ${c.n}`}
                      style={{ position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, background: 'transparent', border: 'none', padding: 0, borderRadius: 4, cursor: 'pointer' }}
                    />
                  ))}
                  {ident.fb.dots.map((d, i) => (
                    <div key={i} style={{ position: 'absolute', left: d.x, top: d.y, width: 25, height: 25, margin: '-12.5px 0 0 -12.5px', borderRadius: '50%', background: d.bg, boxShadow: d.gl, transition: 'box-shadow 0.12s ease, background 0.12s ease', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, pointerEvents: 'none' }}>{d.t}</div>
                  ))}
                  {ident.fb.opens.map((o, i) => (
                    <button
                      key={i} type="button" className="cf-b cf-tap"
                      onClick={() => { if (!o.disabled) setFret(o.s, 0) }}
                      aria-label={`String ${o.s + 1} open`}
                      style={{
                        position: 'absolute', left: o.x, top: o.y, width: 26, height: 26, marginTop: -13,
                        transform: `scale(${o.sc})`, borderRadius: '50%', border: `1.5px solid ${o.bd}`,
                        background: o.bg, color: o.fg, fontSize: 12, fontWeight: 700, padding: 0,
                        boxShadow: o.gl, opacity: o.op, pointerEvents: o.pe, cursor: 'pointer',
                        transition: 'border-color 0.1s ease, transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease',
                      }}
                    >{o.t}</button>
                  ))}
                  {ident.fb.labels.map((l, i) => (
                    <div key={i} style={{ position: 'absolute', left: 0, top: l.y, marginTop: -9, fontSize: 12.5, fontWeight: 700, color: MUTED }}>{l.t}</div>
                  ))}
                  {ident.fb.nums.map((n, i) => (
                    <div key={i} style={{ position: 'absolute', left: n.x, top: ident.fb!.numY, width: 26, marginLeft: -13, textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: '#a79eba' }}>{n.t}</div>
                  ))}
                </div>

                {ident.hasShifted && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="cf-b cf-tap" onClick={() => shiftShape(-1)} style={{ border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: isMobile ? '11px 14px' : '8px 14px', flex: isMobile ? 1 : undefined, fontSize: 13, fontWeight: 600, background: '#ffffff', color: '#3c3452', cursor: 'pointer', transition: 'border-color 0.1s ease' }}>◀ Lower</button>
                    <button type="button" className="cf-b cf-tap" onClick={() => shiftShape(1)} style={{ border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: isMobile ? '11px 14px' : '8px 14px', flex: isMobile ? 1 : undefined, fontSize: 13, fontWeight: 600, background: '#ffffff', color: '#3c3452', cursor: 'pointer', transition: 'border-color 0.1s ease' }}>Higher ▶</button>
                    <span style={{ fontSize: 12.5, color: FAINT, alignSelf: 'center' }}>slide this shape up or down the neck</span>
                  </div>
                )}
              </div>
            )}

            {isPiano && (<>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button" className="cf-b cf-tap" onClick={connectMidi}
                  style={{
                    border: `1.5px solid ${midiState === 'on' ? accent : BORDER}`, borderRadius: 10,
                    padding: isMobile ? '11px 14px' : '8px 14px', fontSize: 13, fontWeight: 600,
                    background: midiState === 'on' ? accent : '#ffffff',
                    color: midiState === 'on' ? '#ffffff' : '#3c3452',
                    whiteSpace: 'nowrap', cursor: 'pointer', transition: 'border-color 0.1s ease',
                  }}
                >{midiLabel}</button>
                {midiStatus && <span style={{ fontSize: 12.5, color: midiStatusColor }}>{midiStatus}</span>}
              </div>
              {pianoWindowed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button" className="cf-b cf-tap" onClick={() => setOctWin(identPianoM.o0 - 1)}
                    disabled={identPianoM.o0 <= 0} aria-label="Show lower octave"
                    style={winBtn(identPianoM.o0 <= 0, octBelow)}
                  >◀</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: MUTED }}>
                    {`Octaves ${identPianoM.o0 + 3}–${identPianoM.o0 + identPianoM.oct + 2}`}
                  </span>
                  <button
                    type="button" className="cf-b cf-tap" onClick={() => setOctWin(identPianoM.o0 + 1)}
                    disabled={identPianoM.o0 >= PIANO_OCTAVES - identPianoM.oct} aria-label="Show higher octave"
                    style={winBtn(identPianoM.o0 >= PIANO_OCTAVES - identPianoM.oct, octAbove)}
                  >▶</button>
                </div>
              )}
              <div ref={identPianoRef} style={{ paddingTop: 2, touchAction: 'manipulation', overflowX: 'hidden' }}>
                <div style={{ position: 'relative', height: 186, width: identPianoM.w }}>
                  {ident.iWhite.map(k => (
                    <button key={`w${k.sm}`} type="button" className="cf-tap" onClick={() => toggleKey(k.sm)} aria-label={`Note ${k.label}`} style={{ position: 'absolute', top: 0, left: k.x, width: k.w, height: 172, background: k.bg, border: `1px solid ${k.bd}`, borderRadius: '0 0 6px 6px', boxSizing: 'border-box', zIndex: 1, boxShadow: k.gl, transition: 'background 0.1s ease, box-shadow 0.1s ease', padding: 0, cursor: 'pointer' }}>
                      <span style={{ position: 'absolute', bottom: 7, left: 0, right: 0, textAlign: 'center', fontSize: identPianoM.label, fontWeight: 700, color: k.fg }}>{k.label}</span>
                    </button>
                  ))}
                  {ident.iBlack.map(k => (
                    <button key={`b${k.sm}`} type="button" className="cf-tap" onClick={() => toggleKey(k.sm)} aria-label={`Note ${k.label || 'black key'}`} style={{ position: 'absolute', top: 0, left: k.x, width: identPianoM.bwId, height: 106, background: k.bg, border: 'none', borderRadius: '0 0 4px 4px', zIndex: 2, boxShadow: k.gl, transition: 'background 0.1s ease, box-shadow 0.1s ease', padding: 0, cursor: 'pointer' }}>
                      <span style={{ position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center', fontSize: identPianoM.blabel, fontWeight: 700, color: k.fg }}>{k.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>)}

            <div style={{ fontSize: 12.5, color: FAINT }}>Octave and order don&apos;t matter — Do–Mi–Sol, Mi–Sol–Do and Sol–Do–Mi are all the same chord.</div>
          </div>
        </section>
      )}
    </div>
  )
}

type FretboardData = {
  w: number; h: number; boardW: number; boardH: number; stringW: number; numY: number
  /** Medidas de la ventana visible; ver `fretMetrics`. */
  boardX: number; nutX: number; openX: number; showNut: boolean; stringX: number
  strings: { y: number; t: number; o: number }[]
  labels: { y: number; t: string }[]
  opens: { s: number; x: number; y: number; t: string; bd: string; bg: string; fg: string; gl: string; sc: number; op: number; pe: 'none' | 'auto'; disabled: boolean }[]
  cells: { s: number; n: number; x: number; y: number; w: number; h: number }[]
  dots: { x: number; y: number; t: string; bg: string; gl: string }[]
  wires: { x: number }[]
  inlays: { x: number; y: number }[]
  nums: { x: number; t: string }[]
  capo: { x: number; y: number; w: number; h: number; gl: string } | null
  dim: { x: number; y: number; w: number; h: number } | null
}
