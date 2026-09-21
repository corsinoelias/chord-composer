# Medir en un móvil real

Scripts que usaron las mediciones del 2026-09-21 (Pixel 8 Pro, Chrome 153). Controlan el
Chrome del móvil por el protocolo de DevTools y el sistema por `adb`.

1. Móvil por USB con depuración activada.
2. `npx astro dev --port 4322` (la CSP con `'wasm-unsafe-eval'` tiene que estar cargada).
3. `adb reverse tcp:4322 tcp:4322` y `adb forward tcp:9222 localabstract:chrome_devtools_remote`.
4. `node lab/app-engine/phone/lab-scenario.mjs <carpeta-capturas>`: el motor de la app en
   `/lab/app-engine/` — normal, interfaz atascada, pantalla apagada, Chrome en segundo plano.
5. `node lab/app-engine/phone/web-scenario.mjs`: lo mismo con el reproductor actual, medido por
   `public/lab/app-engine/tap-worklet.js` enganchado a su salida.
6. `bench.mjs` (Worker, reloj de alta resolución) y `worklet-bench.mjs` (en el hilo de audio):
   cuánto del bloque de 2,67 ms usa el motor.

El número de serie del móvil y la ruta de `adb` están escritos en los scripts.
