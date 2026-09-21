# Estudio: usar en la web el motor de audio de la app

Escrito el 2026-09-21. Estado: **estudio y prueba técnica hechos; nada implementado ni en la
web ni en la app.** La prueba es reproducible en `docs/motor-unico-spike/`.

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

Mi recomendación es **B si el piano de la web es parte de la identidad del sitio; si no, A.**

## 6. Plan por fases

| Fase | Qué | Esfuerzo | Riesgo |
|---|---|---|---|
| 1 | **Prototipo en navegador:** AudioWorklet + el `.wasm` + la canción de prueba, abierto en tu móvil y en un iPhone. Medir cortes y carga (el motor ya mide su propia carga y los bloques tardíos) | 1-2 días | Bajo; no toca ni la web ni la app |
| 2 | Separar en la app el **núcleo** (`engine_core`) de la **plataforma** (AAudio/JNI). La app debe quedar idéntica; tú la pruebas con sus métricas de carga | 2-3 días | Medio: toca la app (ojo con la caída de rendimiento del 18 sep) |
| 3 | **Host web:** worklet con la misma API que el JNI; posición y notas que suenan hacia la interfaz por mensajes; carga y caché del SoundFont y la batería; exportación WAV en un Worker con el mismo `.wasm` | 4-6 días | Medio: Safari iOS (AudioWorklet existe desde 14.5); frecuencia de muestreo a 48 kHz |
| 4 | **Traductor canción web → motor** en TypeScript: estilos, variaciones melódicas, fills, swing, compás, secciones con arreglo propio, «Mis ritmos». Hay una versión en Dart ya escrita en el stash de la app (`web_catalog.dart`, `song_doc.dart`) | 5-8 días | Medio-alto: es donde vive la fidelidad |
| 5 | Cerrar §4 en el C++ (arpegios primero) | 3-6 días | Medio: cambia la app también |
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
