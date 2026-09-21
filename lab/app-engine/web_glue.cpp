// The Android app's audio engine (chord_sequencer/android/app/src/main/cpp/native_audio.cpp)
// built for a browser AudioWorklet. The engine itself is included unchanged — see build.sh
// for the handful of platform lines swapped on the way in — and this file is its web
// counterpart of the JNI bridge at the bottom of native_audio.cpp.
//
// Everything here runs on the audio rendering thread: the worklet calls these between
// quanta, so the engine's "platform thread" and "callback" are the same thread and none
// of its atomics are ever contended.
#include <cstdlib>
struct spike_guard {};
#include "engine_core.inc"
}  // closes the engine's anonymous namespace

namespace {
const char* kTracks[4] = {"drums", "piano", "guitar", "bass"};
int pack(int velocity, int degree, int octave = 0) { return velocity | (degree << 8) | ((octave + 8) << 12); }
}  // namespace

extern "C" {
#define WG(name) __attribute__((export_name(#name)))

WG(wg_alloc) void* wg_alloc(int bytes) { return malloc(bytes); }
WG(wg_set_rate) void wg_set_rate(int rate) { web_aaudio::sampleRate = rate; }

WG(wg_load_soundfont) int wg_load_soundfont(void* data, int bytes) {
  if (soundFont.load()) return 1;
  tsf* font = tsf_load_memory(data, bytes);
  free(data);
  if (!font) return 0;
  soundFont.store(font);
  engine.configureSoundFont();
  return 1;
}
WG(wg_load_sample) int wg_load_sample(int slot, void* pcm, int bytes, float gain) {
  const bool ok = sampleBank.load(slot, static_cast<const int16_t*>(pcm), bytes / 2, gain);
  free(pcm);
  return ok ? 1 : 0;
}

/// Opens the "stream": the engine builds its reverb and strips for the context's rate
/// and hands its callback to the shim, which wg_render calls from then on.
WG(wg_open) int wg_open() { return engine.openStream() ? 1 : 0; }
WG(wg_render) void wg_render(float* interleaved, int frames) {
  if (web_aaudio::callback) web_aaudio::callback(&web_aaudio::stream, web_aaudio::user, interleaved, frames);
}

WG(wg_start) int wg_start(int countInBeats) { return engine.start(countInBeats) ? 1 : 0; }
WG(wg_stop) void wg_stop() { engine.stop(); }
WG(wg_playing) int wg_playing() { return engine.playing() ? 1 : 0; }
WG(wg_set_bpm) void wg_set_bpm(float bpm) { engine.setBpm(bpm); }
WG(wg_set_swing) void wg_set_swing(float ratio) { engine.setSwing(ratio); }
WG(wg_loop_only) void wg_loop_only(int section) { engine.loopOnly(section); }
WG(wg_mixer) void wg_mixer(int track, float volume, int mute) { if (track >= 0 && track < 4) engine.mixer(kTracks[track], volume, mute != 0); }
WG(wg_reverb) void wg_reverb(float size, float mix) { engine.reverb(size, mix); }
WG(wg_metronome) void wg_metronome(int enabled) { engine.metronome(enabled != 0, .7f, kSStick, true, 1); }

/// Low 32 bits of the engine's position: step (0-7), chord (8-12), time round (13-15),
/// section (16-23), bar (24-27), count-in beats left (28-30).
WG(wg_position) int wg_position() { return static_cast<int>(engine.position() & 0x7fffffff); }
WG(wg_late_blocks) int wg_late_blocks() { return engine.lateBlocks(); }
WG(wg_load_average) float wg_load_average() { return engine.loadAverage(); }
WG(wg_load_peak) float wg_load_peak() { return engine.loadPeak(); }
WG(wg_reset_load) void wg_reset_load() { engine.resetLoad(); }

/// Two test songs, set up the way the app's Dart layer sets up any song: arrangement,
/// then per-section patterns and sounds. 0 = pop in D (verse / chorus), 1 = reggaeton in
/// A minor with the dembow on the kit.
WG(wg_demo_song) void wg_demo_song(int style) {
  engine.stop();
  engine.setMeter(16, 4);
  const char* pop[2][4][2] = {{{"D","maj"},{"A","maj"},{"B","min"},{"G","maj"}},
                              {{"G","maj"},{"A","maj"},{"F#","min"},{"B","min"}}};
  const char* reggaeton[2][4][2] = {{{"A","min"},{"F","maj"},{"C","maj"},{"G","maj"}},
                                    {{"F","maj"},{"G","maj"},{"A","min"},{"A","min"}}};
  const auto& song = style == 1 ? reggaeton : pop;
  engine.beginArrangement(2);
  for (int s = 0; s < 2; ++s) {
    engine.section(s, 2, false, 4);
    for (int i = 0; i < 4; ++i) engine.chord(s, i, song[s][i][0], song[s][i][1], 8, -1);
  }
  engine.commitArrangement();
  for (int s = 0; s < 2; ++s) {
    engine.clearTrack(s, "drums");
    for (const char* t : {"piano", "guitar", "bass"}) {
      engine.clearTrack(s, t);
      engine.setTimbre(s, t, kSampled);
    }
    engine.setDrumSound(s, "kick", kSKick);
    engine.setDrumSound(s, "snare", kSSnare);
    engine.setDrumSound(s, "rim", kSStick);
    engine.setDrumSound(s, "hihat", kSHat);
    engine.setDrumSound(s, "hihatOpen", kSHatOpen);
    engine.setDrumSound(s, "crash", kSCrash);
    const bool chorus = s == 1;
    for (int step = 0; step < 16; ++step) {
      if (style == 1) {
        // Dembow: four on the floor, the snare on the "3 . . 6" of each half bar.
        if (step % 4 == 0) engine.setStep(s, "drums", "kick", step, pack(230, 1));
        if (step == 3 || step == 6 || step == 11 || step == 14) engine.setStep(s, "drums", "snare", step, pack(210, 1));
        if (step % 2 == 0) engine.setStep(s, "drums", "hihat", step, pack(chorus ? 170 : 120, 1));
        // Tresillo stabs on the piano, bass on the same 3-3-2.
        if (step == 0 || step == 3 || step == 6 || step == 8 || step == 11 || step == 14) {
          engine.setStep(s, "piano", "", step, pack(step % 8 == 0 ? 200 : 150, 1));
        }
        if (step == 0 || step == 6 || step == 8 || step == 14) engine.setStep(s, "bass", "", step, pack(220, step == 14 ? 4 : 2));
        if (chorus && step % 4 == 2) engine.setStep(s, "guitar", "", step, pack(120, 1));
      } else {
        engine.setStep(s, "drums", "hihat", step, step % 2 == 0 ? pack(180, 1) : pack(90, 1));
        if (step % 8 == 0) engine.setStep(s, "drums", "kick", step, pack(230, 1));
        if (step % 8 == 4) engine.setStep(s, "drums", "snare", step, pack(220, 1));
        if (chorus && step == 0) engine.setStep(s, "drums", "crash", step, pack(150, 1));
        if (step % 4 == 0) engine.setStep(s, "piano", "", step, pack(200, 1));
        if (step % 4 == 2) engine.setStep(s, "piano", "", step, pack(120, 4));
        if (step % 2 == 0) engine.setStep(s, "guitar", "", step, pack(chorus ? 150 : 110, 1));
        if (step % 8 == 0) engine.setStep(s, "bass", "", step, pack(220, 2));
        if (step == 14) engine.setStep(s, "bass", "", step, pack(160, 4));
      }
    }
  }
  engine.reverb(.5f, .22f);
}
}

int main() { return 0; }
