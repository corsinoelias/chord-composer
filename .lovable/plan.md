# Motor de reproducción musical (Chord Player)

Estoy de acuerdo con el diagnóstico: hoy `audioEngine.ts` (2.760 líneas) mezcla scheduler, síntesis, carga de samples, mezcla y export offline en un solo archivo, y la lógica offline es una copia casi literal de la online. La propuesta es migrar a un motor por capas **sin big-bang**: cada fase deja la app funcionando igual, y las siguientes se apoyan en la anterior.

## Estado actual (resumen honesto)

- `scheduleProgression` programa **barra a barra** y se re-agenda con `setTimeout`; ya tiene mitigaciones ("self-heal from scheduler starvation") porque en móvil los timers llegan hasta 2,85 s tarde.
- El scheduler **sí conoce** acordes, estilos, arpegios, fills y variaciones melódicas: por eso añadir un instrumento obliga a tocarlo.
- Cada disparo crea nodos nuevos; no hay pool de voces ni límite de polifonía.
- Todos los samples de piano (88) se cargan al inicio; guitarra vía soundfonts Base64 de MIDI.js.
- `renderProgressionOffline` duplica ~600 líneas de la ruta online → cualquier cambio hay que hacerlo dos veces.
- Mezcla: `masterGain → cadena de efectos → analyser → destination`. No hay buses por instrumento.

## Arquitectura objetivo

```text
Song Model  →  Timeline (Sections/Bars)  →  EventGraph (eventos musicales)
                                                    │
                                        Scheduler (lookahead 300 ms)
                                                    │
                          PianoRenderer  BassRenderer  DrumRenderer  GuitarRenderer
                                                    │
                                            VoiceManager (pool + steal)
                                                    │
                                    Mixer (bus por instrumento → master FX)
```

Regla dura: **el scheduler no sabe qué es un acorde**. Recibe `{ time, event }` y lo delega al renderer registrado para ese tipo.

## Fases

### Fase 1 — Extraer el scheduler (base de todo)
Nuevo `src/lib/engine/`:
- `types.ts`: `MusicalEvent` = `ChordEvent | NoteEvent | DrumEvent | TempoEvent | MarkerEvent`.
- `clock.ts`: reloj con lookahead. Un único `setInterval` de 25 ms que programa lo que caiga en los próximos 300 ms usando `audioContext.currentTime`. Sustituye la cadena de `setTimeout` por barra y el código de self-heal.
- `scheduler.ts`: cola ordenada por tiempo + `registerRenderer(type, renderer)`. Sin lógica musical.
- `loopController.ts`: puntero `section / bar / beat`. El loop mueve el puntero, no reconstruye nada.

`scheduleProgression` se mantiene como fachada con la misma firma pública (`PlaybackContext` no cambia) pero por dentro alimenta al nuevo scheduler.

### Fase 2 — Productor de eventos (`eventBuilder.ts`)
Toda la traducción musical → eventos sale del scheduler:
- estilo/ritmo (16 slots), arpegios, fills de barra 4/8, swing (`getSwingOffset`), variaciones melódicas por sección, transposición, metrónomo.
- Se convierte en una función **pura**: `buildBarEvents(bar, context) => MusicalEvent[]`.
- Beneficio inmediato: el export WAV usa el mismo builder, y `renderProgressionOffline` pasa de ~600 líneas duplicadas a un bucle que empuja los mismos eventos a un `OfflineAudioContext`. Fin del "arreglarlo dos veces".
- Los getters dinámicos actuales (`getBpm`, `getStyle`, `getInstruments`, `getSections`) siguen siendo la fuente en vivo, ahora leídos por el builder en cada barra.

### Fase 3 — Renderers + VoiceManager + Mixer
- Un renderer por instrumento con una sola API: `schedule(event, when, bus)`. La síntesis actual (drums, bajo, piano sampleado, guitarra) se mueve tal cual, sin retocar el sonido.
- `voiceManager.ts`: pool de 64 voces, voice stealing por la más antigua, `stopAll()` real para el Stop.
- `mixer.ts`: `Piano/Bass/Drums/Guitar Bus → master → EQ/Comp/Reverb (audioEffects) → limiter → analyser → destination`. Volumen/mute/solo pasan a actuar sobre el bus, no dentro de cada voz.

### Fase 4 — Carga y caché de samples
- `sampleLibrary.ts` con estados `idle → loading → decoded → ready` por sample, caché por `AudioContext` (nunca se re-decodifica).
- Prioridades: al arrancar solo **drums + piano**; bajo al primer Play; guitarras bajo demanda al seleccionarlas. Nunca bloquea la reproducción (fallback al sintetizado hasta que esté listo).
- Precarga oportunista: mientras suena una sección, se piden los samples que necesita la siguiente.

### Fase 5 — Guitarra sin Base64
- Sustituir los soundfonts MIDI.js por MP3 sueltos en `public/audio/guitars/<set>/<nota>.mp3` (mismo patrón que el piano), servidos con cache HTTP y cargados por nota real + pitch-shift para las intermedias.
- Se mantiene el proxy `/api/guitar-soundfont` como fallback hasta que los sets nuevos estén completos.

## Detalles técnicos

- Nada de esto cambia el modelo persistido (`progressions`, `user_settings`): `Song`/`Section`/`Chord` siguen igual; los eventos son un artefacto en memoria.
- API pública de `audioEngine.ts` (`scheduleProgression`, `stopPlayback`, `getAudioTiming`, `getAnalyserNode`, `previewChord…`) se conserva como capa de compatibilidad, así `PlaybackContext`, `ChordEmbed`, `SongChordPlayer` y el editor de ritmos no se tocan.
- El `AudioContext` deja de recrearse en cada Stop (hoy se cierra); con `stopAllVoices()` del VoiceManager ya no hay solapes, y los efectos dejan de reconstruirse.
- Timing visual: se sigue usando `currentTime` como verdad absoluta y `getChordSchedule()` se alimenta del scheduler.
- Verificación por fase: play/stop/loop, cambio de BPM y estilo en vivo, variaciones por sección, export WAV idéntico al actual, y una pasada en móvil (395 px) buscando huecos de timing.

## Fuera de alcance por ahora
MIDI in/out, automatizaciones, cuantización, grabación de audio y multipista. La arquitectura los deja abiertos, pero no se implementan aquí.
