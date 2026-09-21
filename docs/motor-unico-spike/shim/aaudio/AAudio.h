// Spike stand-in: the engine's AAudio calls become no-ops; audio leaves through exportWav.
#pragma once
#include <cstdint>
typedef int32_t aaudio_result_t; typedef int32_t aaudio_data_callback_result_t;
struct AAudioStream {}; struct AAudioStreamBuilder {};
enum { AAUDIO_OK = 0, AAUDIO_ERROR_DISCONNECTED = -899, AAUDIO_DIRECTION_OUTPUT = 0, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY = 12,
  AAUDIO_SHARING_MODE_EXCLUSIVE = 0, AAUDIO_SHARING_MODE_SHARED = 1, AAUDIO_FORMAT_PCM_FLOAT = 2, AAUDIO_CALLBACK_RESULT_CONTINUE = 0 };
typedef aaudio_data_callback_result_t (*AAudioStream_dataCallback)(AAudioStream*, void*, void*, int32_t);
typedef void (*AAudioStream_errorCallback)(AAudioStream*, void*, aaudio_result_t);
inline aaudio_result_t AAudio_createStreamBuilder(AAudioStreamBuilder** b) { static AAudioStreamBuilder x; *b = &x; return 0; }
inline void AAudioStreamBuilder_setDirection(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setPerformanceMode(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setSharingMode(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setFormat(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setChannelCount(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setSampleRate(AAudioStreamBuilder*, int) {}
inline void AAudioStreamBuilder_setDataCallback(AAudioStreamBuilder*, AAudioStream_dataCallback, void*) {}
inline void AAudioStreamBuilder_setErrorCallback(AAudioStreamBuilder*, AAudioStream_errorCallback, void*) {}
inline aaudio_result_t AAudioStreamBuilder_openStream(AAudioStreamBuilder*, AAudioStream** s) { *s = nullptr; return -1; }
inline void AAudioStreamBuilder_delete(AAudioStreamBuilder*) {}
inline int32_t AAudioStream_getSampleRate(AAudioStream*) { return 48000; }
inline int32_t AAudioStream_getFramesPerBurst(AAudioStream*) { return 128; }
inline void AAudioStream_setBufferSizeInFrames(AAudioStream*, int32_t) {}
inline void AAudioStream_requestStart(AAudioStream*) {}
inline void AAudioStream_requestStop(AAudioStream*) {}
inline void AAudioStream_close(AAudioStream*) {}
inline int32_t AAudioStream_getXRunCount(AAudioStream*) { return 0; }
