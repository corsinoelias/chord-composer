// The Android app's audio engine, built for a browser AudioWorklet: the web's counterpart
// of the JNI bridge at the bottom of native_audio.cpp.
//
// vendor/native_audio.cpp is the app's file, copied unchanged by `npm run engine:sync`
// (never edit it here — the app owns it). Built with CHORD_AUDIO_WEB, it leaves out JNI and
// the stream's lock and reconnect thread, and takes AAudio from shim/, which hands the
// engine's data callback to the worklet.
//
// One export per JNI function, same order and same arguments, so a call the app makes can
// be made from the web the same way (src/lib/appEngine/host.ts names them after the Dart
// side). Strings arrive as NUL-terminated UTF-8 the caller has written into wasm memory.
//
// Everything here runs on one thread — the audio rendering thread in the worklet, or the
// export Worker — so the engine's "platform thread" and "callback" never run at once and
// none of its atomics are ever contended.
#include <cstdlib>
#include "native_audio.cpp"

extern "C" {
#define WG(name) __attribute__((export_name(#name)))

// ── Memory and setup ──
WG(wg_alloc) void* wg_alloc(int bytes) { return malloc(bytes); }
WG(wg_free) void wg_free(void* pointer) { free(pointer); }
/// The rate the "stream" opens at: the AudioContext's. Assets are recorded at 48 kHz, so
/// the host asks for a 48 kHz context.
WG(wg_set_rate) void wg_set_rate(int rate) { web_aaudio::sampleRate = rate; }

/// Takes ownership of [data] (from wg_alloc): tsf copies what it needs and it is freed.
WG(wg_load_soundfont) int wg_load_soundfont(void* data, int bytes) {
  if (soundFont.load()) { free(data); return 1; }  // load once, like the app
  tsf* font = tsf_load_memory(data, bytes);
  free(data);
  if (!font) return 0;
  soundFont.store(font);
  engine.configureSoundFont();
  return 1;
}
/// Takes ownership of [pcm] (from wg_alloc): the bank copies it and it is freed.
WG(wg_load_sample) int wg_load_sample(int slot, void* pcm, int bytes, float gain) {
  const bool ok = sampleBank.load(slot, static_cast<const int16_t*>(pcm), bytes / 2, gain);
  free(pcm);
  return ok ? 1 : 0;
}
WG(wg_has_instruments) int wg_has_instruments() { return engine.hasInstruments() ? 1 : 0; }

// ── Output ──
/// Opens the "stream": the engine tunes its reverb and strips to the rate and hands its
/// data callback to the shim, which wg_render calls from then on.
WG(wg_open) int wg_open() { return engine.openStream() ? 1 : 0; }
WG(wg_close) void wg_close() { engine.closeStream(); }
/// One quantum of interleaved stereo float, exactly as AAudio would ask for it.
WG(wg_render) void wg_render(float* interleaved, int frames) {
  if (web_aaudio::callback) web_aaudio::callback(&web_aaudio::stream, web_aaudio::user, interleaved, frames);
}

// ── Transport ──
WG(wg_start) int wg_start(int countInBeats) { return engine.start(countInBeats) ? 1 : 0; }
WG(wg_stop) void wg_stop() { engine.stop(); }
WG(wg_playing) int wg_playing() { return engine.playing() ? 1 : 0; }
WG(wg_set_bpm) void wg_set_bpm(float bpm) { engine.setBpm(bpm); }
WG(wg_set_swing) void wg_set_swing(float ratio) { engine.setSwing(ratio); }
WG(wg_set_meter) void wg_set_meter(int stepsPerBar, int stepsPerBeat) { engine.setMeter(stepsPerBar, stepsPerBeat); }
WG(wg_loop_only) void wg_loop_only(int section) { engine.loopOnly(section); }
/// The engine's position, in two halves because it is 64 bits: the low word packs step
/// (0-7), chord (8-12), time round (13-15), section (16-23), bar (24-27) and count-in
/// beats left (28-30); the high word is the step within the chord.
WG(wg_position_lo) int wg_position_lo() { return static_cast<int>(engine.position() & 0xffffffff); }
WG(wg_position_hi) int wg_position_hi() { return static_cast<int>(engine.position() >> 32); }

// ── The song ──
WG(wg_begin_arrangement) void wg_begin_arrangement(int count) { engine.beginArrangement(count); }
WG(wg_section) void wg_section(int index, int loop, int infinite, int chordCount) { engine.section(index, loop, infinite != 0, chordCount); }
WG(wg_chord) void wg_chord(int section, int index, const char* root, const char* type, int halfBeats, int bass) { engine.chord(section, index, root, type, halfBeats, bass); }
WG(wg_commit_arrangement) void wg_commit_arrangement() { engine.commitArrangement(); }
WG(wg_set_step) void wg_set_step(int section, const char* track, const char* row, int step, int value) { engine.setStep(section, track, row, step, value); }
WG(wg_clear_track) void wg_clear_track(int section, const char* track) { engine.clearTrack(section, track); }
WG(wg_set_program) void wg_set_program(int section, const char* track, int program) { engine.setProgram(section, track, program); }
WG(wg_set_timbre) void wg_set_timbre(int section, const char* track, int value) { engine.setTimbre(section, track, value); }
WG(wg_set_note_length) void wg_set_note_length(int section, const char* track, float steps) { engine.setNoteLength(section, track, steps); }
WG(wg_set_drum_sound) void wg_set_drum_sound(int section, const char* row, int value) { engine.setDrumSound(section, row, value); }
WG(wg_set_silence) void wg_set_silence(int section, const char* track, int silent) { engine.setSilence(section, track, silent != 0); }
WG(wg_set_pattern_bars) void wg_set_pattern_bars(int section, const char* track, int bars) { engine.setPatternBars(section, track, bars); }
WG(wg_set_fill) void wg_set_fill(int section, int from, int mask, const int* steps, int count) { engine.setFill(section, from, mask, steps, count); }
WG(wg_voicing) void wg_voicing(int section, const char* track, int low, int high) { engine.voicing(section, track, low, high); }

// ── Mix ──
WG(wg_mixer) void wg_mixer(const char* track, float volume, int mute) { engine.mixer(track, volume, mute != 0); }
WG(wg_pan) void wg_pan(const char* track, float value) { engine.pan(track, value); }
WG(wg_reverb) void wg_reverb(float size, float mix) { engine.reverb(size, mix); }
WG(wg_strip) void wg_strip(const char* track, float low, float mid, float high, float threshold, float ratio) { engine.strip(track, low, mid, high, threshold, ratio); }
WG(wg_level) float wg_level(int bus) { return engine.level(bus); }
WG(wg_gain_reduction) float wg_gain_reduction(int bus) { return engine.gainReduction(bus); }
WG(wg_metronome) void wg_metronome(int enabled, float volume, int sound, int accent, int division) { engine.metronome(enabled != 0, volume, sound, accent != 0, division); }

// ── Previews ──
WG(wg_preview_click) void wg_preview_click() { engine.previewClick(); }
WG(wg_preview_chord) void wg_preview_chord(int section, int root, const char* type, int bass, const char* track) { engine.preview(section, root, type, bass, track); }
WG(wg_preview_off) void wg_preview_off(const char* track) { engine.previewOff(track); }
WG(wg_preview_drum) void wg_preview_drum(int section, const char* row) { engine.previewDrum(section, row); }

// ── What is sounding ──
WG(wg_sounding) int wg_sounding(int track, int word) { return static_cast<int>(engine.soundingWord(track, word)); }
WG(wg_struck) int wg_struck(int track, int word) { return static_cast<int>(engine.struckWord(track, word)); }
WG(wg_drum_struck) int wg_drum_struck() { return static_cast<int>(engine.drumStruckWord()); }

// ── Load (the engine's own meters; its clock in a worklet is Date.now(), so coarse) ──
WG(wg_load_average) float wg_load_average() { return engine.loadAverage(); }
WG(wg_load_peak) float wg_load_peak() { return engine.loadPeak(); }
WG(wg_late_blocks) int wg_late_blocks() { return engine.lateBlocks(); }
WG(wg_reset_load) void wg_reset_load() { engine.resetLoad(); }

// ── File export ──
/// Renders the song to a 16-bit WAV at [path] through the same signal path as playback.
/// Only in the export Worker, whose WASI layer keeps the file in memory.
WG(wg_export_wav) int wg_export_wav(const char* path, int steps, float tail) { return engine.exportWav(path, steps, tail); }
WG(wg_export_progress) float wg_export_progress() { return engine.exportProgress(); }
}

int main() { return 0; }
