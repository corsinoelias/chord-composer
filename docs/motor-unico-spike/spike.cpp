// Spike: the Android app's audio engine, unchanged, compiled to WebAssembly.
// Only the platform edge is replaced (see shim/): output goes through exportWav.
#include <cstdlib>
struct spike_guard {};
#include "engine_core.inc"
}  // closes the engine's anonymous namespace

static int pack(int velocity, int degree, int octave = 0) { return velocity | (degree << 8) | ((octave + 8) << 12); }

extern "C" {
__attribute__((export_name("sp_alloc"))) void* sp_alloc(int bytes) { return malloc(bytes); }
__attribute__((export_name("sp_load_soundfont"))) int sp_load_soundfont(void* data, int bytes) {
  tsf* font = tsf_load_memory(data, bytes);
  if (!font) return 0;
  soundFont.store(font);
  engine.configureSoundFont();
  return 1;
}
__attribute__((export_name("sp_load_sample"))) int sp_load_sample(int slot, void* pcm, int bytes, float gain) {
  return sampleBank.load(slot, static_cast<const int16_t*>(pcm), bytes / 2, gain) ? 1 : 0;
}
// A realistic song: 2 sections x 4 chords, 4 beats each, verse x4 and chorus x4 (32 bars),
// piano / guitar / bass on the SoundFont, a sampled kit, reverb on.
__attribute__((export_name("sp_demo_song"))) int sp_demo_song(float bpm) {
  engine.setBpm(bpm);
  engine.setMeter(16, 4);
  const char* verse[4][2] = {{"D","maj"},{"A","maj"},{"B","min"},{"G","maj"}};
  const char* chorus[4][2] = {{"G","maj"},{"A","maj"},{"F#","min"},{"B","min"}};
  engine.beginArrangement(2);
  engine.section(0, 4, false, 4);
  engine.section(1, 4, false, 4);
  for (int i = 0; i < 4; ++i) {
    engine.chord(0, i, verse[i][0], verse[i][1], 8, -1);
    engine.chord(1, i, chorus[i][0], chorus[i][1], 8, -1);
  }
  engine.commitArrangement();
  for (int s = 0; s < 2; ++s) {
    for (const char* t : {"piano", "guitar", "bass"}) {
      engine.setTimbre(s, t, kSampled);
    }
    // Sampled kit: kick, snare, closed and open hat, crash.
    engine.setDrumSound(s, "kick", kSKick);
    engine.setDrumSound(s, "snare", kSSnare);
    engine.setDrumSound(s, "hihat", kSHat);
    engine.setDrumSound(s, "hihatOpen", kSHatOpen);
    engine.setDrumSound(s, "crash", kSCrash);
    for (int step = 0; step < 16; ++step) {
      engine.setStep(s, "drums", "hihat", step, step % 2 == 0 ? pack(180, 1) : pack(90, 1));
      if (step % 8 == 0) engine.setStep(s, "drums", "kick", step, pack(230, 1));
      if (step % 8 == 4) engine.setStep(s, "drums", "snare", step, pack(220, 1));
      // Piano: the chord on every beat, a passing fifth on the off-beats.
      if (step % 4 == 0) engine.setStep(s, "piano", "", step, pack(200, 1));
      if (step % 4 == 2) engine.setStep(s, "piano", "", step, pack(120, 4));
      // Guitar strums eighths; bass root on 1 and 3, fifth on the "and" of 4.
      if (step % 2 == 0) engine.setStep(s, "guitar", "", step, pack(140, 1));
      if (step % 8 == 0) engine.setStep(s, "bass", "", step, pack(220, 2));
      if (step == 14) engine.setStep(s, "bass", "", step, pack(160, 4));
    }
  }
  engine.reverb(.5f, .25f);
  return 1;
}
__attribute__((export_name("sp_export"))) int sp_export(int steps, float tail) {
  return engine.exportWav("/out/song.wav", steps, tail);
}
}
int main() { return 0; }
