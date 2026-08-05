# Refactor del motor de audio — plan

Estado de partida: `src/lib/audioEngine.ts`, 2.760 líneas, 82 commits de historial.
Drivers declarados: (1) cortes/glitches en móvil, (2) añadir instrumentos/features cuesta,
(3) carga inicial y peso.

Regla que gobierna todo el plan: **cada fase deja la app funcionando y verificable**.
Ninguna fase depende de que la siguiente esté terminada.

---

## Hallazgos que cambian el plan

Cosas encontradas leyendo el código que la propuesta original no contemplaba:

1. **La tormenta de timers es probablemente la causa real del glitch en móvil.**
   `scheduleSegment` registra hasta 3 `setTimeout` **por slot de semicorchea**
   (`onStepChange`, `onStep`, `onBeat` — líneas 1867, 1875, 1891). A 120 BPM eso son
   ~70 timers/segundo. Peor: el array `timeouts` (línea 1518) **solo se vacía en
   `cancel()`** (línea 2127) — durante una sesión de 5 minutos acumula ~20.000 entradas.
   Esa presión sobre el event loop es exactamente lo que hace llegar tarde al `setTimeout`
   del propio scheduler, el retraso de 2,85 s que documenta el comentario de
   `SCHEDULE_LOOKAHEAD_SEC`. Es un bucle de realimentación autoinfligido.

2. **`generateBarPattern` se llama una vez por slot, no una vez por barra.**
   `getPatternForBar` (línea 1843) no tiene caché — el comentario dice "NO cache" a
   propósito, para recoger ediciones en vivo. Pero devuelve un objeto con **14 arrays
   nuevos**, así que son 224 arrays por barra en vez de 14. GC gratis en el hilo principal.

3. **La ruta de guitarra está duplicada y la mitad es peso muerto.**
   Coexisten dos caminos: soundfonts SF2 en Base64 (`public/soundfonts/`, **19 MB**,
   descargados en `prebuild`) y samples MP3 reales
   (`public/audio/guitar-{acoustic,electric,nylon}/`, 29/17/27 notas, 8,9 MB).
   `playGuitarNote` (línea 946) despacha a uno u otro según `soundType.sf2Instrument`.
   El SF2 además obliga al parche global de `AudioContext.prototype.createBuffer`
   (línea 33) para no crear un buffer por nota dentro de `adsr`.

4. **El canal de playhead ya está bien resuelto en React.** `setStep`
   (`PlaybackContext.tsx:160`) usa ref + listeners, no `useState`, así que no re-renderiza
   a los 13 consumidores de `usePlayback()`. Y ya existe un bucle rAF que lee
   `getChordSchedule()` (línea 583). **El patrón correcto ya está en el repo** — solo hay
   que extender ese canal al step de semicorchea y borrar los `setTimeout`.

5. **`renderProgressionOffline` es un arnés de test gratis.** Produce PCM determinista y
   está en producción (`Index.tsx:1002`, `SongChordPlayer.tsx:528`). Y **Playwright ya es
   devDependency** — se puede hashear la salida en un navegador real sin añadir nada.

Y lo que la propuesta original daba por hacer que ya estaba hecho: lookahead con
`currentTime` (0,3 s, con clamp de auto-recuperación), carga por prioridades
(drums bloqueante → piano + guitarra eléctrica en background → bajo y resto lazy),
y guitarras en MP3 sueltos.

---

## Fase 0 — Arnés de regresión ✅ HECHA

Implementada en `tests/audio/` — ver `tests/audio/README.md` para uso y cobertura.
16 fixtures, `npm run test:audio`, cero dependencias nuevas.

Tres cosas salieron distintas de lo previsto:

- **El render no es bit-exacto.** Dos renders idénticos difieren hasta 3e-8 por muestra
  (ruido de coma flotante de Chromium, ~113 dB bajo la señal). Un hash del PCM es inútil
  como veredicto. El criterio real es una huella por ventanas de 25 ms: energía (RMS) +
  cruces por cero con histéresis. Detecta un cambio de volumen del 0,1 % en un instrumento.
  → **Esto invalida la nota de la Fase 2 sobre "idéntico bit a bit"**: la comparación es
  por tolerancia desde el principio, así que un reordenamiento benigno no falsea nada.
- **Ningún estilo built-in usa arpegios.** `applyArpeggioOrder` y
  `getArpeggioNotesPerSlot` son código vivo sin un solo estilo que los active; solo se
  alcanzan vía estilos custom de Supabase. El fixture `arpeggios` los cubre con un estilo
  sintético.
- **El arnés destapó tres bugs de producción antes de tocar nada** (detalle en el README):
  el export ignora el `solo`, satura (pico 1,44 sin limitador) y no lleva la cadena de
  efectos. Los tres son de la misma familia — la duplicación online/offline que mata la
  Fase 3. No se arreglan aquí: los fixtures congelan el comportamiento actual a propósito.

Lo que sigue es el diseño original, conservado como registro.

---

### Diseño original de la Fase 0

**Por qué primero:** no hay tests. Las 2.760 líneas contienen conocimiento empírico
ganado en dispositivo real (el clamp de starvation, el parche de `adsr`, el timeout de
2,5 s del soundfont, el guard de consistencia de contexto). Refactorizar eso sin red es
apostar a que te acuerdas de todo.

**Qué construir**
- `tests/fixtures/progressions.ts` — 10 progresiones que cubran cada rama musical del
  scheduler: un estilo por familia, swing (`jazz_light`), arpegios piano y guitarra,
  fill de barra 4 y de barra 8, variaciones melódicas por sección, `repeatCount > 1`,
  transposición ≠ 0, compás 6/8, y una con los 4 instrumentos a la vez.
- `tests/audio-golden.mjs` — script Playwright: abre una página de test, ejecuta
  `renderProgressionOffline` con cada fixture, y saca un hash del `AudioBuffer`
  (SHA-256 sobre el PCM cuantizado a int16 — cuantizar evita falsos positivos por
  ruido de coma flotante entre versiones de Chrome).
- `tests/golden/*.json` — hashes comprometidos en git.
- `npm run test:audio` compara; `npm run test:audio -- --update` regenera.

**Verificación de la propia fase:** rompe a propósito una constante del motor
(p. ej. cambia un volumen de estilo) y comprueba que el test falla. Un arnés que no
falla no es un arnés.

**Riesgo:** bajo. No toca código de producción.

> Nota: el arnés cubre la ruta **offline**. La ruta online no es determinista, así que
> las fases que tocan timing en vivo (1 y 6) necesitan además verificación manual en
> dispositivo — está indicada en cada fase.

---

## Fase 1 — Matar la tormenta de timers *(driver: glitches en móvil)*

Esta fase **no toca la arquitectura** y es la que más probablemente arregla el síntoma
que más duele. Va antes que cualquier reescritura por eso.

**Cambios**
1. Cachear `generateBarPattern` por `(estilo, barNumber, phraseLength)` dentro de
   `scheduleSegment`. La caché vive por segmento, así que sigue recogiendo ediciones en
   vivo en la siguiente barra — que es la granularidad que ya tiene todo lo demás.
   Elimina ~210 asignaciones de array por barra.
2. Borrar los `setTimeout` de `onStep` / `onStepChange` / `onBeat`. En su lugar, publicar
   un `_stepSchedule` análogo al `_chordSchedule` que ya existe, y que el bucle rAF de
   `PlaybackContext.tsx:583` derive step y beat de `ctx.currentTime`. El canal
   ref+listeners de `setStep` ya está montado y no cambia.
3. Con eso, el array `timeouts` queda casi vacío; acotarlo igualmente para que no pueda
   crecer sin límite.

**Verificación**
- Fase 0 en verde (el offline no debería moverse ni un bit — estos cambios son de la
  ruta online y de caché pura).
- Manual en móvil real, no en el emulador: reproducir 5 minutos seguidos tocando BPM,
  transposición y mute mientras suena. Es el escenario exacto que produjo el retraso de
  2,85 s.
- Chrome DevTools Performance con 4× CPU throttling, antes y después: contar timers
  pendientes y mirar el bloqueo del hilo principal.

**Riesgo:** medio-bajo. El playhead visual puede desincronizarse si el rAF deriva mal el
step; se ve al instante en el step-sequencer de `RhythmEditor`.

**Criterio de parada:** si tras esta fase el glitching desaparece, la Fase 6 (swap del
scheduler) baja de prioridad drásticamente. Mídelo antes de decidir.

---

## Fase 2 — Mixer con buses por instrumento ✅ HECHA

`src/lib/engine/mixer.ts`. Medido sobre la ruta online: bajar los faders a 0 durante la
reproducción tardaba **1,429 s** en oírse (esperaba al siguiente acorde) y ahora tarda
**0,029 s** — la rampa de 20 ms del propio fader. Las 9 fórmulas de volumen de la ruta
online desaparecen; las 9 de la offline siguen ahí hasta la Fase 3.

Dos desviaciones del diseño de abajo, ambas deliberadas:

- **Mute/solo va en dos sitios, no solo en el bus.** El bus a 0 silencia al instante lo ya
  programado; el gate de scheduling se mantiene para no construir nodos que nadie va a oír.
  El precio es que *des*mutear sigue esperando al siguiente segmento — igual que antes, así
  que no es una regresión. La Fase 4 lo arregla del todo.
- **Aplicar niveles una vez por segmento no bastaba.** Con eso, un fader seguía esperando
  al siguiente acorde y la fase no habría servido de nada. `applyMixerLevels()` se exporta
  y `updatePlaybackOptions` lo llama en cuanto el usuario mueve algo.

Fuera del mixer a propósito: el clic del metrónomo (no es un canal), los previews de acorde
y batería (hoy ignoran el volumen del instrumento; enrutarlos los dejaría mudos con ese
instrumento muteado) y la pista vocal de referencia (va directa a destination para quedar
fuera de la cadena de efectos y ya tiene su propia ganancia con rampa).

### Diseño original de la Fase 2

**Problema que resuelve:** hoy `volume * style.volumes.X * velocity` está escrito en
**18 sitios** (líneas 1910–2093 online, 2263–2612 offline), y como el volumen se aplica
al crear cada nota, mover un fader no se oye hasta la siguiente barra.

**Cambios**
- `src/lib/engine/mixer.ts`: `piano|bass|drums|guitar|vocal Bus → masterGain →
  buildEffectsChain → analyser → destination`.
- Los `play*Note` reciben el bus como `destination` (ya reciben un `AudioNode`, así que
  la firma no cambia) y **dejan de multiplicar por `state.volume` y `style.volumes`** —
  solo aplican `velocity`.
- Volumen / mute / solo pasan a ser `gain.setTargetAtTime` sobre el bus → respuesta
  inmediata, no en la siguiente barra.

**Verificación**
- Fase 0 en verde. Ojo: el resultado debería ser **idéntico bit a bit** solo si el orden
  de multiplicación se conserva; si cambia por asociatividad de coma flotante, regenerar
  los golden con `--update` **después de confirmar a oído** que no hay diferencia audible,
  y dejarlo anotado en el commit.
- Mixer móvil (`SongPlayerBar`, consola de performance): mover un fader mientras suena y
  comprobar que responde al instante.

**Riesgo:** bajo. Es la fase con mejor ratio valor/riesgo del plan.

---

## Fase 3 — unificar online y offline *(driver: añadir features cuesta)*

Partida en dos pasos verificables por separado, porque hacerlo de una era demasiada
superficie para un solo commit.

**3a — Renderizadores compartidos ✅ HECHA.** Las funciones de nota (`playPianoNote`,
`playBassNote`, `playDrumHit`, `playGuitarNote`, `playSample`, `playClick`, …) pasan de
`AudioContext` a `BaseAudioContext`, así que sirven igual en un `OfflineAudioContext`. El
render offline deja de tener su propia copia de cada instrumento y llama a las mismas.
`audioEngine.ts` baja de 2.836 a 2.571 líneas.

Dos parámetros nuevos donde las dos rutas sí difieren de verdad:
- `playDrumHit` recibe el kit (la live usa `acousticKit`; la offline el suyo, decodificado
  en su propio contexto).
- `playGuitarNote` comprueba `ctx === audioContext` antes de usar un player SF2, porque
  soundfont-player ata su grafo al contexto con el que se creó.

**Consecuencias medidas**, todas esperadas al elegir "unificar del todo":
- El bug del `solo` en el export desaparece solo, por compartir el gate
  `isInstrumentAudible`.
- Los 16 fixtures cambian. El export era una implementación paralela que había derivado:
  batería más silenciosa (`*0.8` en caja y `*0.5` en charles que la live no tiene), piano
  sintetizado con 4 armónicos en vez de 6, ganancia 0,12 en vez de 0,15 y sin detune.
- Desajuste de nivel entre export y reproducción: **−0,41 dB → +0,06 dB**. Medido con 5
  repeticiones por lado; el ruido del analyser es de ~1 dB, así que una sola medición no
  vale — la primera que hice cayó en el extremo bajo y parecía una regresión.
- La saturación empeora (pico 1,42 → 1,56): el export ya no es más silencioso que la
  reproducción, así que el bug del limitador se nota más. Sigue pendiente.

**3b — `eventBuilder` puro ✅ HECHA.** `src/lib/engine/types.ts` define `MusicalEvent`
(`NoteEvent | DrumEvent`) y `eventBuilder.ts` expone `buildSlotEvents(cx)`: función pura,
sin Web Audio, sin estado de módulo, sin reloj. Concentra todo lo musical — patrones de
ritmo, variaciones melódicas, arpegios, chord hits, el balance interno del kit — y deja
fuera todo lo de *sonido*: nada de sound types, offsets de octava, envolventes ni
frecuencias. `dispatchEvents()` en `audioEngine.ts` es el único sitio que convierte un
evento en nodos.

Los dos bucles quedan reducidos a las mismas dos llamadas: construir y despachar. Difieren
solo en lo que de verdad es distinto, y va en `DispatchTargets`: qué buses, qué kit de
batería, y si el bajo sampleado se programa de forma síncrona (live) o asíncrona
recogiendo promesas (offline, que debe esperarlas antes de `startRendering()`).

**El arnés pasa 16/16 sin tocar la línea base**, que es el resultado que importa:
reestructurar ambas rutas por completo no cambió ni un sonido. Y como ahora las dos
comparten builder y dispatcher, la cobertura del arnés se extiende de hecho a la lógica
musical de la ruta online, no solo a la del export. Lo que sigue sin cubrir es lo
exclusivamente online: scheduler y lookahead, metrónomo y guitarras SF2.

Al mover `applyArpeggioOrder` y `getArpeggioNotesPerSlot` al builder los reescribí de
memoria y me equivoqué en los dos (`updown` invertía el extremo equivocado; las velocidades
eran 1/2/4/8 en vez de 2/4/8/16). Se copiaron verbatim del original. Como ningún estilo
built-in usa arpegios, el único fixture que lo habría detectado es el sintético.

Balance: `audioEngine.ts` pasa de 2.760 a 2.305 líneas, más 382 en tres módulos con una
responsabilidad cada uno. El total apenas baja — la ganancia no es de líneas, es que ahora
hay **una** implementación de la lógica musical en vez de dos que derivaban.

### Diseño original de la Fase 3

Aquí muere la duplicación de **564 líneas** (2137–2700).

**Cambios**
- `src/lib/engine/types.ts`: `MusicalEvent = ChordEvent | NoteEvent | DrumEvent |
  ClickEvent | VocalEvent`, cada uno con `{ time, instrument, velocity, ... }`.
- `src/lib/engine/eventBuilder.ts`: `buildSegmentEvents(segment, ctx): MusicalEvent[]`,
  **función pura, sin Web Audio**. Absorbe toda la traducción musical: patrón de ritmo
  (16 slots), arpegios, fills, `getSwingOffset`, variaciones melódicas, transposición,
  metrónomo.
- `scheduleSegment` pasa a: construir eventos → despacharlos. `renderProgressionOffline`
  pasa a: construir los mismos eventos → despacharlos a un `OfflineAudioContext`.
  De 564 líneas duplicadas a un bucle.
- Los getters dinámicos (`getBpm`, `getStyle`, `getInstruments`, `getSections`) siguen
  siendo la fuente en vivo; ahora los lee el builder una vez por segmento.

**Verificación:** Fase 0 es exactamente el test para esto — el offline y el online pasan
a compartir builder, así que si los hashes no se mueven, la equivalencia está probada.
Esta es la fase donde el arnés se paga solo.

**Riesgo:** medio. Superficie grande, pero enteramente cubierta por el arnés.

**Payoff:** a partir de aquí, añadir un instrumento es un renderer nuevo + un tipo de
evento. No se toca el scheduler y no hay que arreglarlo dos veces.

---

## Fase 4 — VoiceManager y fin del cierre de contexto ✅ HECHA

Alcance recortado respecto al diseño de abajo, por dos razones:

- **Los "renderers como módulos" ya no aportaban nada.** Tras la 3a las funciones de nota
  son compartidas y tras la 3b `dispatchEvents()` es el único sitio que crea nodos. Moverlas
  a `renderers/*.ts` sería mover archivos de sitio.
- **El pool de 64 voces se aplaza** hasta que haya una medición que lo justifique. Lo puse
  en el plan por higiene, no por dato. `activeVoiceCount()` queda expuesto justamente para
  poder medirlo antes de decidir.

Lo que sí entró: `engine/voiceManager.ts` registra cada fuente sonora (`newSource` /
`newOscillator` en `audioEngine.ts`, 27 puntos de creación) y las ignora si no son del
contexto en vivo, así que los renders offline quedan fuera. `stopPlayback()` baja el master
en 15 ms, corta todas las voces y **ya no cierra el `AudioContext`**.

**Medido con `npm run test:transport`:**

| | Antes | Después |
|---|---|---|
| Preparar el Play que sigue a un Stop | 172 ms | **0 ms** |
| Audio residual tras Stop | no medible* | **0** |
| Voces vivas tras Stop | — | **0** |
| Nivel del Play tras Stop | — | +0,02 dB (sin solape) |

\* Con el contexto cerrado no se podía medir: `audioEngine` no anula `analyserNode`, así que
`getAnalyserNode()` devolvía el analyser muerto con su último frame congelado. Parecía audio
sonando y no lo era. Ahora el contexto vive y la medición es real.

Ojo con la cifra del stall: **172 ms**, no los "multi-second" que afirmaban los comentarios
del código. Eso era antes de que existiera `stopPlaybackKeepContext`, o en redes reales. La
fase sigue mereciendo la pena por lo demás, pero conviene no vender el argumento equivocado.

Parches retirados o desactivados:
- El timeout de 2,5 s de `ensureGuitarSoundfontLoaded` deja de ser estructural.
- `stopPlaybackKeepContext()` se queda, pero por una razón mucho más pequeña (no cortar las
  voces al encadenar secciones), no por dos semánticas incompatibles de Stop.
- Los samples de bajo del editor de acordes **no los paraba nadie** antes salvo el cierre del
  contexto: `stopAllSampledNodes()` solo lo llamaba el bass tab. Ahora sí.

### Diseño original de la Fase 4

**Cambios**
- `src/lib/engine/renderers/{piano,bass,drums,guitar}.ts`, una API:
  `schedule(event, when, bus)`. La síntesis actual se mueve **tal cual** — no se retoca
  ningún sonido en esta fase, para que el arnés siga siendo válido.
- `src/lib/engine/voiceManager.ts`: pool de 64 voces, robo de la más antigua,
  y sobre todo un `stopAllVoices()` real.
- Con `stopAllVoices()`, `stopPlayback()` **deja de cerrar el `AudioContext`**
  (línea 2711). Eso elimina de raíz la clase de bugs que obligó a escribir
  `stopPlaybackKeepContext()` (línea 2757), el timeout de 2,5 s del soundfont y el
  guard de consistencia de contexto de la línea 1689 — los tres se pueden borrar.

**Verificación**
- Fase 0 en verde.
- Prueba específica de la regresión histórica: Stop → Play inmediato, repetido, buscando
  solapes de audio (era la razón de cerrar el contexto). Y cambio de sección en un song
  largo, buscando el stall multi-segundo que documenta el comentario.

**Riesgo:** alto. Es la fase que revierte una decisión defensiva tomada por un bug real.
Hacerla en un commit propio y fácil de revertir.

---

## Fase 5 — Carga y peso *(driver: carga inicial / peso)*

### Decisión sobre la guitarra: se quedan los SF2, se arregla el export ✅

Datos que llevaron a la decisión:

| Sonido | Tipo | Estilos que lo traen por defecto |
|---|---|---|
| `electric` / `acoustic` / `nylon` | MP3, 8,9 MB | 10 / 7 / 2 |
| `sf2-muted` | SF2 | 1 (rock_basic) |
| los otros 7 `sf2-*` | SF2, ≈17 MB | **0** |

Los 19 MB no se descargan al cargar la página: cada soundfont se pide bajo demanda
(`nameToUrl`), así que el coste por usuario es un archivo de ~2 MB. Pesan en repo, deploy y
ancho de banda, no en el arranque — el argumento de "peso" era más flojo de lo planteado.

Se optó por **conservarlos y arreglar la incoherencia**, que era el problema real: el render
offline sustituía en silencio los 8 sonidos `sf2-*` por un tono sintetizado. Lo exportado no
era lo que se oía.

El arreglo resultó pequeño: `playGuitarSampleSF2` nunca llama al player, solo lee
`player.buffers`, y un `AudioBuffer` es dato decodificado utilizable desde cualquier contexto
(el navegador remuestrea si las tasas difieren). El guard `ctx === audioContext` que puse en
la 3a era excesivamente conservador. Solo hacía falta quitarlo y que
`renderProgressionOffline` esperase a que el soundfont estuviera cargado.

Verificado comparando el mismo fixture con y sin el arreglo: **325 de 360 ventanas cambian
en energía y en tono** (delta de cruces por cero hasta 108), o sea un timbre completamente
distinto.

Y un hueco propio al descubierto: el fixture que decía cubrir esto usaba el estilo `disco`,
que **no tiene fila de ritmo de guitarra ni variación melódica**, así que su guitarra no
sonaba nunca. Sustituido por `sf2-guitar-export`, con un estilo de 8 golpes por compás.

### Lo que queda de la Fase 5

**Cambios**
- **Decidir una sola ruta de guitarra.** Los MP3 sueltos ya funcionan y son 8,9 MB frente
  a 19 MB de SF2. Si la calidad de los sets MP3 cubre los sonidos que ofreces, borrar
  `public/soundfonts/`, el `prebuild: fetch-soundfonts`, la dependencia
  `soundfont-player`, `playGuitarSampleSF2` y **el parche global de
  `AudioContext.prototype.createBuffer`** — que existe solo para tapar un defecto de
  `adsr`. Si no cubre, ampliar los sets MP3 primero. Es la decisión con más peso muerto
  detrás de todo el repo.
- `src/lib/engine/sampleLibrary.ts`: estados `idle → loading → decoded → ready` por
  sample, caché por `AudioContext`. Unifica las tres rutas de carga que hoy existen por
  separado (`loadPianoSamples`, `loadGuitarSampleType`, `sampleEngine` del bass tab).
- Piano: hoy carga las 88 notas (2,5 MB) en background. Cargar primero las octavas
  centrales — ya hay un `sort` que las prioriza (línea 297), pero espera a las 88 antes
  de marcar `pianoSamplesLoaded`. Marcar "usable" al terminar el rango central.
- Precarga oportunista: mientras suena una sección, pedir los samples de la siguiente.

**Verificación:** medir tiempo hasta primer sonido audible en móvil con red 4G simulada,
antes y después. Y comprobar que el fallback a síntesis sigue sonando si el sample no ha
llegado.

**Riesgo:** bajo salvo la decisión de guitarra, que es irreversible en la práctica
(cambia el sonido del producto). Consultarla antes de ejecutarla.

---

## Fase 6 — Swap del scheduler *(condicional)*

Solo si tras la Fase 1 sigue habiendo problemas de timing.

- `src/lib/engine/clock.ts`: un único `setInterval` de 25 ms que programa lo que caiga
  en los próximos 300 ms.
- `src/lib/engine/scheduler.ts`: cola ordenada por tiempo + `registerRenderer(type, r)`.
- `src/lib/engine/loopController.ts`: puntero `section / bar / beat`.

Para entonces la superficie es pequeña (las Fases 3 y 4 ya sacaron toda la lógica
musical y de síntesis) y el arnés existe. Ese es el orden que hace este cambio barato,
en vez de ser el primer paso a ciegas.

---

## Invariantes durante todo el refactor

- **La API pública de `audioEngine.ts` no cambia**: `scheduleProgression`,
  `stopPlayback`, `getAudioTiming`, `getAnalyserNode`, `getChordSchedule`,
  `previewChord*`, `renderProgressionOffline`. Los 4 consumidores
  (`PlaybackContext`, `RhythmEditor`, `useStylePreview`, `SongChordPlayer`) no se tocan
  hasta que el motor esté migrado.
- **El modelo persistido no cambia**: `progressions`, `user_settings`, `Song`, `Section`,
  `Chord`. Los eventos son un artefacto en memoria.
- **El bass tab player no entra en el refactor** — usa `bassTab/bassAudio.ts`, motor
  aparte. Solo `bassTab/sampleEngine.ts` es compartido (el chord editor lo usa para el
  bajo sampleado) y hay que respetarlo en la Fase 5.
- Cada fase, un commit revertible por separado.

## Fuera de alcance

MIDI in/out, automatizaciones, cuantización, grabación multipista. La arquitectura los
deja abiertos; no se implementan aquí.
