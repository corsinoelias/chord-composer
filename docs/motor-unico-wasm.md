# Estudio: usar en la web el motor de audio de la app

Escrito el 2026-09-21. Estado: **hecho: el motor de la app es el único de la web (2026-09-22)** (laboratorio en `/lab/app-engine/`, probado por
el usuario: suena bien); decisión de sonido tomada (A, sección 5). La prueba es reproducible en `docs/motor-unico-spike/`.

Pregunta: ¿puede la web sonar con el mismo motor que la app de Android, es viable y vale la
pena?

Respuesta corta: **sí es viable técnicamente, y la prueba lo demuestra con el motor real sin
cambiar una línea de su núcleo.** Vale la pena, con una condición que decides tú: las
canciones que ya existen en la web van a sonar distinto (sección 5).

---

## 1. Por qué la app «falla mil veces menos»

No es una impresión: los dos motores están construidos de forma opuesta.

| | Web (`src/lib/audioEngine.ts`, 2.680 líneas) | App (`native_audio.cpp`, 2.391 líneas + `tsf.h`) |
|---|---|---|
| Quién decide cuándo suena una nota | Un `setInterval` de 25 ms en el **hilo principal** que programa 300 ms por delante (`engine/clock.ts`) | El propio **callback de audio**, muestra a muestra |
| Cómo suena cada nota | Crea nodos de Web Audio por nota (46 puntos de creación de nodos) | Voces preasignadas (64 melódicas, 32 de batería) dentro de un bucle |
| Si el hilo principal se atasca (React, GC, scroll) | El reloj llega tarde; el código documenta retrasos de hasta 2,85 s en móvil | No le afecta: el audio corre en su hilo |
| Pestaña oculta o pantalla bloqueada | Los navegadores frenan `setInterval` a 1 vez por segundo; con 300 ms de margen eso son cortes | Sigue sonando |
| Cambios en vivo | Tempo/estilo al siguiente compás; cambios de acordes **al final de la vuelta** | Al siguiente paso (una escritura atómica) |
| Exportar WAV | Coste cuadrático: ~2 min para una canción de 3 min | Mismo camino que el directo, más rápido que el tiempo real |
| Mezcla | EQ, compresor y reverb solo en el master; sin paneo | Paneo, EQ y compresor por canal, reverb de envío, medidores y reducción de ganancia |

Lo primero es la razón de fondo: un secuenciador en el hilo principal del navegador siempre
compite con la interfaz. Por eso la web ha necesitado reloj con lookahead, precarga y
pruebas de jank; y aun así depende de que la pestaña esté delante.

## 2. La prueba (spike)

Compilé el motor de la app a WebAssembly con wasi-sdk 25 y lo ejecuté en Node (V8, el mismo
motor de WebAssembly que Chrome en Android).

- **El núcleo compila sin cambios.** Solo se sustituye el borde de plataforma: AAudio (la
  salida de audio de Android), JNI, un log, un hilo que reabre la salida si se desconecta y
  el mutex de ese stream. Todo eso son ~20 líneas de las 2.391.
- **Tamaño:** 388 KB de `.wasm` (141 KB con gzip).
- **Imports:** solo funciones de fichero de WASI, y solo porque la exportación escribe con
  `fopen`. En la web la exportación escribiría a memoria. No necesita hilos, ni
  SharedArrayBuffer, ni cabeceras COOP/COEP.
- **Rendimiento** (canción de 32 compases: piano, guitarra y bajo del SoundFont, batería
  grabada, reverb): **46-50× más rápido que el tiempo real** en este portátil. Un bloque de
  128 muestras (lo que pide un AudioWorklet) tarda 0,055 ms de los 2,67 ms disponibles:
  **2 % del presupuesto**. Un móvil de gama media es varias veces más lento y seguiría muy
  por debajo del límite.
- **Exportación:** 82 s de canción en 1,8 s, con el mismo sonido que el directo.
- **Salida verificada:** el WAV tiene señal de principio a fin (pico 0,78, sin silencios).

Lo que la prueba **no** mide todavía: el motor corriendo en vivo dentro de un AudioWorklet en
un móvil real, con la interfaz a la vez. Es el siguiente paso (fase 1).

## 2b. Medido en un móvil real (fase 1, 2026-09-21)

Pixel 8 Pro, Chrome 153, controlado por USB (DevTools + `adb`). Mismo escenario para los dos
motores; cada salida se mide en el hilo de audio (bloques de 2,67 ms en silencio total).
Scripts en `lab/app-engine/phone/`.

| Prueba | Motor de la app (laboratorio) | Reproductor web actual |
|---|---|---|
| Interfaz atascada 400 ms de cada segundo, 15 s | **0 ms** de silencio | 363 ms en 8 cortes (máx. 117 ms) |
| Pantalla apagada, 20 s | **0 ms** | 515 ms en 17 cortes (máx. 120 ms); 23,1 s de audio en 19,8 s reales |
| Chrome en segundo plano, 20 s | **0 ms** | 445 ms en 18 cortes; 27,1 s de audio en 20,5 s reales |
| Pico de salida | 0,76 | **1,59: satura** |

El usuario lo escuchó durante la prueba: la web «sonó fatal» y con la pantalla apagada «se
perdía el tiempo, iba a trompicones»; el motor C++ «tiene buena pinta».

Coste del motor en ese móvil: 2,0-2,5 % de cada bloque, medido dentro del hilo de audio
(3.000 bloques seguidos) y en un Worker con reloj de alta resolución (40-44× tiempo real;
p99,9 0,2-0,4 ms). Un medidor por bloque con `Date.now()` dio 23 %: el hilo de audio no tiene
reloj más fino que el milisegundo, así que ese número no sirve y se quitó del laboratorio.

Requisito encontrado: la CSP debe incluir `'wasm-unsafe-eval'` en `script-src`.

## 2c. Fase 2 hecha: un solo motor, dos plataformas

- En la app, `native_audio.cpp` marca con `#ifndef CHORD_AUDIO_WEB` lo que es de Android: JNI, el
  log, y el candado y el hilo de reconexión de la salida (34 líneas añadidas, 3 cambiadas).
  **Comprobado:** el código máquina que genera para las cuatro ABI de Android (arm64, armv7,
  x86_64, x86) es idéntico byte a byte al de antes. La app no cambia.
- En la web, `npm run engine:sync` copia ese archivo y `tsf.h` a `engine/vendor/` sin tocarlos,
  compila `engine/web_glue.cpp` a `public/engine/engine.wasm`, recorta el SoundFont, copia la
  batería y apunta todo en `engine/source.json` (commit de la app y hash de cada archivo).
- `npm run check:engine`, en el build de Netlify, falla si algo difiere de `source.json`; en un
  ordenador con el repo de la app, además avisa si el motor de la app cambió desde la última
  sincronización.
- Verificado en el Pixel 8 Pro con el motor sincronizado: 0 ms de cortes con la interfaz
  atascada, la pantalla apagada y Chrome en segundo plano; carga 5,8 %.

**Si mañana cambia el motor en la app:** `npm run engine:sync` → probar en el móvil → commit de
`engine/` y `public/engine/`. Si el cambio añade o cambia una función del puente (lo que hoy
llama Flutter por JNI), también hay que añadirla en `engine/web_glue.cpp`.

## 2d. Fase 3 hecha: el motor, listo para usarse desde la web

- `engine/web_glue.cpp` exporta **toda** la API del puente JNI de la app, con los mismos nombres
  y argumentos (canción, patrones, sonidos, mezcla, previsualizaciones, notas que suenan y
  golpeadas, niveles, exportación).
- `public/engine/processor.js` (AudioWorklet): aplica órdenes por lotes entre dos bloques y
  devuelve ~30 veces por segundo posición, notas, golpes de batería, niveles y cortes.
  `engine-core.js` es el cargador común con el Worker de exportación.
- `public/engine/export-worker.js`: llama al `exportWav` de la app con un sistema de archivos
  en memoria. Pixel 8 Pro: 42 s de canción en 1,9 s (22-26× tiempo real).
- `src/lib/appEngine/`: `AppEngine` (host.ts), órdenes tipadas (commands.ts) y las canciones de
  prueba (demoSongs.ts), ya escritas con las mismas órdenes que usará el traductor.
- Batería: las 46 grabaciones de la app con su hueco y su ganancia, leídos del Dart de la app por
  `engine:sync` (`kit.json`). Se cargan bajo demanda (`ensureSlots`); por defecto, el kit
  acústico y el cencerro de la cuenta atrás.
- Verificado en el Pixel: 0 ms de cortes en las cuatro pruebas; carga 5,5 %. Con las ganancias
  reales de la app el pico llega a 0,94-0,95 (antes 0,76): vigilar que no sature.
- Pendiente para la fase 6: caché permanente de los recursos (hoy el navegador revalida).

## 2e. Fase 4 hecha: las canciones de la web, en el motor de la app

- `src/lib/appEngine/fromSong.ts` (`songToEngine`): una canción web (secciones, acordes, BPM,
  transposición, instrumentos) + su estilo resuelto → órdenes del motor. Lo que la canción *es*
  lo decide el código de la web de siempre (`generateBarPattern` compás a compás,
  `resolveSectionPlayback` para las secciones con arreglo propio, `resolveVariation` para las
  líneas melódicas); el traductor solo lo escribe en pasos del motor. Compás, swing (0-1 → la
  proporción de la app), fills (la regla de cuándo suenan es la de la app), sonidos por el
  catálogo compartido, registro (octaveOffset → ventana de voicing) y mezcla.
- Cambios en el C++ de la app (sin commit en su repo): las 24 calidades de acorde de la web que
  la app no tenía y los grados de escala 1-8 (`kScale1..kScale8`), contados desde el bajo como
  hace la web. Efecto en la app: los acordes de 5 notas con bajo distinto ahora suman ese bajo.
- `engine:sync` trae los 15 programas del catálogo (`sounds.sf2`, 6,3 MB) y los kits de la app
  (`kit.json`). El kit «standard» de la web apunta a un kit que la app no tiene; suena el
  acústico por defecto de la app, que es el mismo.
- Laboratorio: elige cualquiera de las canciones públicas y cualquiera de los 20 ritmos.
- Medido: escritorio y Pixel con 0 ms de cortes (Pixel con la interfaz atascada 20 s, carga
  1,9 %, 268 s exportados en 4,9 s). Pico hasta 0,977 con pop_1: al borde de saturar.
- Sigue sonando distinto: los arpegios suenan en bloque (el laboratorio lo avisa), un paso con más de dos notas se queda con las dos más graves, y un golpe de acorde y
  un grado en el mismo paso de una variación se quedan en el acorde.

## 2f. Fase 6 empezada: el reproductor real, con interruptor

- `?engine=app` en cualquier página del reproductor lo activa en ese navegador (se recuerda);
  `?engine=web` lo quita. Sin él, todo sigue como siempre.
- `src/lib/appEngine/player.ts` (`AppPlayback`), enchufado en `PlaybackContext`: la interfaz no
  cambia. Tempo y clic van solos; la mezcla (faders, mute, solo) solo manda niveles, sin cortar
  notas; cualquier otro cambio (acordes, ritmo, tono) reenvía la canción entera, que el motor toma
  en el siguiente paso sin parar. La posición (acorde con repeticiones, fracción, paso) se
  calcula igual que la del motor web para que el resaltado y la barra funcionen.
- Una sola pasada (`loop: false`, p. ej. tocar una sección en las páginas de canción): la
  canción termina en un compás de silencio añadido; al llegar a él el reproductor para y
  encadena lo siguiente, como el motor web. Siguen en el motor web las canciones con pista de voz. La cuenta atrás visual sigue haciendo
  sus clics con el motor web; mientras cuenta, el motor de la app ya arranca.
- Medido en el Pixel con el reproductor real: 0 ms de cortes con la página atascada 20 s; el
  cambio de tono entra en marcha.
- Hecho después (2026-09-22): la voz de referencia (se corta por sección y se alinea con la
  posición del motor), caché permanente de los recursos (`netlify.toml`, URLs con huella), la
  exportación WAV con el motor de la app (`exportSongWav`) y el motor de la app **por defecto**,
  con `?engine=web` para volver y respaldo automático si el navegador no puede.
- Encontrado en el camino: reenviar la canción entera en cada cambio vaciaba pistas sin soltar
  las notas del SoundFont (un segundo piano sonando segundos); ahora un cambio de mezcla solo
  manda niveles, y un reenvío suelta las notas antes. En la app el mismo fallo se arregla en
  `native_audio.cpp` (soltar la nota al vaciar la pista), pendiente de probar en la app.
- **2026-09-22: motor web eliminado.** El editor de ritmo, la vista previa de estilos, las
  previsualizaciones (acorde, nota, batería) y los efectos del mezclador pasan al motor de la app
  (`preview.ts`, `effects.ts`); se borran `audioEngine.ts`, `audioEffects.ts`, `src/lib/engine/*` y las
  pruebas `tests/audio` y `run-corpus`. La guitarra sube 6 dB (se oía apenas). El arreglo del
  segundo piano en `native_audio.cpp` se deshizo: en la app no pasa.

## 3. Peso de los sonidos

La app usa `GeneralUser.sf2` (30,8 MB): demasiado para la web. Pero solo hacen falta los
programas que se usan (medido con `docs/motor-unico-spike/sf2size.mjs`):

| Conjunto | Tamaño |
|---|---|
| Los 3 por defecto (piano 0, acústica 25, bajo finger 33) | **2,6 MB** |
| Todos los que ofrece la app (18 programas) | 6,8 MB |
| Hoy la web: muestras melódicas (piano / bajo / guitarra) | 2,5 / 5,5 / 8,8 MB |

Con un SoundFont recortado la web descarga lo mismo o menos que ahora.

## 4. Qué le falta al motor de la app para las canciones de la web

Ya está listado en `shared/spec/reproduccion.md` §6. Resumido:

1. **Arpegios:** la app no los tiene. Los estilos web que arpegian sonarían en bloque.
2. **Regla de fills:** la de la app es por sección (cada 8 compases, más transición y crash).
   La de la web va por la canción entera (4 u 8 compases).
3. **Duración de nota:** la app sostiene hasta el siguiente golpe; la web corta a 3 slots.
4. **Pasos con tres notas:** la app se queda con las dos más graves.
5. **Sonidos melódicos:** SoundFont en la app, muestras propias en la web. La batería ya es la
   misma (kit «Web» exportado a la app).

Añadir 1-4 al C++ mejora también la app.

## 5. La decisión que te toca

Si el motor de la app pasa a ser la referencia, **las canciones que ya hay en la web cambian
de sonido**: los 76 públicos y las ~300 progresiones guardadas. Es lo contrario de la regla
del 18 de septiembre («la web es la referencia sonora»). Hay tres salidas:

- **A. Aceptar el sonido de la app.** Lo más simple y coherente. Antes hay que añadir arpegios
  al C++ para que ningún estilo pierda su carácter.
- **B. Conservar el timbre de la web:** convertir las muestras de piano, bajo y guitarra de la
  web en un SoundFont propio y cargarlo en el motor. Las canciones web conservan su piano; la
  app ganaría esos sonidos como opción. El ritmo y los arpegios siguen dependiendo de §4.
- **C. Motor nuevo solo para canciones nuevas.** Descartado: dos motores otra vez, que es el
  problema que queremos quitar.

Mi recomendación era **B si el piano de la web es parte de la identidad del sitio; si no, A.**

**Decidido el 2026-09-21: A.** El motor y los sonidos de la app son la referencia; las canciones
de la web cambian de sonido. **Arpegios descartados (2026-09-22):** ningún ritmo integrado de la
web los usa (solo podría un ritmo propio de «Mis ritmos»), así que el C++ no los necesita y esos
ritmos sonarán en bloque. Esto sustituye a la regla del 18 de septiembre («la web es la
referencia sonora»).

## 6. Plan por fases

| Fase | Qué | Esfuerzo | Riesgo |
|---|---|---|---|
| 1 | **Prototipo en navegador:** AudioWorklet + el `.wasm` + la canción de prueba, abierto en tu móvil y en un iPhone. Medir cortes y carga (el motor ya mide su propia carga y los bloques tardíos) | 1-2 días | Bajo; no toca ni la web ni la app |
| 2 | Separar en la app el **núcleo** (`engine_core`) de la **plataforma** (AAudio/JNI). La app debe quedar idéntica; tú la pruebas con sus métricas de carga | 2-3 días | Medio: toca la app (ojo con la caída de rendimiento del 18 sep) |
| 3 | **Host web:** worklet con la misma API que el JNI; posición y notas que suenan hacia la interfaz por mensajes; carga y caché del SoundFont y la batería; exportación WAV en un Worker con el mismo `.wasm` | 4-6 días | Medio: Safari iOS (AudioWorklet existe desde 14.5); frecuencia de muestreo a 48 kHz |
| 4 | **Traductor canción web → motor** en TypeScript: estilos, variaciones melódicas, fills, swing, compás, secciones con arreglo propio, «Mis ritmos». Hay una versión en Dart ya escrita en el stash de la app (`web_catalog.dart`, `song_doc.dart`) | 5-8 días | Medio-alto: es donde vive la fidelidad |
| 5 | Cerrar §4 en el C++ (**arpegios descartados el 2026-09-22**: ningún ritmo integrado los usa) | 3-6 días | Medio: cambia la app también |
| 6 | **Lanzamiento con interruptor:** `?engine=app` primero, comparación con el corpus real (`tests/corpus`), luego por defecto, con el motor viejo como respaldo una versión | 3-5 días | Bajo |

Total aproximado: **4-6 semanas** de trabajo más tus pruebas. Las fases 1 y 2 se pueden
parar sin haber roto nada.

**Fuente única.** El núcleo vive en el repo de la app, que es su dueño. La web lleva una copia
comprobada por hash y el `.wasm` compilado, con el mismo patrón que ya usáis para
`shared/` (`npm run shared:export` / `tool/sync_shared.dart`). Así no hay dos motores
divergiendo.

## 7. Lo que se gana y lo que cuesta

**Se gana:**
- La misma música suena igual en web y app, y cada arreglo del motor sirve para las dos.
- Reproducción que no se corta por la interfaz ni al cambiar de pestaña.
- Cambios en vivo inmediatos.
- Exportación WAV en segundos e idéntica al directo.
- Un mezclador de verdad en la web (paneo y EQ por canal, medidores), que la interfaz nueva
  ya tiene dibujado.
- Desaparece la lista de diferencias de `reproduccion.md` §6.

**Cuesta:**
- El cambio de sonido de las canciones existentes (sección 5).
- Tocar el motor de la app, que acaba de dar problemas de rendimiento.
- Mantener una cadena de compilación WASM.
- Retirar buena parte del trabajo hecho en el motor web (reloj, precarga). El arnés del
  corpus se reaprovecha para comparar.

## 8. Siguiente paso recomendado

La **fase 1** (1-2 días, sin tocar nada de lo que funciona): un prototipo en el navegador con
el motor real, probado en tu móvil. Si ahí suena limpio con la interfaz abierta, el resto
del plan es trabajo conocido. Antes de la fase 4 hace falta tu decisión de la sección 5.
