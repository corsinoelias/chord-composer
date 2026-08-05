/**
 * Reloj con lookahead: despierta a intervalos cortos y pregunta "¿qué cae en la ventana que
 * viene?". Es el patrón "A Tale of Two Clocks" — el `setInterval` solo decide *cuándo mirar*;
 * los tiempos de audio siempre salen de `ctx.currentTime`.
 *
 * Qué arregla, con números medidos (`npm run test:jank`, CPU ×6, estilo metal a 140 BPM):
 *
 * Antes, el scheduler se re-agendaba con un `setTimeout` por acorde y programaba de golpe
 * los 16 slots de ese acorde. Esa ráfaga bloqueaba el hilo principal 44-67 ms de mediana,
 * justo el umbral de "long task" del navegador. Con `SCHEDULE_LOOKAHEAD_SEC` en 300 ms, una
 * ráfaga de 157 ms se comía la mitad del margen, y el scheduler acababa estorbándose a sí
 * mismo: 2 huecos audibles por cada 20 s, el mayor de 103 ms (`npm run test:timing`).
 *
 * Del desglose, el 58 % del coste era crear nodos y solo ~6 ms por acorde era preparación
 * irreducible. O sea: casi todo el trabajo es por slot y se puede repartir. Eso es lo que
 * hace este reloj — el mismo trabajo total, en trozos de 2-3 ms en vez de uno de 44.
 *
 * El intervalo es deliberadamente mucho más corto que la ventana: si un tick se pierde por
 * jank, el siguiente sigue llegando a tiempo de programar lo que venga. Ese solape es toda
 * la tolerancia a fallos que hay aquí.
 */

/** Cada cuánto se despierta. Corto y barato: si no hay nada que hacer, sale enseguida. */
const TICK_MS = 25;

/**
 * Cuánto se programa por delante. Igual que el `SCHEDULE_LOOKAHEAD_SEC` que sustituye: 300 ms
 * se eligió midiendo retrasos de hasta 2,85 s en hardware de móvil, y es 12 ticks de margen.
 */
const LOOKAHEAD_SEC = 0.3;

export interface Clock {
  /** Para el reloj. Idempotente. */
  stop(): void;
  /** Hasta qué instante hay que tener programado ahora mismo. */
  horizon(): number;
}

/**
 * Arranca un reloj que llama a `onTick(horizon)` cada 25 ms, donde `horizon` es el instante
 * hasta el que hay que dejar programado. El callback debe programar todo lo que caiga antes
 * de ese instante y devolver el control — nada de bucles largos.
 *
 * Se llama una vez de forma síncrona antes del primer intervalo, para que el primer sonido no
 * espere 25 ms de más.
 */
export function startClock(ctx: BaseAudioContext, onTick: (horizon: number) => void): Clock {
  let stopped = false;
  const horizon = () => ctx.currentTime + LOOKAHEAD_SEC;

  const tick = () => {
    if (stopped) return;
    onTick(horizon());
  };

  tick();
  const id = window.setInterval(tick, TICK_MS);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(id);
    },
    horizon,
  };
}

export { TICK_MS, LOOKAHEAD_SEC };
