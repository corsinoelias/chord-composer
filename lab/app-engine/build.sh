#!/usr/bin/env bash
# Builds public/lab/app-engine/: the Android app's audio engine as WebAssembly, the three
# default SoundFont programs, and the kit's recordings.
#
#   WASI_SDK=/path/to/wasi-sdk-25 ./build.sh
#
# The engine source is the app's, read from $APP and never edited: only its platform
# edge is swapped on the way in (no JNI, no reopen thread, no stream mutex — one thread
# owns the engine in a worklet) and AAudio comes from shim/, which forwards the engine's
# data callback to the worklet.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
APP=${APP:-/c/Users/Eliascorsino/Projects/chord_sequencer}
CPP="$APP/android/app/src/main/cpp"
OUT="$here/../../public/lab/app-engine"
mkdir -p "$OUT/drums" "$here/.build"

cp "$CPP/tsf.h" "$here/.build/"
line=$(grep -n "^Engine engine;" "$CPP/native_audio.cpp" | cut -d: -f1)
head -n "$line" "$CPP/native_audio.cpp" \
  | sed -e 's/^#include <jni.h>//' -e 's/^#include <mutex>//' -e 's/^#include <thread>//' \
        -e 's/std::lock_guard<std::mutex> lock(streamLock_);/spike_guard lock;/g' \
        -e 's/std::mutex streamLock_;/int streamLock_ = 0;/' \
        -e 's/    std::thread(\[engine = static_cast<Engine\*>(user), stream\] { engine->reopenAfterDisconnect(stream); }).detach();/    (void)user; (void)stream;/' \
  > "$here/.build/engine_core.inc"

"$WASI_SDK/bin/clang++" --sysroot="$WASI_SDK/share/wasi-sysroot" --target=wasm32-wasip1 -O3 \
  -fno-exceptions -std=c++17 -I"$here/shim" -I"$here/.build" -mexec-model=reactor \
  -Wl,--export=malloc -o "$OUT/engine.wasm" "$here/web_glue.cpp"

node "$here/../../docs/motor-unico-spike/sf2subset.mjs" "$APP/assets/sf2/GeneralUser.sf2" "$OUT/core.sf2" 0,25,33
for f in kick snare stick hat hatopen crash; do cp "$APP/assets/drums/$f.pcm" "$OUT/drums/"; done
echo "engine.wasm: $(wc -c < "$OUT/engine.wasm") bytes"
