## Objetivo
Hacer que el panel **Mixing Console** afecte realmente el sonido (EQ, Reverb, Compresor) en lugar de solo mover sliders sin efecto.

## Diagnóstico

Hoy el panel no funciona por dos razones:

1. **Los nodos de efectos nunca se insertan en la cadena de audio.** En `audioEngine.ts` la cadena es:
   ```
   masterGain → analyser → destination
   ```
   Los nodos creados en `audioEffects.ts` (`eqLowNode`, `compressorNode`, `reverbConvolverNode`, etc.) existen pero están desconectados, así que mover los sliders no cambia nada.

2. **El `AudioContext` se recrea en cada Stop** (`stopPlayback` cierra el contexto y lo pone a `null`). Los nodos de efectos quedan inservibles (pertenecen a un contexto cerrado), y el `effectsInitialized = true` impide volver a crearlos. Además, el estado actual del panel se pierde cuando se cierra el `Sheet` porque vive solo en `useState` local.

## Cambios

### 1. `src/lib/audioEffects.ts` — reescribir la cadena
- Añadir `buildEffectsChain(ctx, input, output)` que crea EQ low → mid → high → compressor → split (dry + wet via convolver) → output, devuelve el nodo de **entrada** de la cadena.
- Eliminar el flag `effectsInitialized` global; en su lugar guardar los nodos por contexto (`WeakMap<AudioContext, Nodes>`) para que al recrear el contexto se reconstruyan limpios.
- Mantener un **`currentEffectsState`** en módulo (fuente de verdad), inicializado a `DEFAULT_EFFECTS_STATE`. Las funciones `updateEQ/updateReverb/updateCompressor` actualizan ese estado **y** aplican al nodo activo si existe.
- Exponer `getCurrentEffectsState()` para que el panel hidrate sus sliders al abrirse.
- Reverb: cuando `enabled = false`, `wetGain = 0`; cuando `true`, usar el `wetDry` del estado (no el 0.3 fijo del bug actual).

### 2. `src/lib/audioEngine.ts` — insertar la cadena
En `getAudioContext()`, donde hoy hace:
```ts
masterGain.connect(analyserNode);
analyserNode.connect(audioContext.destination);
```
cambiar por:
```ts
const effectsInput = buildEffectsChain(audioContext, masterGain, analyserNode);
// masterGain ya queda conectado a effectsInput dentro de buildEffectsChain
analyserNode.connect(audioContext.destination);
```
Re-aplicar `currentEffectsState` al final para que la sesión nueva refleje los ajustes que el usuario ya tenía.

### 3. `src/components/MixingConsole.tsx` — persistir UI
- Inicializar `useState<EffectsState>(getCurrentEffectsState())` en lugar de `DEFAULT_EFFECTS_STATE`, para que al reabrir el panel se vean los valores reales.
- Quitar la llamada a `initializeEffects()` (ya no existe; la cadena se construye al crear el contexto).
- El resto de handlers se mantiene: siguen llamando `updateEQ/Reverb/Compressor`, que ahora sí afectan al audio.

### 4. Verificación
- Reproducir una progresión, abrir el panel, subir +12 dB en Low → debe oírse más graves.
- Activar Reverb con wet 100% → debe escucharse cola de reverberación.
- Activar Compresor con threshold -40 / ratio 20 → la dinámica se aplana.
- Cerrar y reabrir el Sheet → los sliders mantienen sus valores.
- Pulsar Stop y volver a Play → los efectos siguen aplicándose (el contexto nuevo reconstruye la cadena con `currentEffectsState`).

## Fuera de alcance
- No se cambian estilos del panel ni se añaden efectos nuevos (delay, chorus, etc.).
- El export WAV (`OfflineAudioContext`) seguirá sin efectos por ahora; si lo quieres también, lo podemos hacer en una siguiente iteración.
