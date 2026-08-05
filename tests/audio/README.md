# Arnés de regresión del motor de audio

Red de seguridad para el refactor descrito en `docs/audio-engine-refactor.md`. Congela el
sonido que produce el motor hoy, para que cualquier cambio que lo altere salte.

```bash
npm run test:audio          # compara contra tests/audio/baseline.json
npm run test:audio:update   # regenera la línea base (revisa el diff antes de commitear)
node tests/audio/run-golden.mjs --only swing-jazz
node tests/audio/run-golden.mjs --url http://127.0.0.1:4321   # reutiliza un dev server abierto
```

Arranca `astro dev`, abre `/about/` en Chromium headless, importa `audioEngine.ts` en vivo
desde el servidor de Vite y renderiza cada fixture con `renderProgressionOffline()`.
Cero dependencias nuevas: Playwright ya estaba en `devDependencies`.

## Por qué no es un hash del PCM

Lo intuitivo sería hashear el buffer y comparar. No funciona: dos renders idénticos
difieren hasta en **3e-8 por muestra** (medido: 8,9 % de las muestras, con señal de pico
0,27 — unos 113 dB por debajo). Es ruido de coma flotante del mezclador de Chromium,
inaudible, pero basta para cruzar un límite de redondeo de int16 y mover el hash.

El veredicto sale de una huella por ventanas de 25 ms, comparada con tolerancia muy por
encima del ruido y muy por debajo de lo audible:

| Métrica | Qué detecta | Tolerancia |
|---|---|---|
| `rms` | notas que faltan o sobran, volúmenes, desplazamientos de tiempo, duraciones | `1e-6` absoluto |
| `zcr` | cambios de tono (cruces por cero con histéresis de `1e-4`) | ±1 por ventana |

Sensibilidad comprobada: detecta subir el volumen del piano un **0,1 %** en un solo
instrumento (210/424 ventanas, delta máx 1,11e-4).

Cada fixture se renderiza tres veces: la primera se descarta (calienta la decodificación
por contexto) y las otras dos deben coincidir. Si no coinciden, el fixture se reporta como
`NO DETERMINISTA` y **no** se escribe en la línea base — así una carga de samples a medias
no queda congelada como si fuera correcta.

`Math.random` se sustituye por un PRNG sembrado (mulberry32) durante cada render: la
síntesis de batería usa buffers de ruido y el hi-hat abierto elige sample al azar.

## Qué cubre

Los 16 fixtures de `fixtures.mjs` recorren compás 4/4 y 6/8, swing, arpegios, variaciones
melódicas (incluida una con id inexistente, para el fallback de `resolveVariation`), frases
de 4 y 8 barras con sus fills, `repeatCount` > 1 con varias secciones, transposición,
duraciones fraccionarias, cualidades de acorde extendidas, mute/solo, y las rutas de
samples y de síntesis de los cuatro instrumentos.

## Qué NO cubre

`renderProgressionOffline` no ejecuta parte del motor, así que el arnés tampoco:

- **Metrónomo** (`playClick`) — no existe en la ruta offline.
- **Guitarra sintetizada** (`playGuitarSynth`) — no se puede fijar por configuración: los 11
  sonidos de guitarra son o MP3 o SF2, y esa ruta solo se alcanza si la carga falla.
- **Pista vocal de referencia** (`audioTrack`).
- **Cadena de efectos** (`buildEffectsChain`: EQ, reverb, compresor) — solo online.
- **Todo lo relativo al tiempo real**: scheduler, lookahead, getters dinámicos (BPM, estilo
  o secciones cambiando durante la reproducción), loop de sección, transporte.

Por eso las fases del refactor que tocan timing en vivo (1 y 6) necesitan además
verificación manual en dispositivo. Está indicada fase por fase en el plan.

## Bugs que el arnés destapó

1. ~~**El export ignora el `solo`.**~~ **Arreglado en la Fase 3.** La ruta offline filtraba
   por `!state.muted` en vez de `isInstrumentAudible(state, instruments)`: ponías el bajo en
   solo, exportabas, y en el WAV sonaba todo. Lo capturó `muted-and-solo`, cuyo pico cayó de
   1,447 a 0,704 al unificar.
2. **El export satura.** Sin limitador y con `masterGain` a 1.0. Empeoró con la Fase 3
   (pico 1,42 → 1,56 en el fixture base) porque el export ya no es más silencioso que la
   reproducción. Sigue pendiente.
3. **El export no lleva los efectos.** EQ, reverb y compresor solo existen online. Con los
   valores por defecto la cadena es unitaria (comprobado en `audioEffects.ts`: `compGain=0`,
   `bypassGain=1`, `dryGain=1`, `wetGain=0`), así que solo se nota cuando el usuario los
   toca en `MixingConsole`. Sigue pendiente.
4. ~~**El export sustituía las guitarras SF2 por un tono sintético.**~~ **Arreglado en la
   Fase 5.** Los 8 sonidos `sf2-*` sonaban distinto en el WAV que en la reproducción.
   Ningún fixture lo detectaba: el que decía cubrirlo usaba el estilo `disco`, que **no
   tiene fila de ritmo de guitarra**, así que su guitarra no sonaba nunca. Ahora lo cubre
   `sf2-guitar-export`, con un estilo de 8 golpes de guitarra por compás.

## Por qué se ha regenerado la línea base

Una vez, en la Fase 3, a propósito: los 16 fixtures cambiaron al pasar reproducción y export
a compartir renderizadores. El export era una implementación paralela que había derivado
(batería más silenciosa, piano sintetizado con 4 armónicos en vez de 6 y sin detune), así
que unificar cambia el WAV. Verificado con una medición aparte de que el cambio va en la
dirección correcta: el desajuste de nivel entre export y reproducción pasó de **−0,41 dB**
(fuera del ruido de medición, 0,28 dB) a **+0,06 dB**.

Regla: la línea base solo se regenera cuando el cambio de sonido es deliberado y está
justificado en el mensaje del commit. Si `npm run test:audio` falla y no sabes por qué,
**no** es un caso de `--update`.

## Puerto

El arnés levanta su propio `astro dev` en el **4327**, no en el 4321. Es a propósito: este
script mata por la fuerza lo que ocupe su puerto, así que compartirlo con `npm run dev`
significa tumbar el servidor que alguien está usando. Y el fallo resultante engaña: los
instrumentos precargados (piano, batería) siguen sonando, mientras que los que cargan bajo
demanda al tocar (bajo vía `/samples/`, guitarra vía `/soundfonts/`) se quedan mudos. Parece
un bug de audio y no lo es.

Se puede cambiar con `AUDIO_TEST_PORT`, o reutilizar un servidor ya abierto con `--url`.
