// AAudio for the web: just enough of Android's audio API for the app's engine to run in a
// browser AudioWorklet, unchanged.
//
// The engine opens a stream, hands it a data callback and waits to be called. Here opening
// always succeeds, the callback is kept, and the worklet calls it through wg_render() for
// every 128-frame quantum — the same contract AAudio gives it on the phone.
#pragma once
#include <cstdint>

typedef int32_t aaudio_result_t;
typedef int32_t aaudio_data_callback_result_t;
struct AAudioStream { int unused; };
struct AAudioStreamBuilder { int unused; };
enum {
  AAUDIO_OK = 0, AAUDIO_ERROR_DISCONNECTED = -899, AAUDIO_DIRECTION_OUTPUT = 0,
  AAUDIO_PERFORMANCE_MODE_LOW_LATENCY = 12, AAUDIO_SHARING_MODE_EXCLUSIVE = 0,
  AAUDIO_SHARING_MODE_SHARED = 1, AAUDIO_FORMAT_PCM_FLOAT = 2, AAUDIO_CALLBACK_RESULT_CONTINUE = 0,
};
typedef aaudio_data_callback_result_t (*AAudioStream_dataCallback)(AAudioStream*, void*, void*, int32_t);
typedef void (*AAudioStream_errorCallback)(AAudioStream*, void*, aaudio_result_t);

namespace web_aaudio {
inline AAudioStream stream;
inline AAudioStreamBuilder builder;
inline AAudioStream_dataCallback callback = nullptr;
inline void* user = nullptr;
inline int32_t sampleRate = 48000;   // the AudioContext's rate, set by the worklet
inline int32_t xruns = 0;            // the worklet has no way to know; kept for the API
}  // namespace web_aaudio

inline aaudio_result_t AAudio_createStreamBuilder(AAudioStreamBuilder** b) { *b = &web_aaudio::builder; return AAUDIO_OK; }
inline void AAudioStreamBuilder_setDirection(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setPerformanceMode(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setSharingMode(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setFormat(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setChannelCount(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setSampleRate(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setDataCallback(AAudioStreamBuilder*, AAudioStream_dataCallback cb, void* user) {
  web_aaudio::callback = cb;
  web_aaudio::user = user;
}
inline void AAudioStreamBuilder_setErrorCallback(AAudioStreamBuilder*, AAudioStream_errorCallback, void*) {}
inline aaudio_result_t AAudioStreamBuilder_openStream(AAudioStreamBuilder*, AAudioStream** s) { *s = &web_aaudio::stream; return AAUDIO_OK; }
inline void AAudioStreamBuilder_delete(AAudioStreamBuilder*) {}
inline int32_t AAudioStream_getSampleRate(AAudioStream*) { return web_aaudio::sampleRate; }
inline int32_t AAudioStream_getFramesPerBurst(AAudioStream*) { return 128; }
inline void AAudioStream_setBufferSizeInFrames(AAudioStream*, int32_t) {}
inline void AAudioStream_requestStart(AAudioStream*) {}
inline void AAudioStream_requestStop(AAudioStream*) {}
inline void AAudioStream_close(AAudioStream*) {}
inline int32_t AAudioStream_getXRunCount(AAudioStream*) { return web_aaudio::xruns; }
