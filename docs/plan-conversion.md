# Plan: mejorar la conversión antes de buscar más tráfico

Escrito el 2026-09-16. Datos de GA4 (propiedad 543619190), del 18 ago al 14 sep (28 días).

## Por qué ahora

El tráfico se ha duplicado en un mes (clics en Google: 3.552 → 7.193), pero casi nadie
convierte. Cada punto de conversión que ganamos ahora se multiplica por el crecimiento
que ya viene. Otro +30% de visitas con el embudo actual deja casi el mismo resultado.

## Qué es "conversión" aquí

El sitio es gratis, así que no hay venta. Usamos tres escalones, cada uno con su evento:

| Escalón | Qué significa | Evento(s) GA4 |
|---|---|---|
| **1. Escucha** | el visitante oye música | `play_song`, `play_song_section`, `play_chord_preview`, `play_progression` |
| **2. Crea** | abre el Chord Player y lo modifica | `song_editor_opened`, `chord_added`, `style_changed` |
| **3. Se queda** | crea cuenta o exporta | `sign_up`, `export_wav`, `export_midi`, `song_pdf_exported` |

## Punto de partida

**Usuarios totales:** ~9.300 en 28 días. El 88% son nuevos. 110 se registraron (1,2%).

### Páginas de canciones: aquí se pierde la mayoría

Las páginas `/songs/*` son la mayor fuente de tráfico: 3.308 usuarios y unas 3.000
sesiones de entrada. Casi no generan eventos clave.

```
3.308  ven una canción
 ~276  pulsan Play en la canción entera (8%)   (+234 una sección, +232 un acorde)
  163  escuchan ≥10 s
  105  escuchan ≥30 s
   63  escuchan ≥60 s
   44  abren el Chord Player (1,3%)            43 de ellos por el bloque bajo la partitura
    3  se registran (0,09%)
```

- El botón "Editor" de la barra del reproductor da 1 clic y el del panel de práctica
  otro. **Solo funciona el bloque bajo la partitura.**
- **Los 3 registros no son un fallo: la página no da ningún motivo para crear cuenta.**
  Compartir, imprimir, imagen y editar funcionan sin sesión. Por eso en canciones **no se
  mide `sign_up`**. Su trabajo es que el visitante escuche y pase al Chord Player, que es
  donde sí hay algo que guardar.
- La tasa de interacción en canciones es 47–61%, frente al 62–78% de las herramientas.

### Chord Player (`/chord-player/`)

| | Escritorio | Móvil |
|---|---:|---:|
| Ven la página | 1.635 | 834 |
| Reproducen (`play_progression`) | 998 (61%) | 419 (50%) |
| Pulsan "Guardar" (`save_cta_clicked`) | 96 (5,9%) | 44 (5,3%) |
| Se registran | 38 (2,3%) | 19 (2,3%) |

Esta página funciona razonablemente. La fuga está entre "reproduce" y "guarda":
de cada 10 que tocan música, menos de 1 intenta guardar.

### Móvil frente a escritorio (todo el sitio)

- **Tráfico:** el móvil ya es el 46% de los usuarios (4.317 frente a 4.689).
- **Interacción:** en móvil interactúa el 52% de las sesiones; en escritorio, el 65%.
- **Duración media:** 166 s en móvil frente a 342 s en escritorio.

### La medición tiene agujeros

1. **`song_play_stopped` está roto.** En `SongChordPlayer.tsx:181` el efecto se ejecuta
   al montar con `isPlaying=false` y dispara el evento a los 400 ms en *cada* visita.
   Por eso GA4 muestra 1.687 usuarios que "paran" y solo 276 que reproducen.
   Cualquier lectura de "cuánto escuchan" basada en este evento es falsa.
2. ~~`sign_up` casi nunca lleva `entry_point`~~ **Corregido el 16 sep:** sí lo lleva desde
   agosto (`AuthModal.tsx`). El "(not set)" era `save_cta_clicked`, que no tiene ese
   parámetro. Registros por origen: botón Guardar 56, barra de navegación 43,
   Chord Sheet Maker 3, biblioteca 3, aviso de exportación 2.
3. **Tráfico sin atribuir.** 680 sesiones entran con landing `(not set)` y solo interactúa
   el 17,6%. Otros 502 usuarios salen como `(not set)` en nuevo/recurrente.
   Hay que averiguar qué son.
4. **Home recién medida.** Sus eventos (`preview_*`, `home_link_clicked`) se publicaron el
   14 sep. Se leen a partir del 21 sep (ver la nota del rediseño de la home).

## El plan

Regla general: **un cambio por página y por semana.** Se mide martes–sábado contra
martes–sábado, nunca contando el día del deploy. El banner de la app Android está activo
en canciones y en el Chord Player hasta el 28 sep. Mientras tanto, los cambios en esas
páginas se miden **excluyendo Android** para no mezclar efectos.

### Fase 0: arreglar la medición (esta semana, ~1 día)

Sin esto, las fases siguientes no se pueden evaluar.

- [ ] Arreglar `song_play_stopped`: solo disparar si hubo reproducción en esta visita
      (p. ej. `playedMsRef.current > 0` o una ref `hasPlayedRef`).
- [ ] Investigar las sesiones `(not set)`: ¿bots?, ¿páginas sin GA?, ¿consentimiento?
- [ ] Crear un informe de embudo fijo (GA4 funnel) para cada uno de los dos embudos
      de arriba y apuntar la línea base con los datos corregidos (1 semana limpia).

### Fase 1: que más gente escuche en las canciones (semana del 22 sep)

**Objetivo:** subir los visitantes de canciones que oyen algo del ~8–10% al **15%**.

Es la mayor palanca: 3.300 usuarios al mes y 9 de cada 10 no pulsan nada.

Hipótesis, por orden:
1. **En móvil, el Play no se ve sin hacer scroll.** Hay que comprobarlo con una captura
   a 390 px. Si es así, poner un botón Play grande en la cabecera, junto al `<h1>`.
2. **El primer Play tarda.** Revisar `latency_ms_value` (se registra desde el 15 sep)
   por dispositivo. Si en móvil la media pasa de 1–2 s, precargar el audio al primer toque.
3. **No se entiende que la partitura suena.** Probar un texto corto del tipo
   "▶ Escucha la canción con acompañamiento".

**Se mide con:** usuarios con `song_audio_ready` ÷ usuarios que ven `/songs/*`, sin Android.

### Fase 2: de la canción al Chord Player (semana del 29 sep)

**Objetivo:** subir la apertura del editor desde canciones del 1,3% al **3%**.

- Mostrar el enlace al Chord Player **en el momento de valor**: cuando termina la
  reproducción (`reason: 'ended'`) o tras 30 s escuchando. Por ejemplo: "¿La quieres en
  otro tono o con otro ritmo? Ábrela en el Chord Player".
- En móvil, la barra del reproductor oculta su enlace al editor. Hay que decidir si
  vuelve a mostrarse o si se sustituye por el aviso de arriba.
- Quitar o reubicar los enlaces que no se usan (barra y panel: 1 clic cada uno). Así
  la atención va a uno solo.

**Se mide con:** `song_editor_opened` ÷ usuarios de `/songs/*`, por `entry_point`.

**Puerta falsa (misma semana): ¿quieren guardar canciones?** Un botón "Guardar en mi
repertorio" en la cabecera de la canción, que solo registra el clic
(`song_save_intent`) y responde "Muy pronto". No se construye nada detrás.
- Si en 2 semanas lo pulsa **≥3%** de los visitantes de canciones, se construye
  repertorio + tono recordado con login. Sería el primer motivo real para tener cuenta
  desde una canción, y la base de un posible plan para equipos de alabanza (setlists).
- Si no llega, se quita el botón y las canciones siguen siendo solo una puerta al Chord Player.
- Señal previa, floja: solo 23 usuarios transpusieron una canción en su página en 28 días.

### Fase 3: del Chord Player a la cuenta (en paralelo, desde el 29 sep)

**Objetivo:** subir el registro de quien reproduce en el Chord Player del ~4% al **7%**
(hoy: 57 registros sobre ~1.460 que reproducen).

Es otra página, así que puede ir en paralelo con la fase 2 sin mezclar resultados.

Embudo (28 días): 2.542 ven → 1.459 reproducen → **652 añaden acordes → 142 pulsan
Guardar (22%)** → 56 se registran desde ahí (39%; 3 de cada 4 con Google). Otros 34
cancelan el modal. **El formulario funciona; la fuga está antes:** 510 construyen algo y
se van sin guardar.

Un cambio por semana, en este orden:
1. **Aviso mientras construyen.** Tras 4–5 `chord_added` sin cuenta, un toast como el
   de exportar: "Tu progresión aún no está guardada. Guárdala gratis con Google".
2. **Aviso al guardar un ritmo.** `custom_style_saved` lo hacen 221 usuarios, sin login
   (se guarda en `localStorage`). Mensaje: "Guardado en este navegador. Crea una cuenta
   para tenerlo en todos tus dispositivos".
3. **(Después, con cuidado) borrador local para anónimos** y, al volver, "Tienes una
   progresión sin guardar". Riesgo: quita el miedo a perder el trabajo.
- El aviso tras exportar apenas convierte (116 lo ven → 13 clics → 2 registros).
  No se invierte más en él.
- **No** obligar a iniciar sesión para reproducir o exportar.

**Se mide con:** `sign_up` (con `entry_point`) ÷ usuarios con `play_progression`.

### Fase 4: que vuelvan (octubre, solo si las fases 1–3 funcionan)

Hoy el 12% de los usuarios son recurrentes. Esta fase se decide con los datos de las
anteriores; no se construye nada antes.

## Qué se pausa mientras tanto

- Herramientas o instrumentos nuevos, la versión iOS, el ritmo por sección.
- Proyectos SEO grandes (títulos, nuevas secciones).
- **Sigue** añadiendo canciones de la lista priorizada por volumen: es contenido barato y
  alimenta directamente la fase 1.

## Calendario

| Fecha | Qué |
|---|---|
| 16–19 sep | Fase 0: arreglos de medición, deploy |
| 21 sep | Leer los resultados de la home nueva (ya planificado) |
| 22–26 sep | Fase 1: cambio en canciones; línea base limpia de la fase 0 |
| 28 sep | Leer el banner de la app Android |
| 29 sep | Fase 2 (canciones) y fase 3 (Chord Player) |
| 30 sep–4 oct | Medir la fase 1 contra la línea base |
| 13 oct | Revisión: qué fase movió la aguja, siguiente paso |

## Objetivos a 4 semanas (13 oct)

| Métrica | Hoy | Objetivo |
|---|---:|---:|
| Canciones → escuchan | ~8–10% | 15% |
| Canciones → abren el Chord Player | 1,3% | 3% |
| Chord Player (reproducen) → registro | ~4% | 7% |
| Registros al mes | 110 | 200 |

Los porcentajes se recalculan con la línea base corregida de la fase 0. Si los datos
limpios cambian el punto de partida, se ajustan los objetivos y no se maquillan los datos.
