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
- **Guitarras SF2** — los 8 sonidos `sf2-*` caen a guitarra sintetizada en el offline.
- **Pista vocal de referencia** (`audioTrack`).
- **Cadena de efectos** (`buildEffectsChain`: EQ, reverb, compresor) — solo online.
- **Todo lo relativo al tiempo real**: scheduler, lookahead, getters dinámicos (BPM, estilo
  o secciones cambiando durante la reproducción), loop de sección, transporte.

Por eso las fases del refactor que tocan timing en vivo (1 y 6) necesitan además
verificación manual en dispositivo. Está indicada fase por fase en el plan.

## Bugs que el arnés destapó

Ninguno está arreglado — el fixture congela el comportamiento **actual**, incluido el
incorrecto. Al corregirlos, el test fallará: eso es lo que tiene que pasar, y se
regenera la línea base a propósito en el mismo commit.

1. **El export ignora el `solo`.** La ruta offline filtra por `!state.muted` en vez de
   `isInstrumentAudible(state, instruments)`, que es lo que usa la online. Pones el bajo en
   solo, exportas, y en el WAV suena todo. Lo captura `muted-and-solo`.
2. **El export satura.** Pico de 1,44 en la mayoría de fixtures, sin limitador y con
   `masterGain` a 1.0. Los WAV recortan.
3. **El export no lleva los efectos.** EQ, reverb y compresor solo existen online. Por
   defecto son neutros, así que solo se nota cuando el usuario los toca en `MixingConsole`.

Los tres son de la misma familia: 564 líneas duplicadas entre la ruta online y la offline
que hay que arreglar dos veces. Es exactamente lo que elimina la Fase 3 del plan.
