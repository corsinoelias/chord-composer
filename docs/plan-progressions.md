# /progressions/ → la página de "chord progressions"

Plan escrito el 2026-09-24.

**Decidido el mismo día: por fases.** Solo se hizo lo barato, que se deshace en un commit:
- `/progressions/`: título y H1 "Chord Progressions", y el explorador de progresiones arriba
  del todo (el generador baja).
- El artículo cambia su `seoTitle` a "What Is a Chord Progression (or Chord Sequence)?" y
  enlaza a `/progressions/`.
- La home enlaza con el texto "Browse chord progressions".

El tablero, "Make it gospel" y las estadísticas de canciones (secciones de abajo) **solo se
construyen si** a las 3–4 semanas del rastreo `/progressions/` aparece para "chord progressions"
dentro del top 20. Si no aparece, esas horas van a "chord player" (posición 5,8, 15k impresiones).

## Por qué

- Keyword Planner agrupa **chord progression(s) / chord sequence / chord sequencer** en una sola
  búsqueda: **246.000/mes en todo el mundo** (110k en EE. UU., 6,6k en Reino Unido). Google trata
  "chord sequence" (nuestro dominio) y "chord progression" como la misma cosa.
- Hoy la ocupa `/learn/what-is-a-chord-progression/`: 45.448 impresiones, **13 clics** y posición
  10,6 (26 ago – 22 sep). Es un artículo que explica qué es una progresión, pero quien busca
  "chord progressions" quiere una lista para tocar.
- `/progressions/` no sale: 1 impresión en 28 días para esa consulta. Su `<title>` evita la keyword
  a propósito (ver el comentario en `index.astro`) para no competir con el artículo. Este plan
  invierte esos papeles.
- Volúmenes de las búsquedas que deberían caer en la misma página o en sus hijas:

| Búsqueda | /mes |
|---|---|
| 12 bar blues | 18.100 |
| 4 chord song | 12.100 |
| chord progressions guitar | 12.100 |
| chord progressions piano | 8.100 |
| jazz chord progressions | 6.600 |
| common chord progressions | 5.400 |
| royal road progression | 4.400 |
| sad chord progressions | 4.400 |
| 2 5 1 / andalusian cadence / best / popular | 2.400 c/u |
| 1 5 6 4 chord progression | 1.600 |
| 1 4 5 · gospel chords | 1.000 c/u |
| canon · 50s progression · neo soul | 880 c/u |
| gospel chord progressions | 720 |

## Lo que nadie más puede poner en esa página

Las listas de progresiones son iguales en todas partes (I–V–vi–IV, ii–V–I…). Nosotros tenemos
tres cosas que no tiene la competencia:

1. **78 canciones reales con acordes por sección** (`public_songs`, 58 de worship). Cruzándolas
   (script de prueba del 24 sep) sale:
   - **23 de 78 canciones (30%)** usan la familia I–V–vi–IV en alguna de sus rotaciones: Way
     Maker, 10,000 Reasons, Holy Forever, Goodness of God, Praise, Reckless Love…
   - I–IV–vi–V: 15 canciones. IV–vi–V–I: 15. I–vi–IV–V: 9 (How Great Is Our God, Build My Life).
   - Color fuera de la tonalidad: ♭VII en 11 canciones, iv prestado en 8, ♭VI en 8.

   Es decir: **"esta progresión suena en estas canciones, y aquí puedes oír su coro"**, con datos
   propios, no copiados.
2. **Un motor que toca con banda completa en cualquier tono y estilo.** Las mismas cuatro notas
   cambian por completo de pop a worship, gospel o neo soul. Nadie más lo deja escuchar en un clic.
3. **Gospel de verdad.** Hay `GospelChordPalette` (22 acordes), el 7–3–6, Total Praise y Never
   Would Have Made It en `iconicSongs.ts`. `/progressions/gospel/` tiene 0 impresiones: es buen
   contenido que nadie encuentra.

## La página

Orden de arriba abajo. Lo que ya existe se reordena; casi nada se tira.

### 1. Cabecera: respuesta directa

- `<title>`: **"Chord Progressions: The Most Common Ones, Playable in Any Key"**
- H1: **Chord Progressions**
- Una frase bajo el H1 (candidata a snippet): *"A chord progression is a series of chords played
  in order — also called a chord sequence. These are the ones real songs use most, with how often
  each one appears in our library of 78 songs."*

### 2. El tablero de progresiones (lo nuevo, arriba del todo)

Un solo control global: **tono** (12 tonos) + **estilo** (Pop · Worship · Gospel · Neo soul ·
Lo-fi · Rock). Debajo, las ~16 progresiones más comunes como tarjetas:

```
┌──────────────────────────────────────────────┐
│ I – V – vi – IV            "The 4-chord song" │
│ G   D   Em   C                 ▶  ⤢ player  │
│ ▮▮▮▮▮▮▮▮▮▮▮▮ 23 of our 78 songs use it       │
│ Way Maker · 10,000 Reasons · Holy Forever +20│
└──────────────────────────────────────────────┘
```

- **▶** suena en el tono y estilo globales, con el motor (`preview.ts` / `AppPlayback`). Cambiar
  el estilo mientras suena lo cambia en vivo (`update()`), que es la demostración.
- **"23 of our 78 songs"** se calcula al hacer el build desde `public_songs` (no se escribe a mano;
  crece solo con cada canción nueva). Cada canción enlaza a `/songs/<slug>/`.
- **⤢ player** abre `/chord-player/` con la progresión, el tono y el estilo cargados.
- Nombre popular cuando lo tiene: *The 4-chord song*, *Royal Road*, *Andalusian cadence*,
  *50s / doo-wop*, *Canon*, *ii–V–I*, *12-bar blues*, *Gospel 7–3–6*. Esos nombres son
  exactamente las búsquedas de la tabla de arriba.
- Diagramas de guitarra / piano plegables en cada tarjeta, para "chord progressions guitar"
  (12,1k) y "piano" (8,1k). Las digitaciones ya existen (`chordVoicingsGuitar.json`,
  `KeyHarmonyExplorer`).

### 3. "Make it gospel": la sorpresa

Un interruptor sobre el tablero que **rearmoniza** cada progresión sin cambiar sus números:

```
Pop:     G        D/F#      Em        C
Gospel:  Gmaj9    D/F#      Em9  A7   Cmaj9  C#°7  G/D  …  F#ø7 B7 Em (7–3–6)
```

Mismos grados, con las extensiones, dominantes secundarias, disminuidos de paso y el turnaround
7–3–6 que usa `GospelChordPalette`. Suena con el estilo Gospel. Explica en una línea qué cambió y
enlaza a `/progressions/gospel/`. Nadie más convierte "la de las 4 notas" en gospel en un clic:
es lo que se comparte y lo que hace que la gente se quede.

### 4. En canciones reales

Para las 3–4 familias grandes, cada canción de la biblioteca con la **sección** donde aparece
(normalmente el coro) y ▶ para oír esa sección en su tono original. Sustituye a
`IconicSongProgressions`, que es una lista fija de 8 canciones a mano.

### 5. Por género (se queda)

La cuadrícula actual de 13 géneros, más baja. Es el enlace interno hacia las páginas hijas.

### 6. Generador + explorador (se quedan, más abajo)

`HomeGenerator`, `ProgressionExplorer` y `KeyHarmonyExplorer` siguen, pero dejan de ser lo
primero. Quien llega por "chord progressions" quiere la lista, no generar.

### 7. Teoría + preguntas (se quedan)

Acordeón visible. **Nunca como FAQPage** (CLAUDE.md, `check-schema.mjs`). Añadir la pregunta
*"Chord progression or chord sequence?"* (el término británico).

## Fases

**0. Mirar la SERP (10 min, antes de escribir código).** Buscar "chord progressions" en
incógnito, con google.com en EE. UU. y Reino Unido. ¿Quién sale del 1 al 5? ¿Listas, Hooktheory,
vídeos, un bloque de "People also ask"? ¿Dónde aparece el artículo con esas 45k impresiones: en
el bloque normal o en uno secundario? Ver la memoria de las impresiones parásitas: una posición
10,6 con 0,03% de CTR puede ser eso. DataForSEO no tiene saldo (−0,06 USD); recargar unos pocos
dólares resolvería esto de forma medible.

**1. Tablero + cabecera + intercambio de papeles (el grueso).**
- `index.astro`: título, H1, frase, tablero, reordenar secciones y reescribir el comentario que
  hoy defiende el título orientado a géneros.
- Datos: `scripts/build-progression-stats.mjs` lee `public_songs`, pasa cada sección a grados
  (mismo algoritmo que la prueba: acorde → grado respecto a `key`, ventanas de 4, rotaciones
  agrupadas) y escribe `src/data/progressionStats.json`. Se commitea, como `soundGains.json`,
  para que el build no dependa de Supabase.
- `/learn/what-is-a-chord-progression/`: nuevo título *"What Is a Chord Progression (Chord
  Sequence)?"* para "what is a chord sequence" (3,6k, hoy en posición 20) y enlace destacado a
  `/progressions/` con el texto "chord progressions".
- Home: enlace visible a `/progressions/` con el texto "chord progressions".
- Eventos de GA4: `progression_play`, `progression_style_change`, `progression_gospelize`,
  `progression_open_player`. Sin ellos no sabremos si el tablero engancha.

**2. Páginas por progresión**, solo para las que tienen búsquedas propias:
`/progressions/i-v-vi-iv/` (4 chord song + 1 5 6 4 → 13,7k), `/progressions/royal-road/` (4,4k),
`/progressions/andalusian-cadence/` (2,4k), `/progressions/ii-v-i/` (ya existe como género; se
revisa), `/progressions/12-bar-blues/` (ya existe; 18,1k: comprobar por qué rankea),
`canon`, `50s`, `i-iv-v`. Misma plantilla: la tarjeta en grande, todos los tonos, todas las
canciones de la biblioteca que la usan, su versión gospel y su teoría. El tablero de la fase 1
enlaza a cada una.

**3. Enlaces de vuelta desde las canciones**: en cada `/songs/<slug>/`, "Este coro usa
I–V–vi–IV → otras 22 canciones con la misma progresión". **No antes del 20 de octubre:** tocar
las páginas de canción ahora contamina el test A/B de títulos (lectura el 10-20).

## Riesgos

- **Perder el 10,6 del artículo mientras Google decide cuál de las dos páginas elige.** Lo que
  está en juego son 13 clics en 28 días: el riesgo es pequeño.
- **Tarjetas que suenan todas a la vez / carga del motor.** El motor ya se carga en `/progressions/`
  (los reproductores existentes); un solo ▶ activo a la vez, como en el resto del sitio.
- **El catálogo es 74% worship.** El "23 of 78" sesga hacia worship. Decirlo tal cual ("in our
  library") es honesto y además es nuestro nicho fuerte; las progresiones de jazz, blues y neo
  soul se cuentan igual con sus canciones (Autumn Leaves…) aunque sean pocas.

## Cómo se mide

Referencia: 26 ago – 22 sep de 2026.

| Métrica | Hoy |
|---|---|
| "chord progressions", página que rankea | `/learn/…` pos 10,6, 45.448 impr, 13 clics |
| `/progressions/` | 1 impr en 28 días para esa consulta |
| "what is a chord sequence" | pos 20,3, 14 impr |

Confirmar primero que Google volvió a rastrear las páginas y después leer a las 3–4 semanas
(`node scripts/gsc.mjs query "chord progressions"`). En GA4, `pagePath` y no `pageTitle`, y los
eventos de la fase 1.
