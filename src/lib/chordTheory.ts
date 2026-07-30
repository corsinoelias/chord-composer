// Teoría de acordes compartida.
//
// Esto vivía dentro de ChordFinderTool.tsx, que solo necesitaba la dirección directa
// (acorde -> notas). El identificador de src/lib/chordIdentify.ts necesita exactamente los
// mismos datos para la dirección inversa, y duplicarlos garantizaba que las dos versiones
// divergieran en cuanto alguien tocara un tipo de acorde: se generaría un acorde que el
// identificador no reconoce, y eso no se ve hasta que lo reporta un usuario.

// DEG[token] = [desplazamiento de letra desde la fundamental, semitonos desde la fundamental]
export const DEG: Record<string, [number, number]> = {
  '1': [0, 0], '2': [1, 2], 'b3': [2, 3], '3': [2, 4], '4': [3, 5], 'b5': [4, 6],
  '5': [4, 7], '#5': [4, 8], '6': [5, 9], 'bb7': [6, 9], 'b7': [6, 10], '7': [6, 11],
  'b9': [8, 13], '9': [8, 14], '#9': [8, 15], '11': [10, 17], '13': [12, 21],
}

// [indice de letra, alteracion] para las 12 fundamentales cromaticas empezando en C
export const ROOTS: [number, number][] = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0],
  [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
]

/** Clase de altura de cada letra natural: C=0, D=2, E=4, F=5, G=7, A=9, B=11 */
export const LETPC = [0, 2, 4, 5, 7, 9, 11]
export const EN = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
export const LA = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si']

// Afinaciones. TUN/UKT son clases de altura; GMID/UMID son notas MIDI al aire.
export const TUN = [4, 9, 2, 7, 11, 4]      // EADGBE, grave -> agudo
export const UKT = [7, 0, 4, 9]             // GCEA
export const GMID = [40, 45, 50, 55, 59, 64] // EADGBE en MIDI, grave -> agudo
export const UMID = [67, 60, 64, 69]         // GCEA en MIDI (sol reentrante agudo)

/**
 * `opt` son los grados que el acorde puede perder sin dejar de llamarse igual. El
 * identificador prueba a quitarlos cuando el conjunto de notas no cuadra exacto: en
 * guitarra la quinta se omite constantemente por falta de dedos, y en los acordes
 * extendidos tambien se caen la novena o la oncena. La tercera y la septima nunca estan
 * aqui: quitarlas cambia el acorde, no lo simplifica.
 */
export type ChordType = { id: string; suf: string; degs: string[]; opt: string[]; group: string; k: string }
const T = (id: string, suf: string, degs: string[], opt: string[], group: string, k?: string): ChordType =>
  ({ id, suf, degs, opt, group, k: k ?? suf })

export const G1 = 'Basic', G2 = '6th & 7th', G3 = 'Extended'

export const TYPES: ChordType[] = [
  T('maj', '', ['1', '3', '5'], [], G1), T('m', 'm', ['1', 'b3', '5'], [], G1),
  T('dim', 'dim', ['1', 'b3', 'b5'], [], G1), T('aug', 'aug', ['1', '3', '#5'], [], G1),
  T('sus2', 'sus2', ['1', '2', '5'], [], G1), T('sus4', 'sus4', ['1', '4', '5'], [], G1),
  T('5', '5', ['1', '5'], [], G1),
  T('6', '6', ['1', '3', '5', '6'], ['5'], G2), T('m6', 'm6', ['1', 'b3', '5', '6'], ['5'], G2),
  T('69', '6/9', ['1', '3', '5', '6', '9'], ['5'], G2, '69'),
  T('7', '7', ['1', '3', '5', 'b7'], ['5'], G2), T('maj7', 'maj7', ['1', '3', '5', '7'], ['5'], G2, 'Maj7'),
  T('m7', 'm7', ['1', 'b3', '5', 'b7'], ['5'], G2),
  T('dim7', 'dim7', ['1', 'b3', 'b5', 'bb7'], [], G2), T('m7b5', 'm7♭5', ['1', 'b3', 'b5', 'b7'], [], G2, 'm7b5'),
  T('7b5', '7♭5', ['1', '3', 'b5', 'b7'], [], G2, '7b5'),
  T('7sus4', '7sus4', ['1', '4', '5', 'b7'], ['5'], G2),
  T('9', '9', ['1', '3', '5', 'b7', '9'], ['5'], G3), T('maj9', 'maj9', ['1', '3', '5', '7', '9'], ['5'], G3, 'Maj9'),
  T('m9', 'm9', ['1', 'b3', '5', 'b7', '9'], ['5'], G3),
  T('add9', 'add9', ['1', '3', '5', '9'], ['5'], G3),
  T('7b9', '7♭9', ['1', '3', '5', 'b7', 'b9'], ['5'], G3, '7b9'), T('7s9', '7♯9', ['1', '3', '5', 'b7', '#9'], ['5'], G3, '7#9'),
  T('11', '11', ['1', '3', '5', 'b7', '9', '11'], ['3', '5', '9'], G3), T('m11', 'm11', ['1', 'b3', '5', 'b7', '9', '11'], ['5', '9'], G3),
  T('maj11', 'maj11', ['1', '3', '5', '7', '9', '11'], ['5', '9'], G3, 'Maj11'),
  T('13', '13', ['1', '3', '5', 'b7', '9', '13'], ['5', '9'], G3), T('m13', 'm13', ['1', 'b3', '5', 'b7', '9', '13'], ['5', '9'], G3),
  T('maj13', 'maj13', ['1', '3', '5', '7', '9', '13'], ['5', '9'], G3, 'Maj13'),
]

export const GROUPS = [G1, G2, G3]

export type SpelledNote = { l: number; a: number; pc: number; semi: number }

/**
 * Deletrea un grado sobre una fundamental dada, respetando la enarmonia: la tercera de
 * D♭ es F, no E♯, porque la letra se decide por el grado y no por la clase de altura.
 */
export function spell(li: number, acc: number, dtok: string): SpelledNote {
  const d = DEG[dtok]
  const rl = (li + d[0]) % 7
  const pc = (((LETPC[li] + acc + d[1]) % 12) + 12) % 12
  let a = pc - LETPC[rl]
  if (a > 6) a -= 12
  if (a < -6) a += 12
  return { l: rl, a, pc, semi: d[1] }
}

export function nn(n: { l: number; a: number }, notation: 'english' | 'latin'): string {
  const base = notation === 'latin' ? LA[n.l] : EN[n.l]
  const acc = n.a === 0 ? '' : n.a === 1 ? '♯' : n.a === -1 ? '♭' : n.a === 2 ? '𝄪' : '𝄫'
  return base + acc
}

/** Clases de altura que suenan en un acorde, sin duplicados. */
export function chordPitchClasses(rootIdx: number, type: ChordType): number[] {
  const [li, acc] = ROOTS[rootIdx]
  const set = new Set<number>()
  for (const d of type.degs) set.add(spell(li, acc, d).pc)
  return [...set].sort((a, b) => a - b)
}
