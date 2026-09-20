# Paridad web ↔ app — plan

Estado: **implementado en su mayor parte el 18 sep 2026, sin commit, pendiente de probar.**
Ver "Estado de la implementación" al final.

Objetivo: que la web (`chord-composer`) y la app Flutter (`C:\Users\Eliascorsino\Projects\chord_sequencer`)
sean **dos clientes del mismo producto**: la misma canción, abierta en cualquiera de los dos,
tiene los mismos acordes, las mismas secciones, los mismos ritmos por sección, los mismos
sonidos por instrumento, y suena igual. Lo que editas en el móvil aparece en la web y al revés.

Relación con documentos anteriores:

- **Sustituye** a `chord_sequencer/docs/plan-datos-compartidos.md` (8 sep). Su idea central
  (un documento canónico, preservar campos desconocidos, RLS antes de escribir desde el móvil)
  sigue en pie y se reutiliza. Desde entonces la app cambió mucho (estilo por sección, fills,
  kit de 11 piezas, estilos de la web portados, `styleId` guardado, bilingüe) y aquel plan solo
  hablaba de **datos**. Este plan añade las dos cosas que faltaban: **comportamiento** y **sonido**.
- **Complementa** a `docs/ritmo-por-seccion.md` (14 sep). Su decisión "referencias, no copias"
  se mantiene como comportamiento por defecto; la decisión D1 de abajo la amplía para que la app
  pueda seguir editando el groove de una sección sin romperla.

---

## 0. Regla que manda sobre todo lo demás: lo que ya existe no cambia de sonido

Hoy el motor de la web hace sonar tres cosas con usuarios reales:

- las **canciones públicas** (`/songs/<slug>/`, p. ej. `/songs/washed-elevation-rhythm/`),
  76 en `public_songs`, reproducidas por `SongChordPlayer`;
- las **progresiones guardadas** de los usuarios: 273 de 168 usuarios (14 sep), 250+ cuentas;
- el **editor** con cualquier canción nueva.

La app apenas tiene usuarios. De ahí salen tres consecuencias que ordenan el plan:

1. **La web es la referencia sonora.** Cuando la web y la app hacen lo mismo de forma distinta
   (un estilo con el mismo nombre, la regla de fills, un voicing, un sonido), **se adapta la
   app**. La web solo cambia añadiendo cosas nuevas, nunca modificando cómo suena lo que ya hay.
2. **Una canción sin los campos nuevos suena exactamente como hoy.** Todo lo nuevo (estilo por
   sección, sonido por sección, pistas editadas, pan, EQ…) es opcional y activa código nuevo
   solo cuando está presente. El formato v5 se aplica **al leer**: los datos guardados no se
   reescriben en bloque, y cuando un usuario vuelve a guardar, lo que se escribe tiene que sonar
   igual que lo que había.
3. **Se demuestra con el corpus real, no con fixtures inventados.** Antes de tocar nada (fase 0)
   se congela la huella sonora de **todas** las canciones públicas y **todas** las progresiones
   guardadas, con el mismo método que `tests/audio/` (ventanas de 25 ms, RMS y cruces por cero,
   PRNG con semilla). Tras cada fase se vuelven a renderizar y **cualquier diferencia bloquea**
   la fase. Una diferencia solo se acepta si es un bug confirmado escuchando y se anota con el
   id de la canción afectada.

`npm run test:audio:update` sobre el corpus queda prohibido como forma de "arreglar" un fallo.

---

## 1. Qué significa "funcionar igual"

Hay tres niveles, y cada uno cuesta un orden de magnitud más que el anterior:

| Nivel | Qué se garantiza | Cómo se comprueba |
|---|---|---|
| **1. Datos** | La canción guardada por un cliente la abre el otro sin perder nada, y al guardarla de vuelta queda idéntica. | Round-trip de fixtures, byte a byte, en los dos repos. |
| **2. Comportamiento** | Los dos generan **las mismas notas**: mismo instante, misma altura, misma velocidad, misma duración, mismo instrumento. | Volcado de eventos de los dos motores para los mismos fixtures, comparados como listas. |
| **3. Sonido** | Cada nota suena con **el mismo instrumento** y el mismo nivel. | Mismo material de origen para cada sonido + medición de sonoridad (LUFS) + escucha A/B. |

Lo que **no** es el objetivo:

- **Audio idéntico bit a bit.** Dos motores distintos (Web Audio en JS, C++ nativo en Android)
  nunca darán el mismo PCM: reverbs, interpolación, denormales. El nivel 2 es exacto; el 3 es
  perceptual con tolerancias numéricas.
- **La misma interfaz.** Cada cliente presenta las cosas como le convenga (la app con hojas de
  opciones, la web con tarjetas). Lo que se comparte es el modelo y las reglas, no las pantallas.

**La idea que sostiene todo el plan:** la paridad no se consigue portando features de un lado a
otro a mano. Se consigue sacando de los dos códigos lo que hoy está duplicado y divergente
(formato, catálogo de estilos y sonidos, reglas de reproducción) a **un sitio compartido con
tests que fallan cuando alguno se desvía**. Sin los tests, la deriva vuelve en semanas; es lo
mismo que pasó con el FAQPage de este repo (ver `CLAUDE.md`).

---

## 2. Dónde divergen hoy (verificado en el código el 18 sep)

### Modelo de canción

| Concepto | Web | App | Consecuencia |
|---|---|---|---|
| Acorde | `{id, root, accidental, quality, duration, bassNote?}` (`musicTheory.ts:50`) | `{root:'C#', type, beats, bass?, origin?}` (`chord.dart`) | La app solo escribe sostenidos: un `Bb` de la web vuelve como `A#`. |
| Calidades | 39 (`CHORD_QUALITIES`, `musicTheory.ts:40`) | 15 (`chordTypes`, `constants.dart:14`), nombres distintos (`m9` ↔ `min9`) | `_decodeChord` **descarta** el acorde si no conoce el tipo (`project_codec.dart`). Una canción de la web con `maj9` perdería acordes. |
| Duración | `duration` en beats (number) | `beats` en medios | Compatible si la web limita a medios. |
| Tonalidad | no existe | `key` + `origin` por acorde | La web no tiene dónde guardarla. |
| Compás | del estilo (`timeSignature`) | de la canción (`meter`) | — |
| Repeticiones | `repeatCount` | `loop` + `infinite` | Mapeo directo; `infinite` no existe en la web. |
| Estilo | `styleId` de la canción | `styleId` de la canción (+ `styleIndex` legado) | Ids distintos: 20 en la web, 17 en la app, pocos coinciden. La web tiene ids como `'Pop 2'` y `'Reggae_twostep'`. |
| Ritmo por sección | no existe (planificado como referencia) | **copia** de 4 pistas en `Section.patterns` | Decisión D1. |
| Excepciones por sección | variaciones melódicas (`bassVariationId`…) | `SectionOverrides`: sonido, programa, kit, duración de nota, registro, silencio | La web no tiene dónde guardarlas. |
| Largo de patrón | `loopBars` por estilo y por variación | `patternBars` por pista y sección | Mismo concepto, distinto nivel. |
| Mezcla | `instrumentSettings[]`: volumen, mute, solo, sonido | `mixer`: volumen, mute, pan, reverb, EQ y compresión por canal | La web no tiene pan ni EQ por canal. |
| Swing | 0–1 (0 recto, 1 tresillo) | ratio 1–3 (1 recto, 2 shuffle) | Conversión: `ratio = p/(1-p)`, con `p = 0.5 + swing/6`. El 3 de la app no cabe en la web. |

### Lenguaje de los patrones (el punto más delicado)

- **Web:** la batería son arrays de velocidad por pieza. Piano y guitarra son arrays de
  velocidad que tocan **el acorde entero**, más `arpeggios` por celda. Encima, las
  variaciones melódicas (`bassScale.ts`) usan **grados de escala 1–8** resueltos con
  `SCALE_SEMITONES` según la calidad del acorde, más `chordHit` y `octaveOffsets`.
- **App:** cada paso es un int empaquetado (`packStep`, `constants.dart`) con **notas del
  acorde** (`*`, `R`, `3`, `5`, `7`, `9`, `8`), octava, segunda nota y acento. No tiene
  arpegios ni grados de escala 2, 4 y 6.

Son dos idiomas musicales distintos. Un "3" en la web es el tercer grado de la escala; en la
app es la tercera del acorde. Coinciden en tríadas mayores y menores y divergen en `sus4`,
`dim` con escalas, etc.

### Reglas de reproducción

Ejemplos que ya divergen hoy aunque el dato fuera idéntico:

- **Fill de frase:** la web usa frase de 8 compases si la canción tiene 8+, si no de 4
  (`audioEngine.ts:1898`); la app siempre 8 (`phraseBars`, `constants.dart`).
- **Fill de transición y crash** en el primer tiempo de la sección siguiente: solo la app.
- **Voicings:** la app tiene `Voicing` por pista (registro, número de notas, separación); la
  web calcula los suyos. Mismo acorde, otras notas.
- **Aleatoriedad:** arpegio `random` y samples alternados de hi-hat abierto
  (`audioEngine.ts:1433`) usan `Math.random()`. Sin semilla no hay nada que comparar.

### Sonidos

| | Web | App |
|---|---|---|
| Piano | 39 MP3 propios + osciladores | SoundFont `GeneralUser.sf2` (32 MB, programas GM 0/1/4/5) + síntesis C++ (Organ, Pad, Sine, FM) |
| Guitarra | MP3 propios (acoustic/electric/nylon) + soundfonts Base64 por nombre (`sf2-steel`…, 19 MB) | SF2 programas 24–29 + síntesis (Pluck, Saw, Overdrive syn…) |
| Bajo | MP3 (finger, muted, slap, modo) + osciladores | SF2 programas 32–36 + síntesis (Sub, Reese, Square) |
| Batería | 18 MP3, "kits" como tipo de sonido (`standard`, `analog`, `punch`, `lofi`) | 46 PCM + síntesis, **sonido por pieza**, 9 kits |
| Ids | strings (`'sampled'`, `'fender'`) | ints atados a enums de `native_audio.cpp` |

Ningún sonido de un lado existe en el otro con el mismo material de origen.

### Estilos del usuario

- Web: "Mis ritmos" y los retoques a estilos de fábrica viven en `localStorage`
  (`userSettings.ts:9`, "localStorage is the primary store"); Supabase `user_settings` solo se
  lee como migración. **Hoy no viajan entre dispositivos ni siquiera dentro de la web.**
- App: patrones guardados por instrumento, en el dispositivo (`saved_pattern.dart`).

---

## 3. Arquitectura propuesta

Cuatro piezas compartidas. Ninguna es código de interfaz.

```
shared/                          ← vive en chord-composer; la app lo copia con un script
├── schema/song-doc.schema.json  ← (A) el contrato de la canción
├── catalog/
│   ├── chords.json              ← (B) calidades: intervalos, escala, alias por cliente
│   ├── styles.json              ←     estilos de fábrica en el lenguaje de pasos común
│   ├── sounds.json              ←     ids de sonido, origen, archivos, nivel de referencia
│   └── kits.json                ←     kits de batería: sonido por pieza
├── spec/reproduccion.md         ← (C) reglas: voicings, fills, swing, crash, frases
└── fixtures/
    ├── songs/*.json             ←     canciones golden
    └── events/*.json            ←     notas que DEBE producir cada canción
```

**(D) El banco de sonidos** no va en git: se genera con un script y se publica en
`public/audio/bank/` (web) y dentro del APK o descargable (app).

### Por qué una carpeta en el repo web y no un tercer repositorio

Eres una sola persona con dos repos. Un repo `chord-core` con submódulos añade un tercer sitio
donde hacer commit y el clásico submódulo desactualizado. Una carpeta `shared/` aquí, más
`tool/sync_shared.dart` en la app que la copia desde la ruta hermana y escribe el hash del commit
de origen, es más simple. Un test de la app falla si el hash vendorizado no coincide con el que
declara `shared/VERSION`. Si algún día hay un segundo desarrollador, se promueve a paquete.

---

## 4. Decisiones clave (con recomendación)

### D1 — Ritmo por sección: referencia por defecto, copia solo al editar

El choque real entre los dos modelos: la web quiere referencias (el Rhythm Editor propaga, el
JSON es pequeño); la app copia patrones en la sección (puedes editar el groove de ese estribillo).
Las dos razones son buenas. Se quedan ambas:

```jsonc
"sections": [{
  "styleId": "reggaeton",               // opcional: si falta, el de la canción
  "trackStyles": { "bass": "ballad" },  // opcional: estilo por pista (fase 6 del plan web)
  "patterns": {                         // opcional: SOLO las pistas editadas a mano
    "drums": { "bars": 2, "lanes": { … } }
  },
  "overrides": { … }                    // el SectionOverrides de la app, tal cual
}]
```

Resolución de una pista: `patterns[pista] ?? estilo(trackStyles[pista] ?? styleId ?? canción)`.

- Elegir un estilo nunca copia nada. Editar una celda de la rejilla en esa sección **bifurca
  solo esa pista** (copia el patrón del estilo a `patterns` y la edita). La tarjeta muestra
  "editado"; "Volver al ritmo del estilo" borra la copia.
- La app ya compara pista por pista con el estilo en `setStyle`; el cambio es que deja de
  copiar al aplicar y solo copia al editar.
- Consecuencia buena: cambiar el estilo de la canción mueve todas las secciones que no se
  tocaron, sin el aviso de "estas secciones conservaron lo suyo" que la app necesita hoy.

### D2 — Un solo lenguaje de pasos, legible, sin ints empaquetados

```jsonc
// batería: velocidad por paso
"kick": [1, 0, 0, 0, 0.9, 0, 0, 0, …]
// melódico: null = silencio
"lane": [
  { "v": 0.85, "n": ["R"] },
  null,
  { "v": 0.7, "n": ["3", "5"], "acc": true },
  { "v": 0.6, "n": ["*"], "arp": { "type": "up", "speed": "fast" } },
  { "v": 0.8, "n": ["R-1"] }          // octava abajo
]
```

- **Vocabulario de notas (unión de los dos):** `*` acorde entero; `R 3 5 7 9 8` notas del
  acorde; `2 4 6` grados de la escala del acorde; sufijo `+1/-1` para la octava.
- **La resolución nota → semitono vive en `chords.json`**, no en código: para cada calidad,
  sus intervalos y su escala. Así el `3` de un `sus4` se resuelve igual en los dos, porque
  los dos leen la misma tabla.
- Los grados de la web se traducen: 1→`R`, 3→`3`, 5→`5`, 7→`7`, 8→`8`, 2/4/6→`2/4/6`.
- El `packStep` de la app sigue existiendo, pero **solo** como detalle del puente Dart → C++,
  nunca en disco ni en la nube (ya lo decía el plan del 8 sep).

### D3 — Sonidos: ids de texto; los de la web son los canónicos

- Ids de texto. **Los ids que la web ya guarda (`sampled`, `fender`, `sf2-steel`, `standard`…)
  se conservan tal cual**, porque están dentro de 273 progresiones y no se reescriben. Los
  sonidos nuevos llevan ids con espacio de nombres (`piano.rhodes-gu`, `drums.kick.ap1`…).
  `sounds.json` dice, para cada id, de dónde sale y qué archivos usa en cada cliente. Los ints
  de C++ se mapean en la app, en un solo sitio.
- **Cada sonido de la web mantiene exactamente sus archivos y su cadena de síntesis.** Nada se
  sustituye por "un equivalente". Los soundfonts Base64 de la guitarra se quedan mientras haya
  canciones que los usen.
- **La app aprende los sonidos de la web**: sus MP3 (piano, bajo, guitarras, batería) se
  convierten a PCM para la app, y los soundfonts Base64 se decodifican a muestras. Así una
  canción de la web abierta en el móvil suena con el mismo instrumento.
- **Los sonidos propios de la app llegan a la web como sonidos nuevos**, no como reemplazo: los
  programas de `GeneralUser.sf2` se renderizan a multisamples (una nota cada 3 semitonos, 3
  capas de velocidad) con **el mismo `tsf.h` que usa la app** compilado como CLI, y los 46 PCM
  de batería se codifican para la web. Aparecen en el selector con id nuevo; ninguna canción
  existente los usa hasta que alguien los elige.
- **Los sintetizados** (osciladores de la web; Pad, FM, Reese, Square de la app): los de la web
  se portan a la app **tal cual** (son pocas líneas de Web Audio: oscilador + ADSR), porque
  canciones existentes los usan. Los de la app pueden llegar a la web renderizados a muestras.
- **Prioridad por datos.** En la web no se quita ningún sonido que use una canción guardada o
  pública. El inventario de la fase 0 decide el **orden** en que la app los importa: primero
  los que más suenan.
- **Nivel:** la app calibra cada sonido importado para que suene al mismo nivel que en la web
  (LUFS de una nota media, medido en los dos). La web es la referencia y no se renormaliza.
  Sin esto, el mismo piano sonaría más alto en uno y el balance de la mezcla no se trasladaría.
- **Licencias:** GeneralUser GS permite redistribuir; los soundfonts de la web (probablemente
  los de `midi-js-soundfonts`, FluidR3/MusyngKite) hay que comprobarlos antes de meterlos en
  el APK.

### D4 — Motores: dos motores con una especificación, no un motor único (por ahora)

La opción tentadora es compilar el núcleo C++ de la app (`native_audio.cpp`, 2.391 líneas, con
`tsf.h`) a WebAssembly y usarlo en la web dentro de un AudioWorklet: paridad automática, gratis
para siempre, y es el mismo C++ que hará falta en iOS.

**Recomendación: no ahora.** El motor web tiene 2.600 líneas afinadas, un arnés de regresión
de 17 fixtures (`tests/audio/`), carga por prioridades y ajustes para móvil; tirarlo antes de
saber qué reglas debe cumplir el sustituto es rehacer dos veces. En su lugar:

1. Se escribe la especificación (`spec/reproduccion.md`) y los fixtures de eventos.
2. Los dos motores la cumplen, verificados por el test de paridad de la fase 3.
3. **Se reevalúa cuando llegue iOS**, que necesita portar el lado nativo de todos modos. Si
   para entonces el test de paridad sigue exigiendo arreglos en dos sitios cada vez que se
   añade una regla, esa es la señal para unificar en C++/WASM. Con la especificación y los
   fixtures ya hechos, esa migración tendría un criterio de "hecho" objetivo.

Lo que sí se unifica ya es lo que es **dato**: estilos, calidades de acorde, kits, sonidos. Eso
deja de estar escrito dos veces en la fase 2.

### D5 — Estilos del usuario a la nube

- Tabla `user_styles (id, user_id, data jsonb, updated_at)` con RLS por `user_id`. Sustituye a
  `localStorage` como fuente de "Mis ritmos" (`localStorage` queda como caché).
- **Los retoques a estilos de fábrica (`styleOverrides`) no se comparten con otros usuarios.**
  Hoy, si un usuario retoca `pop_1`, sus canciones suenan distinto solo para él; al compartir
  una canción, el otro oye el `pop_1` original. Se conserva esa semántica tal cual: los
  retoques se suben a la nube **con el mismo significado** ("para este usuario, `pop_1` es
  esto"), para que el dueño oiga lo mismo en el móvil que en la web. No se convierten en
  estilos nuevos ni se reescriben sus canciones.
- Que quien abre un enlace compartido oiga el retoque del dueño (copiando el estilo en el
  documento) sería un cambio de lo que hoy oyen los visitantes. Queda como decisión aparte,
  no incluida en este plan.
- Los patrones guardados de la app pasan a la misma nube como `user_patterns`
  (instrumento + pista), y la web los ofrece en el selector de la sección.

### D6 — Versionado y compatibilidad hacia delante

- `schemaVersion` mayor.menor en el documento. Un cliente que lee un **mayor** más nuevo abre
  la canción en solo lectura y pide actualizar; nunca la reescribe.
- Un **menor** más nuevo se abre y edita, y los campos que no entiende **se conservan
  intactos** al guardar. Hoy la app hace lo contrario a propósito ("Unknown tracks are dropped",
  `section_overrides.dart`); en un mundo sincronizado eso es borrar datos del otro cliente.
- Si una canción usa algo que este cliente conserva pero no sabe reproducir, lo dice ("Esta
  canción usa arpegios; esta versión los reproduce como acorde"). Mejor avisar que sonar distinto
  en silencio.
- **Regla de trabajo:** ninguna feature sale en un cliente sin que el formato la contemple y el
  otro, como mínimo, la conserve.

---

## 5. Fases

Cada fase deja las dos apps funcionando y es útil aunque la siguiente no llegue. Tamaños
relativos: S (días), M (1–2 semanas), L (3+ semanas).

### Fase 0 — Congelar el corpus real e inventario (M)

La red de seguridad de todo el plan, antes de cambiar una sola línea del motor.

- **Corpus:** script que descarga con la service-role key todas las `public_songs` y todas las
  `progressions` (incluidos los `user_settings` de sus dueños, porque un retoque de estilo cambia
  cómo suena su canción) a `tests/corpus/data/`, **en `.gitignore`**: son datos de usuarios y
  no entran en git.
- `npm run test:corpus`: renderiza cada canción **por la misma ruta que su página** (las
  públicas a través de `buildPlayback` de `SongChordPlayer`, las progresiones como las carga
  `Index.tsx`, con estilo, sonidos, volúmenes, variaciones y retoques del dueño) y compara su
  huella con la línea base. Reutiliza `tests/audio/run-golden.mjs`; lo nuevo es la fuente de
  los fixtures. Aprox. 350 renders: se corre a mano antes de cada merge, no en cada build.
- Cuando exista el volcado de eventos (fase 3), el corpus también se compara nota a nota, que
  es más rápido y dice exactamente qué cambió.
- **Inventario:** uso real de cada `styleId`, `soundTypeId`, calidad de acorde, variación y
  arpegio. Incluye los ids que hoy no existen y caen al valor por defecto (11 canciones públicas
  con `pop_basic` → `pop_1`): esos fallbacks pasan a ser **alias explícitos** en el catálogo,
  para que sigan sonando igual.
- Tabla de equivalencias de estilos web ↔ app. Cuando chocan, gana el de la web (regla 0); el
  de la app, si suena distinto y vale la pena, entra con otro id.

**Salida:** línea base del corpus, `shared/catalog/` en borrador, lista de alias. **No cambia
nada audible.**

### Fase 1 — Contrato de datos (M)

- `shared/schema/song-doc.schema.json` (SongDoc v5) con todo lo de la sección 4. `ajv` ya está
  en las dependencias de la web.
- 10–12 fixtures de canciones: vacía, 4/4 simple, medios tiempos, slash chords con bemoles,
  vals 3/4, 6/8, sección con estilo propio, sección con pista editada, overrides de sonido y
  silencio, variaciones melódicas, calidad rara (`7#9`), campo desconocido.
- **Web:** `migrateLegacySong` → v5 (con migración perezosa al leer; las 273 canciones no se
  reescriben en bloque) y codificador v5. Test: fixture → cargar → guardar → idéntico.
- **App:** `ProjectCodec` v5 que lee y escribe SongDoc; `ProjectState` sigue siendo el modelo
  interno. Raíz + accidental separados, las 39 calidades se conservan aunque el selector ofrezca
  15, preservación de desconocidos. Mismo test de round-trip con los mismos fixtures.
- Importar/exportar JSON en los dos (compartir en la app, pegar en la web): permite probar la
  ida y vuelta real **sin la nube**.

**Verificación:** round-trip idéntico en los dos repos; `npm run test:audio` sin `--update`.

### Fase 2 — Catálogo compartido (M)

- Script que convierte `styles.ts` al lenguaje de pasos común → `styles.json`. Los estilos de
  la app que no existen en la web se añaden en ese formato.
- Web: `styles.ts` pasa a cargar `styles.json` (tipos y funciones se quedan). La conversión
  tiene que ser **sin pérdida**: `npm run test:audio` y `npm run test:corpus` sin regenerar
  ninguna línea base lo demuestran.
- App: `tool/gen_catalog.dart` genera `style_presets.g.dart`, `chord_types.g.dart` y los kits
  desde `shared/`. El intérprete de pasos aprende `2 4 6` y lee intervalos de `chords.json`.
- Aquí la app **sí cambia de sonido** en los estilos que se fusionan con los de la web. Con
  ~0 instalaciones es el momento barato para hacerlo.

**Verificación:** añadir un estilo nuevo es editar un JSON y correr dos scripts; ningún estilo
queda escrito a mano en dos sitios.

### Fase 3 — Especificación de reproducción y test de paridad (L)

El corazón del plan. Sin esto, "suena igual" es una opinión.

- `shared/spec/reproduccion.md`: cómo un paso se convierte en notas. Voicing por pista
  (registro, número de notas, inversión más cercana), notas del acorde y de la escala, arpegios
  (velocidades en subdivisiones), swing (una fórmula, un rango), fills de frase (¿4 u 8?),
  fill de transición, crash, secciones infinitas, bajo de slash chords, transposición y
  semilla de lo aleatorio. Cada regla con un ejemplo.
- **Volcado de eventos** en los dos motores: lista de `{t (en ticks), pista, nota MIDI,
  velocidad, duración, sonido}`.
  - Web: desde la ruta de `renderProgressionOffline`, que ya es determinista y la usa el arnés.
  - App: desde la misma lógica que `midi_export.dart`, que ya comparte la resolución de
    overrides con el motor. Si el motor C++ decide algo que el exportador no ve, se añade un
    volcado nativo.
- `shared/fixtures/events/*.json`: la salida esperada. Un test en cada repo compara su volcado
  con el esperado y **dice qué nota difiere y en qué compás**.
- **La especificación se escribe describiendo lo que hace hoy la web**, incluidas sus
  rarezas (frase de 4 u 8 según la longitud, fills en el compás 4/8). Los eventos esperados se
  generan con el motor web actual. Las divergencias se arreglan **en la app**. El fill de
  transición y el crash de la app entran en la especificación como comportamiento opcional,
  activado por un campo de la sección, no por defecto.
- Lo aleatorio usa un PRNG con semilla, igual en los dos. En la web se cambia solo en el
  volcado de eventos y en el arnés (que ya lo siembra); en la reproducción en vivo sigue como
  hoy, porque cambiarlo alteraría cómo suena el hi-hat abierto.

**Verificación:** todos los fixtures de eventos pasan en los dos repos, y el corpus de la web
sigue idéntico.

### Fase 4 — Banco de sonidos común (L)

- **App primero:** importa los sonidos de la web (MP3 y soundfonts decodificados a PCM, los
  osciladores portados) con sus mismos ids. Es lo que hace que una canción de la web suene
  igual en el móvil.
- **Web después, solo sumando:** CLI de render sobre `tsf.h` + `GeneralUser.sf2`, y las
  baterías de la app codificadas. Entran en `sounds.json` como ids nuevos; el cargador de la
  web los lee de ahí. Los sonidos existentes no se tocan ni se mueven de ruta.
- Batería por pieza en la web (el modelo de la app) como **capa opcional**: los kits actuales
  (`standard`, `analog`, `punch`, `lofi`) siguen existiendo y sonando igual; una canción puede,
  además, cambiar el sonido de una pieza concreta.
- Nivel de referencia (LUFS) solo para los sonidos nuevos, calibrado contra los de la web.
  Los existentes no se renormalizan: cambiaría el balance de canciones ya mezcladas.

**Verificación:** eventos y sonoridad de cada fixture en los dos clientes (diferencia ≤ 1 dB
por pista), escucha A/B de 5 canciones públicas web vs. móvil, y el corpus web idéntico.

### Fase 5 — La web aprende lo que solo tiene la app (M–L)

Por orden de valor. Las fases 0–2 de `docs/ritmo-por-seccion.md` caen aquí sin cambios:

1. Estilo por sección y pistas silenciadas (ya planificado).
2. Editar el groove de una sección (bifurcación de D1) con la rejilla del Rhythm Editor.
3. Sonido y kit por sección (`overrides`), registro y duración de nota por pista.
4. `patternBars` por pista.
5. Tonalidad de la canción y `origin` de los acordes (la web ya calcula tonalidades en
   `keyDetect.ts`).
6. Mezclador: pan, EQ y compresión por canal (`StereoPannerNode`, `BiquadFilterNode`,
   `DynamicsCompressorNode`; baratos en Web Audio). Reverb: parámetros comunes, sonido
   aproximado. Con los valores por defecto (pan 0, EQ plana, sin compresión) los nodos no se
   crean, para que el corpus siga idéntico.

Todo esto llega **a la vez al editor y a las canciones públicas**, porque las dos usan el
mismo motor. Ver la sección siguiente.

### Canciones públicas: editar por sección cómo suena cada cosa

Las canciones de `/songs/<slug>/` son hoy el uso más visible del motor y las que peor
expresan una canción real: un estilo y unos sonidos para toda la canción. Hoy `SongSection`
(`src/data/songs.ts:16`) es `{ name, lines, repeatCount, audioRange }`.

- **Modelo:** `SongSection` gana los mismos campos opcionales que la sección del editor:
  `styleId`, `trackStyles`, `patterns` (pistas editadas), `overrides` (sonido, kit, silencio,
  registro, duración de nota). Y la canción, lo mismo que la canción del editor (sonidos,
  volúmenes, pan…). **Un solo tipo de sección para los dos**, para que una canción pública
  abierta en el editor ("abrir en el editor", `editorLink.ts`) o en la app no pierda nada.
- **Creador de canciones** (`SongCreator/ChordStep.tsx`): en cada sección, el mismo menú
  "Opciones de sección" que el editor (ritmo, pistas que suenan, sonido por instrumento, kit,
  y "editar el groove de esta sección"). Mismo componente, no una copia.
- **Reproductor** (`SongChordPlayer`): `buildPlayback` pasa los campos nuevos a la `Section` y
  el resolver hace el resto. El export WAV/MIDI de la página los respeta.
- **Las 76 canciones actuales no se tocan**: sin campos nuevos suenan como hoy (lo comprueba
  el corpus). Se mejoran una a una, a mano, cuando tú decidas, empezando por las que más se
  reproducen.
- `pop_basic` (11 canciones) y `rock_basic` (41) siguen resolviendo igual gracias a los alias
  de la fase 0. Corregirlas es una decisión editorial aparte.
- Lo que no hay que olvidar: estas páginas son SEO. El HTML y el JSON-LD no dependen de los
  campos de sonido, así que no cambian; solo cambia lo que se oye al darle a reproducir.

### Fase 6 — La app aprende lo que solo tiene la web (M)

1. Selector con las 39 calidades (el motor ya las sonará desde la fase 2).
2. Arpegios en el motor C++.
3. Variaciones melódicas como presets por instrumento del estilo.
4. Bemoles en el selector de raíz.

### Fase 7 — La nube (L)

Retoma las fases 2–3 del plan del 8 sep, que siguen siendo correctas:

- **Antes de la primera escritura desde el móvil:** migración de RLS de `progressions`
  (`UPDATE`/`DELETE` con `user_id = auth.uid()`; hoy no están versionadas, lo avisa
  `20260727_share_progressions.sql`) y tabla `user_styles`.
- `supabase_flutter`, login con email y Google, abrir canciones de la nube en solo lectura
  primero.
- Sincronización: lo local manda sin conexión; subida con guarda por `updated_at`; ante
  conflicto, elegir versión o duplicar. Sin edición colaborativa en tiempo real (fuera de
  alcance).
- Enlaces `/chord-player/<id>` abiertos en la app (conecta con el plan web → app, que dejó
  los deep links para cuando hubiera instalaciones).

**Orden obligatorio:** las fases 1–3 van antes que cualquier escritura desde la app. Un
autosave de un códec con pérdidas borra en silencio datos de la web, y con sincronización lo
hace en todos los dispositivos del usuario a la vez.

---

## 6. Riesgos

1. **Borrado silencioso al sincronizar.** Se cierra con preservación de desconocidos (D6) y
   el round-trip de la fase 1. No negociable.
2. **La fase 3 destapa más divergencias de las previstas.** Es probable: son dos motores
   escritos por separado. Presupuestarla como la fase más larga y no empezar la 7 hasta que
   pase.
3. **Cambiar sin querer cómo suena una canción existente** (regla 0). Se cierra con el corpus
   de la fase 0, que cubre las 76 públicas y todas las progresiones guardadas. Punto débil: el
   corpus solo cubre la ruta offline; la reproducción en vivo (scheduler, cambios durante la
   reproducción) se prueba a mano en móvil con 5 canciones públicas tras cada fase.
4. **Peso de la web.** El banco nuevo tiene que cargar por prioridades como hoy (batería
   bloqueante, el resto en segundo plano o bajo demanda) o empeora la carga en móvil.
5. **Deriva del catálogo** si alguien edita `style_presets.dart` a mano. El archivo generado
   lleva cabecera "no editar" y el test del hash lo detecta.
6. **Retoques de estilo por usuario (D5).** Es el cambio de semántica más fácil de romper; hay
   que migrar los `styleOverrides` existentes a estilos propios sin cambiar cómo suenan esas
   canciones para su dueño.
7. **Coste frente a uso.** La app tiene muy pocas instalaciones. Por eso las fases 0–3 están
   elegidas para valer por sí solas (un catálogo en vez de dos, bugs de motor encontrados, menos
   peso en la web) aunque la sincronización se retrase.

---

## 7. Decisiones pendientes para ti

1. **D1** (referencia por defecto + copia al editar): ¿de acuerdo? Cambia cómo la app guarda
   sus secciones.
2. **D4:** ¿confirmas "dos motores + especificación" y reevaluar el motor C++/WASM cuando
   empiece iOS?
3. **Visitantes de un enlace compartido** (D5): ¿deben oír los retoques de estilo del dueño?
   Hoy no los oyen; cambiarlo cambia lo que oyen.
4. **Por dónde empezar:** la fase 0 (congelar el corpus) no toca nada audible y es requisito
   de todo lo demás; recomendada como siguiente paso.

Ya decidido (18 sep): la web es la referencia sonora. Cuando un estilo o un sonido choca, gana
el de la web; la app se adapta. Las canciones existentes, públicas y de usuarios, suenan igual
después de cada fase.

---

## Estado de la implementación (18 sep 2026)

Decisiones tomadas al implementar: la web es la referencia (regla 0); D1 como se propuso
(referencia por defecto, copia solo de la pista editada); D4 dos motores + especificación.
Cambio respecto a D2: **el lenguaje común de ritmos es el de la web** (filas de velocidad,
variaciones por grado de escala, arpegios), no un tercer formato; la app lo traduce a sus pasos.
Lo exclusivo de la app viaja bajo `app` (canción y sección).

### Web (chord-composer)

| Qué | Dónde |
|---|---|
| Corpus real congelado (grafo de audio, exacto, ~0,1 s por canción) | `tests/corpus/`, `npm run corpus:fetch`, `corpus:update`, `test:corpus` |
| Inventario de uso | `npm run corpus:inventory` |
| Arreglo por sección: estilo, estilo por pista, groove editado, pistas silenciadas, sonido | `src/lib/sections.ts`, `src/lib/sectionPlayback.ts`, motor en vivo y offline en `audioEngine.ts`, `PlaybackContext.tsx` |
| Menú "Opciones de sección" (editor y creador de canciones públicas) | `src/components/SectionArrangementMenu.tsx`, `SectionCard.tsx`, `SongCreator/ChordStep.tsx` |
| "Editar el ritmo de esta sección" (Rhythm Editor en modo sección) | `Index.tsx`, `RhythmEditor.tsx` (`onSaveSection`) |
| Canciones públicas con arreglo por sección (reproductor, export, enlace al editor) | `src/data/songs.ts`, `SongChordPlayer.tsx`, `editorLink.ts` |
| Documento v5 + campos desconocidos conservados al guardar + solo lectura si es más nuevo | `src/lib/songs.ts`, `Index.tsx` |
| "Mis ritmos" y retoques sincronizados con Supabase al iniciar sesión | `src/lib/userSettings.ts`, `customStyles.ts` |
| Migración RLS + `user_settings` (**sin aplicar**) | `supabase/migrations/20260918_shared_songs_app.sql` |
| Catálogo compartido, esquema, canciones de referencia, reglas | `shared/` (`npm run shared:export`, `npm run test:shared`) |
| Kit de batería web exportado para la app | `scripts/export-drums-for-app.mjs` |

### App (chord_sequencer)

| Qué | Dónde |
|---|---|
| Catálogo de la web embebido y comprobado por hash | `tool/sync_shared.dart`, `lib/core/shared/` |
| Estilos de la web como presets (ganan a los de la app; alias para los ids viejos) | `web_catalog.dart`, `style_presets.dart` |
| 39 calidades de acorde y grados de escala 1–8 (Dart, C++, MIDI) | `constants.dart`, `chord_theory.dart`, `native_audio.cpp`, `midi_export.dart` |
| Kit "Web" (las mismas grabaciones, con el equilibrio de la web) | `tool/drums/`, `assets/drums/web_*.pcm` |
| Códec del documento compartido, ida y vuelta sin pérdidas | `lib/core/data/song_doc.dart`, `test/shared_song_doc_test.dart` |
| Nube: sesión con la cuenta de la web, abrir, guardar con aviso de conflicto | `lib/core/cloud/`, `lib/features/cloud/cloud_screen.dart` (botón de nube en "Mis canciones") |

### Pendiente

1. **Aplicar la migración** `20260918_shared_songs_app.sql` y revisar las políticas con la
   consulta del final del archivo. Hasta entonces la app no debería escribir en la nube.
2. **Congelar el corpus antes de desplegar la web** (`npm run corpus:update` sobre el código
   de `main` anterior a estos cambios) y después `npm run test:corpus` con los cambios: debe
   dar 0 cambios.
3. **Fase 3, diferencias de motor en la app**: fills, arpegios, duraciones, bajo con barra
   (lista exacta en `shared/spec/reproduccion.md`, sección 6).
4. **Fase 4, sonidos melódicos**: piano, bajo y guitarra de la web dentro de la app (hoy usa
   programas del SoundFont equivalentes). La batería ya está.
5. En la app: subida automática al guardar (hoy es un botón en la pantalla Nube), enlaces
   `/chord-player/<id>` que abran la app, y confirmación de email por deep link.
