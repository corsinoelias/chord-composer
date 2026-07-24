/**
 * Bass Tab Player — capa de tema.
 *
 * Antes de esto cada componente escribía sus colores a mano: ~460 literales
 * `hsl()` repartidos por 17 archivos, más objetos `const C = {…}` inventados
 * por separado en `BassTabSeekBar` y `MobileBarView`. Cambiar el aspecto
 * significaba buscar y reemplazar a ciegas.
 *
 * Los tokens se exponen de dos formas porque hay dos consumidores distintos:
 *
 *  - `BT_VARS` — variables CSS para el DOM. Se ponen en el contenedor raíz del
 *    player y se usan desde los `style={{ }}` en línea que ya hay
 *    (`background: 'var(--bt-card)'`), sin tener que migrar nada a Tailwind.
 *
 *  - `BT` — los mismos valores como objeto. Los exportadores de PNG y vídeo
 *    (`videoExporter.ts`, `videoPageRenderer.ts`, `tabImageExporter.ts`) pintan
 *    sobre canvas, donde `var(--bt-*)` no resuelve: necesitan el valor literal.
 *    Ese es el motivo de que exista la duplicidad — no es redundancia.
 *
 * Fuente de la paleta: prototipo PentagramTab. Tema claro únicamente; el tema
 * oscuro anterior queda sustituido, no conmutable.
 */

export const BT = {
  // Fondos, de más al fondo a más al frente
  paper:  '#f4f2ec',   // lienzo de la aplicación
  card:   '#ffffff',   // partitura, paneles, menús
  sunken: '#f0eee8',   // controles segmentados, franjas alternas
  rule:   '#e6e4dd',   // bordes y separadores

  // Texto, de más a menos contraste
  ink:   '#1c1b19',
  muted: '#5a5750',
  soft:  '#7d7a72',
  dim:   '#a29e93',

  // Acento. `wash` es el relleno del cursor y de la selección: tiene que
  // dejar leer la nota que hay debajo, por eso va con alfa y no sólido.
  accent:     '#c8492f',
  accentHi:   '#d8543a',
  accentWash: 'rgba(200, 73, 47, 0.08)',

  // Colores semánticos. Van aparte del acento a propósito: el acento significa
  // "esto es accionable", mientras que estos significan "esto está bien / ojo /
  // esto destruye". Que "borrar todo" y "reproducir" compartieran color sería
  // una trampa, y colapsarlos todos en el acento pierde información.
  danger:     '#d64545',
  dangerWash: 'rgba(214, 69, 69, 0.12)',
  ok:         '#2f8f5b',   // grabando, dispositivo MIDI conectado
  okWash:     'rgba(47, 143, 91, 0.12)',
  warn:       '#b8791f',   // cuenta atrás, compás desbordado
  warnWash:   'rgba(184, 121, 31, 0.12)',

  // Superficies oscuras: transporte, diapasón y vista Bass Guitar. Se quedan
  // oscuras a propósito — son madera y chasis, no papel.
  panel:     '#211f1c',
  panel2:    '#2a2823',
  panelRule: '#3a3833',
  panelInk:  '#f4f3ef',
  wood:      '#2b2621',
  woodInlay: '#3d382f',

  // Azul de referencia: número de compás. No es acento porque no es accionable,
  // solo te dice dónde estás.
  bar:     '#2f6fc8',
  barWash: 'rgba(47, 111, 200, 0.09)',

  // Tinta de pentagrama y tablatura
  staff: '#3a3833',

  shadow:   '0 1px 2px rgba(0,0,0,.08)',
  shadowLg: '0 12px 32px rgba(0,0,0,.14)',
} as const

export type BtToken = keyof typeof BT

/**
 * Pilas tipográficas. Van en un objeto aparte de `BT` porque `alpha()` da por
 * hecho que todo token de `BT` es un color hexadecimal, y porque los tipos
 * tienen un consumidor más: los `fontFamily` de SVG y canvas.
 *
 * `ui` mantiene Inter al frente — la carga `BaseLayout.astro` para todo el
 * sitio, así que el player no puede desviarse sin desentonar con el resto.
 * `mono` es la pila del sistema y no Space Mono: los números de traste se leen
 * a 9px sobre la cuerda, y ahí una mono de carácter estorba. Va con
 * `tabular-nums` allí donde el número cambia (BPM, compás:pulso) para que no
 * baile el ancho.
 */
export const BT_FONT = {
  ui:   "'Inter', ui-sans-serif, 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: "ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace",
} as const

export type BtFontToken = keyof typeof BT_FONT

/** Nombre de la variable CSS de un token: `paper` → `--bt-paper`. */
const cssVarName = (token: string) =>
  '--bt-' + token.replace(/[A-Z]/g, c => '-' + c.toLowerCase())

/**
 * Variables CSS listas para poner en el contenedor raíz del player.
 * Se tipa como Record<string, string> porque React.CSSProperties no admite
 * propiedades personalizadas sin un cast en cada una.
 */
export const BT_VARS: Record<string, string> = Object.fromEntries(
  [...Object.entries(BT), ...Object.entries(BT_FONT)]
    .map(([token, value]) => [cssVarName(token), value]),
)

/** Referencia a un token desde un `style={{ }}`: `v('accent')` → `var(--bt-accent)`. */
export const v = (token: BtToken) => `var(${cssVarName(token)})`

/** Igual que `v`, para las pilas tipográficas: `f('mono')` → `var(--bt-mono)`. */
export const f = (token: BtFontToken) => `var(${cssVarName(token)})`

/**
 * Alfa sobre un token hexadecimal, para estados de hover y capas por encima.
 * Solo acepta hex de 6 dígitos: los tokens que ya son rgba() no se pueden
 * recomponer así y devolverlos sin tocar enmascararía el error.
 */
export function alpha(token: BtToken, a: number): string {
  const hex = BT[token]
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`alpha() necesita un token hex de 6 dígitos; '${token}' es '${hex}'`)
  }
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
