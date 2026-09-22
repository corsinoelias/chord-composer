# Estudio: un solo catálogo de sonidos para la app y la web

Escrito el 2026-09-22. Estado: **decididos el clic, los platos, los ritmos y el paneo (§7b); falta la lista de sonidos, pad/cuerdas y la mezcla.** Datos sacados del código de los
dos repos ese día (`chord_sequencer` en `165d929`, la web en `534a83d`+).

Objetivo: que la app y la web tengan **los mismos sonidos, ganancias, volúmenes y ritmos**, y
que solo queden los más profesionales.

---

## 1. Resumen

- **El motor ya es común** (docs/motor-unico-wasm.md): los dos tocan con `native_audio.cpp` y el
  mismo SoundFont (GeneralUser, la web con una copia recortada) y las mismas grabaciones de
  batería con las mismas ganancias (`sampledDrumGains`, que `engine:sync` copia a `kit.json`).
  Lo que **no** es común es *qué se ofrece y con qué valores por defecto*: cada lado tiene su
  lista de sonidos, su mezcla por defecto y su colección de ritmos.
- **Sonidos:** hay duplicados (la web ofrece tres pianos que son el mismo piano de cola, tres
  guitarras dos veces), sonidos sintetizados de calidad menor (Sine, FM, Saw, Square, los dos
  kits sintetizados…) y huecos (la web no tiene Rhodes, órgano, contrabajo ni fretless; la app
  no tiene los que la web usa por nombre). Propuesta: **6 pianos/teclados, 6 guitarras, 6 bajos
  y 7 kits grabados**, todos del SoundFont o grabados; el SoundFont de la web **baja** de 6,29 MB
  a 5,82 MB.
- **Mezcla:** la misma canción suena con otro equilibrio en cada lado (la web con el bajo a la
  mitad que la app, sin paneo). Propuesta: una sola tabla de mezcla por defecto, la de la app.
- **Ritmos:** la web tiene 20, la app 17; 12 se llaman igual y al menos uno de esos
  (Reggaeton) no toca igual. Propuesta: un solo catálogo (`shared/catalog/styles.json`, que ya
  existe y que la app ya sabe leer en su rama de paridad), y decidir ritmo a ritmo **escuchando**.
- **Clic:** la web usa el cencerro y la app la baqueta. Uno de los dos.

Lo que sigue son las tablas y, al final (§7), lo que te toca decidir.

---

## 2. Piano / teclados

| Sonido | Programa GM | App | Web hoy | Peso (MB) | Propuesta |
|---|---|---|---|---|---|
| Grand Piano | 0 | Piano | sampled, acoustic, soft, upright (los cuatro = 0) | 2,08 | **Sí** (uno solo) |
| Bright Piano | 1 | Bright | bright | comparte muestras con 0 | **Sí** |
| E-Piano (Tine) | 4 | E-Piano | electric | 0,36 | **Sí** |
| Rhodes | 5 | Rhodes | — | 0,36 | **Sí** (falta en la web) |
| Órgano | 16 (Drawbar) | Organ (sintetizado) | — | 0,04 | **Sí, del SoundFont** en vez del sintetizado: gospel/coritos lo piden |
| Honky-Tonk | 3 | — | honkytonk | 2,28 | No: efecto, pesa mucho |
| Pad / cuerdas | 89 / 48 | Pad (sintetizado) | — | 2,34 | Opcional (ver §7): útil en baladas, pero +2,3 MB |
| Sine, FM | — | sintetizados | — | — | No |

## 3. Guitarra

| Sonido | Programa | App | Web hoy | Peso | Propuesta |
|---|---|---|---|---|---|
| Steel (acústica) | 25 | Steel | acoustic **y** sf2-steel | 0,39 | **Sí** (uno) |
| Nylon | 24 | Nylon | nylon **y** sf2-nylon | 0,40 | **Sí** (uno) |
| Clean (eléctrica) | 27 | Clean | electric **y** sf2-clean | 0,52 | **Sí** (uno) |
| Jazz | 26 | Jazz | sf2-jazz | 0,28 | **Sí** |
| Muted | 28 | Muted | sf2-muted | 0,05 | **Sí** |
| Overdrive | 29 | Overdrive | sf2-overdrive | 0,85 | **Sí** |
| Distortion | 30 | — | sf2-distortion | 0,80 | No: casi igual que Overdrive |
| Harmonics | 31 | — | sf2-harmonics | 0,04 | No: efecto |
| Overdrive syn., Muted syn., Pluck, Saw | — | sintetizados | — | — | No |

## 4. Bajo

| Sonido | Programa | App | Web hoy | Peso | Propuesta |
|---|---|---|---|---|---|
| Finger | 33 | Finger | finger **y** muted (= 33) | 0,10 | **Sí** (uno) |
| Pick | 34 | Pick | fender | 0,15 | **Sí** |
| Slap | 36 | Slap | slap | 0,09 | **Sí** |
| Upright (contrabajo) | 32 | Upright | — | 0,07 | **Sí** (jazz, bossa) |
| Fretless | 35 | Fretless | — | 0,13 | **Sí** |
| Sub (sintetizado) | — | Sub | sub | — | **Sí**: el grave del hip-hop/trap no tiene equivalente grabado |
| Reese, Square | — | sintetizados | synth (= Square) | — | No |

**Registro:** la app pone el bajo desde E2 (MIDI 40), la guitarra desde G3 (55) y el piano desde
C4 (60); la web, el bajo desde C2 (36) y la guitarra desde C4 (60). Con un catálogo común, el
registro debería ir con el sonido y ser el mismo en los dos lados.

## 5. Batería

| Kit | Tipo | App | Web hoy | Propuesta |
|---|---|---|---|---|
| Acoustic | grabado | sí (por defecto) | «standard» cae en él | **Sí**, por defecto |
| Acoustic 2 | grabado (Yamaha Oak) | sí, «a prueba» | — | **Sí** |
| Electronic | grabado (808 y clap reales, toms 909) | sí, «a prueba» | «electronic» (heredado) | **Sí** |
| AP1, Brutalist, Chase, Run It | grabados (hip-hop) | sí, «a prueba» | — | **Sí** los que pasen la escucha |
| Synth | sintetizado | sí | «analog», «lofi» | No |
| 808 | sintetizado | sí | «punch» | No: el Electronic tiene un 808 grabado |

- **Ganancias:** ya comunes (las de la app, `drum_gains.dart`, medidas por grabación).
- **Diferencia:** la web aplica además unos recortes propios a los platos (hi-hat ×0,7, abierto
  ×0,8, pedal ×0,6, ride ×0,7; `DRUM_TRIM` en `fromSong.ts`), heredados de su motor antiguo. La
  app no los tiene. Hay que elegir: o se meten en los patrones o se quitan.
- **Clic:** cencerro (web, desde hoy) o baqueta (app).

## 6. Mezcla y ritmos

### Mezcla por defecto

Lo que el motor recibe con una canción nueva, en los dos lados (volumen de la pista × master):

| Pista | App | Web (Pop 1) | Nota |
|---|---|---|---|
| Batería | 0,9 × 0,7 = **0,63** | 0,7 × 1 × 0,6 = **0,42** | |
| Piano | 0,7 × 0,7 = **0,49** | 0,7 × 0,7 × 1 = **0,49** | igual |
| Guitarra | 0,85 × 0,7 = **0,60** | 0,7 × 0,7 × 1,66 = **0,81** | la web la subió hoy |
| Bajo | 0,9 × 0,7 = **0,63** | 0,7 × 1 × 0,46 = **0,32** | la mitad |
| Paneo | piano −0,25, guitarra +0,3 | ninguno | |
| Reverb | tamaño 0,7, mezcla 0,18 | apagada | |

La web calcula su volumen con tres factores: el del instrumento, el del ritmo (`volumes` de cada
estilo) y el ajuste `MIX_TRIM`, calibrado para sonar como el motor web antiguo. La app usa uno:
el del mezclador. Propuesta: **una tabla de mezcla por defecto en el catálogo compartido**, la
de la app como punto de partida (incluido el paneo), y quitar `MIX_TRIM`. Los `volumes` de cada
ritmo solo si de verdad cambian de un ritmo a otro (hoy son casi todos iguales).

### Ritmos

| Ritmo | Web | App | Nota |
|---|---|---|---|
| Reggaeton | 95 | 95 | batería y bajo iguales; **piano distinto** (web: un acorde por compás; app: a contratiempo) |
| Pop | Pop 1 (85) | Pop Ballad (85) | |
| Rock | Rock Básico (120) | Rock Basic (120) | |
| Funk | 102 | 100 | |
| Blues Shuffle | 100, swing en el patrón | 95, swing 2 | |
| Jazz Swing | 130 | 130 | |
| Coritos | 151 | 151 | |
| Merengue | 130 | 130 | |
| R&B | 70 | 70 | |
| Reggae | 125 (id `bossa_light`) | 125 | el id web dice «bossa» y es reggae |
| Hip-Hop | Hip-Hop/Trap 95, Hip-Hop 2 90 | Hip-Hop 90 | |
| Folk / Indie | 90 | 90 | |
| Solo en la web | Pop 2, Pop 3, Pop 6/8, Disco, Metal, Metal 2, Reggae Two-Step | — | |
| Solo en la app | — | Bossa Nova, House, Ballad, Jazz Waltz, Slow 6/8 | |

Solo he comparado nota a nota el Reggaeton; los demás pares hay que escucharlos.

---

## 7. Lo que te toca decidir

1. **La lista de sonidos de §2-§5.** La tabla propone por criterio técnico (grabado frente a
   sintetizado, duplicados, peso); «el más profesional» se decide escuchando. Propongo añadir al
   laboratorio (`/lab/app-engine/`) una página de escucha: cada candidato tocando el mismo
   fragmento, uno detrás de otro, para marcar sí/no.
2. **Pad/cuerdas:** entra (+2,3 MB, cargado solo si una canción lo usa) o no.
3. **Clic:** cencerro o baqueta, en los dos.
4. **Recortes de platos de la web:** dentro de los patrones o fuera.
5. **Mezcla por defecto:** la de la app para los dos (con paneo), u otra.
6. **Ritmos:** para cada par de §6, qué versión gana, y qué hacer con los que solo tiene un lado
   (pasarlos al otro o quitarlos).

## 7b. Decidido (2026-09-22)

- **Clic: el cencerro en los dos.** Web hecho; en la app, `AppSettings.metronomeSound = countInSound`
  (`app_settings.dart`), sin commit hasta probar la app. Quien ya eligió otro clic lo conserva.
- **Platos sin recorte.** La web quita su `DRUM_TRIM`: los platos suenan al nivel del patrón, como en
  la app.
- **Ganan los ritmos de la web.** La app tendrá que tocar los de `shared/catalog/styles.json` (§8.3);
  es trabajo en la app, pendiente.
- **Paneo en la web** con los valores de la app: piano −0,25, guitarra +0,3, batería y bajo al centro
  (`PAN` en `fromSong.ts`).

## 7c. Página de escucha

`/lab/sounds/` (noindex; antes, una vez: `npm run lab:audition`, que prepara su SoundFont de 9 MB fuera
de git). Cada candidato toca Do–Lam–Fa–Sol a 92 BPM, solo, con el motor de la app: los programas del
SoundFont (también Rhodes, órgano, contrabajo, fretless, cuerdas y pad), los timbres sintetizados de la
app, los 9 kits y **las grabaciones de la web**, convertidas en el navegador a un SoundFont
(`src/lib/appEngine/sf2Writer.ts`) en el tono que suenan de verdad y con el nivel igualado. Las marcas
Sí/No se quedan en el navegador; «Copiar resultado» las da en texto.

## 8. Cómo se haría (cuando decidas)

1. **Catálogo único:** `shared/catalog/sounds.json` pasa a ser la lista (id, nombre, programa o
   kit, registro) y `styles.json` los ritmos, con la mezcla por defecto. Ya se exporta desde la
   web y la app lo lee en su rama de paridad (el stash del 2026-09-18).
2. **Web:** `instruments.ts` y los selectores leen del catálogo; los ids viejos (`sf2-steel`,
   `acoustic`…) se traducen al nuevo al abrir una canción, sin perder nada. `engine:sync` recorta
   el SoundFont con la lista nueva.
3. **App:** `timbreOptions`, `drumKits` y `stylePresets` salen del mismo catálogo.
4. **Canciones guardadas:** las que usen un sonido retirado pasan al más parecido de la lista
   (p. ej. Honky-Tonk → Bright, Distortion → Overdrive, kit Synth → Electronic).
