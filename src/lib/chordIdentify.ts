// Identificacion inversa: de un conjunto de notas al nombre del acorde.
//
// Fuerza bruta sobre 12 fundamentales x 30 tipos = 360 candidatos. Es trivial en ejecucion
// (se recalcula en cada clic sin que se note) y evita mantener una tabla de busqueda que
// habria que regenerar cada vez que se toca TYPES.

import { ROOTS, TYPES, chordPitchClasses, nn, spell, type ChordType } from './chordTheory'

export type ChordMatch = {
  rootIdx: number
  type: ChordType
  /** Nombre listo para mostrar, con barra si el bajo no es la fundamental: "C/E" */
  name: string
  /** Grados del acorde que el usuario no toco, p.ej. ['5'] en un C7 sin quinta */
  missing: string[]
  /** true si la nota mas grave no es la fundamental */
  inverted: boolean
  score: number
}

/** Grados que se pueden omitir sin destruir la identidad del acorde. */
const OMISSIBLE = new Set(['5', '9', '11'])

/**
 * La quinta justa es la nota mas prescindible: no distingue mayor de menor ni altera la
 * funcion. En guitarra se omite constantemente por falta de dedos, y en acordes extendidos
 * (9, 11, 13) tambien se cae la novena o la oncena. Omitir la tercera o la septima, en
 * cambio, si cambia el acorde, asi que esas nunca se dan por supuestas.
 */
function omissionPenalty(missing: string[]): number | null {
  let p = 0
  for (const d of missing) {
    if (!OMISSIBLE.has(d)) return null // grado esencial ausente: no es este acorde
    p += d === '5' ? 1 : 2
  }
  return p
}

export type IdentifyOptions = {
  notation?: 'english' | 'latin'
  /** Cuantas lecturas alternativas devolver como maximo */
  limit?: number
}

/**
 * @param pitchClasses clases de altura (0-11); se ignoran duplicados y el orden
 * @param bassPc       clase de altura de la nota mas grave, para inversiones y acordes con barra
 */
export function identifyChord(
  pitchClasses: number[],
  bassPc?: number,
  opts: IdentifyOptions = {},
): ChordMatch[] {
  const notation = opts.notation ?? 'english'
  const limit = opts.limit ?? 6

  const input = [...new Set(pitchClasses.map(pc => ((pc % 12) + 12) % 12))].sort((a, b) => a - b)
  if (input.length < 2) return []

  // Con dos notas solo tiene sentido nombrar los acordes que de verdad tienen dos: el de
  // quinta. Dejar que una triada coincidiera "sin la quinta" haria que C-E se llamara C, y
  // dos notas no bastan para afirmar eso. Asi C-G da C5 y C-E no da nada, que es lo correcto.
  const twoNoteOnly = input.length === 2

  const inputSet = new Set(input)
  const out: ChordMatch[] = []

  for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
    const [li, acc] = ROOTS[rootIdx]

    for (const type of TYPES) {
      if (twoNoteOnly && type.degs.length !== 2) continue

      // Que grado aporta cada clase de altura, para poder decir cual falta
      const byPc = new Map<number, string>()
      for (const d of type.degs) byPc.set(spell(li, acc, d).pc, d)
      const chordPcs = chordPitchClasses(rootIdx, type)

      // Una nota tocada que el acorde no contiene lo descarta: preferimos no nombrar a
      // nombrar mal. El caso de "acorde con notas de mas" se cubre con otra lectura, que
      // casi siempre existe (C-E-G-A es Am7 aunque no sea C con un extra).
      if (input.some(pc => !chordPcs.includes(pc))) continue

      const missing = chordPcs.filter(pc => !inputSet.has(pc)).map(pc => byPc.get(pc)!)
      const penalty = omissionPenalty(missing)
      if (penalty === null) continue

      const rootPc = chordPcs.length ? spell(li, acc, '1').pc : -1
      const inverted = bassPc !== undefined && bassPc !== rootPc

      // Preferimos: sin omisiones > acordes mas ricos (mas grados explican mas notas) >
      // fundamental al bajo. Lo ultimo es lo que hace que A-C-E-G con A al bajo salga como
      // Am7 y no como C6, que es la lectura que espera cualquier musico.
      let score = 100 - penalty * 10 + type.degs.length
      if (bassPc !== undefined) score += bassPc === rootPc ? 8 : -4

      const rootName = nn(spell(li, acc, '1'), notation)
      let name = rootName + type.suf
      if (inverted) name += '/' + nn(spell(...bassLetterFor(bassPc!)), notation)

      out.push({ rootIdx, type, name, missing, inverted, score })
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Deletrea la nota del bajo por si sola. Se usa la grafia por defecto de ROOTS: sin el
 * contexto del acorde no hay forma de saber si un 6 es F♯ o G♭, y elegir mal seria peor
 * que elegir la convencional.
 */
function bassLetterFor(pc: number): [number, number, string] {
  const idx = ((pc % 12) + 12) % 12
  const [li, acc] = ROOTS[idx]
  return [li, acc, '1']
}
