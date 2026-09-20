# Reglas de reproducción (web = referencia)

Qué notas genera una canción. La web es la referencia sonora
(`docs/plan-paridad-web-app.md`, regla 0): esto describe lo que hace hoy su motor, con el
archivo que lo implementa, y la app Flutter (`chord_sequencer`) tiene que cumplirlo. Al final
están las diferencias que la app todavía tiene: esa lista es el trabajo que queda de la fase 3.

## 1. Tiempo

- Rejilla de semicorcheas: 4 slots por pulso de negra. Slots por compás =
  `numerador × 16 / denominador` (`styles.getSlotsPerBar`): 4/4 = 16, 3/4 = 12, 6/8 = 12.
- Un acorde dura `duration` pulsos (medios permitidos) = `duration × 4` slots.
- El patrón corre por **slot global**, no por acorde: `patternSlot = slotGlobal % slotsPorCompás`,
  `compás = floor(slotGlobal / slotsPorCompás) + 1` (`audioEngine.scheduleProgression`).
- Swing (`styles.getSwingOffset`): solo el "y" de cada pulso (slot ≡ 2 mod 4) se retrasa;
  0 = 50 % del pulso, 1 = 66,7 %. La app usa ratio: `ratio = p / (1 − p)`, `p = 0,5 + swing/6`
  (`WebCatalog.swingRatio`).
- `repeatCount` repite la sección entera; el contador global de slots no se reinicia.

## 2. Patrón de un compás (`styles.generateBarPattern`)

- Con `loopBars > 1`, cada array tiene `slotsPorCompás × loopBars` y se toma el trozo
  `((compás − 1) % loopBars)`.
- **Fill**: se aplica cuando `compás % frase == 0`, con `frase = 8` si la canción (o la
  sección en bucle) tiene ≥ 8 compases y `4` si no. Desde `fill.position` hasta el final del
  compás, cada fila que el fill define sustituye a la del groove (incluidos sus silencios).
  Las filas que el fill no define siguen con el groove.
- Regla de interacción: donde suena la caja, el hi-hat cerrado se multiplica por
  `INTERACTION_RULES.hihatSoftensOnSnare`.
- El export `shared/catalog/styles.json` incluye `rendered.bars` (compases ya calculados con
  estas reglas) y `rendered.fill`; la app construye sus presets a partir de ahí.

## 3. Notas de un slot (`engine/eventBuilder.buildSlotEvents`)

Acorde en MIDI (`musicTheory.chordToMidiNotes`): raíz en la octava 4 (C4 = 60 … B4 = 71),
intervalos de `chords.json` encima; con barra (`bassNote`), esa nota va **debajo** de las
demás (primera del array). Luego se suma la transposición.

| Pista | Con variación melódica | Sin variación (fila `rhythm`) |
|---|---|---|
| Piano / guitarra | ver abajo | todas las notas del acorde juntas, duración 3 slots; o arpegio si `arpeggios[slot]` |
| Bajo | ver abajo | `midiNotes[0]` (la nota del bajo si hay barra), duración 2 slots |
| Batería | — | cada pieza con velocidad × `DRUM_TRIM` (hihat 0,7, abierto 0,8, pedal 0,6, ride 0,7) |

Variación melódica (`bassScale`): `slotEnLoop = slotGlobal % (loopBars × slotsPorCompás)`.
- `chordHit[slot] > 0` → todas las notas del acorde.
- Cada grado `d` con velocidad > 0 → `midiNotes[0] + escala[d − 1] + octaveOffsets[d] × 12`,
  con `escala = getScale(calidad)` (menor si empieza por `min`, mixolidia si `7`, disminuida,
  aumentada, mayor en el resto — también `m7b5`). Duración 3 slots. **Cuenta desde
  `midiNotes[0]`, que en un acorde con barra es la nota del bajo.**
- Variación elegida: la de `sección.<pista>VariationId`, o la primera si el id no existe.

Arpegios (`applyArpeggioOrder`): `up`, `down`, `updown`, `random`; notas por slot: slow 2,
normal 4, fast 8, veryfast 16; cada nota dura `slot / n × 1,5`. `random` usa `Math.random`.

Sonido: cada sonido desplaza su pista `octaveOffset` octavas (`instruments.ts`; los bajos −1 a −3).

## 4. Sección con arreglo propio (`sectionPlayback.resolveSectionPlayback`)

- Sin `styleId`, `trackStyles`, `patterns`, `silenced` ni `sounds` → exactamente lo anterior.
- Estilo por pista: `patterns[pista]` > `trackStyles[pista]` > `styleId` > estilo de la canción.
  Estilos de otro compás se ignoran para esa pista.
- El estilo compuesto toma: filas de cada pista de su fuente (repetidas hasta el `loopBars`
  mayor), swing y fill de la fuente de la batería, arpegios y variaciones de cada pista.
  **Volúmenes y sonidos por defecto siguen siendo los de la canción.**
- `silenced[pista]` → esa pista no genera eventos en la sección.
- `sounds[pista]` → ese sonido solo en la sección (se precarga igual que el de la canción).

## 5. Mezcla

Nivel de bus = `volumen del instrumento × style.volumes[instrumento]` (guitarra sin volumen
propio usa el del piano). Mute/solo por `isInstrumentAudible`. Cadena: EQ, reverb, compresor
y limitador (`audioEffects.buildEffectsChain`).

## 6. Diferencias que la app todavía tiene (trabajo pendiente de la fase 3)

1. **Fills**: la app toca el fill de frase cada 8 compases **contados desde el inicio de la
   sección**, más un fill de transición en el último compás de la última repetición y un crash
   al entrar la siguiente. La web: frase de 4 u 8 según la longitud total, contada en toda la
   canción, sin fill de transición ni crash. Para canciones que vienen de la web la app debería
   seguir la regla web (y dejar la suya como opción de sección).
2. **Arpegios**: la app no los tiene; toca el acorde en bloque donde la web arpegia.
3. **Registro**: la app coloca la raíz en una ventana de dos octavas por pista. Para canciones
   de la web, `SongDoc.decode` pone la ventana donde la web (piano y guitarra desde C4, bajo
   desplazado por su `octaveOffset`), así que la raíz cae igual; el bajo con barra puede quedar
   una octava por encima de la web (la web lo coloca bajo el acorde).
4. **Duraciones**: la app sostiene la nota hasta el siguiente golpe o `noteLength`; la web
   corta a 3 slots (2 en el bajo sin variación).
5. **Pasos de más de dos notas**: una variación web con tres grados en el mismo slot se queda
   con los dos más graves en la app.
6. **Sonidos melódicos**: la batería "standard" ya suena con las mismas grabaciones (kit
   "Web" en la app). Piano, bajo y guitarra usan todavía programas del SoundFont de la app
   (`shared/catalog/sounds.json`, campo `app`), no las muestras de la web.
7. **Aleatorio**: `random` (arpegio) y el hi-hat abierto (elige entre 3 grabaciones) no tienen
   semilla en vivo en la web; en la app el hi-hat abierto es siempre la misma grabación.

Cómo verificar cada arreglo: exportar MIDI de la misma canción en la web (`exportMidi` solo da
acordes hoy) y en la app, o comparar el volcado de eventos del arnés
(`node tests/corpus/run-corpus.mjs --only <id> --dump`) con el de la app cuando exista su
volcado equivalente.
