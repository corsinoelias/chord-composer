// Logica del buscador de acordes, sin React.
//
// Todo lo que no es pintar vive aqui: leer digitaciones, componer el diagrama, nombrar un
// conjunto de notas, reconocer una forma en el mastil y entender lo que el usuario escribe
// en el buscador. Separado del componente porque son funciones puras sobre datos y se
// razonan (y se corrigen) mucho mejor sin el ruido del JSX alrededor.

import {
  DEG, ROOTS, LETPC, EN, TYPES, GROUPS, spell, nn,
  type ChordType, type SpelledNote,
} from '../../lib/chordTheory'

export type Notation = 'english' | 'latin'
export type Instrument = 'guitar' | 'piano' | 'ukulele'

// ── Digitaciones ───────────────────────────────────────────────────────────
// La base de datos guarda cada voicing como "x,3,2,0,1,0" mas una cadena de dedos "321".
// Los dedos van SOLO para las cuerdas pisadas, en orden, asi que hay que recorrer el
// voicing para saber a que cuerda corresponde cada digito.

export type RawVoicing = { p: string; f: string }
export type ChordsDB = Record<string, Record<string, RawVoicing[]>>

export type Barre = { finger: number; fret: number; from: number; to: number }
export type ParsedVoicing = {
  v: number[]
  an: { fingers: Record<number, number>; barres: Barre[]; minF: number; maxF: number }
}

export function parseVoicing(e: RawVoicing, n: number): ParsedVoicing | null {
  const v = String(e.p).split(',').map(t => (t === 'x' ? -1 : parseInt(t, 10)))
  if (v.length !== n || v.some(isNaN)) return null
  const digits = String(e.f || '').replace(/[^0-9]/g, '')
  const fingers: Record<number, number> = {}
  let i = 0
  for (let s = 0; s < n; s++) if (v[s] > 0) { const d = digits[i++]; if (d && d !== '0') fingers[s] = +d }
  // Mismo dedo + mismo traste en varias cuerdas = cejilla. No viene marcada en los datos,
  // se deduce, que es como se lee tambien en un diagrama de papel.
  const groups: Record<string, number[]> = {}
  Object.keys(fingers).forEach(sk => {
    const s = +sk
    const k = fingers[s] + '@' + v[s]
    ;(groups[k] = groups[k] || []).push(s)
  })
  const barres: Barre[] = []
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

export function voicingsFor(db: ChordsDB | null, rootKey: string, type: ChordType, tuningKey: string): ParsedVoicing[] {
  if (!db) return []
  const arr = (db[tuningKey] || {})[rootKey + type.k] || []
  const n = tuningKey === 'GCEA' ? 4 : 6
  return arr.map(e => parseVoicing(e, n)).filter((x): x is ParsedVoicing => x !== null)
}

/** Nombre de la fundamental tal y como la indexa la base: C, C#, Db, … */
export function rootKeyOf(li: number, acc: number): string {
  return EN[li] + (acc === -1 ? 'b' : acc === 1 ? '#' : '')
}

/** Indice de ROOTS cuya clase de altura es `pc`. */
export function rootIdxForPc(pc: number): number {
  const p = ((pc % 12) + 12) % 12
  return ROOTS.findIndex(rr => ((((LETPC[rr[0]] + rr[1]) % 12) + 12) % 12) === p)
}

export function pcOfRoot(rootIdx: number): number {
  const [li, acc] = ROOTS[rootIdx]
  return (((LETPC[li] + acc) % 12) + 12) % 12
}

// ── Diagrama de acorde ─────────────────────────────────────────────────────
// Una caja de 4 trastes. Si el acorde no pasa del 4º se dibuja la cejuela gruesa arriba;
// si no, la caja empieza en el traste mas grave y se rotula "5fr". Es la convencion de
// cualquier cancionero, y respetarla evita tener que explicar el diagrama.

export type Geometry = { sw: number; fh: number; padL: number; padR: number; padT: number; padB: number; dotR: number }
export type DiagramOpts = {
  lefty: boolean
  showFingers: boolean
  full: boolean
  tun: number[]
  accent?: string
  capo?: number
  noteFor?: (pc: number) => { t: string; root: boolean } | null
  activeS?: number | string | null
  /** Clase de altura senalada desde fuera, para emparejar nota y posicion al pasar el raton. */
  hoverPc?: number | null
}
/**
 * Cada elemento lleva la clase de altura que suena ahi (`pc`) y si esta emparejado con la
 * nota senalada (`hl`). Es lo que permite el vaiven en las dos direcciones: del circulo de
 * la nota a sus posiciones en el mastil, y de una posicion de vuelta a su nota.
 */
export type DiagramData = {
  w: number; h: number; gridTop: number; gridH: number; gridLeft: number; gridW: number
  /** Separacion entre cuerdas: es el ancho que se le da a cada zona sensible. */
  sw: number
  strings: { x: number }[]
  frets: { y: number; h: number; bg: string }[]
  /**
   * `ghost` = cuerda tapada por una cejilla: no se pinta, pero se puede senalar. `hitX`/
   * `hitW` son su trozo de pildora, repartida entre las cuerdas que tapa para que no quede
   * ni un pixel muerto — ni siquiera el que ocupa el numero del dedo.
   */
  dots: { x: number; y: number; n: string; sc: number; bg: string; gl: string; pc: number | null; hl: boolean; ghost: boolean; s: number; hitX: number; hitW: number }[]
  tops: { x: number; y: number; t: string; sc: number; c: string; pc: number | null; hl: boolean; s: number }[]
  notes: { x: number; y: number; t: string; c: string; pc: number; hl: boolean }[]
  barres: { x: number; y: number; w: number; h: number; n: string; gl: string }[]
  baseLabel: string; baseY: number
}

export function buildDiagram(vo: ParsedVoicing, g: Geometry, o: DiagramOpts): DiagramData {
  const v = vo.v, an = vo.an, L = o.lefty, N = v.length
  const X = (s: number) => g.padL + (L ? N - 1 - s : s) * g.sw
  const nut = an.maxF <= 4
  const base = nut ? 1 : an.minF
  const gw = (N - 1) * g.sw
  const accent = o.accent || '#7C3AED'
  const d: DiagramData = {
    w: g.padL + gw + g.padR, h: g.padT + 4 * g.fh + g.padB,
    gridTop: g.padT, gridH: 4 * g.fh, gridLeft: g.padL, gridW: gw, sw: g.sw,
    strings: [], frets: [], dots: [], tops: [], notes: [], barres: [],
    baseLabel: nut ? '' : base + 'fr', baseY: g.padT + 0.5 * g.fh - (o.full ? 9 : 5),
  }
  for (let s = 0; s < N; s++) d.strings.push({ x: X(s) - (o.full ? 1 : 0.5) })
  for (let i = 0; i <= 4; i++) {
    const isNut = i === 0 && nut
    const th = isNut ? (o.full ? 5 : 3) : (o.full ? 2 : 1)
    d.frets.push({ y: g.padT + i * g.fh - th / 2, h: th, bg: isNut ? '#241d33' : '#b9b0cc' })
  }
  const barreOf = (s: number) => an.barres.find(b => v[s] === b.fret && s >= b.from && s <= b.to && an.fingers[s] === b.finger)
  const inBarre = (s: number) => !!barreOf(s)

  /**
   * El trozo de pildora que le toca a una cuerda: hasta el punto medio con la cuerda
   * vecina que tambien esta bajo la cejilla, y hasta el borde en los extremos. Reparte la
   * pildora entera sin dejar huecos, que es lo que hacia que senalar el numero del dedo no
   * respondiera a nada.
   */
  const barreSlice = (s: number) => {
    const b = barreOf(s)!
    const covered: number[] = []
    for (let i = b.from; i <= b.to; i++) if (v[i] === b.fret && an.fingers[i] === b.finger) covered.push(i)
    const xs = covered.map(X).sort((a, c) => a - c)
    const pillL = Math.min(X(b.from), X(b.to)) - g.dotR
    const pillR = Math.max(X(b.from), X(b.to)) + g.dotR
    const k = xs.indexOf(X(s))
    const left = k <= 0 ? pillL : (xs[k - 1] + xs[k]) / 2
    const right = k >= xs.length - 1 ? pillR : (xs[k] + xs[k + 1]) / 2
    return { hitX: left, hitW: right - left }
  }
  // Con capo el traste 0 ya no es la cejuela sino el capo, asi que hasta las cuerdas al
  // aire suenan transpuestas.
  const capo = o.capo || 0
  for (let s = 0; s < N; s++) {
    const f = v[s]
    const on = o.activeS === 'all' || (o.activeS != null && o.activeS === s)
    const pc = f < 0 ? null : (o.tun[s] + (f > 0 ? f + capo : capo)) % 12
    const hl = pc != null && o.hoverPc != null && pc === o.hoverPc
    if (f < 0) { d.tops.push({ x: X(s), y: g.padT - (o.full ? 18 : 9), t: '×', sc: 1, c: '#8a819e', pc: null, hl: false, s }); continue }
    if (f === 0) {
      d.tops.push({ x: X(s), y: g.padT - (o.full ? 18 : 9), t: '○', sc: on ? 1.35 : hl ? 1.25 : 1, c: on || hl ? accent : '#8a819e', pc, hl, s })
    } else {
      const rel = f - base + 1, covered = inBarre(s)
      const y = g.padT + (rel - 0.5) * g.fh
      if (!covered) {
        d.dots.push({ x: X(s), y, n: o.showFingers ? String(an.fingers[s] || '') : '', sc: on ? 1.28 : hl ? 1.18 : 1, bg: accent, gl: on ? '0 0 0 6px ' + accent + '33' : 'none', pc, hl, ghost: false, s, hitX: X(s) - g.sw / 2, hitW: g.sw })
      } else if (on && o.activeS !== 'all') {
        // La cuerda esta bajo la cejilla: sin punto propio no habria nada que iluminar
        // cuando suena, y la nota pareceria no existir.
        d.dots.push({ x: X(s), y, n: '', sc: 1.28, bg: accent, gl: '0 0 0 6px ' + accent + '33', pc, hl, ghost: false, s, hitX: X(s) - g.sw / 2, hitW: g.sw })
      } else if (o.full) {
        // Una cejilla es una sola pildora, pero cada cuerda que tapa es una nota distinta.
        // Sin un blanco propio por cuerda no habria forma de senalar el Fa de la 6a y el
        // Do de la 2a por separado: la pildora se comeria las dos. Invisible hasta que se
        // senala, para no ensuciar el diagrama con puntos sobre la cejilla.
        //
        // Se marca con un aro y no con un circulo relleno: en una cejilla de tres cuerdas
        // el centro de la pildora cae justo sobre la de en medio, y el relleno tapaba el
        // numero del dedo.
        d.dots.push({ x: X(s), y, n: '', sc: hl ? 1.18 : 1, bg: 'transparent', gl: 'none', pc, hl, ghost: true, s, ...barreSlice(s) })
      }
    }
    if (o.noteFor && pc != null) {
      const info = o.noteFor(pc)
      // Todos los nombres en el mismo tono: el acento solo marca la nota senalada.
      if (info) d.notes.push({ x: X(s), y: g.padT + 4 * g.fh + 12, t: info.t, c: hl ? accent : '#6f6788', pc, hl })
    }
  }
  an.barres.forEach(b => {
    const rel = b.fret - base + 1
    const xa = X(b.from), xb = X(b.to)
    const bon = o.activeS === 'all'
    d.barres.push({
      x: Math.min(xa, xb) - g.dotR, y: g.padT + (rel - 0.5) * g.fh - g.dotR * 0.95,
      w: Math.abs(xb - xa) + 2 * g.dotR, h: g.dotR * 1.9,
      n: o.showFingers ? String(b.finger) : '', gl: bon ? '0 0 0 5px ' + accent + '33' : 'none',
    })
  })
  return d
}

// ── Nombrar notas y acordes ────────────────────────────────────────────────

/**
 * Grafia por defecto de una clase de altura suelta, sin contexto de acorde: naturales
 * cuando existen, y si no la sostenida de la anterior. Solo se usa para notas que no
 * pertenecen al acorde elegido — dentro de un acorde manda su propio deletreo.
 */
export function defName(pc: number, notation: Notation): string {
  const li = LETPC.indexOf(pc)
  if (li >= 0) return nn({ l: li, a: 0 }, notation)
  return nn({ l: LETPC.indexOf(pc - 1), a: 1 }, notation)
}

/** Todos los subconjuntos de `arr`, de menor a mayor tamaño. */
function combos<T>(arr: T[]): T[][] {
  let res: T[][] = [[]]
  arr.forEach(a => { res = res.concat(res.map(r => r.concat([a]))) })
  return res.sort((a, b) => a.length - b.length)
}

export type NamedNote = SpelledNote & { name: string }
export type ChordCandidate = {
  name: string
  score: number
  note: string
  ti: number
  tid: string
  rootPc: number
  size: number
  notes: NamedNote[]
}

/**
 * De un conjunto de clases de altura a los nombres de acorde que lo explican.
 *
 * Fuerza bruta sobre 12 fundamentales x 30 tipos. Primero se busca la coincidencia exacta
 * (100 puntos); si no la hay, se prueba a quitar los grados omisibles del tipo (80 puntos y
 * una nota tipo "no 5"). Ordena por puntuacion, luego por acorde mas simple, y deja fuera
 * los nombres repetidos.
 */
export function matchChords(pcs: number[], notation: Notation): ChordCandidate[] {
  const key = pcs.join(',')
  if (pcs.length < 3) return []
  const out: ChordCandidate[] = []
  const setOf = (a: { pc: number }[]) => [...new Set(a.map(o => o.pc))].sort((x, y) => x - y).join(',')

  ROOTS.forEach(r => {
    const li = r[0], acc = r[1]
    const rootName = nn({ l: li, a: acc }, notation)
    const rootPc = (((LETPC[li] + acc) % 12) + 12) % 12
    TYPES.forEach((t, ti) => {
      const objs: NamedNote[] = t.degs.map(d => { const n = spell(li, acc, d); return { ...n, name: nn(n, notation) } })
      if (setOf(objs) === key) {
        out.push({ name: rootName + t.suf, score: 100, note: '', ti, tid: t.id, rootPc, size: t.degs.length, notes: objs })
        return
      }
      if (!t.opt.length) return
      const subs = combos(t.opt)
      for (let i = 0; i < subs.length; i++) {
        const drop = subs[i]
        if (!drop.length) continue
        const kept = objs.filter(o => !drop.some(dt => DEG[dt][1] === o.semi))
        if (kept.length >= 3 && setOf(kept) === key) {
          out.push({ name: rootName + t.suf, score: 80, note: 'no ' + drop.join('/'), ti, tid: t.id, rootPc, size: t.degs.length, notes: kept })
          return
        }
      }
    })
  })

  out.sort((a, b) => b.score - a.score || a.size - b.size || a.ti - b.ti)
  const seen: Record<string, 1> = {}
  const res: ChordCandidate[] = []
  out.forEach(o => { if (!seen[o.name]) { seen[o.name] = 1; res.push(o) } })
  return res.slice(0, 5)
}

/** El acorde que forman unos grados sobre una fundamental, opcionalmente transpuesta. */
export function nameFor(li: number, acc: number, tid: string, shift: number, notation: Notation): { name: string; notes: NamedNote[] } {
  const t = TYPES.find(x => x.id === tid)!
  let L = li, A = acc
  if (shift) {
    const i = rootIdxForPc(LETPC[li] + acc + shift)
    L = ROOTS[i][0]; A = ROOTS[i][1]
  }
  const notes: NamedNote[] = t.degs.map(d => { const n = spell(L, A, d); return { ...n, name: nn(n, notation) } })
  return { name: nn({ l: L, a: A }, notation) + t.suf, notes }
}

// ── Reconocer una forma en el mastil ───────────────────────────────────────

export type DbEntry = { p: string; v: number[]; li: number; acc: number; tid: string; ti: number; pi: number; n: number }

// El indice es caro de construir y no cambia nunca para una misma base: se cachea por
// objeto de datos, que es lo unico que puede variar (guitarra vs ukelele).
const dbIndexCache = new WeakMap<ChordsDB, Record<string, DbEntry[]>>()

export function dbIndex(db: ChordsDB | null, tuningKey: string): DbEntry[] {
  if (!db) return []
  let byTuning = dbIndexCache.get(db)
  if (!byTuning) { byTuning = {}; dbIndexCache.set(db, byTuning) }
  const cached = byTuning[tuningKey]
  if (cached) return cached

  const out: DbEntry[] = []
  const tbl = db[tuningKey] || {}
  ROOTS.forEach(r => {
    const li = r[0], acc = r[1]
    const rk = rootKeyOf(li, acc)
    TYPES.forEach((t, ti) => {
      const arr = tbl[rk + t.k]
      if (!arr) return
      arr.forEach((e, pi) => out.push({
        p: String(e.p),
        v: String(e.p).split(',').map(x => (x === 'x' ? -1 : parseInt(x, 10))),
        li, acc, tid: t.id, ti, pi, n: arr.length,
      }))
    })
  })
  byTuning[tuningKey] = out
  return out
}

/**
 * ¿Esta forma esta catalogada?
 *
 * Primero se busca el voicing identico. Si no aparece y la forma no usa cuerdas al aire,
 * se busca la misma forma desplazada por el mastil: una cejilla es la misma digitacion en
 * cualquier traste, asi que reconocerla movida es lo que hace que el 90% de los acordes
 * con cejilla tengan respuesta sin catalogarlos doce veces.
 */
export function matchShape(vec: number[], db: ChordsDB | null, tuningKey: string): { hits: DbEntry[]; moved: number } | null {
  const list = dbIndex(db, tuningKey)
  if (!list.length) return null
  const key = vec.join(',')
  const exact = list.filter(e => e.v.join(',') === key)
  if (exact.length) return { hits: exact, moved: 0 }

  const fretted = vec.filter(x => x > 0)
  // Una cuerda al aire no se desplaza con la mano, asi que la forma no es transportable.
  if (vec.indexOf(0) >= 0 || fretted.length < 3) return null
  for (let i = 0; i < list.length; i++) {
    const ev = list[i].v
    if (ev.length !== vec.length || ev.indexOf(0) >= 0) continue
    let d: number | null = null, ok = true
    for (let j = 0; j < vec.length; j++) {
      const a = vec[j], b = ev[j]
      if ((a < 0) !== (b < 0)) { ok = false; break }
      if (a < 0) continue
      if (d === null) d = a - b
      else if (a - b !== d) { ok = false; break }
    }
    if (ok && d) return { hits: [list[i]], moved: d }
  }
  return null
}

// ── Buscador por nombre ────────────────────────────────────────────────────

export type ParsedQuery = {
  rootIdx: number
  latin: boolean
  hadSlash: boolean
  /** Sufijo que no reconocemos. Presente solo cuando no se pudo resolver el tipo. */
  unknown?: string
  rootName?: string
  typeId?: string
  typeTab?: number
  name?: string
  /** true si se escribio con sostenido pero lo mostramos como bemol (mismas notas) */
  enh?: boolean
}

/** Sufijos aceptados. Las claves con mayuscula se comprueban aparte: M = mayor, m = menor. */
const QUALITY: Record<string, string> = {
  '': 'maj', 'maj': 'maj', 'major': 'maj', 'mayor': 'maj', 'ma': 'maj', 'M': 'maj',
  'm': 'm', 'min': 'm', 'mi': 'm', 'minor': 'm', 'menor': 'm', 'mineur': 'm',
  'dim': 'dim', 'o': 'dim', 'aug': 'aug', '+': 'aug', 'plus': 'aug',
  'sus': 'sus4', 'sus2': 'sus2', 'sus4': 'sus4', '5': '5', 'power': '5',
  '6': '6', 'm6': 'm6', 'min6': 'm6', 'menor6': 'm6', '69': '69', '6/9': '69', '69add': '69',
  '7': '7', 'dom7': '7', 'dominant7': '7', 'maj7': 'maj7', 'major7': 'maj7', 'ma7': 'maj7', 'M7': 'maj7', 'mayor7': 'maj7',
  'm7': 'm7', 'min7': 'm7', 'menor7': 'm7', 'dim7': 'dim7', 'o7': 'dim7',
  'm7b5': 'm7b5', 'min7b5': 'm7b5', 'halfdim': 'm7b5', '7b5': '7b5', '7sus4': '7sus4', '7sus': '7sus4',
  '9': '9', 'maj9': 'maj9', 'major9': 'maj9', 'M9': 'maj9', 'm9': 'm9', 'min9': 'm9', 'menor9': 'm9',
  'add9': 'add9', '9add': 'add9', '7b9': '7b9', '7#9': '7s9', '7s9': '7s9', '7+9': '7s9',
  '11': '11', 'm11': 'm11', 'min11': 'm11', 'maj11': 'maj11', 'M11': 'maj11',
  '13': '13', 'm13': 'm13', 'min13': 'm13', 'maj13': 'maj13', 'M13': 'maj13',
}

/** Solfeo primero: "sol" tiene que ganar a la letra que empieza igual. */
const SOLFEGE: [string, number][] = [['do', 0], ['re', 1], ['mi', 2], ['fa', 3], ['sol', 4], ['la', 5], ['si', 6]]

/**
 * Lee casi cualquier forma de escribir un acorde: Cmaj7, CM7, C-7, F#m7b5, Bb sus4,
 * sol7, do menor. El bajo de un acorde con barra se descarta a proposito — aqui se nombra
 * el acorde por sus notas, y "C/E" es un do mayor.
 */
export function parseChordQuery(q: string): ParsedQuery | null {
  if (!q) return null
  let s = String(q).trim()
  if (!s) return null

  let hadSlash = false
  const sl = s.match(/^(.*?)\s*\/\s*[A-Ga-g#b♯♭]+\s*$/)
  if (sl) { s = sl[1]; hadSlash = true }
  s = s.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/Δ/g, 'maj').replace(/ø/g, 'm7b5').replace(/°/g, 'dim')

  let latin = false, li = -1, acc = 0, rest = ''
  const low = s.toLowerCase().replace(/é/g, 'e')
  let hit: [string, number] | null = null
  for (const p of SOLFEGE) if (low.startsWith(p[0]) && (!hit || p[0].length > hit[0].length)) hit = p
  if (hit) {
    latin = true; li = hit[1]; rest = s.slice(hit[0].length)
  } else {
    const m = s.match(/^([A-Ga-g])/)
    if (!m) return null
    li = EN.indexOf(m[1].toUpperCase()); rest = s.slice(1)
  }

  let r = rest.replace(/^\s+/, '')
  const am = r.match(/^(##|#)/) || r.match(/^(bb|b)(?![a-z])/i) || r.match(/^\s*(sostenido|sharp|bemol|flat)(?![a-z])/i)
  if (am) {
    const t = am[1].toLowerCase()
    if (t === '#' || t === 'sostenido' || t === 'sharp') acc = 1
    else if (t === 'b' || t === 'bemol' || t === 'flat') acc = -1
    else if (t === '##') acc = 2
    else if (t === 'bb') acc = -2
    r = r.slice(am[0].length)
  }

  const rIdx = rootIdxForPc(LETPC[li] + acc)
  if (rIdx < 0) return null

  // "C-7" es la notacion de jazz para menor. Solo cuando el guion va pegado a un numero o
  // cierra la cadena: "C-" es menor, "C - 7" tambien, pero "sus-4" no.
  const rawQ = r.replace(/^\s*-\s*(?=\d|$)/, 'm')
  const k = rawQ.toLowerCase().replace(/[\s\-_.–—]/g, '')
  const rawTrim = rawQ.replace(/[\s\-_.]/g, '')

  let tid: string | null = null
  // La mayuscula distingue: CM7 es mayor septima, Cm7 es menor septima. Se comprueba antes
  // de bajar a minusculas, que es donde esa diferencia se pierde.
  if (QUALITY[rawTrim] !== undefined && /M/.test(rawTrim)) tid = QUALITY[rawTrim]
  if (!tid && QUALITY[k] !== undefined) tid = QUALITY[k]
  if (!tid) {
    const k2 = k.replace(/^major/, 'maj').replace(/^mayor/, 'maj')
      .replace(/^min(?=\d)/, 'm').replace(/^menor/, 'm').replace(/^minor/, 'm')
    if (QUALITY[k2] !== undefined) tid = QUALITY[k2]
  }

  const rootName = nn({ l: ROOTS[rIdx][0], a: ROOTS[rIdx][1] }, latin ? 'latin' : 'english')
  if (!tid) return { rootIdx: rIdx, latin, hadSlash, unknown: k, rootName }

  const t = TYPES.find(x => x.id === tid)
  if (!t) return null
  return {
    rootIdx: rIdx, typeId: t.id, typeTab: GROUPS.indexOf(t.group), latin, hadSlash,
    name: rootName + t.suf,
    enh: acc === 1 && ROOTS[rIdx][1] === -1,
  }
}

export type Suggestion = { id: string; label: string; notes: string; tab: number; ord: number; sc: number }

/**
 * Sugerencias para lo que se lleva escrito. Se fija la fundamental y se ordenan los 30
 * tipos por lo cerca que estan del sufijo tecleado, para que escribir "Cma" ofrezca maj,
 * maj7, maj9… antes que el resto.
 */
export function searchSuggestions(q: string, notation: Notation): Suggestion[] {
  if (!q || !q.trim()) return []
  const p = parseChordQuery(q)
  if (!p) return []
  const [li, acc] = ROOTS[p.rootIdx]
  const rn = nn({ l: li, a: acc }, notation)
  const want = p.unknown ? String(p.unknown).toLowerCase() : ''

  const score = (t: ChordType) => {
    if (!want) return 0
    const cands = [t.id.toLowerCase(), String(t.suf).toLowerCase(), String(t.k).toLowerCase()]
    let best = 99
    cands.forEach(c => {
      if (!c) return
      if (c === want) best = Math.min(best, 0)
      else if (want.startsWith(c)) best = Math.min(best, 1 + (want.length - c.length) * 0.1)
      else if (c.startsWith(want)) best = Math.min(best, 2 + (c.length - want.length) * 0.1)
      else {
        let shared = 0
        for (let i = 0; i < Math.min(c.length, want.length); i++) { if (c[i] === want[i]) shared++; else break }
        if (shared) best = Math.min(best, 4 - shared * 0.3)
      }
    })
    return best
  }

  const out: Suggestion[] = TYPES.map((t, i) => ({
    id: t.id,
    label: rn + t.suf,
    notes: t.degs.map(d => nn(spell(li, acc, d), notation)).join(' – '),
    tab: GROUPS.indexOf(t.group),
    ord: i,
    sc: score(t),
  }))
  if (want) out.sort((a, b) => a.sc - b.sc || a.ord - b.ord)
  // Si el tipo se reconocio del todo, va primero pase lo que pase.
  if (p.typeId) {
    const i = out.findIndex(o => o.id === p.typeId)
    if (i > 0) { const x = out.splice(i, 1)[0]; out.unshift(x) }
  }
  return out.slice(0, 6)
}
