#!/usr/bin/env bash
# Builds the Android app's audio engine, unchanged, as WebAssembly (the 2026-09-21 spike).
# Needs wasi-sdk 25 (https://github.com/WebAssembly/wasi-sdk/releases) at $WASI_SDK.
# Run from this folder; then `node run.mjs [bpm]` renders the demo song to out/song.wav.
set -euo pipefail
APP=${APP:-/c/Users/Eliascorsino/Projects/chord_sequencer/android/app/src/main/cpp}
cp "$APP/tsf.h" .
# The core is everything up to `Engine engine;`. Only the platform edge is swapped out:
# no JNI, no threads (the reopen-after-disconnect thread), and the stream mutex becomes
# a no-op — one thread owns the engine in a browser.
line=$(grep -n "^Engine engine;" "$APP/native_audio.cpp" | cut -d: -f1)
head -n "$line" "$APP/native_audio.cpp" \
  | sed -e 's/^#include <jni.h>//' -e 's/^#include <mutex>//' -e 's/^#include <thread>//' \
        -e 's/std::lock_guard<std::mutex> lock(streamLock_);/spike_guard lock;/g' \
        -e 's/std::mutex streamLock_;/int streamLock_ = 0;/' \
        -e 's/    std::thread(\[engine = static_cast<Engine\*>(user), stream\] { engine->reopenAfterDisconnect(stream); }).detach();/    (void)user; (void)stream;/' \
  > engine_core.inc
"$WASI_SDK/bin/clang++" --sysroot="$WASI_SDK/share/wasi-sysroot" --target=wasm32-wasip1 -O3 \
  -fno-exceptions -std=c++17 -Ishim -mexec-model=reactor -Wl,--export=malloc -o engine.wasm spike.cpp
mkdir -p out
echo "engine.wasm: $(wc -c < engine.wasm) bytes"
