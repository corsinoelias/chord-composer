// Paleta de las paginas de chord lookup.
//
// Estas paginas van con estilos en linea y su propia tipografia (Bricolage Grotesque +
// Hanken Grotesk, cargadas por pagina), aparte del sistema Tailwind del resto del sitio.
// Por eso los colores son literales y no variables CSS: aqui no hay tema que seguir.
//
// Vive en su propio modulo desde que el identificador (ChordIdentifier.tsx) comparte
// superficie con el buscador (ChordFinderTool.tsx) y las dos tienen que verse como una
// sola herramienta.

export const ACCENT = '#7C3AED'
export const TEXT = '#241d33'
export const MUTED = '#6f6788'
export const FAINT = '#8a819e'
export const BORDER = '#ddd5ec'
export const BORDER_LIGHT = '#e7e0f2'
export const PILL_BG = '#ece6f7'
export const CARD_BG = '#ffffff'

/** Teclado: 3 octavas, mismas medidas que el diagrama del buscador. */
export const KEY_W = 34
export const WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11]
export const BLACK_SEMIS = [1, 3, 6, 8, 10]
/** Desplazamiento en teclas blancas de cada tecla negra dentro de la octava */
export const BLACK_OFFSETS = [0, 1, 3, 4, 5]
export const OCTAVES = 3
/** El diagrama empieza en C3: MIDI 48 = semitono 0 */
export const PIANO_BASE_MIDI = 48
