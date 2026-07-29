// Identificacion inversa: de un conjunto de notas al nombre del acorde.
//
// Fuerza bruta sobre 12 fundamentales x 30 tipos = 360 candidatos. Es trivial en ejecucion
// (se recalcula en cada clic sin que se note) y evita mantener una tabla de busqueda que
// habria que regenerar cada vez que se toca TYPES.

import { ROOTS, TYPES, chordPitchClasses, nn, spell, type ChordType } from './chordTheory'

export type ChordMatch = {
  rootIdx: number
  type: ChordType
  /** Solo el acorde, sin bajo: "C". Es la identidad, y es lo que hay que destacar. */
  chordName: string
  /** Nombre completo con barra si el bajo no es la fundamental: "C/E" */
  name: string
  /** Nota del bajo ya deletreada, o null si es la fundamental */
  bassName: string | null
  /**
   * "1st inversion", "2nd inversion"... o null si esta en estado fundamental.
   * Se calcula del grado que ocupa el bajo dentro del acorde. Sin esto, un E-G-C se
   * presenta como "C/E" y se lee como si el mi fuera la fundamental, cuando en realidad
   * es un do mayor invertido -- que es justo lo que el usuario quiere que le digan.
   */
  inversion: string | null
  /** Grados del acorde que el usuario no toco, p.ej. ['5'] en un C7 sin quinta */
  missing: string[]
  /** true si la nota mas grave no es la fundamental */
  inverted: boolean
  score: number
}

/** Que inversion implica tener este grado en el bajo. */
function inversionFor(deg: string | undefined): string | null {
  if (!deg || deg === '1') return null
  if (deg === '3' || deg === 'b3') return '1st inversion'
  if (deg === '5' || deg === 'b5' || deg === '#5') return '2nd inversion'
  if (deg === '7' || deg === 'b7' || deg === 'bb7') return '3rd inversion'
  return null // 9as, 11as y 13as al bajo no se numeran como inversion
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

/**
 * La penalizacion por omitir tiene que ser mayor que cualquier bonus, para que un acorde
 * incompleto nunca gane a uno exacto. Se descubrio comprobando contra las digitaciones
 * reales: el Cdim de ukelele (5,3,2,x) suena Do-Mi♭-Sol♭, que es Cdim exacto, pero salia
 * como E♭m6 -- que necesita omitir su quinta -- solo porque el mi♭ quedaba al bajo y el
 * bono de fundamental-al-bajo compensaba la omision.
 */
const OMISSION_WEIGHT = 30
/** Una nota sobrante desplaza mas que una omitida, y siempre por debajo de una lectura limpia. */
const EXTRA_WEIGHT = 45

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

  // Se permite que dos clases de altura nombren una triada a la que le falte la quinta.
  // Al principio se prohibia, pero nuestra propia base de digitaciones lo contradice: el
  // Do de ukelele x,0,0,3 suena Do-Mi-Do, o sea solo {Do, Mi}, y esta catalogado como Do
  // mayor. La tercera sigue siendo obligatoria, asi que Do-Sol da C5 y no "Do sin tercera".
  const inputSet = new Set(input)
  const out: ChordMatch[] = []

  for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
    const [li, acc] = ROOTS[rootIdx]

    for (const type of TYPES) {
      // Que grado aporta cada clase de altura, para poder decir cual falta
      const byPc = new Map<number, string>()
      for (const d of type.degs) byPc.set(spell(li, acc, d).pc, d)
      const chordPcs = chordPitchClasses(rootIdx, type)

      // Se tolera UNA nota ajena al acorde. Descartarlas todas dejaba sin respuesta a
      // digitaciones reales de 5 y 6 cuerdas que doblan o anaden una nota suelta: probado
      // contra la base, habia formas que devolvian la lista vacia, y no dar ninguna
      // respuesta es peor que dar una con matices. Mas de una sobrante si descarta: a esas
      // alturas ya no es ese acorde.
      const extras = input.filter(pc => !chordPcs.includes(pc)).length
      if (extras > 1) continue
      // Una nota de mas solo es creible en acordes de cuatro grados o mas, donde doblar o
      // anadir una nota es habitual. En una triada o un acorde de quinta, una nota ajena
      // significa que simplemente no es ese acorde: sin esto, C5 salia como lectura
      // alternativa de cualquier do mayor, que es ruido y no una lectura de verdad.
      if (extras > 0 && type.degs.length < 4) continue

      const missing = chordPcs.filter(pc => !inputSet.has(pc)).map(pc => byPc.get(pc)!)
      const penalty = omissionPenalty(missing)
      if (penalty === null) continue
      // Una nota de mas pesa mas que una quinta ausente: sobra informacion que contradice
      // la lectura, en vez de faltar informacion que se puede dar por supuesta.
      if (extras > 0 && missing.length > 0) continue // ni omitida ni sobrante a la vez

      const rootPc = chordPcs.length ? spell(li, acc, '1').pc : -1
      const inverted = bassPc !== undefined && bassPc !== rootPc

      // Orden de preferencia: sin omisiones primero (con mucha diferencia), luego acordes
      // mas ricos, y la fundamental al bajo solo como desempate entre lecturas igual de
      // exactas -- que es lo que hace que A-C-E-G con A al bajo salga Am7 y no C6.
      let score = 100 - penalty * OMISSION_WEIGHT - extras * EXTRA_WEIGHT + type.degs.length
      if (bassPc !== undefined) score += bassPc === rootPc ? 8 : -4

      const rootName = nn(spell(li, acc, '1'), notation)
      const chordName = rootName + type.suf
      const bassName = inverted ? nn(spell(...bassLetterFor(bassPc!)), notation) : null
      const inversion = inverted ? inversionFor(byPc.get(bassPc!)) : null

      // name no lleva barra: una inversion sigue siendo el mismo acorde. Escribir "C/E"
      // sugiere que el mi al bajo es una decision armonica buscada, cuando casi siempre es
      // un detalle de como cae la forma bajo los dedos.
      out.push({ rootIdx, type, chordName, name: chordName, bassName, inversion, missing, inverted, score })
    }
  }

  out.sort((a, b) => b.score - a.score)

  // Solo se ofrecen como alternativa las lecturas que compiten de verdad con la primera.
  // Un "Cadd9 sin novena" es un do mayor con otro nombre: tecnicamente coincide, pero
  // listarlo hace ruido y da la impresion de que la herramienta duda mas de lo que duda.
  // Los empates autenticos (C6 y Am7) quedan a pocos puntos y siguen apareciendo.
  const cutoff = out.length ? out[0].score - 20 : 0
  return out.filter(m => m.score >= cutoff).slice(0, limit)
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
