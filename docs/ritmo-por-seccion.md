# Ritmo por sección — plan

Estado: **sin implementar** (plan escrito el 14 sep 2026). Cuándo se hace está por decidir.

Idea: que cada sección de una canción pueda sonar distinta (estrofa en balada, coro en
reggaetón, intro sin batería), tanto en el editor (`/chord-player/`) como en las canciones
públicas (`/songs/<slug>/`) y en su creador.

Regla que gobierna todo el plan, igual que en `docs/audio-engine-refactor.md`: **cada fase
deja la app funcionando y verificable**, y una canción sin nada por sección suena
exactamente igual que hoy (lo comprueba `npm run test:audio` sin regenerar la línea base).

---

## Por qué: datos de Supabase (consultados el 14 sep 2026)

`progressions` (editor), sin contar la cuenta del dueño: 273 canciones de 168 usuarios.

| Secciones con acordes | Canciones |
|---|---|
| 1 | 156 (57 %) |
| 2 | 30 |
| 3 | 18 |
| 4 | 21 |
| 5+ | 48 |

- 117 canciones (43 %) tienen 2+ secciones; 82 de 168 usuarios (49 %) tienen al menos una.
- Ninguna es copia de una canción pública (0 coincidencias de título): las arman ellos.
- **20 canciones ya ponen una variación melódica distinta en cada sección**, que es lo
  más cercano a "otro ritmo por sección" que existe hoy. Y el selector de variaciones solo
  aparece en estilos con 2+ variaciones, así que la mayoría ni lo ve.

`public_songs`: 75 de 76 tienen 2+ secciones (56 tienen 5+). Nombres más comunes: verse
(157), chorus (141), bridge (75), intro (38), instrumental (24).

Lo que los datos **no** dicen: que la gente quiera otro ritmo. Dicen que construye canciones
por partes y que algunos ya intentan diferenciarlas con lo único que tienen.

---

## Cómo está hoy la web (lo que condiciona el diseño)

1. **El estilo es uno por canción.** `Song.styleId` en el editor, `song.style` en las
   públicas. Se resuelve en `resolveActiveStyle` (`src/lib/styles.ts:1422`), que usan tanto
   `Index.tsx:282` como `PlaybackContext.resolveCurrentStyle` (`PlaybackContext.tsx:198`).

2. **El motor en vivo ya pide el estilo por tramo**: `audioEngine.ts:2081` llama a
   `getStyle()` una vez por acorde, y en ese punto ya conoce el `sectionId` (línea 2078).
   `getBassScale(sectionId)` y compañía son el precedente exacto de lo que hace falta.

3. **Pero hay seis sitios que asumen un solo estilo para toda la canción:**
   - `phraseLength` se calcula con el estilo inicial (`audioEngine.ts:1898`, `2036`).
   - Volúmenes del mezclador: `style.volumes` en `audioEngine.ts:182-186`, aplicados al
     arrancar y desde `updatePlaybackOptions` (`PlaybackContext.tsx:632`).
   - Variaciones melódicas: los getters (`PlaybackContext.tsx:503-523`) leen
     `optionsRef.current.melodic`, que es el `melodic` del estilo de la canción
     (`Index.tsx:368`, `SongChordPlayer.tsx:611`, `661`).
   - Precarga de notas: `collectMidiNotes` recibe un solo estilo (`PlaybackContext.tsx:412`,
     `433`; `audioEngine.ts:2418`). Si otra sección usa un bajo distinto, sus notas no se
     precargan y en sesión fría las primeras suenan tarde o sintetizadas.
   - Export WAV: `renderProgressionOffline(sections, bpm, instruments, style)` usa un estilo
     para `slotsPerBar` (2438), la caché de patrones (2447), el swing (2495), los buses
     (2471-2477), el `audible` (2465) y las variaciones (2480).
   - Sonidos de instrumento: `useStyleInstruments` reescribe sonidos y volúmenes cuando
     cambia el estilo.

4. **Qué son hoy las "variaciones".** `style.melodic.{bass,piano,guitar}.variations[]`
   (`src/lib/bassScale.ts:24-42`): patrones por grado de escala que **pertenecen a un
   estilo**. `SectionCard.tsx:159-166` muestra el selector solo si hay 2+. **La batería no
   tiene variaciones**: solo `rhythm` y `fill` (`styles.ts:59-101`).

5. **Las canciones públicas no llevan nada por sección.** `SongSection` (`src/data/songs.ts:16`)
   es `{ name, lines, repeatCount, audioRange }`: ni estilo ni variaciones. `buildPlayback`
   (`SongChordPlayer.tsx:362`) crea secciones sin ids de variación.

6. **El enlace "abrir en el editor" pierde la estructura extra.** `EditorLinkSection`
   (`src/lib/editorLink.ts:18`) solo lleva `{ name, repeatCount, chords }`.

---

## Cómo lo resolvió la app Flutter (`C:\Users\Eliascorsino\Projects\chord_sequencer`)

La app ya pasó por esto. Lo relevante:

1. **Cada sección es dueña de sus patrones** (`lib/core/models/section.dart`:
   `Map<String, PatternMatrix> patterns`, uno por pista). El comentario lo justifica igual
   que los datos de arriba: con un solo patrón, "una estrofa y un coro solo podían
   diferenciarse en la armonía, nunca en el groove".
2. **Los presets son por instrumento y generales, no de cada estilo.**
   `lib/core/data/pattern_library.dart`: `drumPatterns`, `pianoPatterns`, `guitarPatterns`,
   `bassPatterns`. Aplicar uno **copia** las celdas en la pista de la sección que editas
   (`applyPatternMatrix`, `project_provider.dart:1096`); no queda referencia.
3. **Patrones guardados propios**, por instrumento y del dispositivo, no del proyecto
   (`saved_pattern.dart`: "un groove que resolviste una vez vale también para la siguiente
   canción"). Salen primero en la tira del selector.
4. **Excepciones dispersas por sección** (`section_overrides.dart`): sonido por pista, kit
   de batería, duración de nota, registro y **silenciar una pista en esa sección**. Clave
   ausente = "lo que diga la canción". La tarjeta muestra un chip cuando la sección difiere.
5. **El compás es de la canción, no de la sección** (`project_provider.dart:114-118`):
   "pretender soportarlo mientras el transporte cuenta un solo compás sería peor que no
   ofrecerlo".
6. **Elegir un estilo de canción ya no pisa lo que cambiaste por sección** (`setStyle`).
   Hasta el 14 sep 2026 copiaba sus patrones en *todas* las secciones y borraba los
   grooves distintos. Ahora compara pista por pista: solo reemplaza lo que seguía al estilo
   anterior, avisa qué secciones conservaron lo suyo y ofrece "Aplicar a todas". Un cambio
   de compás sí lo reemplaza todo. Sigue trayendo BPM, compás, swing, kit y timbres.
7. **"Aplicar un estilo" a una sola sección** (`applyStyleToSection`, desde la hoja de
   opciones): copia las 4 pistas y el fill. El kit y los timbres entran como excepción de
   esa sección solo donde difieren de la canción. Solo estilos del mismo compás.
8. **Fills de transición** (`Section.fill`, copiados de los estilos equivalentes de la
   web): suenan en el último compás de la última repetición, antes de la sección siguiente,
   y nunca en una sección en bucle. Toms y crash son carriles propios del fill. Salen igual
   en el WAV y en el MIDI.
9. **Las acciones de sección van en una hoja con etiquetas** (`section_options.dart`), no
   como iconos en la cabecera: con cinco iconos y un título, en un móvil estrecho la sección
   se leía "Estribi…".

### Qué se adopta y qué no

- **Se adopta el alcance "por instrumento"**, pero con **referencias en vez de copias**. La
  web resuelve estilos por id (reales, overrides y "Mis ritmos" en `user_settings`); copiar
  14 pistas por sección inflaría `progressions.data` y rompería que editar un ritmo en el
  Rhythm Editor se oiga en todas las canciones que lo usan. Una sección puede decir "la
  batería de Reggaetón y el bajo de Balada" apuntando a estilos existentes (fase 6).
- **Se adopta silenciar una pista por sección.** Es lo más barato y lo más usado en un
  arreglo real (intro sin batería, puente sin bajo). Pasa a fase 2.
- **Se adopta la hoja/menú de opciones de sección** para la UI en móvil, con un chip que
  avisa cuando la sección difiere de la canción.
- **Se adopta el compás por canción** (ya era la regla 3).
- **No se adopta que cambiar el estilo de la canción pise las secciones.** Con referencias
  no hace falta: las secciones que heredan cambian y las que tienen ritmo propio lo
  conservan. Sí se ofrece un "Aplicar a todas las secciones" explícito.
- **No se adopta (todavía) el sonido por sección.** La app lo tiene y su argumento vale
  (guitarra limpia en la estrofa, distorsionada en el coro), pero en la web los sonidos van
  atados a `useStyleInstruments` y a la precarga de muestras. Queda como candidato
  (fase 7).
- **No se crea una biblioteca de patrones aparte.** La referencia por instrumento de la fase
  6 ya permite usar como "preset" la pista de cualquier estilo, incluidos "Mis ritmos". Si
  eso se queda corto, entonces se diseña la biblioteca.

---

## Modelo

Todo es opcional en la `Section`; lo ausente hereda de la canción.

```ts
interface Section {
  // …lo de hoy…
  styleId?: string;                          // A. ritmo completo de la sección
  instrumentStyleIds?: Partial<Record<'drums' | 'bass' | 'piano' | 'guitar', string>>; // A por instrumento (fase 6)
  silenced?: Partial<Record<'drums' | 'bass' | 'piano' | 'guitar', boolean>>;         // fase 2
  bassVariationId?: string;                  // B. ya existen
  pianoVariationId?: string;
  guitarVariationId?: string;
}
```

Estilo efectivo de un instrumento en una sección:
`instrumentStyleIds[inst] ?? section.styleId ?? estilo de la canción`, filtrado por la
regla 3.

Las variaciones (nivel B) siguen siendo "presets de cada ritmo": pertenecen al estilo
efectivo de ese instrumento. Variaciones de batería: fase 5, decisión aparte.

---

## Reglas de diseño

1. **Todo campo por sección es opcional; ausente = hereda.** Nada existente cambia, ni en
   datos ni en sonido.
2. **El ritmo de una sección no trae sonidos ni volúmenes.** Aporta patrón, arpegios, fill,
   swing y variaciones melódicas; los sonidos y el mezclador siguen siendo de la canción.
   Así no hay saltos de timbre ni de volumen, y `useStyleInstruments` y los buses no se
   tocan. (El sonido por sección, si llega, será una excepción explícita, como en la app:
   fase 7.)
3. **Un solo compás por canción.** Solo se admiten estilos con el mismo `getSlotsPerBar`. El
   selector filtra. Si luego se cambia el estilo de la canción a otro compás, las referencias
   incompatibles se ignoran al resolver y la UI lo marca. Se resuelve al leer; no se mutan
   los datos guardados.
4. **Las variaciones siguen al estilo efectivo del instrumento.** Al cambiar el ritmo de una
   sección se borran sus `*VariationId` afectados. Si quedara uno huérfano,
   `resolveVariation` ya cae a la primera variación.
5. **"Mis ritmos" solo en el editor.** El creador de canciones públicas ya usa
   `showCustom={false}` (`StyleSelector.tsx:18`). Un enlace compartido con un ritmo privado
   de otro usuario cae a `pop_1`, igual que hoy con el estilo de la canción.
6. **Cambiar el estilo de la canción nunca pisa un ritmo propio de sección** (la lección de
   `setStyle` en la app). "Aplicar a todas las secciones" existe, pero como acción
   explícita.

---

## Fase 0 — Resolver único (código puro)

- `resolveSectionStyle(section, songStyle, customStyles, overrideGetter)` en `styles.ts`,
  junto a `resolveActiveStyle`. Aplica las reglas 1 y 3. La fase 6 lo amplía por
  instrumento sin cambiar a quien lo llama.
- **Edición en vivo con el Rhythm Editor.** Hoy `liveEditedStyle` sustituye al estilo sin
  mirar el id. Nueva semántica: se aplica a toda referencia cuyo estilo tenga ese id. Si
  ninguna lo usa (ritmo nuevo desde plantilla), sustituye al de la canción, que es el
  comportamiento actual.
- Fixtures nuevos en `tests/audio/fixtures.mjs`: `section-style-switch` (4/4 reggaetón →
  pop_1 con variación melódica) y `section-style-incompatible` (sección 6/8 en canción 4/4,
  debe sonar como la canción).

**Verificación:** los 17 fixtures actuales pasan sin `--update`.

## Fase 1 — Motor (en vivo y export)

- `PlaybackOptions.getStyle` pasa a `(sectionId?: string) => StylePattern`
  (`audioEngine.ts:1751`); la llamada de la línea 2081 le pasa el `sectionId`.
  `resolveCurrentStyle` busca la sección en `optionsRef.current.sections ?? sectionsRef.current`,
  igual que ya hacen los getters de variaciones.
- Getters de variaciones (`PlaybackContext.tsx:503-523`): usar el `melodic` del estilo
  efectivo. `options.melodic` se queda para lo que hereda (conserva la edición en vivo).
- `phraseLength` y mezclador: **sin cambios**, por las reglas 2 y 3.
- `renderProgressionOffline`: parámetro opcional `getSectionStyle?: (s: Section) => StylePattern`,
  para que `progressionExport.ts:53` (acordes planos) no cambie. Dentro del bucle
  `sections.forEach` (2479): estilo por sección para swing, variaciones y patrón. La clave
  de la caché de patrones pasa a ser `${style.id}:${barNum}`.
- `collectMidiNotes` (`engine/preloadPlan.ts:52`): aceptar el mismo resolver para precargar
  las notas de todos los estilos que suenan.

**Verificación:** `npm run test:audio` (17 sin cambios + 2 nuevos). A mano en dispositivo,
porque el arnés no cubre el tiempo real: cambiar el ritmo de una sección durante la
reproducción tiene que notarse en el siguiente acorde, sin reiniciar.

## Fase 2 — Editor: ritmo de sección y pistas silenciadas

- `Section` (`src/lib/sections.ts:9`): `styleId?` y `silenced?`.
- **Motor para `silenced`:** en vivo, el `audible` de cada instrumento ya se calcula por
  tramo (se guarda en `active`, `audioEngine.ts:2205`); basta con añadir `&& !silenced[inst]`.
  Offline, `audible` (2465) pasa a calcularse dentro del bucle de secciones. No toca los
  buses del mezclador, así que no interfiere con mute/solo. Fixture nuevo:
  `section-silenced-drums`.
- **UI, siguiendo la app:** un menú "Opciones de sección" con etiquetas en vez de más iconos
  en la cabecera de `SectionCard`, que en móvil ya va justa (reordenar, nombre, variaciones,
  loop). Dentro:
  - **Ritmo**: `StyleSelector` con una prop nueva `filter?: (s: StylePattern) => boolean` y
    la opción "Usar el de la canción".
  - **Pistas que suenan**: cuatro interruptores (batería, bajo, piano, guitarra).
  - En la cabecera solo queda un chip cuando la sección difiere de la canción ("Reggaetón",
    "sin batería"), como el `differs()` de la app.
- Los `variationPickers` (`SectionCard.tsx:159-166`) deben usar el estilo efectivo de la
  sección, no la prop `style` de la canción. `Index.tsx` pasa el estilo ya resuelto.
- `Index.tsx`: `handleSectionStyleChange` y `handleSectionSilenceChange`, calcados de
  `handleSectionVariationChange` (1197). El primero borra las variaciones de esa sección.
  Ambos empujan `sections` al scheduler.
- Junto al selector de estilo de la canción: "Aplicar a todas las secciones" (regla 6),
  visible solo si alguna sección tiene ritmo propio.
- "Editar este ritmo" desde el menú abre `RhythmEditor` con ese estilo (hoy siempre abre el
  de la canción, línea 1449).
- Export WAV (`Index.tsx:1060`): pasar el resolver. El MIDI no lee el estilo.
- Persistencia: `progressions.data` es JSON y `forkDraft` guarda `sections` enteras, así que
  **no hace falta migración**. Duplicar sección copia los campos nuevos.
- Analytics en `src/lib/analytics.ts`: `sectionStyleChanged` (`style_id`, `inherit`) y
  `sectionTrackSilenced` (`instrument`, `silenced`).

## Fase 3 — Canciones públicas

- `SongSection` (`src/data/songs.ts:16`): `styleId?` y `silenced?`. `public_songs.sections`
  ya guarda `audioRange` dentro sin migración (ver `20260723_song_audio_track.sql`), así que
  esto tampoco la necesita. Confirmar el tipo de columna antes.
- Creador (`SongCreator/ChordStep.tsx`): el mismo menú de opciones en la tarjeta de sección,
  junto al `×N` de repeticiones (~1021), con `showCustom={false}` y el filtro de compás.
  Duplicar (línea 94) y pegar sección (178) copian los campos.
- `SongChordPlayer`: `buildPlayback` recibe `styleId`/`silenced` y los pone en la `Section`
  (líneas 362, 375, 649). El resolver de la fase 1 hace el resto.
- `editorLink.ts`: `EditorLinkSection` gana `st?: string` y `sl?: string[]` (claves cortas,
  como `c`/`d`), en `songToEditorSections` (60), `editorSectionsData` de `SongChordPlayer`
  (349) y `editorSectionsToSections` (101), validando cada id con `resolveStyleId`.

## Fase 4 — Transición (opcional; decidir escuchando)

Fill obligatorio en el último compás antes de una sección cuyo estilo de batería cambia,
con el fill del estilo saliente. `generateBarPattern` ya admite `forceFill`
(`audioEngine.ts:2192`). Solo cuando el ritmo cambia, no en cada sección.

## Fase 5 — Variaciones de batería (nivel B; decisión aparte)

`StylePattern.drumVariations?: { id, name, rhythm: Partial<…pistas de batería…>, fill? }[]`
+ `Section.drumsVariationId`. `generateBarPattern` superpone la variación sobre `rhythm`.
Pestaña en el Rhythm Editor. Obliga a escribir contenido para cada estilo, por eso va
después de la fase 6, que reutiliza lo que ya existe.

## Fase 6 — Ritmo por instrumento

`Section.instrumentStyleIds`: "batería de Reggaetón, bajo de Balada". Es el equivalente de
la tira de presets por instrumento de la app, pero apuntando a estilos existentes.

- Función pura `composeSectionStyle(drums, bass, piano, guitar): StylePattern`, cacheada
  por combinación de ids. Toma de cada estilo su parte: `rhythm.kick…crash` y `fill` de la
  batería; `rhythm.bass` y `melodic.bass` del bajo; `rhythm.piano`, `arpeggios.piano` y
  `melodic.piano` del piano; y lo mismo para la guitarra.
- **Swing:** el del estilo de batería. El groove lo marca el batería y el resto le sigue,
  igual que en una banda.
- **`loopBars` distintos:** `generateBarPattern` espera arrays de `slotsPerBar * loopBars`.
  El compuesto repite cada pista hasta el mayor `loopBars` de los cuatro (máximo 4, igual
  que `maxBars` en la app).
- El resto del motor no cambia: recibe un `StylePattern` como siempre.
- UI: en el menú de la sección, "Ritmo" gana un modo "por instrumento" con cuatro selectores.
- Fixture: `section-style-per-instrument`, incluyendo `loopBars` distintos.

Esto también cubre la "biblioteca general": la pista de cualquier estilo, incluidos "Mis
ritmos", funciona como preset de ese instrumento.

## Fase 7 — Sonido por sección (candidato; como `SectionOverrides` de la app)

`Section.soundTypeIds?: Partial<Record<instrumento, string>>`. Implica precargar las
muestras de todos los sonidos usados (bajo y guitarra cargan bajo demanda) y cambiar el
`sound` por tramo en `active`. Solo si las fases anteriores tienen uso.

---

## Fuera de alcance

- Compás distinto por sección (tampoco lo tiene la app, a propósito).
- BPM distinto por sección.
- Copiar patrones dentro de la sección, como hace la app (ver "Qué se adopta y qué no").
- Variaciones melódicas por sección en canciones públicas (`SongSection` no las tiene hoy).

## Medición

- Dos semanas después de la fase 2: porcentaje de progresiones guardadas con al menos una
  sección con `styleId` o `silenced`, **sobre las que tienen 2+ secciones** (base del
  14 sep: 117 de 273). Consulta: leer `progressions.data->sections` con la service role key
  y contar.
- Canciones públicas: comparar `playSongSection` y el tiempo de reproducción entre canciones
  con y sin ritmos por sección.
- Las fases 5, 6 y 7 solo si la fase 2 muestra uso.

## Compatibilidad con la app

Las dos apps guardan cosas distintas: la web, referencias a estilos; la app, patrones
copiados. Si algún día hay deep links o importación web → app (ver el plan web → Android),
un `styleId` de sección se traduce copiando los patrones del preset de la app con el mismo
id (`StylePreset.id`), y `silenced` se traduce directamente a `SectionOverrides.silenced`.
No hace falta decidirlo ahora, pero conviene que los ids de estilo de ambos lados coincidan
donde se pueda.

## Riesgos

- **Balance de volúmenes (regla 2).** `style.volumes` está ajustado por estilo; una sección
  con otro ritmo puede quedar descompensada con los volúmenes de la canción. Probar de oído;
  si falla, aplicar el ratio entre ambos estilos en vez de reabrir el mezclador por sección.
- **Precarga.** Si `collectMidiNotes` no recibe el resolver, las primeras notas de la sección
  nueva llegan tarde en una sesión fría.
- **Rhythm Editor con varios ritmos en juego.** La semántica nueva de `liveEditedStyle` es el
  cambio más fácil de romper sin darse cuenta; el arnés no lo cubre.
- **Fase 6: estilos que no se entienden entre sí** (bajo con swing sobre batería recta,
  arpegios pensados para otro tempo). El selector no puede impedirlo; se asume que el
  usuario lo oye.

## Pendientes aparte (no dependen de este plan)

- 11 canciones públicas usan `style: "pop_basic"`, que no existe, y suenan como `pop_1`.
- 41 de 76 usan `rock_basic`, que parece más un valor por defecto que una elección.
