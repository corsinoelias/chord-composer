// The engine is shared with the website (chord-composer), which builds this same file for a
// browser AudioWorklet with CHORD_AUDIO_WEB defined. The only differences are at the
// platform edge — JNI, the log, and the lock and thread around the output stream — and
// every one of them is marked below. Without CHORD_AUDIO_WEB, which is every Android
// build, the compiler sees exactly the code it always did.
#include <aaudio/AAudio.h>
#ifndef CHORD_AUDIO_WEB
#include <android/log.h>
#include <jni.h>
#endif
#include <atomic>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstdio>
#include <ctime>
#ifndef CHORD_AUDIO_WEB
#include <mutex>
#include <thread>
#endif

#define TSF_IMPLEMENTATION
#include "tsf.h"

// In a browser the engine lives on one thread, the audio thread: the page's calls are
// applied there between blocks, so nothing else ever opens or closes the stream.
#ifndef CHORD_AUDIO_WEB
#define CHORD_STREAM_LOCK() std::lock_guard<std::mutex> lock(streamLock_)
#else
#define CHORD_STREAM_LOCK() ((void)0)
#endif

namespace {
// The widest bar any meter asks for — five quarters of four steps each. Patterns are
// stored at this width whatever the meter, and the meter says how many of them a bar
// plays: a lane that is not cut down cannot lose what was written in it.
constexpr int kMaxStepsPerBar = 20;
// And how many bars a pattern may run before it starts over. One was the whole world
// until now, which is why everything this made sounded like a loop.
constexpr int kMaxBars = 4;
constexpr int kMaxSteps = kMaxStepsPerBar * kMaxBars;
// Every piece of the kit, by the index the engine keeps it at. Must match drumRows in
// constants.dart: the first four are the rows the grid started with, so a song sent by an
// older build lands on the same ones.
constexpr int kDrumRows = 11;
constexpr const char* kDrumRowNames[kDrumRows] = {
    "kick", "snare", "hihat", "rim", "hihatOpen", "hihatFoot", "tom1", "tom2", "floorTom", "ride", "crash"};
constexpr int kCrashRow = 10;
// A part marks the end of every eighth bar with its fill. Must match phraseBars in
// constants.dart.
constexpr int kPhraseBars = 8;
// A step is a sixteenth note in every meter and the tempo counts quarters, so a step
// always lasts the same time and only the length of the bar moves. A chord says how
// many beats it lasts, never how many steps.
constexpr int kStepsPerQuarter = 4;
constexpr int kVoices = 64;
constexpr int kSections = 32;
constexpr int kChordsPerSection = 32;
constexpr int kKsMax = 1024;  // Karplus-Strong delay line: enough for 47 Hz at 48 kHz.
constexpr int kSineSize = 2048;
constexpr float kPi = 3.14159265359f;

// Melodic timbres. Dart offers a subset of these per track; the ids must stay in
// sync with timbreOptions in lib/core/music/constants.dart.
enum Timbre { kSine = 0, kFmEp, kPartials, kOrgan, kPad, kSaw, kPluck, kMuted, kTriangle, kOverdrive, kSub, kReese, kSquare, kSampled, kTimbreCount };
// Starting General MIDI program per melodic track; the UI can change each of them,
// because how loud and how bright a sampled instrument sounds is a property of the
// program, not something to be guessed at.
constexpr int kGmProgram[3] = {0, 25, 33};  // grand piano, steel guitar, finger bass
// Drum generators. Any of the four drum rows can host any of them. The ids from
// kSampledFirst on are played from a recording instead of synthesised, so the two
// kinds sit in the same list and can be swapped lane by lane to compare them.
enum DrumSound {
  kKick = 0, k808, kTom, kSnare, kClap, kRim, kHatClosed, kHatOpen, kCowbell,
  kSampledFirst,
  kSKick = kSampledFirst, kSSnare, kSStick, kSHat, kSHatOpen, kSHatFoot,
  kSTom1, kSTom2, kSFloorTom, kSRide, kSRideBell, kSCrash,
  kSKick2, kSSnare2, kSHat2, kSHatOpen2, kS808, kSClap,
  kSKickAp1, kSSnareAp1, kSHatAp1, kSHatOpenAp1,
  kSKickBrutalist, kSSnareBrutalist, kSHatBrutalist, kSHatOpenBrutalist,
  kSKickChase, kSSnareChase, kSHatChase, kSHatOpenChase,
  kSKickRunIt, kSSnareRunIt, kSHatRunIt, kSHatOpenRunIt,
  kSRide2, kSCrash2,
  kSCountIn,  // the cowbell the count-in before playback is played on; countInSound in Dart
  kSTom1Oak, kSTom2Oak, kSFloorTomOak,
  kSTom1909, kSTom2909, kSFloorTom909,
  kSTom1Phat, kSTom2Phat, kSFloorTomPhat,
  kDrumSoundCount
};
constexpr int kSampleSlots = kDrumSoundCount - kSampledFirst;
constexpr int kNoRow = -1;  // a drum voice on no lane of the kit: the metronome and the count-in
constexpr int kClickBeep = -1;  // the metronome's own sine pip rather than a drum sound
constexpr int kMaxCountInBeats = 7;  // position() has three bits for it; maxCountInBeats in Dart
constexpr int kSampleRate = 48000;  // the assets are written at the engine's own rate
constexpr int kLoadWarmupBlocks = 32;  // skipped so a cold start does not define the peak
constexpr int kLoadMinFrames = 64;     // below this the ratio says more about the block than the work
// One voice per row cut a crash or a ride the moment its lane hit again, so its tail
// was never heard. A shared pool lets hits ring over each other the way a kit does.
// Twelve was sized for synthesised hits; recordings ring for seconds — a snare with a
// two-second tail four times a bar, a ride, toms after a fill — and kept all twelve busy.
constexpr int kDrumVoices = 32;
// How long a voice takes to go quiet when it is choked or given up: short enough to
// read as a damped drum, long enough not to click.
constexpr float kChokeSeconds = .008f;
// Which voices the callback should drop, one bit per melodic track and a fourth for the
// kit. Set from the platform thread and honoured in the callback, because the voices
// belong to the callback and clearing them from anywhere else is a race.
constexpr int kClearDrums = 1 << 3;
constexpr int kClearEverything = 0b1111;

// What a melodic step plays. Until now a step only said *when*, never *what*, so every
// chord came out as a block with all its notes stacked on the same instant. Saying
// which chord tone to sound is the difference between spelling harmony and playing it.
// Must stay in sync with the degree ids in lib/core/music/constants.dart.
enum Degree { kRest = 0, kChordAll, kRoot, kThird, kFifth, kSeventh, kExtension, kOctave, kDegreeCount };

// A step is packed into one int32 so the grid stays a single atomic store per cell and
// the callback keeps its lock-free read.
//   bits 0-7   velocity 0..255   bits 8-11  degree     bits 12-15 octave shift + 8
//   bits 16-19 second degree    bits 20-23 second octave + 8   bit 24 accent
inline int stepVelocity(int packed) { return packed & 0xff; }
inline int stepDegree(int packed) { return (packed >> 8) & 0xf; }
inline int stepOctave(int packed) { return ((packed >> 12) & 0xf) - 8; }
inline int stepDegree2(int packed) { return (packed >> 16) & 0xf; }
inline int stepOctave2(int packed) { return ((packed >> 20) & 0xf) - 8; }
inline bool stepAccent(int packed) { return ((packed >> 24) & 1) != 0; }

int noteIndex(const char* value) {
  const char* names[] = {"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"};
  for (int i = 0; i < 12; ++i) if (strcmp(names[i], value) == 0) return i;
  return 0;
}

int instrumentIndex(const char* track) { return strcmp(track, "piano") == 0 ? 0 : strcmp(track, "guitar") == 0 ? 1 : 2; }
// -1 for a name this build does not have, which every caller ignores. Anything unknown
// used to land on the rim: hits nobody wrote, on a lane nobody chose.
int drumRowIndex(const char* row) {
  for (int i = 0; i < kDrumRows; ++i) if (strcmp(row, kDrumRowNames[i]) == 0) return i;
  return -1;
}

constexpr int kMaxChordVoices = 5;

// Interval formulas, mirroring _chordFormulas in lib/core/music/chord_theory.dart.
// Keep both lists in step: the UI offers these names and the engine must spell them.
struct ChordType { const char* name; int count; int intervals[kMaxChordVoices]; };
constexpr ChordType kChordTypes[] = {
  {"maj",  3, {0, 4, 7}},
  {"min",  3, {0, 3, 7}},
  {"7",    4, {0, 4, 7, 10}},
  {"maj7", 4, {0, 4, 7, 11}},
  {"min7", 4, {0, 3, 7, 10}},
  {"dim",  3, {0, 3, 6}},
  {"aug",  3, {0, 4, 8}},
  {"sus4", 3, {0, 5, 7}},
  {"m9",   5, {0, 3, 7, 10, 14}},
  {"9",    5, {0, 4, 7, 10, 14}},
  {"6",    4, {0, 4, 7, 9}},
  // Added because transcribing real songs kept asking for them and there was nothing
  // to spell them with. sus2 was being written as sus4, add9 as a plain major, a
  // half-diminished as a diminished triad, and a minor eleventh as a minor seventh.
  {"sus2", 3, {0, 2, 7}},
  {"add9", 4, {0, 4, 7, 14}},
  {"m7b5", 4, {0, 3, 6, 10}},
  {"m11",  5, {0, 3, 7, 10, 17}},
};
constexpr int kChordTypeCount = sizeof(kChordTypes) / sizeof(kChordTypes[0]);

int chordTypeIndex(const char* name) {
  for (int i = 0; i < kChordTypeCount; ++i) if (strcmp(kChordTypes[i].name, name) == 0) return i;
  return 0;
}

float hzFromMidi(int note) { return 440.0f * powf(2.0f, (note - 69) / 12.0f); }

// Phases are normalised to [0,1) so the table lookup and the anti-aliasing
// correction below can share them.
float sineTable[kSineSize + 1];
void buildSineTable() { for (int i = 0; i <= kSineSize; ++i) sineTable[i] = sinf(2 * kPi * i / kSineSize); }

inline float wrap(float phase) { return phase - floorf(phase); }

// Interpolated lookup keeps the partial-heavy timbres affordable: the organ and
// grand voices would otherwise cost three sinf per sample each.
inline float osc(float phase) {
  const float x = wrap(phase) * kSineSize;
  const int i = static_cast<int>(x);
  const float f = x - i;
  return sineTable[i] + (sineTable[i + 1] - sineTable[i]) * f;
}

// PolyBLEP smooths the discontinuity of naive saw/square so high notes stop aliasing.
inline float polyBlep(float t, float dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1.0f; }
  if (t > 1.0f - dt) { t = (t - 1.0f) / dt; return t * t + t + t + 1.0f; }
  return 0.0f;
}
inline float saw(float phase, float dt) { return 2.0f * phase - 1.0f - polyBlep(phase, dt); }
inline float square(float phase, float dt) { return (phase < .5f ? 1.0f : -1.0f) + polyBlep(phase, dt) - polyBlep(wrap(phase + .5f), dt); }
inline float triangle(float phase) { return 1.0f - 4.0f * fabsf(phase - .5f); }

// Envelope stages. Until now a voice only ever decayed from its attack, so a chord
// held for four bars and one held for a sixteenth sounded identical, and there was no
// way to end a note early — which is also why a sampled engine could not be driven.
enum Stage { kAttack = 0, kDecay, kSustain, kRelease };

// track drives mixer routing and the clear mask; timbre is captured at note-on so
// switching sounds mid-bar never cuts a note that is already ringing.
struct Voice {
  bool active = false;
  int track = 0, timbre = kSine, ksRead = 0, ksLen = 0;
  int stage = kAttack;
  // generation stamps which chord fired the voice, so the previous one can be
  // released without touching notes that have just been triggered.
  int generation = 0;
  // gain is the fixed note amplitude; level is the envelope that moves.
  int sampleNote = -1;  // the note handed to the SoundFont, so it can be released
  // What this voice is playing, whatever generator it uses. Only the sampled path
  // needed to remember it before; the keyboard on screen needs it from all of them.
  int note = -1;
  float dt = 0, gain = 0, decay = 0, phase = 0, phase2 = 0, phase3 = 0;
  float level = 0, attack = 1, sustain = 0, release = 0;
  float lp = 0, lpCoef = 1, aux = 0;
  float apC = 0, apX = 0, apY = 0;  // allpass that tunes the Karplus-Strong loop
  // Frames left before this note lets go, or -1 to hold until the lane strikes again
  // or the chord changes. Counted here rather than scheduled, because a note that is
  // stolen or stopped early has to take its own gate with it.
  int gate = -1;
};
// serial orders voices by when they were struck; fade and fadeStep carry a voice that
// has been choked down to silence instead of cutting it off.
struct DrumVoice { bool active = false; int sound = kKick, row = 0; float amp = 0, phase = 0, phase2 = 0, pitch = 1, t = 0, position = 0, fade = 1, fadeStep = 0; uint32_t serial = 0; };

// A kit is not four instruments in one spot: the hats and the rim sit off to the side
// of the player. The lane is stored on the voice rather than its pan, so moving the
// drum channel's pan is heard on hits that are already ringing.
constexpr float kDrumLaneSpread[kDrumRows] = {
    0.0f, 0.0f, .22f, -.28f,  // kick, snare, hihat, rim
    .22f, .22f,               // open hat and pedal, where the hats are
    .12f, -.06f, -.24f,       // the toms, high to low, across the kit
    -.32f, .30f};             // the ride on one side, the crash on the other

/// A decoded drum recording. The pointer is published after the length so the audio
/// callback either sees nothing or sees a sample that is fully written; loading happens
/// once per slot from the platform thread and is never replaced, so nothing is freed
/// under the callback's feet.
struct SampleBank {
  std::atomic<const int16_t*> data[kSampleSlots];
  std::atomic<int> length[kSampleSlots];
  // How loud each recording plays. The assets are stored at full scale so a quiet one
  // can be raised here, in the float mix, without clipping on the way in.
  std::atomic<float> gain[kSampleSlots];

  bool load(int slot, const int16_t* source, int count, float level) {
    if (slot < 0 || slot >= kSampleSlots || count <= 0) return false;
    if (data[slot].load(std::memory_order_acquire) != nullptr) return false;  // load once
    auto* copy = new (std::nothrow) int16_t[count];
    if (!copy) return false;
    memcpy(copy, source, count * sizeof(int16_t));
    gain[slot].store(level, std::memory_order_release);
    length[slot].store(count, std::memory_order_release);
    data[slot].store(copy, std::memory_order_release);
    return true;
  }
};
SampleBank sampleBank;
struct Chord { int root = 0, halfBeats = 8, bass = -1; int type = 0; };
struct Section { int loop = 1, chordCount = 0; bool infinite = false; Chord chords[kChordsPerSection]; };
struct Arrangement { int sectionCount = 0; Section sections[kSections]; };

float ksBuffers[kVoices][kKsMax];

/// The SoundFont player. Loading allocates and parses 30 MB, so it happens on the
/// platform thread and is published here; the callback only ever reads the pointer.
/// Once set it is never replaced, so nothing is freed under the callback's feet.
std::atomic<tsf*> soundFont{nullptr};
constexpr int kSfScratch = 2048;  // stereo frames tsf renders into, kept stereo through the mix
constexpr int kExportBlock = 1024;  // frames per pass when rendering to a file
// The window of notes the on-screen keyboard can show, as a bitmask: three 32-bit
// words from kNoteFloor upward, which covers everything the engine will ever voice.
constexpr int kNoteFloor = 24;
constexpr int kNoteWords = 3;
constexpr float kSilence = 1e-4f;   // -80 dBFS: below this a tail has finished

// A 44-byte canonical WAV header: RIFF/WAVE, 16-bit PCM, stereo. Written twice —
// once before the audio, when the length is not known yet, and once after.
inline void writeLE(FILE* file, uint32_t value, int bytes) {
  for (int i = 0; i < bytes; ++i) fputc((value >> (8 * i)) & 0xff, file);
}
inline void writeWavHeader(FILE* file, int sampleRate, int frames) {
  const uint32_t dataBytes = static_cast<uint32_t>(frames) * 4;  // stereo, 16 bit
  fwrite("RIFF", 1, 4, file);
  writeLE(file, 36 + dataBytes, 4);
  fwrite("WAVEfmt ", 1, 8, file);
  writeLE(file, 16, 4);                            // PCM chunk size
  writeLE(file, 1, 2);                             // uncompressed
  writeLE(file, 2, 2);                             // channels
  writeLE(file, static_cast<uint32_t>(sampleRate), 4);
  writeLE(file, static_cast<uint32_t>(sampleRate) * 4, 4);  // bytes per second
  writeLE(file, 4, 2);                             // block align
  writeLE(file, 16, 2);                            // bits per sample
  fwrite("data", 1, 4, file);
  writeLE(file, dataBytes, 4);
}

// Equal-power pan, normalised so the centre is unity rather than -3 dB. The textbook
// law puts .707 on both sides at centre, which would have quietened the whole app by
// 3 dB the moment stereo arrived — a change nobody asked for and everybody hears.
constexpr float kSqrt2 = 1.41421356f;
inline void panGains(float pan, float& left, float& right) {
  const float angle = (fmaxf(-1.0f, fminf(1.0f, pan)) + 1.0f) * (kPi * .25f);
  left = cosf(angle) * kSqrt2;
  right = sinf(angle) * kSqrt2;
}

// A Freeverb: eight lowpass-feedback combs in parallel into four allpasses in series,
// per channel, with the right channel's delays offset so the two are not the same room.
// Chosen over a plate or an FDN because it is the cheapest structure that still sounds
// like a space rather than an echo, and the callback has a deadline to keep.
constexpr int kCombs = 8;
constexpr int kAllpasses = 4;
constexpr int kCombTuning[kCombs] = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617};
constexpr int kAllpassTuning[kAllpasses] = {556, 441, 341, 225};
constexpr int kStereoSpread = 23;
// The tunings above are in samples at 44.1 kHz, so a delay line has to be sized for the
// highest rate a device might open the stream at, not for the one we expect.
constexpr int kReverbMaxRate = 96000;
constexpr int scaledDelay(int samples) {
  return static_cast<int>(static_cast<double>(samples) * kReverbMaxRate / 44100.0) + kStereoSpread + 1;
}
constexpr int kCombMax = scaledDelay(kCombTuning[kCombs - 1]);
constexpr int kAllpassMax = scaledDelay(kAllpassTuning[0]);

struct Comb {
  float buffer[kCombMax]{};
  int size = 1, index = 0;
  float store = 0, feedback = .84f, damp1 = .2f, damp2 = .8f;

  float process(float input) {
    const float output = buffer[index];
    // The damping lives in the feedback path, which is what makes the tail lose its
    // top end over time the way a real room does.
    store = output * damp2 + store * damp1;
    buffer[index] = input + store * feedback;
    if (++index >= size) index = 0;
    return output;
  }
};

struct Allpass {
  float buffer[kAllpassMax]{};
  int size = 1, index = 0;

  float process(float input) {
    const float buffered = buffer[index];
    const float output = -input + buffered;
    buffer[index] = input + buffered * .5f;
    if (++index >= size) index = 0;
    return output;
  }
};

/// One biquad, in transposed direct form II — two state variables per channel instead
/// of four, and it is the form that stays well behaved when the coefficients are
/// swapped underneath it, which is exactly what moving an EQ band does.
struct Biquad {
  float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  float z1 = 0, z2 = 0;

  inline float process(float x) {
    const float y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }

  void reset() { z1 = z2 = 0; }

  /// The three shapes an EQ band takes. `gainDb` of zero leaves the band as a pass
  /// through, so a flat strip costs three multiply-adds and changes nothing.
  void lowShelf(float sampleRate, float freq, float gainDb) {
    const float A = powf(10.0f, gainDb / 40.0f);
    const float w = 2.0f * static_cast<float>(M_PI) * freq / sampleRate;
    const float cw = cosf(w), sw = sinf(w);
    const float alpha = sw / 2.0f * sqrtf((A + 1.0f / A) * (1.0f / 0.7071f - 1.0f) + 2.0f);
    const float twoSqrtAalpha = 2.0f * sqrtf(A) * alpha;
    const float a0 = (A + 1) + (A - 1) * cw + twoSqrtAalpha;
    b0 = A * ((A + 1) - (A - 1) * cw + twoSqrtAalpha) / a0;
    b1 = 2 * A * ((A - 1) - (A + 1) * cw) / a0;
    b2 = A * ((A + 1) - (A - 1) * cw - twoSqrtAalpha) / a0;
    a1 = -2 * ((A - 1) + (A + 1) * cw) / a0;
    a2 = ((A + 1) + (A - 1) * cw - twoSqrtAalpha) / a0;
  }

  void highShelf(float sampleRate, float freq, float gainDb) {
    const float A = powf(10.0f, gainDb / 40.0f);
    const float w = 2.0f * static_cast<float>(M_PI) * freq / sampleRate;
    const float cw = cosf(w), sw = sinf(w);
    const float alpha = sw / 2.0f * sqrtf((A + 1.0f / A) * (1.0f / 0.7071f - 1.0f) + 2.0f);
    const float twoSqrtAalpha = 2.0f * sqrtf(A) * alpha;
    const float a0 = (A + 1) - (A - 1) * cw + twoSqrtAalpha;
    b0 = A * ((A + 1) + (A - 1) * cw + twoSqrtAalpha) / a0;
    b1 = -2 * A * ((A - 1) + (A + 1) * cw) / a0;
    b2 = A * ((A + 1) + (A - 1) * cw - twoSqrtAalpha) / a0;
    a1 = 2 * ((A - 1) - (A + 1) * cw) / a0;
    a2 = ((A + 1) - (A - 1) * cw - twoSqrtAalpha) / a0;
  }

  void peaking(float sampleRate, float freq, float q, float gainDb) {
    const float A = powf(10.0f, gainDb / 40.0f);
    const float w = 2.0f * static_cast<float>(M_PI) * freq / sampleRate;
    const float cw = cosf(w), sw = sinf(w);
    const float alpha = sw / (2.0f * q);
    const float a0 = 1 + alpha / A;
    b0 = (1 + alpha * A) / a0;
    b1 = -2 * cw / a0;
    b2 = (1 - alpha * A) / a0;
    a1 = -2 * cw / a0;
    a2 = (1 - alpha / A) / a0;
  }

  void bypass() { b0 = 1; b1 = b2 = a1 = a2 = 0; }
};

/// Tone and compression for one channel: three bands and a feed-forward compressor
/// reading the louder of the two sides, so a note panned hard does not slip past the
/// threshold on the quiet side.
///
/// The knee is hard and the makeup gain automatic. Both are choices about how much of
/// a compressor is worth putting on glass: a soft knee needs a curve to be worth
/// having, and a makeup fader you have to ride to hear whether the compressor helped
/// makes the whole thing feel like it does nothing.
struct Strip {
  Biquad low[2], mid[2], high[2];
  float envelope = 0;        // in linear gain, the running detector level
  float reduction = 0;       // in dB, what the meter reports
  float attackCoef = 0, releaseCoef = 0;
  float thresholdDb = 0, ratio = 1, makeup = 1;
  bool flat = true, compressing = false;

  void prepare(float sampleRate) {
    // 12 ms attack, 180 ms release: fast enough to catch a kick, slow enough not to
    // pump on a piano chord.
    attackCoef = expf(-1.0f / (0.012f * sampleRate));
    releaseCoef = expf(-1.0f / (0.180f * sampleRate));
  }

  void configure(float sampleRate, float lowDb, float midDb, float highDb, float thrDb,
                 float rat) {
    for (int c = 0; c < 2; ++c) {
      if (lowDb == 0) low[c].bypass(); else low[c].lowShelf(sampleRate, 160.0f, lowDb);
      if (midDb == 0) mid[c].bypass(); else mid[c].peaking(sampleRate, 1000.0f, 0.9f, midDb);
      if (highDb == 0) high[c].bypass(); else high[c].highShelf(sampleRate, 4500.0f, highDb);
    }
    thresholdDb = thrDb;
    ratio = rat < 1.0f ? 1.0f : rat;
    compressing = ratio > 1.0f && thresholdDb < 0.0f;
    flat = lowDb == 0 && midDb == 0 && highDb == 0 && !compressing;
    // Give back most of what the compressor takes at full tilt, so turning it up is
    // heard as "denser" and not simply as "quieter".
    makeup = compressing ? powf(10.0f, (-thresholdDb * (1.0f - 1.0f / ratio) * 0.6f) / 20.0f) : 1.0f;
    if (!compressing) reduction = 0;
  }

  inline void process(float& l, float& r) {
    if (flat) return;
    l = high[0].process(mid[0].process(low[0].process(l)));
    r = high[1].process(mid[1].process(low[1].process(r)));
    if (!compressing) return;
    const float peak = fmaxf(fabsf(l), fabsf(r));
    const float coef = peak > envelope ? attackCoef : releaseCoef;
    envelope = peak + coef * (envelope - peak);
    // −100 dB rather than zero: log of silence is not a number, and the branch that
    // would avoid it runs on every sample.
    const float levelDb = 20.0f * log10f(fmaxf(envelope, 1e-5f));
    float gainDb = 0;
    if (levelDb > thresholdDb) gainDb = (thresholdDb - levelDb) * (1.0f - 1.0f / ratio);
    reduction = -gainDb;
    const float gain = powf(10.0f, gainDb / 20.0f) * makeup;
    l *= gain;
    r *= gain;
  }

  void reset() {
    for (int c = 0; c < 2; ++c) { low[c].reset(); mid[c].reset(); high[c].reset(); }
    envelope = 0;
    reduction = 0;
  }
};

/// Stereo reverb used as a send: it is given the mix and returns only the wet signal,
/// which the caller adds back. Its input is high-passed first, because low frequencies
/// in a reverb tail are what turns a kick and a bass into mud, and no amount of tail
/// length is worth losing the bottom end to.
class Reverb {
 public:
  /// Sizes every delay line for the rate the stream actually opened at and clears them.
  /// Called from the platform thread before the callback starts, never during.
  void prepare(float sampleRate) {
    const double scale = static_cast<double>(sampleRate) / 44100.0;
    for (int i = 0; i < kCombs; ++i) {
      combL_[i].size = clampSize(static_cast<int>(kCombTuning[i] * scale), kCombMax);
      combR_[i].size = clampSize(static_cast<int>(kCombTuning[i] * scale) + kStereoSpread, kCombMax);
    }
    for (int i = 0; i < kAllpasses; ++i) {
      allpassL_[i].size = clampSize(static_cast<int>(kAllpassTuning[i] * scale), kAllpassMax);
      allpassR_[i].size = clampSize(static_cast<int>(kAllpassTuning[i] * scale) + kStereoSpread, kAllpassMax);
    }
    highpassCoef_ = 1.0f / (2.0f * kPi * kHighpassHz / sampleRate + 1.0f);
    mute();
  }

  void mute() {
    for (int i = 0; i < kCombs; ++i) {
      memset(combL_[i].buffer, 0, sizeof(combL_[i].buffer));
      memset(combR_[i].buffer, 0, sizeof(combR_[i].buffer));
      combL_[i].store = combR_[i].store = 0;
      combL_[i].index = combR_[i].index = 0;
    }
    for (int i = 0; i < kAllpasses; ++i) {
      memset(allpassL_[i].buffer, 0, sizeof(allpassL_[i].buffer));
      memset(allpassR_[i].buffer, 0, sizeof(allpassR_[i].buffer));
      allpassL_[i].index = allpassR_[i].index = 0;
    }
    hpXL_ = hpYL_ = hpXR_ = hpYR_ = 0;
  }

  /// size 0..1 is how long the tail runs, mix 0..1 how much of it is heard.
  void configure(float size, float mix) {
    const float feedback = .7f + fminf(1.0f, fmaxf(0.0f, size)) * .28f;
    for (int i = 0; i < kCombs; ++i) {
      combL_[i].feedback = combR_[i].feedback = feedback;
      combL_[i].damp1 = combR_[i].damp1 = kDamp;
      combL_[i].damp2 = combR_[i].damp2 = 1.0f - kDamp;
    }
    // Freeverb scales its wet output by three, because it is a dry/wet processor and
    // that is what full wet means there. Used as a send on top of an untouched dry
    // signal it is far too hot: measured against a note, mix 1 came out 9.7 dB louder
    // than the dry it was fed. Unscaled, mix 1 sits level with the dry and the default
    // .18 lands 15 dB under it, which is a room rather than a swimming pool.
    wet_ = fminf(1.0f, fmaxf(0.0f, mix));
  }

  void process(float inL, float inR, float& wetL, float& wetR) {
    const float hpL = highpass(inL, hpXL_, hpYL_);
    const float hpR = highpass(inR, hpXR_, hpYR_);
    const float input = (hpL + hpR) * kInputGain;
    float left = 0, right = 0;
    for (int i = 0; i < kCombs; ++i) {
      left += combL_[i].process(input);
      right += combR_[i].process(input);
    }
    for (int i = 0; i < kAllpasses; ++i) {
      left = allpassL_[i].process(left);
      right = allpassR_[i].process(right);
    }
    wetL = left * wet_;
    wetR = right * wet_;
  }

 private:
  static constexpr float kDamp = .28f;
  static constexpr float kInputGain = .015f;
  static constexpr float kHighpassHz = 220.0f;

  static int clampSize(int wanted, int limit) { return std::max(1, std::min(wanted, limit)); }

  float highpass(float x, float& lastX, float& lastY) const {
    lastY = highpassCoef_ * (lastY + x - lastX);
    lastX = x;
    return lastY;
  }

  Comb combL_[kCombs], combR_[kCombs];
  Allpass allpassL_[kAllpasses], allpassR_[kAllpasses];
  float wet_ = .18f;
  float highpassCoef_ = .97f;
  float hpXL_ = 0, hpYL_ = 0, hpXR_ = 0, hpYR_ = 0;
};

class Engine {
 public:
  Engine() {
    buildSineTable();
    gains_[0].store(.9f); gains_[1].store(.7f); gains_[2].store(.7f); gains_[3].store(.9f);
    for (auto& p : pan_) p.store(0.0f);
    // The windows the hardcoded anchors used to mean: piano around C4, guitar a fourth
    // below, bass two octaves under that.
    // Per section, because a verse and a chorus can play the same track with another
    // instrument, in another register, held or clipped. Every section starts on the
    // same values; what makes one different is pushed from Dart, already resolved.
    const int low[3] = {60, 55, 40};
    const int timbre[3] = {kSine, kSaw, kSine};
    for (int s = 0; s < kSections; ++s) {
      for (int i = 0; i < 3; ++i) {
        voiceLow_[s][i].store(low[i]);
        voiceHigh_[s][i].store(low[i] + 23);
        timbre_[s][i].store(timbre[i]);
        program_[s][i].store(kGmProgram[i]);
        gateSteps_[s][i].store(0);
      }
    }
    // The synthesised kit until Dart says otherwise, with the pieces it has no voice for
    // borrowing the nearest one it has — the same kit as drumKits[0] in constants.dart.
    const int kit[kDrumRows] = {kKick, kSnare, kHatClosed, kRim, kHatOpen, kHatClosed,
                                kTom,  kTom,   kTom,       kHatClosed, kHatOpen};
    for (int s = 0; s < kSections; ++s) {
      for (int row = 0; row < kDrumRows; ++row) drumSound_[s][row].store(kit[row]);
      // By track, not by piece: these two are about the drums as a whole.
      for (int track = 0; track < 4; ++track) {
        silent_[s][track].store(false);
        patternBars_[s][track].store(1);
      }
    }
    // No fill anywhere until Dart sends one.
    for (int s = 0; s < kSections; ++s) {
      fillFrom_[s].store(0);
      fillMask_[s].store(0);
      for (auto& lane : fill_[s]) for (auto& step : lane) step.store(0);
    }
    for (auto& section : drums_) for (auto& row : section) for (auto& step : row) step.store(0);
    for (auto& section : instruments_) for (auto& track : section) for (auto& step : track) step.store(0);
  }

  /// Opens the output without starting the sequencer.
  ///
  /// How long the stream lives and whether the song is running are two different facts.
  /// They used to be one: Stop closed the only stream there was, so a chord previewed in
  /// the editor allocated its voices into an output nobody was rendering and the whole
  /// feature was silent unless you happened to be playing. Anything that needs to be
  /// heard opens the stream through here; [closeStream] hands it back once nothing has
  /// asked for it in a while.
  ///
  /// Idempotent, and it resets the transport — with no stream open there was nothing
  /// sounding and nowhere to be in the song.
  bool openStream() {
    CHORD_STREAM_LOCK();
    if (stream_) return true;
    // An export drives this same transport and these same voices from its own thread.
    if (exporting_.load(std::memory_order_acquire)) return false;
    if (!buildStream()) return false;
    prepareForRate();
    for (auto& voice : voices_) voice.active = false;
    for (auto& drum : drumVoices_) drum.active = false;
    for (auto& generation : generation_) generation = 0;
    stepBudget_ = -1;  // an export may have left it counting down
    resetTransport();
    previewRows_.store(0, std::memory_order_release);  // nothing queued onto the last stream
    AAudioStream_requestStart(stream_);
    streamOpen_.store(true, std::memory_order_release);
    return true;
  }

  /// Opens [stream_] with the one configuration this engine plays through. Leaves it
  /// stopped, and leaves the transport and the voices alone.
  bool buildStream() {
    AAudioStreamBuilder* builder = nullptr;
    AAudio_createStreamBuilder(&builder);
    AAudioStreamBuilder_setDirection(builder, AAUDIO_DIRECTION_OUTPUT);
    AAudioStreamBuilder_setPerformanceMode(builder, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    AAudioStreamBuilder_setSharingMode(builder, AAUDIO_SHARING_MODE_EXCLUSIVE);
    AAudioStreamBuilder_setFormat(builder, AAUDIO_FORMAT_PCM_FLOAT);
    AAudioStreamBuilder_setChannelCount(builder, 2);
    AAudioStreamBuilder_setSampleRate(builder, 48000);
    AAudioStreamBuilder_setDataCallback(builder, dataCallback, this);
    AAudioStreamBuilder_setErrorCallback(builder, errorCallback, this);
    aaudio_result_t result = AAudioStreamBuilder_openStream(builder, &stream_);
    if (result != AAUDIO_OK) {
      AAudioStreamBuilder_setSharingMode(builder, AAUDIO_SHARING_MODE_SHARED);
      result = AAudioStreamBuilder_openStream(builder, &stream_);
    }
    AAudioStreamBuilder_delete(builder);
    if (result != AAUDIO_OK) { stream_ = nullptr; return false; }
    sampleRate_ = AAudioStream_getSampleRate(stream_);
    // Two bursts of cushion instead of one. Measured on a Pixel 8, the callback's real
    // work is 11-15 % of its deadline and the worst honest block is about 75 %, but the
    // odd block takes three times as long as its own workload explains — the thread
    // loses the CPU, not the DSP getting heavier. A single-burst buffer turns any such
    // hiccup into an underrun; a second burst absorbs it for about two milliseconds of
    // added latency, which nobody sequencing a pattern is going to feel.
    const int32_t burst = AAudioStream_getFramesPerBurst(stream_);
    if (burst > 0) AAudioStream_setBufferSizeInFrames(stream_, burst * 2);
    return true;
  }

  /// Everything tuned in samples, retuned to the rate the stream actually opened at.
  void prepareForRate() {
    // Delay lines are tuned in samples, so the room only comes out the right size once
    // the stream has told us the rate it actually opened at.
    reverb_.prepare(static_cast<float>(sampleRate_));
    reverbDirty_.store(true, std::memory_order_release);
    // The compressor's attack and release are in samples too, so they wait for the
    // rate the stream actually opened at.
    for (auto& strip : strips_) {
      strip.prepare(static_cast<float>(sampleRate_));
      strip.reset();
    }
    stripsDirty_.store(true, std::memory_order_release);
    // 40 ms to inaudible, at whatever rate the stream opened at.
    clickDecay_ = coefFor(.04f);
    clickLevel_ = 0;
    configureSoundFont();
    loadAverage_ = 0; blocksSinceStart_ = 0; resetLoad();
  }

  /// A new output took over — Bluetooth headphones connecting, a cable pulled — and
  /// AAudio closed the stream under us. Nothing reopened it, so the song froze where
  /// it was and every later Play or preview talked to a dead stream.
  ///
  /// The song keeps its place: the transport is only touched by the callback, and
  /// between the dead stream and the new one there is no callback to race.
  void reopenAfterDisconnect(AAudioStream* dead) {
    CHORD_STREAM_LOCK();
    if (stream_ != dead) return;  // already closed or replaced from the platform side
    AAudioStream_requestStop(dead);
    AAudioStream_close(dead);
    stream_ = nullptr;
    const int previousRate = sampleRate_;
    if (!buildStream()) {
#ifndef CHORD_AUDIO_WEB
      __android_log_print(ANDROID_LOG_WARN, "ChordAudio", "could not reopen the output after a disconnect");
#endif
      sequencing_.store(false, std::memory_order_release);
      streamOpen_.store(false, std::memory_order_release);
      return;
    }
    if (sampleRate_ != previousRate) {
      // Voices hold increments worked out for the old rate and would come out detuned.
      for (auto& voice : voices_) voice.active = false;
      for (auto& drum : drumVoices_) drum.active = false;
      if (tsf* font = soundFont.load(std::memory_order_acquire)) tsf_note_off_all(font);
      framesToStep_ *= static_cast<float>(sampleRate_) / previousRate;
    }
    prepareForRate();
    AAudioStream_requestStart(stream_);
  }

  /// Back to the top of the song. Only ever called with the sequencer stopped, so
  /// nothing is reading these while they move.
  void resetTransport() {
    stepFrames_ = sampleRate_ * 60.0f / bpm_.load() / kStepsPerQuarter;
    framesToStep_ = 0;
    currentStep_ = sectionIndex_ = chordIndex_ = chordStep_ = loopCount_ = barIndex_ = sectionBar_ = 0;
    // Listening to one part on repeat starts on that part.
    if (const int only = loopOnly_.load(std::memory_order_relaxed); only >= 0) sectionIndex_ = only;
    crashPending_ = false;
    for (auto& bottom : lastBottom_) bottom = 0;
    lastChord_ = -1;
    reportedPosition_.store(0, std::memory_order_release);
    countInSteps_ = countInTotal_ = 0;
    countInBeat_.store(0, std::memory_order_release);
  }

  /// Runs the song from the top. The output may already be open — the editor previews
  /// through it while the song is parked — so whatever it was holding is dropped first.
  ///
  /// With countInBeats the clock first counts that many beats on the cowbell, and the
  /// song's first step lands exactly one beat after the last. The count runs on the same
  /// sample clock as the song: counted anywhere else — a timer on the UI thread, then a
  /// message to start — it drifts, and the song comes in late off the last beat.
  bool start(int countInBeats) {
    if (!openStream()) return false;
    silenceAll();
    resetTransport();
    const int beats = std::max(0, std::min(kMaxCountInBeats, countInBeats));
    countInTotal_ = countInSteps_ = beats * std::max(1, stepsPerBeat_.load(std::memory_order_relaxed));
    countInBeat_.store(beats, std::memory_order_release);
    sequencing_.store(true, std::memory_order_release);
    return true;
  }

  /// Parks the sequencer and silences what it was playing, leaving the output open.
  /// Stop used to close the stream, which is why nothing else in the app could be
  /// heard afterwards; the stream now outlives it and [closeStream] ends it.
  void stop() {
    sequencing_.store(false, std::memory_order_release);
    silenceAll();
  }

  /// Hands the output back. Called when the app has been quiet for a while or has gone
  /// to the background: an idle low-latency stream keeps the audio hardware awake for
  /// nothing, and the next preview or Play opens a fresh one.
  void closeStream() {
    CHORD_STREAM_LOCK();
    sequencing_.store(false, std::memory_order_release);
    streamOpen_.store(false, std::memory_order_release);
    if (!stream_) return;
    if (tsf* font = soundFont.load(std::memory_order_acquire)) tsf_note_off_all(font);
    AAudioStream_requestStop(stream_);
    AAudioStream_close(stream_);
    stream_ = nullptr;
  }

  /// Drops everything that is sounding, from the platform thread.
  ///
  /// The voices are not touched here — they belong to the callback, which clears them
  /// on the mask this leaves behind. Only the SoundFont is told directly, as [stop] and
  /// the export have always told it.
  void silenceAll() {
    if (tsf* font = soundFont.load(std::memory_order_acquire)) tsf_note_off_all(font);
    clearVoices_.fetch_or(kClearEverything, std::memory_order_release);
  }

  /// Points each channel at its General MIDI program and matches the stream rate.
  /// Safe to call again: the bank may finish loading after playback has started.
  void configureSoundFont() {
    tsf* font = soundFont.load(std::memory_order_acquire);
    if (!font) return;
    tsf_set_output(font, TSF_STEREO_INTERLEAVED, sampleRate_, 0);
    const int at = (sectionIndex_ < 0 || sectionIndex_ >= kSections) ? 0 : sectionIndex_;
    for (int track = 0; track < 3; ++track) {
      const int program = program_[at][track].load(std::memory_order_acquire);
      tsf_channel_set_presetnumber(font, track, program, 0);
      appliedProgram_[track] = program;
      tsf_channel_set_volume(font, track, gains_[track + 1].load());
      // Creating a channel centres it, so a pan set before the bank finished loading
      // has to be put back or it is silently lost.
      tsf_channel_set_pan(font, track, (pan_[track + 1].load() + 1.0f) * .5f);
    }
  }

  void setBpm(float value) { bpm_.store(fmaxf(40, fminf(200, value))); }
  void setSwing(float value) { swing_.store(fmaxf(1.0f, fminf(2.0f, value))); }

  /// Where the bar ends and where a beat ends, in steps. Both are clamped to something
  /// the arrays can hold: a meter the UI has and the engine has not would otherwise
  /// index past the end of a pattern.
  void setMeter(int stepsPerBar, int stepsPerBeat) {
    const int bar = std::max(1, std::min(kMaxSteps, stepsPerBar));
    stepsPerBar_.store(bar, std::memory_order_relaxed);
    stepsPerBeat_.store(std::max(1, std::min(bar, stepsPerBeat)), std::memory_order_relaxed);
  }

  /// How long a step lasts, relative to a straight one. Swing splits the beat in two:
  /// the first half is lengthened and the second shortened by as much, so the beat
  /// itself lands where it always did. Half a quarter is two steps and half an eighth
  /// is one, which is why this asks the meter rather than assuming four.
  float swingScale(int step) const {
    const float ratio = swing_.load();
    const int perBeat = stepsPerBeat_.load(std::memory_order_relaxed);
    return (step % perBeat < perBeat * .5f) ? 2 * ratio / (ratio + 1) : 2 / (ratio + 1);
  }
  // Every section carries its own patterns, so a verse and a chorus can share the
  // arrangement without sharing a groove. Melodic tracks still have one lane each: the
  // row argument names a drum row and is ignored elsewhere, because the pitch always
  // comes from the chord and never from the grid.
  void setStep(int section, const char* track, const char* row, int step, int value) {
    if (step < 0 || step >= kMaxSteps || section < 0 || section >= kSections) return;
    if (strcmp(track, "drums") == 0) {
      const int index = drumRowIndex(row);
      if (index >= 0) drums_[section][index][step].store(value);
    }
    else instruments_[section][instrumentIndex(track)][step].store(value);
  }
  void clearTrack(int section, const char* track) {
    if (section < 0 || section >= kSections) return;
    if (strcmp(track, "drums") == 0) {
      for (auto& row : drums_[section]) for (auto& step : row) step.store(0, std::memory_order_release);
      return;
    }
    const int instrument = instrumentIndex(track);
    for (auto& step : instruments_[section][instrument]) step.store(0, std::memory_order_release);
    clearVoices_.fetch_or(1 << instrument, std::memory_order_release);
  }
  // A single relaxed store is the whole cost of switching a sound while playing.
  // The callback picks the new value up at the next note-on; nothing is reallocated.
  /// How long a note on this track is held in this section, in steps. Zero or less
  /// means hold it the way the engine always did: until the lane strikes again or the
  /// chord changes.
  void setNoteLength(int section, const char* track, float steps) {
    if (section < 0 || section >= kSections) return;
    gateSteps_[section][instrumentIndex(track)].store(fminf(64.0f, steps), std::memory_order_relaxed);
  }

  void setTimbre(int section, const char* track, int value) {
    if (section < 0 || section >= kSections) return;
    timbre_[section][instrumentIndex(track)].store(std::max(0, std::min<int>(kTimbreCount - 1, value)), std::memory_order_release);
  }

  /// The sampled instrument is a property of the tsf channel, and there are three
  /// channels for a song of any length — so the program is stored per section and
  /// pushed into the channel when that section comes round.
  ///
  /// Only stored here, never applied: the channel and the record of what is in it
  /// belong to the audio callback, and writing them from this thread as well would be
  /// a race for the sake of saving one step of latency. The next step picks it up.
  void setProgram(int section, const char* track, int program) {
    if (section < 0 || section >= kSections) return;
    program_[section][instrumentIndex(track)].store(program, std::memory_order_release);
  }
  void setDrumSound(int section, const char* row, int value) {
    if (section < 0 || section >= kSections) return;
    const int index = drumRowIndex(row);
    if (index < 0) return;
    drumSound_[section][index].store(std::max(0, std::min<int>(kDrumSoundCount - 1, value)), std::memory_order_release);
  }

  /// Whether a part sounds a track at all. The pattern is untouched: it is written and
  /// kept, and this decides whether this section is where it is heard.
  /// How many bars this track's pattern runs for in this section. The step counter
  /// stays inside one bar and a separate bar counter walks across them, so a two-bar
  /// bass and a one-bar kit never drift: both wrap on a bar line, just not the same one.
  /// One, two or four. Three is not offered: the bar counter runs to four and wraps,
  /// so a three-bar pattern would repeat its first bar twice every time the counter
  /// came round. Every pattern in the transcriptions we read was a power of two
  /// anyway, which is not a coincidence — phrases come in twos.
  void setPatternBars(int section, const char* track, int bars) {
    if (section < 0 || section >= kSections) return;
    const int index = strcmp(track, "drums") == 0 ? 3 : instrumentIndex(track);
    const int clamped = std::max(1, std::min(kMaxBars, bars));
    patternBars_[section][index].store(clamped >= 4 ? 4 : (clamped >= 2 ? 2 : 1),
                                      std::memory_order_release);
  }

  void setSilence(int section, const char* track, bool silent) {
    if (section < 0 || section >= kSections) return;
    const int index = strcmp(track, "drums") == 0 ? 3 : instrumentIndex(track);
    silent_[section][index].store(silent, std::memory_order_release);
  }

  /// The fill that takes a section into the next one: a bar per piece of the kit, the
  /// step it starts on, and which lanes it writes at all. A lane outside the mask leaves
  /// that row playing its groove; one inside it takes the row over, silence included.
  ///
  /// The mask goes down first and comes back up last, so the callback — which only reads
  /// lanes the mask names — never plays a bar that is half the old fill and half the new.
  void setFill(int section, int from, int mask, const int* steps, int count) {
    if (section < 0 || section >= kSections) return;
    fillMask_[section].store(0, std::memory_order_release);
    for (int row = 0; row < kDrumRows; ++row) {
      for (int step = 0; step < kMaxStepsPerBar; ++step) {
        const int at = row * kMaxStepsPerBar + step;
        fill_[section][row][step].store(at < count ? steps[at] : 0, std::memory_order_release);
      }
    }
    fillFrom_[section].store(std::max(0, std::min(kMaxStepsPerBar, from)), std::memory_order_release);
    fillMask_[section].store(mask & ((1 << kDrumRows) - 1), std::memory_order_release);
  }
  // Java writes the inactive buffer and publishes it atomically on commit.
  // The audio callback therefore never locks or reads a partially edited song.
  void beginArrangement(int count) {
    editingArrangement_ = 1 - activeArrangement_.load(std::memory_order_acquire);
    Arrangement& arrangement = arrangements_[editingArrangement_];
    arrangement = {};
    arrangement.sectionCount = std::max(0, std::min(kSections, count));
  }
  void section(int index, int loop, bool infinite, int chordCount) {
    Arrangement& arrangement = arrangements_[editingArrangement_];
    if (index < 0 || index >= arrangement.sectionCount) return;
    Section& value = arrangement.sections[index];
    value.loop = std::max(1, std::min(99, loop)); value.infinite = infinite;
    value.chordCount = std::max(0, std::min(kChordsPerSection, chordCount));
  }
  void chord(int sectionIndex, int index, const char* root, const char* type, int halfBeats, int bass) {
    Arrangement& arrangement = arrangements_[editingArrangement_];
    if (sectionIndex < 0 || sectionIndex >= arrangement.sectionCount || index < 0 || index >= arrangement.sections[sectionIndex].chordCount) return;
    Chord& value = arrangement.sections[sectionIndex].chords[index];
    value.root = noteIndex(root); value.halfBeats = std::max(1, std::min(128, halfBeats));
    value.bass = (bass >= 0 && bass < 12) ? bass : -1;
    value.type = chordTypeIndex(type);
  }
  /// Plays only section [index], round and round; -1 plays the whole song. Read when the
  /// transport starts and whenever a part ends.
  void loopOnly(int index) { loopOnly_.store(index, std::memory_order_relaxed); }
  void commitArrangement() { activeArrangement_.store(editingArrangement_, std::memory_order_release); }
  /// Bar, section, chord and step as reportedPosition_ packs them, with the beats of the
  /// count-in still to play in the three bits above the bar.
  int64_t position() const {
    return reportedPosition_.load(std::memory_order_acquire) |
           int64_t(countInBeat_.load(std::memory_order_acquire)) << 28;
  }
  float loadAverage() const { return loadAvg_.load(std::memory_order_relaxed); }
  float loadPeak() const { return loadMax_.load(std::memory_order_relaxed); }
  float loadTriggerPeak() const { return loadTriggerMax_.load(std::memory_order_relaxed); }
  float loadQuietPeak() const { return loadQuietMax_.load(std::memory_order_relaxed); }
  /// What AAudio itself says went wrong. This is the only number that decides whether
  /// a high load figure mattered: a callback can measure over its deadline and still
  /// produce unbroken audio if the buffer had cushion left.
  int xruns() const { return stream_ ? AAudioStream_getXRunCount(stream_) : 0; }
  int lateBlocks() const { return lateBlocks_.load(std::memory_order_relaxed); }
  int peakFrames() const { return peakFrames_.load(std::memory_order_relaxed); }
  int peakVoices() const { return peakVoices_.load(std::memory_order_relaxed); }
  int peakMicros() const { return peakMicros_.load(std::memory_order_relaxed); }
  void resetLoad() {
    loadPeak_ = triggerPeak_ = quietPeak_ = 0;
    lateBlocks_.store(0, std::memory_order_relaxed);
    loadMax_.store(0, std::memory_order_relaxed);
    loadTriggerMax_.store(0, std::memory_order_relaxed);
    loadQuietMax_.store(0, std::memory_order_relaxed);
  }
  bool playing() const { return sequencing_.load(std::memory_order_acquire); }
  void mixer(const char* track, float volume, bool mute) {
    float v = mute ? 0 : fmaxf(0, fminf(1, volume));
    // SoundFont voices are mixed inside tsf, so a fader has to reach it as well.
    tsf* font = soundFont.load(std::memory_order_acquire);
    if (font) {
      const int channel = strcmp(track, "piano") == 0 ? 0 : strcmp(track, "guitar") == 0 ? 1
                        : strcmp(track, "bass") == 0 ? 2 : -1;
      if (channel >= 0) tsf_channel_set_volume(font, channel, v);
    }
    if (strcmp(track, "drums") == 0) gains_[0].store(v); else if (strcmp(track, "piano") == 0) gains_[1].store(v); else if (strcmp(track, "guitar") == 0) gains_[2].store(v); else if (strcmp(track, "bass") == 0) gains_[3].store(v); else master_.store(v);
  }

  /// -1 hard left, 0 centre, 1 hard right. The melodic tracks are panned twice over:
  /// here for the procedural timbres, and inside tsf for the sampled ones, because a
  /// SoundFont voice is mixed to stereo before we ever see it.
  void pan(const char* track, float value) {
    const float v = fmaxf(-1.0f, fminf(1.0f, value));
    const int index = strcmp(track, "drums") == 0 ? 0 : strcmp(track, "piano") == 0 ? 1
                    : strcmp(track, "guitar") == 0 ? 2 : strcmp(track, "bass") == 0 ? 3 : -1;
    if (index < 0) return;
    pan_[index].store(v);
    if (index == 0) return;
    tsf* font = soundFont.load(std::memory_order_acquire);
    if (font) tsf_channel_set_pan(font, index - 1, (v + 1.0f) * .5f);
  }

  /// Where one melodic track plays. This used to carry how many tones sounded and
  /// whether the voicing was spread open; both are gone — the count was always left on
  /// all, and open spacing cannot exist once every note is folded into one octave.
  void voicing(int section, const char* track, int low, int high) {
    (void)high;  // the window is always an octave; only where it starts is a choice
    const int index = strcmp(track, "piano") == 0 ? 0 : strcmp(track, "guitar") == 0 ? 1
                    : strcmp(track, "bass") == 0 ? 2 : -1;
    if (index < 0 || section < 0 || section >= kSections) return;
    // The window is one octave, always. Every note of a chord is folded into it, so a
    // wider one would let the voicing spread back out of the range and a narrower one
    // could not hold a chord at all. Only where the octave starts is a choice.
    const int lo = std::max(kNoteFloor, std::min(96, low));
    voiceLow_[section][index].store(lo, std::memory_order_relaxed);
    voiceHigh_[section][index].store(lo + 23, std::memory_order_relaxed);
  }

  /// Where a track is allowed to sit. Everything that places a note goes through this
  /// rather than through a hardcoded anchor, so one control moves them all together.
  struct Window { int low, high, anchor; };
  Window windowOf(int section, int track) const {
    const int at = (section < 0 || section >= kSections) ? 0 : section;
    const int low = voiceLow_[at][track].load(std::memory_order_relaxed);
    const int high = voiceHigh_[at][track].load(std::memory_order_relaxed);
    return {low, high, (low + high) / 2};
  }

  uint32_t soundingWord(int track, int word) const {
    if (track < 0 || track > 2 || word < 0 || word >= kNoteWords) return 0;
    return sounding_[track][word].load(std::memory_order_relaxed);
  }

  /// The notes struck since this was last asked, and asking clears them. A note that
  /// is struck is a different fact from a note that is sounding: the guitar holds one
  /// chord for a whole bar, so its keys stayed lit the entire time and there was no
  /// way to see it play at all.
  uint32_t struckWord(int track, int word) {
    if (track < 0 || track > 2 || word < 0 || word >= kNoteWords) return 0;
    return struck_[track][word].exchange(0, std::memory_order_relaxed);
  }

  /// The pieces of the kit struck since this was last asked, and asking clears them: bit n
  /// for kDrumRowNames[n], and bit n + 16 as well when the hit was a hard one.
  uint32_t drumStruckWord() { return drumStruck_.exchange(0, std::memory_order_relaxed); }

  /// Sounds one piece of the kit on the sound a section gives it. Queued for the callback
  /// rather than triggered here: the drum voices belong to it, and taking one from the
  /// platform thread is a race.
  void previewDrum(int section, const char* row) {
    const int index = drumRowIndex(row);
    if (index < 0 || !openStream()) return;
    queuePreview(section, index);
  }

  /// A tapped piece, from any thread, onto an output that is already open. False when it
  /// is not, so the caller takes the platform-thread path that can open one.
  bool queuePreview(int section, int row) {
    if (row < 0 || row >= kDrumRows || !streamOpen_.load(std::memory_order_acquire)) return false;
    previewSection_.store(std::max(0, std::min(kSections - 1, section)), std::memory_order_release);
    previewRows_.fetch_or(1u << row, std::memory_order_acq_rel);
    return true;
  }

  /// Stored, not applied: the callback picks the change up on its next block so the
  /// filter coefficients are never rewritten while it is reading them.
  /// Tone and compression for one channel. Stored and flagged rather than applied:
  /// the coefficients are rebuilt inside the audio callback, where nothing else can be
  /// reading them.
  void strip(const char* track, float low, float mid, float high, float threshold, float ratio) {
    const int bus = strcmp(track, "drums") == 0    ? 0
                    : strcmp(track, "piano") == 0  ? 1
                    : strcmp(track, "guitar") == 0 ? 2
                    : strcmp(track, "bass") == 0   ? 3
                                                   : -1;
    if (bus < 0) return;
    stripLow_[bus].store(fmaxf(-24.0f, fminf(24.0f, low)));
    stripMid_[bus].store(fmaxf(-24.0f, fminf(24.0f, mid)));
    stripHigh_[bus].store(fmaxf(-24.0f, fminf(24.0f, high)));
    stripThreshold_[bus].store(fmaxf(-60.0f, fminf(0.0f, threshold)));
    stripRatio_[bus].store(fmaxf(1.0f, fminf(20.0f, ratio)));
    stripsDirty_.store(true, std::memory_order_release);
  }

  /// Whether a click sounds while the song plays, and how. [sound] is a drum sound id or
  /// kClickBeep; [volume] also sets the count-in, which is the same click before the song;
  /// [division] is clicks per beat, 1 or 2.
  void metronome(bool enabled, float volume, int sound, bool accent, int division) {
    clickVolume_.store(fmaxf(0.0f, fminf(1.0f, volume)), std::memory_order_relaxed);
    clickSound_.store(sound >= kSampledFirst && sound < kDrumSoundCount ? sound : kClickBeep,
                      std::memory_order_relaxed);
    clickAccent_.store(accent, std::memory_order_relaxed);
    clickDivision_.store(division == 2 ? 2 : 1, std::memory_order_relaxed);
    metronome_.store(enabled, std::memory_order_relaxed);
  }

  /// One accented click, so a sound or a volume can be judged without playing the song.
  void previewClick() {
    if (!openStream()) return;
    previewClick_.store(true, std::memory_order_release);
  }

  /// Sounds one chord immediately, outside the sequencer, so the editor can let you
  /// hear what you are building.
  ///
  /// Everything about how it is voiced is the real thing — [addChord] is what the
  /// arrangement plays through, so the same track, register, timbre and program apply.
  /// Reaching for a different code path here would let a preview drift out of step
  /// with playback, and a preview you cannot trust is worse than none.
  ///
  /// It holds until [previewOff]. A chord you are looking at is a chord you are still
  /// deciding about, so it sustains for as long as your finger is down rather than
  /// decaying on its own schedule.
  void preview(int section, int root, const char* type, int bass, const char* track) {
    // The editor is open with the song stopped far more often than with it playing, and
    // the output only existed between Play and Stop — so this allocated its voices into
    // a closed stream and the preview was silent exactly when it was most wanted.
    if (!openStream()) return;
    const int index = instrumentIndex(track);
    // Whatever the last preview left ringing lets go first, so tapping through the
    // qualities does not stack six chords on top of each other.
    retrigger(index);
    Chord chord;
    chord.root = ((root % 12) + 12) % 12;
    chord.type = chordTypeIndex(type);
    chord.bass = bass;
    const int at = std::max(0, std::min(kSections - 1, section));
    // The sampled instrument belongs to the tsf channel, and with the song parked
    // nothing else is moving it — so the preview points the channel at the section it
    // is previewing for. While the sequencer runs it owns that channel and this stays
    // out of the way; the next step would put it back regardless.
    if (!sequencing_.load(std::memory_order_acquire)) applyPrograms(at);
    const int timbre = timbre_[at][index].load(std::memory_order_acquire);
    addChord(at, chord, 1.0f, index, timbre);
  }

  /// Lets go of whatever [preview] is holding.
  void previewOff(const char* track) { releaseTrack(instrumentIndex(track)); }

  /// How far a channel's compressor is pulling it down right now, in decibels.
  /// The held peak of a bus (0–3) or of the master (4), linear, 0–1.
  float level(int bus) const {
    if (bus < 0 || bus > 4) return 0;
    return levels_[bus].load(std::memory_order_relaxed);
  }

  float gainReduction(int bus) const {
    if (bus < 0 || bus > 3) return 0;
    return reduction_[bus].load(std::memory_order_relaxed);
  }

  void reverb(float size, float mix) {
    reverbSize_.store(fmaxf(0.0f, fminf(1.0f, size)));
    reverbMix_.store(fmaxf(0.0f, fminf(1.0f, mix)));
    reverbDirty_.store(true, std::memory_order_release);
  }

  /// Renders [totalSteps] of the arrangement to a 16-bit stereo WAV, then lets the
  /// tail ring out. Returns the number of frames written, or 0 if it could not.
  ///
  /// Only legal while stopped. It drives the same transport and voice state the audio
  /// callback owns, and two writers would produce neither a good file nor good audio;
  /// the caller enforces this by stopping playback first. It runs as fast as the CPU
  /// allows rather than in real time, so a two-minute song takes a couple of seconds.
  ///
  /// Stopped no longer means the output is closed — it is kept open for the editor's
  /// previews — so the render takes it down itself rather than refusing. The next
  /// preview or Play opens a new one.
  int exportWav(const char* path, int totalSteps, float tailSeconds) {
    if (totalSteps <= 0 || !path) return 0;
    if (sequencing_.load(std::memory_order_acquire)) return 0;
    if (exporting_.exchange(true, std::memory_order_acq_rel)) return 0;
    closeStream();
    FILE* file = fopen(path, "wb");
    if (!file) { exporting_.store(false, std::memory_order_release); return 0; }

    sampleRate_ = kSampleRate;
    reverb_.prepare(static_cast<float>(sampleRate_));
    reverb_.configure(reverbSize_.load(), reverbMix_.load());
    reverbDirty_.store(false, std::memory_order_release);
    // A rendered file has to be the mix you heard, so the strips are rebuilt at the
    // export rate rather than left holding coefficients tuned for the output stream.
    for (auto& strip : strips_) {
      strip.prepare(static_cast<float>(sampleRate_));
      strip.reset();
    }
    stripsDirty_.store(true, std::memory_order_release);
    configureSoundFont();
    if (tsf* font = soundFont.load(std::memory_order_acquire)) tsf_note_off_all(font);
    stepFrames_ = sampleRate_ * 60.0f / bpm_.load() / kStepsPerQuarter;
    framesToStep_ = 0;
    currentStep_ = sectionIndex_ = chordIndex_ = chordStep_ = loopCount_ = barIndex_ = sectionBar_ = 0;
    crashPending_ = false;
    for (auto& voice : voices_) voice.active = false;
    for (auto& drum : drumVoices_) drum.active = false;
    for (auto& bottom : lastBottom_) bottom = 0;
    for (auto& generation : generation_) generation = 0;
    lastChord_ = -1;
    countInSteps_ = countInTotal_ = 0;  // a file starts on the song, never on a count
    stepBudget_ = totalSteps;
    exportProgress_.store(0, std::memory_order_relaxed);

    writeWavHeader(file, sampleRate_, 0);
    // A song is bounded well below this; the cap is here so a bad step count cannot
    // fill the phone's storage.
    const int maxFrames = sampleRate_ * 60 * 10;
    const int tailFrames = std::min(maxFrames, static_cast<int>(tailSeconds * sampleRate_));
    int written = 0;
    // Three phases: the song, then one beat for its last chord to ring, then the tail
    // after that chord has been let go. Without the middle one the final chord of the
    // file is cut off the instant it sounds; without the release the notes are held in
    // sustain for ever and the file ends on a chord that is still at full level, which
    // is what the first render did.
    int ringLeft = -1;
    int tailLeft = -1;
    while (written < maxFrames) {
      if (ringLeft < 0 && tailLeft < 0 && stepBudget_ == 0) {
        ringLeft = static_cast<int>(stepFrames_ * 4);
      }
      if (tailLeft == 0) break;
      const int frames = kExportBlock;
      renderBlock(exportScratch_, frames);
      if (ringLeft > 0) {
        ringLeft -= frames;
        if (ringLeft <= 0) { releaseMelodic(); ringLeft = -1; tailLeft = tailFrames; }
      } else if (tailLeft > 0) {
        tailLeft = std::max(0, tailLeft - frames);
      }
      float blockPeak = 0;
      for (int i = 0; i < frames * 2; ++i) {
        const float clamped = fmaxf(-1.0f, fminf(1.0f, exportScratch_[i]));
        blockPeak = fmaxf(blockPeak, fabsf(clamped));
        const int16_t value = static_cast<int16_t>(lrintf(clamped * 32767.0f));
        fputc(value & 0xff, file);
        fputc((value >> 8) & 0xff, file);
      }
      // The tail ends when it has actually died, not when a timer says so. A cathedral
      // needs seconds more than a room, and padding every file for the worst case
      // leaves a couple of seconds of silence on the end of most of them.
      if (tailLeft > 0 && blockPeak < kSilence) tailLeft = 0;
      written += frames;
      // Progress counts steps until the song is done and then the tail, because a bar
      // that says nothing for the last few seconds looks like a hang.
      const float done = stepBudget_ == 0
          ? 1.0f - .1f * (static_cast<float>(std::max(0, tailLeft)) /
                          fmaxf(1.0f, static_cast<float>(tailFrames)))
          : .9f * (1.0f - static_cast<float>(stepBudget_) / static_cast<float>(totalSteps));
      exportProgress_.store(fminf(1.0f, done), std::memory_order_relaxed);
    }

    // The header could not know the length before the audio existed, so it is patched
    // now that it does.
    fseek(file, 0, SEEK_SET);
    writeWavHeader(file, sampleRate_, written);
    fclose(file);

    stepBudget_ = -1;
    for (auto& voice : voices_) voice.active = false;
    for (auto& drum : drumVoices_) drum.active = false;
    if (tsf* font = soundFont.load(std::memory_order_acquire)) tsf_note_off_all(font);
    exportProgress_.store(1.0f, std::memory_order_relaxed);
    exporting_.store(false, std::memory_order_release);
    return written;
  }

  float exportProgress() const { return exportProgress_.load(std::memory_order_relaxed); }

  /// True once the SoundFont and every drum recording are in memory. Rendering before
  /// that produces a file on the fallback oscillators, which sounds like a different
  /// app and gives no sign of why.
  bool hasInstruments() const {
    if (!soundFont.load(std::memory_order_acquire)) return false;
    for (int slot = 0; slot < kSampleSlots; ++slot) {
      if (!sampleBank.data[slot].load(std::memory_order_acquire)) return false;
    }
    return true;
  }

 private:
  static aaudio_data_callback_result_t dataCallback(AAudioStream*, void* user, void* data, int32_t frames) { return static_cast<Engine*>(user)->render(static_cast<float*>(data), frames); }
  // AAudio forbids closing or opening a stream from its own error callback, so the
  // reopen runs on a thread of its own.
  static void errorCallback(AAudioStream* stream, void* user, aaudio_result_t error) {
    if (error != AAUDIO_ERROR_DISCONNECTED) return;
#ifndef CHORD_AUDIO_WEB
    std::thread([engine = static_cast<Engine*>(user), stream] { engine->reopenAfterDisconnect(stream); }).detach();
#else
    (void)user; (void)stream;  // a browser has no disconnect for AAudio to report
#endif
  }
  // Load factor: how long the callback took over how long its block lasts. Unlike a
  // CPU percentage it is immune to frequency scaling, because it compares work against
  // the deadline that actually matters. Above 1.0 the callback is late and you hear it.
  aaudio_data_callback_result_t render(float* output, int32_t frames) {
    timespec began;
    clock_gettime(CLOCK_MONOTONIC, &began);
    const int clearMask = clearVoices_.exchange(0, std::memory_order_acq_rel);
    if (clearMask != 0) {
      for (auto& voice : voices_) if (clearMask & (1 << voice.track)) voice.active = false;
      // Stop has to be silent immediately. It used to be silent because it closed the
      // stream; now that the stream stays open, a crash cymbal caught mid-ring would
      // otherwise go on ringing over a stopped song.
      if (clearMask & kClearDrums) for (auto& drum : drumVoices_) drum.active = false;
    }
    // Pieces tapped on the kit panel, taken here where the drum voices are safe to touch.
    const uint32_t previews = previewRows_.exchange(0, std::memory_order_acq_rel);
    if (previews != 0) {
      const int section = previewSection_.load(std::memory_order_acquire);
      for (int row = 0; row < kDrumRows; ++row) {
        if (previews & (1u << row)) {
          triggerDrum(drumSound_[section][row].load(std::memory_order_acquire), .9f, row);
        }
      }
    }
    if (previewClick_.exchange(false, std::memory_order_acq_rel)) click(true, true);
    renderBlock(output, frames);
    timespec ended;
    clock_gettime(CLOCK_MONOTONIC, &ended);
    const float elapsed = (ended.tv_sec - began.tv_sec) + (ended.tv_nsec - began.tv_nsec) * 1e-9f;
    const float budget = static_cast<float>(frames) / sampleRate_;
    // Two blocks are excluded, because including them made the peak say the callback
    // had missed its deadline while AAudio reported no underrun at all:
    //   - the first callbacks after the stream opens, where the caches are cold and the
    //     governor has not yet raised the clock;
    //   - unusually small blocks, where the fixed per-call work is divided by a short
    //     deadline and the ratio spikes without anything being slow.
    if (++blocksSinceStart_ > kLoadWarmupBlocks && frames >= kLoadMinFrames && budget > 0) {
      const float load = elapsed / budget;
      loadAverage_ += (load - loadAverage_) * .02f;
      // How often the callback ran over, rather than how badly it ran over once. A
      // single worst-ever block is dominated by whichever scheduling hiccup happened
      // to be the worst; a count says whether it keeps happening.
      if (load > 1.0f) lateBlocks_.fetch_add(1, std::memory_order_relaxed);
      if (load > loadPeak_) {
        loadPeak_ = load;
        // What the worst block was actually doing. A high load with few voices and a
        // short block is the ratio complaining about a fixed cost divided by a small
        // deadline; a high load with many voices is real work.
        int voices = 0;
        for (const auto& v : voices_) if (v.active) ++voices;
        for (const auto& d : drumVoices_) if (d.active) ++voices;
        peakFrames_.store(frames, std::memory_order_relaxed);
        peakVoices_.store(voices, std::memory_order_relaxed);
        peakMicros_.store(elapsed * 1e6f, std::memory_order_relaxed);
      }
      loadAvg_.store(loadAverage_, std::memory_order_relaxed);
      loadMax_.store(loadPeak_, std::memory_order_relaxed);
      // Split by whether a step fired in this block. A single peak figure says the
      // callback nearly missed its deadline but not what it was doing at the time, and
      // the two answers call for completely different fixes.
      if (triggeredThisBlock_) {
        if (load > triggerPeak_) { triggerPeak_ = load; loadTriggerMax_.store(load, std::memory_order_relaxed); }
      } else if (load > quietPeak_) {
        quietPeak_ = load; loadQuietMax_.store(load, std::memory_order_relaxed);
      }
    }
    triggeredThisBlock_ = false;
    publishSoundingNotes();
    return AAUDIO_CALLBACK_RESULT_CONTINUE;
  }

  /// Which notes each melodic track is sounding, as three 32-bit words per track
  /// covering [kNoteFloor, kNoteFloor + 96). Rebuilt once per block rather than kept
  /// up to date on every note-on and note-off: sixty-four voices scanned once a block
  /// is nothing, and a scan cannot drift out of step with the voices the way a pair of
  /// incremental updates can.
  void publishSoundingNotes() {
    uint32_t mask[3][kNoteWords] = {};
    for (const auto& v : voices_) {
      if (!v.active || v.note < kNoteFloor) continue;
      if (v.track < 0 || v.track > 2) continue;
      const int bit = v.note - kNoteFloor;
      if (bit >= kNoteWords * 32) continue;
      mask[v.track][bit / 32] |= 1u << (bit % 32);
    }
    for (int track = 0; track < 3; ++track) {
      for (int word = 0; word < kNoteWords; ++word) {
        sounding_[track][word].store(mask[track][word], std::memory_order_relaxed);
      }
    }
  }

  /// One block of audio. Shared by the live callback and the file export, so what a
  /// rendered file contains is the same signal path the phone was playing, note for
  /// note — an export that runs through a second, simpler mixer is an export that
  /// does not sound like what you made.
  void renderBlock(float* output, int32_t frames) {
    stepFrames_ = sampleRate_ * 60.0f / bpm_.load() / kStepsPerQuarter;
    // Gains are read once per block and applied while rendering rather than baked
    // into the voice at note-on, so a fader move is audible on notes already ringing.
    const float drumGain = gains_[0].load();
    const float trackGain[3] = {gains_[1].load(), gains_[2].load(), gains_[3].load()};
    const float master = master_.load();
    // Up to twice unity: a click is for playing along to, and in headphones over a full
    // song it often has to be louder than the song.
    const float clickGain = clickVolume_.load(std::memory_order_relaxed) * 2.0f;
    // Pan is resolved once per block into plain gains. Two trig calls per lane per
    // block is nothing; two per voice per sample would not be.
    const float drumPan = pan_[0].load();
    float drumL[kDrumRows], drumR[kDrumRows], panL[3], panR[3];
    for (int row = 0; row < kDrumRows; ++row) {
      panGains(fmaxf(-1.0f, fminf(1.0f, drumPan + kDrumLaneSpread[row])), drumL[row], drumR[row]);
    }
    for (int track = 0; track < 3; ++track) panGains(pan_[track + 1].load(), panL[track], panR[track]);
    // Reverb settings are applied here rather than from the platform thread, so the
    // filters are never rewritten underneath the loop that is reading them.
    if (reverbDirty_.exchange(false, std::memory_order_acq_rel)) {
      reverb_.configure(reverbSize_.load(), reverbMix_.load());
    }
    // The reverb runs every block whether or not it is heard. Skipping it while the
    // mix is down would leave the delay lines holding whatever was in them, and turning
    // the reverb back on would replay that frozen tail; the alternative is clearing a
    // quarter of a megabyte from inside the callback, which is worse than the twenty-four
    // multiply-adds a sample this costs.
    // The SoundFont renders per block, not per sample, so the loop below reads what it
    // produced. It comes out stereo and now stays that way: tsf pans each channel
    // itself, which is where a sampled instrument's own stereo image lives.
    tsf* font = soundFont.load(std::memory_order_acquire);
    int rendered = 0;
    if (font) {
      rendered = std::min(frames, kSfScratch);
      // One buffer per melodic channel rather than one mixed one, so each instrument
      // can be given its own tone and compression. Every voice is still rendered
      // exactly once — see tsf_render_float_channel.
      for (int track = 0; track < 3; ++track) {
        tsf_render_float_channel(font, track, sfScratch_[track], rendered, 0);
      }
    }
    // Strip settings are applied here, not from the platform thread, so a coefficient
    // set is never half-written underneath the loop reading it — the same reason the
    // reverb is configured here.
    if (stripsDirty_.exchange(false, std::memory_order_acq_rel)) {
      for (int bus = 0; bus < 4; ++bus) {
        strips_[bus].configure(static_cast<float>(sampleRate_), stripLow_[bus].load(),
                               stripMid_[bus].load(), stripHigh_[bus].load(),
                               stripThreshold_[bus].load(), stripRatio_[bus].load());
      }
    }
    // The stream outlives Stop so the editor can be heard with the song parked, which
    // means the clock has to be told when to run rather than assuming that a block being
    // rendered is a song being played. An export renders these same blocks with no
    // stream at all and its own budget of steps, so it advances on that instead.
    // The loudest sample each bus and the master reach in this block, for the meters.
    float peak[5] = {0, 0, 0, 0, 0};
    const bool advance = sequencing_.load(std::memory_order_relaxed) || stepBudget_ >= 0;
    for (int i = 0; i < frames; ++i) {
      if (advance && framesToStep_-- <= 0) {
        if (countInSteps_ > 0) {
          // Straight rather than swung: swing only moves steps inside a beat, never the
          // beat, so the song's first step still falls exactly where the next beat would.
          countInStep();
          framesToStep_ += stepFrames_;
        } else {
          if (countInTotal_ > 0) {
            countInTotal_ = 0;
            countInBeat_.store(0, std::memory_order_release);
          }
          const int played = currentStep_;
          triggerStep();
          framesToStep_ += stepFrames_ * swingScale(played);
        }
      }
      // Four buses — drums, piano, guitar, bass — kept apart until each has been
      // through its own strip. They used to be summed as they were produced, which is
      // why there was nowhere to put a per-instrument EQ.
      float busL[4] = {0, 0, 0, 0}, busR[4] = {0, 0, 0, 0};
      float clicked = 0;
      drums(drumGain, drumL, drumR, busL[0], busR[0], clicked);
      voices(trackGain, panL, panR, font, busL, busR);
      if (i < rendered) {
        for (int track = 0; track < 3; ++track) {
          busL[track + 1] += sfScratch_[track][i * 2];
          busR[track + 1] += sfScratch_[track][i * 2 + 1];
        }
      }
      float left = 0, right = 0;
      for (int bus = 0; bus < 4; ++bus) {
        strips_[bus].process(busL[bus], busR[bus]);
        peak[bus] = fmaxf(peak[bus], fmaxf(fabsf(busL[bus]), fabsf(busR[bus])));
        left += busL[bus];
        right += busR[bus];
      }
      float wetL = 0, wetR = 0;
      reverb_.process(left, right, wetL, wetR);
      left += wetL; right += wetR;
      if (clickLevel_ > .0001f) {
        clicked += sinf(clickPhase_) * clickLevel_ * .5f;
        clickPhase_ += 2.0f * kPi * clickFreq_ / sampleRate_;
        if (clickPhase_ > 2.0f * kPi) clickPhase_ -= 2.0f * kPi;
        clickLevel_ *= clickDecay_;
      }
      // The click joins after the master and after the song's saturation. It used to go in
      // before both, at a fifth of full scale, so it followed the master fader down and was
      // squashed along with a loud song — and a sine pip under a kick landing on the same
      // beat simply vanished. On its own gain it stays where you put it.
      clicked *= clickGain;
      const float mixL = tanhf(left * master), mixR = tanhf(right * master);
      peak[4] = fmaxf(peak[4], fmaxf(fabsf(mixL), fabsf(mixR)));
      output[i * 2] = fmaxf(-1.0f, fminf(1.0f, mixL + clicked));
      output[i * 2 + 1] = fmaxf(-1.0f, fminf(1.0f, mixR + clicked));
    }
    // Published once a block rather than once a sample: the meter is read at 8 Hz and
    // an atomic store per sample per bus would cost more than the compressor does.
    for (int bus = 0; bus < 4; ++bus) {
      reduction_[bus].store(strips_[bus].reduction, std::memory_order_relaxed);
    }
    // Held peaks that fall back over about a quarter of a second, so a meter read a few
    // times a second still shows the hit that happened between two reads.
    const float fall = expf(-static_cast<float>(frames) / (0.25f * sampleRate_));
    for (int bus = 0; bus < 5; ++bus) {
      levels_[bus].store(fmaxf(levels_[bus].load(std::memory_order_relaxed) * fall, peak[bus]),
                         std::memory_order_relaxed);
    }
  }
  /// Where in a track's lane this step of this bar falls. The step counter never
  /// leaves the bar; the bar counter walks across the pattern and wraps at its length,
  /// so a two-bar part and a one-bar part are always on the same beat of their own bar.
  int laneStep(int section, int track, int step) const {
    const int bars = patternBars_[section][track].load(std::memory_order_relaxed);
    const int bar = bars <= 1 ? 0 : (barIndex_ % bars);
    const int at = bar * stepsPerBar_.load(std::memory_order_relaxed) + step;
    return at < kMaxSteps ? at : step;
  }

  /// Where this step sits in a bar the section's fill plays over: 0 on that bar's first
  /// step, -1 in any other bar. Two kinds of bar get one.
  ///
  /// The last bar of the section's last pass, counted back from where the section really
  /// ends — a part that is not a whole number of bars still fills into the next downbeat,
  /// not into a bar line that never comes.
  ///
  /// And every kPhraseBars-th bar of the part, which is where a drummer marks the end of
  /// a phrase whether or not anything new starts after it. Not in the two bars before the
  /// section's own way out, where it would land a bar ahead of that fill and sound like a
  /// stumble. A part held in a loop never ends, so it only ever gets this kind.
  ///
  /// midi_export.dart counts both the same way.
  int fillStep(const Arrangement& arrangement) const {
    if (sectionIndex_ >= arrangement.sectionCount) return -1;
    const Section& section = arrangement.sections[sectionIndex_];
    if (section.chordCount == 0) return -1;
    const int bar = stepsPerBar_.load(std::memory_order_relaxed);
    if (!section.infinite && loopCount_ + 1 >= section.loop) {
      const int perBeat = stepsPerBeat_.load(std::memory_order_relaxed);
      const bool inRange = chordIndex_ < section.chordCount;
      const int chord = inRange ? chordIndex_ : 0;
      int total = 0, elapsed = inRange ? chordStep_ : 0;
      for (int i = 0; i < section.chordCount; ++i) {
        int steps = (section.chords[i].halfBeats * perBeat) / 2;
        if (steps < 1) steps = 1;
        if (i < chord) elapsed += steps;
        total += steps;
      }
      const int remaining = total - elapsed;
      if (remaining > 0 && remaining <= bar) return bar - remaining;
      if (remaining <= 2 * bar) return -1;
    }
    return (sectionBar_ + 1) % kPhraseBars == 0 ? currentStep_ : -1;
  }

  /// One step of the count-in: on each beat the cowbell, harder on the first so the ear
  /// knows where the count starts, and the number of beats left for the screen.
  void countInStep() {
    const int perBeat = std::max(1, stepsPerBeat_.load(std::memory_order_relaxed));
    const int counted = countInTotal_ - countInSteps_;
    if (counted % perBeat == 0) {
      triggerDrum(kSCountIn, counted == 0 ? 1.0f : .7f, kNoRow);
      countInBeat_.store(countInSteps_ / perBeat, std::memory_order_release);
    }
    --countInSteps_;
  }

  void triggerStep() {
    // The export renders a fixed number of steps and then lets the tail ring. Stopping
    // the sequencer here rather than at the block boundary is what keeps the last note
    // of a file from being a stray one from the top of the loop.
    if (stepBudget_ == 0) return;
    if (stepBudget_ > 0) --stepBudget_;
    triggeredThisBlock_ = true;
    // Changing meter mid-bar can leave the counter past the end of the new one. Coming
    // back to the top here rather than playing the orphaned step is what keeps a switch
    // to a shorter bar from sounding a hit that is no longer in the pattern.
    if (currentStep_ >= stepsPerBar_.load(std::memory_order_relaxed)) currentStep_ = 0;
    const int step = currentStep_;
    // The click, on every beat or every half beat. Never during an export: a metronome is
    // something you play along to, not part of the song — stepBudget_ is only
    // non-negative while rendering to a file.
    if (metronome_.load(std::memory_order_relaxed) && stepBudget_ < 0) {
      const int perBeat = stepsPerBeat_.load(std::memory_order_relaxed);
      const int every =
          clickDivision_.load(std::memory_order_relaxed) == 2 && perBeat % 2 == 0 ? perBeat / 2 : perBeat;
      if (every > 0 && step % every == 0) click(step == 0, step % perBeat == 0);
    }
    // Silence is checked before the step is read, not after the voice is made: a part
    // that does not play its drums should cost nothing, and a hit that is triggered and
    // then muted is still a voice taken from the pool.
    const Arrangement& arrangement = arrangements_[activeArrangement_.load(std::memory_order_acquire)];
    // Taken whether or not it can sound, so a part with its drums silenced does not keep
    // the crash for some later downbeat that nothing filled into.
    const bool crash = crashPending_;
    crashPending_ = false;
    if (!silent_[sectionIndex_][3].load(std::memory_order_acquire)) {
      if (crash) {
        triggerDrum(drumSound_[sectionIndex_][kCrashRow].load(std::memory_order_acquire), .85f, kCrashRow);
      }
      const int at = laneStep(sectionIndex_, 3, step);
      // Inside a bar the fill plays over, it takes over the lanes it writes from the step
      // it starts on. Everywhere else this is the groove as ever.
      const int inFill = fillStep(arrangement);
      const bool filling = inFill >= 0 && inFill < kMaxStepsPerBar &&
                           inFill >= fillFrom_[sectionIndex_].load(std::memory_order_acquire);
      const int mask = filling ? fillMask_[sectionIndex_].load(std::memory_order_acquire) : 0;
      for (int row = 0; row < kDrumRows; ++row) {
        const int packed = (mask & (1 << row))
                               ? fill_[sectionIndex_][row][inFill].load(std::memory_order_acquire)
                               : drums_[sectionIndex_][row][at].load();
        const float velocity = stepVelocity(packed) / 255.0f;
        if (velocity > 0) {
          triggerDrum(drumSound_[sectionIndex_][row].load(std::memory_order_acquire), velocity, row);
        }
      }
    }
    if (arrangement.sectionCount > 0) {
      if (sectionIndex_ >= arrangement.sectionCount) { sectionIndex_ = 0; chordIndex_ = 0; chordStep_ = 0; loopCount_ = 0; }
      const Section& section = arrangement.sections[sectionIndex_];
      if (chordIndex_ >= section.chordCount) { chordIndex_ = 0; chordStep_ = 0; }
      // The bar rides along so the grid can show the playhead on the bar being
      // played rather than on whichever bar happens to be open. So does the repeat,
      // in the three bits above the chord (which never needs more than five), so the
      // section card can say which time round it is.
      reportedPosition_.store(int64_t(std::min(chordStep_, 0xffff)) << 32 | (barIndex_ % kMaxBars) << 24 | (sectionIndex_ << 16) |
                                  (std::min(loopCount_, 7) << 13) | (chordIndex_ << 8) | step,
                              std::memory_order_release);
      if (section.chordCount > 0) {
      // A sustaining voice must stop when its chord does, or it keeps holding the old
      // harmony under the new one. Detected here, before this step fires, so the
      // release never lands on notes that were just triggered.
      const int chordId = (sectionIndex_ << 8) | chordIndex_;
      if (chordId != lastChord_) { releaseMelodic(); lastChord_ = chordId; }
      applyPrograms(sectionIndex_);
      const Chord& c = section.chords[chordIndex_];
      for (int track = 0; track < 3; ++track) {
        if (silent_[sectionIndex_][track].load(std::memory_order_acquire)) continue;
        const int packed = instruments_[sectionIndex_][track][laneStep(sectionIndex_, track, step)].load();
        const int degree = stepDegree(packed);
        float velocity = stepVelocity(packed) / 255.0f;
        if (velocity <= 0 || degree == kRest) continue;
        if (stepAccent(packed)) velocity = fminf(1.0f, velocity * 1.3f);
        const int timbre = timbre_[sectionIndex_][track].load(std::memory_order_acquire);
        retrigger(track);
        if (degree == kChordAll) {
          addChord(sectionIndex_, c, velocity, track, timbre);
        } else {
          // A single tone carries the level a whole chord would have had, so swapping
          // a block chord for an arpeggio does not drop the track in the mix.
          const float gain = velocity * (track == 2 ? 1.0f : .66f);
          const int note = chordTone(sectionIndex_, c, degree, track, stepOctave(packed));
          addVoice(sectionIndex_, hzFromMidi(note), gain, track, timbre, note);
          // A second tone in the same step: root and octave together is what a boogie
          // bass does, and it is not the same as the two alternating.
          const int degree2 = stepDegree2(packed);
          if (degree2 != kRest && degree2 != kChordAll) {
            const int note2 = chordTone(sectionIndex_, c, degree2, track, stepOctave2(packed));
            addVoice(sectionIndex_, hzFromMidi(note2), gain * .8f, track, timbre, note2);
          }
        }
      }
      // Length arrives in half beats so a chord can land on the offbeat. The halving
      // is exact wherever a beat divides into an even number of steps, which every
      // meter the app offers does; anywhere it would not, the floor is still a whole
      // step and one step is the floor, so a chord always lasts.
      int chordSteps = (c.halfBeats * stepsPerBeat_.load(std::memory_order_relaxed)) / 2;
      if (chordSteps < 1) chordSteps = 1;
      if (++chordStep_ >= chordSteps) {
        chordStep_ = 0; ++chordIndex_;
      }
      }
      if (section.chordCount == 0 || chordIndex_ >= section.chordCount) {
        if (section.infinite || ++loopCount_ < section.loop) { chordIndex_ = 0; chordStep_ = 0; }
        else {
          // The part being left filled into this one unless its fill is off, so the next
          // step — this part's downbeat — lands on a crash. Not when that fill crashed
          // already: a second crash a beat after the first is a stumble, not an arrival.
          const int leaving = fillMask_[sectionIndex_].load(std::memory_order_acquire);
          crashPending_ = leaving != 0 && !(leaving & (1 << kCrashRow));
          // On repeat, the part comes round again instead of handing over to the next.
          const int only = loopOnly_.load(std::memory_order_relaxed);
          sectionIndex_ = only >= 0 && only < arrangement.sectionCount
                              ? only
                              : (sectionIndex_ + 1) % arrangement.sectionCount;
          loopCount_ = 0; chordIndex_ = 0; chordStep_ = 0;
          // A new part starts its patterns from the top. A two-bar groove landing on
          // its second bar because of what came before is not an arrangement, it is a
          // coin toss.
          //
          // The top is the next bar line when this is the last step of a bar — which is
          // where nearly every part ends — and the wrap just below moves the counter on
          // by one. Setting it to 0 here, as it was, started every part after the first
          // on its second bar. midi_export.dart counts the same way.
          const bool onBarLine = currentStep_ + 1 >= stepsPerBar_.load(std::memory_order_relaxed);
          barIndex_ = onBarLine ? kMaxBars - 1 : 0;
          // The same count without the wrap at four, for the phrase fills.
          sectionBar_ = onBarLine ? -1 : 0;
        }
      }
    }
    // Reading the bar length here rather than caching it is what lets the meter change
    // while the transport is running: the next step wraps at the new bar, and a step
    // already past the end of it comes back to the top instead of running off the
    // pattern.
    const int bar = stepsPerBar_.load(std::memory_order_relaxed);
    if (++currentStep_ >= bar) {
      currentStep_ = 0;
      barIndex_ = (barIndex_ + 1) % kMaxBars;
      ++sectionBar_;
    }
  }
  /// One tone of the chord, as a MIDI note. The root is anchored in the track's
  /// register and everything else is stacked above it by its interval, so "the fifth"
  /// is the fifth of this chord rather than whichever fifth happens to be nearby.
  int chordTone(int section, const Chord& chord, int degree, int track, int octaveShift) {
    const ChordType& type = kChordTypes[chord.type];
    const Window window = windowOf(section, track);
    // A slash chord names the note that goes underneath. On the bass track the root
    // degree is what "the chord's own note" means, so that is where the named one goes;
    // every other degree still stacks from the real root.
    const int rootClass = (track == 2 && degree == kRoot && chord.bass >= 0)
                              ? chord.bass % 12
                              : chord.root % 12;
    // The root goes in the range and the asked-for tone is stacked above it, the same
    // way [voiceChord] builds a whole chord. Folding each tone on its own put "the
    // seventh" wherever the window happened to start, which could be below the root —
    // a seventh under its own root is not the note the pattern asked for.
    const int rootNote = window.low + ((rootClass - window.low) % 12 + 12) % 12;
    int note = rootNote;
    if (degree == kOctave) {
      // Two octaves of room means the octave above the root is simply in the range now,
      // rather than the one degree that had to be let out of it.
      note = rootNote + 12;
    } else {
      // A triad asked for a seventh gets its fifth rather than silence.
      const int index = std::max(0, std::min(degree - kRoot, type.count - 1));
      note = rootNote + type.intervals[index];
    }
    // The step's own octave shift still applies on top: that is written into the
    // pattern and is a deliberate leap, not a register the range is meant to override.
    return std::max(kNoteFloor, std::min(108, note + octaveShift * 12));
  }

  // Voice leading: put each chord tone in the octave nearest to whatever played the
  // same position in the previous chord. Consecutive chords then share a register and
  // the inner voices barely move, which is what a keyboard player actually does.
  // Spelling every chord in root position is what makes a progression sound stepped.
  int voiceChord(int section, const Chord& chord, int track, int* notes) {
    const ChordType& type = kChordTypes[chord.type];
    const Window window = windowOf(section, track);
    const int anchor = window.anchor;
    int& previousBottom = lastBottom_[track];
    const int target = previousBottom > 0 ? previousBottom : anchor;

    // Every tone the chord has. There used to be a count here, choosing which ones
    // survived when a track was told to play fewer — the fifth given up before the
    // third, and so on. It was always left on all, and a chord's tones are the chord's.
    const int count = type.count;
    // The root is placed in the range and every other tone is stacked above it by its
    // real interval — which is how a chord is built, and how anyone playing one holds
    // it.
    //
    // Folding each tone separately into a single octave is what this replaced, and it
    // was wrong in a way you could hear. Where a tone landed depended on where the
    // window happened to start, so a C major seventh on the guitar, whose range starts
    // on G, put its B a semitone *under* the root: G3 B3 C4 E4. That is not a major
    // seventh, it is a cluster, and the chord stopped sounding like the one you had
    // written. The same chord on the piano was fine, which is why this looked like the
    // guitar being broken rather than the rule being wrong.
    //
    // Stacking needs room, so the range is two octaves rather than one. A triad or a
    // seventh spans at most eleven semitones, so from a root anywhere in the lower
    // octave it always fits.
    //
    // A ninth or an eleventh can reach past the top, and it is left there. Bringing it
    // back down an octave was tried and it recreated the very fault this replaced: in
    // A♯m9 the ninth came down onto 72, a semitone under the minor third at 73. A tone
    // that has to move to fit is a tone in the wrong place, and a ninth sounding a
    // little above the drawn register is what a ninth actually is.
    const int rootNote = window.low + ((chord.root % 12 - window.low) % 12 + 12) % 12;
    for (int i = 0; i < count; ++i) notes[i] = rootNote + type.intervals[i];
    // Ascending, so the caller and the keyboard both see a chord rather than a set.
    for (int i = 1; i < count; ++i) {
      for (int j = i; j > 0 && notes[j] < notes[j - 1]; --j) {
        const int swap = notes[j]; notes[j] = notes[j - 1]; notes[j - 1] = swap;
      }
    }
    previousBottom = notes[0];


    // A slash chord's named note goes underneath, which is what naming it is for. With
    // two octaves to work in it can finally sit in the lower one, below the chord it is
    // carrying, instead of being folded in among the others.
    if (chord.bass >= 0 && count < kMaxChordVoices) {
      const int bassClass = chord.bass % 12;
      const int note = window.low + ((bassClass - window.low) % 12 + 12) % 12;
      bool already = false;
      for (int i = 0; i < count; ++i) if (notes[i] == note) already = true;
      if (!already) {
        int at = count;
        while (at > 0 && notes[at - 1] > note) { notes[at] = notes[at - 1]; --at; }
        notes[at] = note;
        return count + 1;
      }
    }
    return count;
  }
  void addChord(int section, const Chord& chord, float gain, int track, int timbre) {
    int notes[kMaxChordVoices];
    const int count = voiceChord(section, chord, track, notes);
    // Spread over sqrt(count), not count. Notes at different pitches sum incoherently,
    // so dividing by three left a triad audibly quieter than a single note. With the
    // SoundFont it was worse than a level problem: this gain is the note-on velocity,
    // so every chord note was firing a softer sample and changing timbre too.
    const float perVoice = gain * .66f / sqrtf(static_cast<float>(count));
    for (int i = 0; i < count; ++i) addVoice(section, hzFromMidi(notes[i]), perVoice, track, timbre, notes[i]);
  }
  float noise() { noise_ = noise_ * 1664525u + 1013904223u; return (static_cast<int>(noise_ >> 9) / 4194304.0f) - 1.0f; }
  // One-pole coefficient for a cutoff in Hz. Getting the 2*pi wrong here drops the
  // cutoff below the fundamental and the voice all but disappears.
  float lowpass(float cutoffHz) const { return fminf(.95f, 2 * kPi * cutoffHz / sampleRate_); }
  // Per-sample multiplier that reaches inaudibility after the given time.
  float coefFor(float seconds) const { return expf(-9.21034f / fmaxf(seconds, .001f) / sampleRate_); }
  // Richer timbres ring longer, so a free slot is no longer guaranteed. Stealing the
  // quietest voice drops the least audible note instead of silently losing the new one.
  int allocateVoice() {
    for (int i = 0; i < kVoices; ++i) if (!voices_[i].active) return i;
    int quietest = 0; float lowest = voices_[0].gain * voices_[0].level;
    for (int i = 1; i < kVoices; ++i) { const float level = voices_[i].gain * voices_[i].level; if (level < lowest) { lowest = level; quietest = i; } }
    return quietest;
  }
  void addVoice(int section, float frequency, float gain, int track, int timbre, int midiNote = -1) {
    const int index = allocateVoice();
    Voice& v = voices_[index];
    v = {};
    v.active = true; v.track = track; v.timbre = timbre; v.note = midiNote;
    // A note that is struck is a different fact from a note that is sounding. The
    // guitar holds one chord for a whole bar, so its keys were lit the entire time and
    // there was no way to see it play at all. This is set on the strike and cleared
    // when the screen reads it.
    if (track >= 0 && track <= 2 && midiNote >= kNoteFloor) {
      const int bit = midiNote - kNoteFloor;
      if (bit < kNoteWords * 32) {
        struck_[track][bit / 32].fetch_or(1u << (bit % 32), std::memory_order_relaxed);
      }
    }
    v.stage = kAttack; v.level = 0; v.generation = generation_[track];
    // How long this note is held, in steps, turned into frames at the tempo it was
    // struck at. A tempo change while it rings does not stretch it, which is what a
    // player would do: the note was already that long when it started.
    if (track >= 0 && track <= 2) {
      const float steps = gateSteps_[(section < 0 || section >= kSections) ? 0 : section][track].load(std::memory_order_relaxed);
      v.gate = steps > 0 ? static_cast<int>(steps * stepFrames_) : -1;
    }
    v.dt = frequency / sampleRate_; v.gain = gain; v.decay = .9990f; v.attack = 1.0f;
    v.sustain = 0; v.release = coefFor(.06f);
    v.phase2 = .33f; v.phase3 = .66f;  // stagger so detuned pairs do not start in phase
    switch (timbre) {
      case kSine:      v.decay = .99920f; break;
      case kFmEp:      v.decay = .99930f; v.aux = 1.0f; break;
      case kPartials:  v.decay = .99910f; v.aux = 1.0f; break;
      case kOrgan:     v.decay = coefFor(.30f); v.sustain = .85f; v.release = coefFor(.12f); break;
      // A pad needs its decay to outlast its own attack, otherwise the note is
      // already fading by the time the ramp finishes and it never gets loud.
      case kPad:       v.decay = coefFor(1.2f); v.sustain = .62f; v.release = coefFor(.55f);
                       v.attack = 1.0f / (.09f * sampleRate_); v.lpCoef = lowpass(1800.0f); break;
      case kSaw:       v.decay = .99880f; break;
      case kPluck:
      case kMuted: {
        v.decay = timbre == kMuted ? .99750f : .99985f;
        v.lpCoef = timbre == kMuted ? .35f : .50f;  // loop brightness
        v.aux = timbre == kMuted ? .99200f : .99950f;  // loss per round trip: how long the string rings
        // An integer delay line can only produce sampleRate/N Hz, which put the top
        // note of a chord as much as 20 cents sharp. The period is split into an
        // integer delay plus an allpass for the remainder, and the lowpass sitting in
        // the loop contributes its own delay of (1-a)/a samples.
        const float period = sampleRate_ / fmaxf(frequency, 20.0f);
        float loop = period - (1.0f - v.lpCoef) / v.lpCoef;
        if (loop < 3.0f) loop = 3.0f;
        v.ksLen = std::min(kKsMax, static_cast<int>(loop));
        float fraction = loop - v.ksLen;
        // The allpass is best behaved away from zero delay, so borrow a whole sample.
        if (fraction < .1f && v.ksLen > 2) { --v.ksLen; fraction += 1.0f; }
        v.apC = (1.0f - fraction) / (1.0f + fraction);
        float* buffer = ksBuffers[index];
        for (int i = 0; i < v.ksLen; ++i) buffer[i] = noise();
        break;
      }
      case kTriangle:  v.decay = .99900f; break;
      case kOverdrive: v.decay = .99890f; break;
      case kSub:       v.decay = coefFor(.45f); v.sustain = .30f; v.release = coefFor(.10f); break;
      case kReese:     v.decay = coefFor(.50f); v.sustain = .38f; v.release = coefFor(.14f); v.lpCoef = lowpass(700.0f); break;
      case kSquare:    v.decay = coefFor(.38f); v.sustain = .22f; v.release = coefFor(.09f); break;
      case kSampled: {
        // The SoundFont owns this note from here: its own envelope, filter and loop
        // points shape it, so our voice only exists to remember what to release.
        tsf* font = soundFont.load(std::memory_order_acquire);
        if (font) {
          v.sampleNote = midiNote;
          tsf_channel_note_on(font, track, midiNote, fminf(1.0f, gain));
          v.decay = coefFor(30.0f); v.sustain = 1.0f; v.release = coefFor(.001f);
        } else {
          v.timbre = kSine;  // bank not loaded yet: stay audible rather than silent
          v.decay = .99920f; v.sustain = 0; v.release = coefFor(.06f);
        }
        break;
      }
    }
  }
  float renderVoice(Voice& v, float* ks) {
    switch (v.timbre) {
      case kFmEp: {
        // Two-operator FM. The modulation index falls faster than the carrier, which is
        // what gives a Rhodes its bright attack and mellow tail.
        v.phase = wrap(v.phase + v.dt); v.phase2 = wrap(v.phase2 + v.dt * 2.0f);
        v.aux *= .99975f;
        return osc(v.phase + osc(v.phase2) * v.aux * .9f);
      }
      case kPartials: {
        // Struck-string spectrum: upper partials are quieter and die sooner.
        v.phase = wrap(v.phase + v.dt); v.phase2 = wrap(v.phase2 + v.dt * 2.0f); v.phase3 = wrap(v.phase3 + v.dt * 3.0f);
        v.aux *= .99965f;
        return (osc(v.phase) + osc(v.phase2) * .30f * v.aux + osc(v.phase3) * .14f * v.aux * v.aux) * .85f;
      }
      case kOrgan:
        v.phase = wrap(v.phase + v.dt); v.phase2 = wrap(v.phase2 + v.dt * 2.0f); v.phase3 = wrap(v.phase3 + v.dt * 4.0f);
        return (osc(v.phase) + osc(v.phase2) * .5f + osc(v.phase3) * .35f) * .6f;
      case kPad: {
        // Two saws a few cents apart; the filter keeps the detune from turning harsh.
        v.phase = wrap(v.phase + v.dt); v.phase2 = wrap(v.phase2 + v.dt * 1.006f);
        const float raw = (saw(v.phase, v.dt) + saw(v.phase2, v.dt * 1.006f)) * .85f;
        v.lp += (raw - v.lp) * v.lpCoef;
        return v.lp;
      }
      case kSaw:
        v.phase = wrap(v.phase + v.dt);
        return saw(v.phase, v.dt) * .85f;
      case kPluck:
      case kMuted: {
        // Karplus-Strong: read the delay line, damp it, write it back. lpCoef sets how
        // bright the string is, aux how fast it loses energy — that pair is what
        // separates an open pluck from a palm-muted one.
        const float delayed = ks[v.ksRead];
        const float tuned = v.apC * (delayed - v.apY) + v.apX;  // fractional delay
        v.apX = delayed;
        v.apY = tuned;
        v.lp += (tuned - v.lp) * v.lpCoef;
        ks[v.ksRead] = v.lp * v.aux;
        if (++v.ksRead >= v.ksLen) v.ksRead = 0;
        return tuned * .85f;
      }
      case kTriangle:
        v.phase = wrap(v.phase + v.dt);
        return triangle(v.phase) * .95f;
      case kOverdrive:
        v.phase = wrap(v.phase + v.dt);
        return tanhf(saw(v.phase, v.dt) * 3.2f) * .85f;
      case kSub:
        v.phase = wrap(v.phase + v.dt); v.phase2 = wrap(v.phase2 + v.dt * 2.0f);
        return osc(v.phase) + osc(v.phase2) * .18f;
      case kReese: {
        v.phase = wrap(v.phase + v.dt); v.phase2 = wrap(v.phase2 + v.dt * 1.008f);
        const float raw = (saw(v.phase, v.dt) + saw(v.phase2, v.dt * 1.008f)) * .75f;
        v.lp += (raw - v.lp) * v.lpCoef;
        return v.lp;
      }
      case kSquare:
        v.phase = wrap(v.phase + v.dt);
        return square(v.phase, v.dt) * .80f;
      case kSampled:
        return 0;  // the SoundFont renders this note; the voice only tracks its release
      default:
        v.phase = wrap(v.phase + v.dt);
        return osc(v.phase);
    }
  }
  // With sustain at zero the decay stage reduces to level *= decay, which is exactly
  // what the engine did before. Only the sustaining timbres change behaviour, and they
  // are the ones that were wrong.
  void advanceEnvelope(Voice& v) {
    switch (v.stage) {
      case kAttack:
        v.level += v.attack;
        if (v.level >= 1.0f) { v.level = 1.0f; v.stage = kDecay; }
        break;
      case kDecay:
        v.level = v.sustain + (v.level - v.sustain) * v.decay;
        if (v.level <= v.sustain + .0001f) {
          if (v.sustain < .0001f) { v.active = false; return; }
          v.level = v.sustain;
          v.stage = kSustain;
        }
        break;
      case kSustain:
        break;  // holds until the chord changes or the lane retriggers
      case kRelease:
        v.level *= v.release;
        break;
    }
    if (v.stage != kSustain && v.level < .0001f) v.active = false;
  }

  /// Writes into the melodic buses, which are 1..3 — bus 0 is the drums.
  void voices(const float* trackGain, const float* panL, const float* panR, tsf* font,
              float* busL, float* busR) {
    for (int i = 0; i < kVoices; ++i) {
      Voice& v = voices_[i];
      if (!v.active) continue;
      const float sample = renderVoice(v, ksBuffers[i]) * v.gain * v.level * trackGain[v.track];
      busL[v.track + 1] += sample * panL[v.track];
      busR[v.track + 1] += sample * panR[v.track];
      advanceEnvelope(v);
      // The gate is what gives a track a note length of its own. Unlike a chord
      // change it applies to plucked timbres too: a staccato piano is the whole
      // point, and leaving those alone here would make the setting do nothing on
      // half the sounds.
      if (v.gate > 0 && --v.gate == 0) releaseVoice(v, font);
    }
  }

  /// Points the sampled channels at what this section plays, if they are not there
  /// already. Called on every step and does nothing on almost all of them: the compare
  /// is three loads, and only a section that actually changes instrument pays for the
  /// preset lookup underneath.
  void applyPrograms(int section) {
    if (section < 0 || section >= kSections) return;
    tsf* font = soundFont.load(std::memory_order_acquire);
    if (!font) return;
    for (int track = 0; track < 3; ++track) {
      const int program = program_[section][track].load(std::memory_order_relaxed);
      if (program == appliedProgram_[track]) continue;
      tsf_channel_set_presetnumber(font, track, program, 0);
      appliedProgram_[track] = program;
    }
  }

  /// Puts one voice into its release stage. A SoundFont note keeps sounding until it
  /// is told to stop; our envelope only decides when to say so.
  void releaseVoice(Voice& v, tsf* font) {
    if (v.stage == kRelease) return;
    v.stage = kRelease;
    v.gate = -1;
    if (v.timbre == kSampled && font && v.sampleNote >= 0) {
      tsf_channel_note_off(font, v.track, v.sampleNote);
    }
  }

  /// Sends a track's sustaining notes into release. Voices that are already decaying to
  /// silence are left alone: cutting a ringing pluck short sounds worse than letting it
  /// ring across the chord change, which is what a real player does.
  void releaseTrack(int track) {
    tsf* font = soundFont.load(std::memory_order_acquire);
    for (auto& v : voices_) {
      if (v.active && v.track == track && v.sustain > 0.0f) releaseVoice(v, font);
    }
  }
  void releaseMelodic() { for (int track = 0; track < 3; ++track) releaseTrack(track); }

  /// A lane hitting again is a new note, so whatever that track was holding lets go.
  void retrigger(int track) { releaseTrack(track); ++generation_[track]; }
  /// Hats are one instrument on a real kit: closing it stops whatever it was ringing.
  static bool isHat(int sound) {
    return sound == kHatClosed || sound == kHatOpen ||
           sound == kSHat || sound == kSHatOpen || sound == kSHatFoot ||
           sound == kSHat2 || sound == kSHatOpen2 ||
           sound == kSHatAp1 || sound == kSHatOpenAp1 ||
           sound == kSHatBrutalist || sound == kSHatOpenBrutalist ||
           sound == kSHatChase || sound == kSHatOpenChase ||
           sound == kSHatRunIt || sound == kSHatOpenRunIt;
  }

  /// A free voice, or failing that the one that matters least: one already fading out,
  /// else the one struck longest ago. It used to be the quietest by amp, but a
  /// recording's amp is its velocity and never decays — so a full pool gave up the
  /// softest hit however new it was, and the snare after a fill lost its voice to the
  /// next hit on the same step before it had made a sound.
  int allocateDrumVoice() {
    int pick = -1;
    for (int i = 0; i < kDrumVoices; ++i) {
      const DrumVoice& voice = drumVoices_[i];
      if (!voice.active) return i;
      if (pick < 0) { pick = i; continue; }
      const DrumVoice& best = drumVoices_[pick];
      const bool fading = voice.fadeStep > 0, bestFading = best.fadeStep > 0;
      if (fading != bestFading ? fading : voice.serial < best.serial) pick = i;
    }
    return pick;
  }

  /// How many hits of one piece may ring at once. A drum struck again damps what it was
  /// still ringing, so two is enough to hear a roll; a cymbal washes, so it keeps three.
  static int hitsPerPiece(int row) { return row == kCrashRow || row == kCrashRow - 1 ? 3 : 2; }

  static void fadeOut(DrumVoice& voice, float step) {
    if (voice.fadeStep <= 0) voice.fadeStep = step;
  }

  /// One metronome click. The downbeat is louder and, on the pip, higher — when accenting
  /// is on — so you can hear where the bar starts; a half-beat click is softer than a beat.
  void click(bool downbeat, bool onBeat) {
    const bool accented = downbeat && clickAccent_.load(std::memory_order_relaxed);
    const float velocity = accented ? 1.0f : onBeat ? .72f : .45f;
    const int sound = clickSound_.load(std::memory_order_relaxed);
    if (sound == kClickBeep) {
      clickLevel_ = velocity;
      clickPhase_ = 0;
      clickFreq_ = accented ? 1600.0f : onBeat ? 1000.0f : 800.0f;
      return;
    }
    triggerDrum(sound, velocity, kNoRow);
  }

  void triggerDrum(int sound, float velocity, int row) {
    const float choke = 1.0f / (kChokeSeconds * sampleRate_);
    if (isHat(sound)) {
      for (auto& voice : drumVoices_) if (voice.active && isHat(voice.sound)) fadeOut(voice, choke);
    } else if (row >= 0) {
      // Struck again, a piece damps its oldest ring once it already has as many as it
      // keeps. Without this every hit of a long recording held a voice until its tail
      // ran out.
      int ringing = 0;
      DrumVoice* oldest = nullptr;
      for (auto& voice : drumVoices_) {
        if (!voice.active || voice.row != row || voice.fadeStep > 0) continue;
        ++ringing;
        if (!oldest || voice.serial < oldest->serial) oldest = &voice;
      }
      if (oldest && ringing >= hitsPerPiece(row)) fadeOut(*oldest, choke);
    }
    DrumVoice& d = drumVoices_[allocateDrumVoice()];
    d = {};
    d.active = true; d.sound = sound; d.amp = velocity; d.row = row; d.serial = ++drumSerial_;
    // Told to the screen as well as to the pool, so the kit under the grid lights what was
    // hit — fills and the crash into a part included, which the grid never shows.
    if (row >= 0 && row < kDrumRows) {
      drumStruck_.fetch_or((1u << row) | (velocity >= .7f ? 1u << (row + 16) : 0u),
                           std::memory_order_relaxed);
    }
  }
  float renderDrum(DrumVoice& d, float n, float hp, float inv) {
    if (d.sound >= kSampledFirst) return renderSampledDrum(d);
    float out = 0;
    switch (d.sound) {
      case kKick:
        d.pitch *= .99920f;
        d.phase = wrap(d.phase + (48.0f + 120.0f * d.pitch) * inv);
        out = osc(d.phase) * d.amp; d.amp *= .99820f; break;
      case k808:
        // Long, saturated sine with a slow pitch drop: the 808 tail is the point.
        d.pitch *= .99965f;
        d.phase = wrap(d.phase + (38.0f + 46.0f * d.pitch) * inv);
        out = tanhf(osc(d.phase) * 1.7f) * d.amp * .80f; d.amp *= .99975f; break;
      case kTom:
        d.pitch *= .99955f;
        d.phase = wrap(d.phase + (92.0f + 110.0f * d.pitch) * inv);
        out = osc(d.phase) * d.amp * .90f; d.amp *= .99900f; break;
      case kSnare: {
        d.pitch *= .99900f;
        d.phase = wrap(d.phase + (172.0f + 40.0f * d.pitch) * inv);
        out = (hp * .28f + n * .22f + osc(d.phase) * .35f) * d.amp; d.amp *= .99600f; break;
      }
      case kClap: {
        // Three short bursts ~9 ms apart, then the room tail.
        const float burst = d.t < .027f ? (fmodf(d.t, .009f) < .0045f ? 1.0f : .18f) : 1.0f;
        out = hp * d.amp * burst * .38f;
        d.amp *= d.t < .027f ? .99995f : .99680f; break;
      }
      case kRim:
        d.phase = wrap(d.phase + 1050.0f * inv); d.phase2 = wrap(d.phase2 + 1700.0f * inv);
        out = (osc(d.phase) * .60f + osc(d.phase2) * .25f + hp * .20f) * d.amp * .70f;
        d.amp *= .98000f; break;
      case kHatClosed:
        out = hp * d.amp * .34f; d.amp *= .98500f; break;
      case kHatOpen:
        out = hp * d.amp * .30f; d.amp *= .99865f; break;
      case kCowbell:
        d.phase = wrap(d.phase + 540.0f * inv); d.phase2 = wrap(d.phase2 + 800.0f * inv);
        out = (osc(d.phase) + osc(d.phase2)) * d.amp * .40f; d.amp *= .99650f; break;
    }
    d.t += inv;
    if (d.amp < .0001f) d.active = false;
    return out;
  }
  /// Plays a recording back at the engine's rate. The assets are written at 48 kHz, so
  /// on a device that opens the stream at another rate this steps through fractionally
  /// and interpolates rather than shifting the pitch of the whole kit.
  float renderSampledDrum(DrumVoice& d) {
    const int slot = d.sound - kSampledFirst;
    const int16_t* data = sampleBank.data[slot].load(std::memory_order_acquire);
    const int length = sampleBank.length[slot].load(std::memory_order_acquire);
    if (!data || length <= 0) { d.active = false; return 0; }
    const int index = static_cast<int>(d.position);
    if (index >= length - 1) { d.active = false; return 0; }
    const float fraction = d.position - index;
    const float a = data[index] / 32768.0f, b = data[index + 1] / 32768.0f;
    d.position += static_cast<float>(kSampleRate) / sampleRate_;
    return (a + (b - a) * fraction) * d.amp * sampleBank.gain[slot].load(std::memory_order_relaxed);
  }

  void drums(float gain, const float* panL, const float* panR, float& left, float& right, float& click) {
    const float n = noise();
    const float hp = n - lastNoise_;  // +6 dB/oct: this is what gives hats and claps their bite
    lastNoise_ = n;
    const float inv = 1.0f / sampleRate_;
    for (auto& d : drumVoices_) {
      if (!d.active) continue;
      float fade = 1.0f;
      if (d.fadeStep > 0) {
        d.fade -= d.fadeStep;
        if (d.fade <= 0) { d.active = false; continue; }
        fade = d.fade;
      }
      if (d.row == kNoRow) {
        // The metronome and the count-in belong to no lane: centred, and kept out of the
        // drum bus altogether — its fader, mute, tone, compressor and the reverb — so a
        // song with its drums muted still counts you in and keeps the click.
        click += renderDrum(d, n, hp, inv) * fade;
        continue;
      }
      const float sample = renderDrum(d, n, hp, inv) * gain * fade;
      left += sample * panL[d.row];
      right += sample * panR[d.row];
    }
  }
  // Held by whoever opens, closes or replaces [stream_]: the platform thread and the
  // thread a disconnect spawns.
#ifndef CHORD_AUDIO_WEB
  std::mutex streamLock_;
#endif
  AAudioStream* stream_ = nullptr; int sampleRate_ = 48000, currentStep_ = 0, sectionIndex_ = 0, chordIndex_ = 0, chordStep_ = 0, loopCount_ = 0, editingArrangement_ = 1; float stepFrames_ = 3000, framesToStep_ = 0, lastNoise_ = 0; uint32_t noise_ = 1;
  Reverb reverb_;
  std::atomic<float> pan_[4]; std::atomic<float> reverbSize_{.7f}, reverbMix_{.18f}; std::atomic<bool> reverbDirty_{true};
  std::atomic<int> voiceLow_[kSections][3]{}; std::atomic<int> voiceHigh_[kSections][3]{};
  std::atomic<uint32_t> sounding_[3][kNoteWords]{};
  std::atomic<uint32_t> struck_[3][kNoteWords]{};
  std::atomic<uint32_t> drumStruck_{0};
  // Pieces tapped on the kit and waiting for the callback, one bit per row, with the
  // section whose sounds they play. A mask rather than one slot: two fingers landing in
  // the same block used to overwrite each other, and only the last was heard.
  std::atomic<uint32_t> previewRows_{0};
  std::atomic<int> previewSection_{0};
  // Whether the output is open, readable from any thread. A tap that comes straight from
  // Dart only ever queues onto an open stream; opening one stays on the platform thread.
  std::atomic<bool> streamOpen_{false};
  // The count-in before the song: steps still to count and how many it started with,
  // written before sequencing starts and owned by the callback after. countInBeat_ is the
  // number on screen — beats left, 0 once the song is playing — published by position().
  int countInSteps_ = 0, countInTotal_ = 0;
  std::atomic<int> countInBeat_{0};
  std::atomic<int> stepsPerBar_{16}, stepsPerBeat_{kStepsPerQuarter};
  std::atomic<int> patternBars_[kSections][4]{};  // by section, then track; drums last
  // Each section's fill: one bar per piece, the step it starts on, and which pieces it
  // writes.
  std::atomic<int> fill_[kSections][kDrumRows][kMaxStepsPerBar]{};
  std::atomic<int> fillFrom_[kSections]{}, fillMask_[kSections]{};
  std::atomic<float> gateSteps_[kSections][3]{};  // 0 is hold, as the engine always did
  std::atomic<float> bpm_{95}, swing_{1.0f}, gains_[4], master_{.7f}; std::atomic<int> drums_[kSections][kDrumRows][kMaxSteps]; std::atomic<int> instruments_[kSections][3][kMaxSteps]; std::atomic<int> timbre_[kSections][3], program_[kSections][3], drumSound_[kSections][kDrumRows]; std::atomic<bool> silent_[kSections][4]{}; Voice voices_[kVoices]; DrumVoice drumVoices_[kDrumVoices]; uint32_t drumSerial_ = 0; Arrangement arrangements_[2]; std::atomic<int> activeArrangement_{0}; std::atomic<int64_t> reportedPosition_{0}; std::atomic<int> clearVoices_{0};
  /// Whether the sequencer is running — which is not the same as whether the output is
  /// open. The stream stays up between Stop and the next thing that wants to be heard,
  /// so `stream_ != nullptr` stopped being an answer to "is the song playing".
  std::atomic<bool> sequencing_{false};
  /// Set while a file is being rendered on the export thread. That render drives this
  /// transport and these voices itself, so nothing else may open the output underneath it.
  std::atomic<bool> exporting_{false};
  /// -1 while playing: the sequencer runs until told to stop. The export sets it to
  /// the length of the song so the transport can run out on its own.
  int stepBudget_ = -1;
  // Which bar of a pattern is playing. Runs to four and wraps, which is why a pattern
  // may be one, two or four bars and not three.
  int barIndex_ = 0;
  // Bars since the section started, without the wrap — what the phrase fills count. -1
  // for the instant between a part ending on a bar line and that line being crossed.
  int sectionBar_ = 0;
  // Set as a part that filled into the next one ends; spent on that next part's downbeat.
  bool crashPending_ = false;
  std::atomic<float> exportProgress_{0};
  float exportScratch_[kExportBlock * 2]{};
  int lastBottom_[3]{};  // bottom note of the previous chord per track, for voice leading
  int generation_[3]{};  // bumped on every retrigger, stamped into each voice
  int lastChord_ = -1;   // packed section<<8|chord, to notice a chord change
  // What each tsf channel is actually set to. The sampled instrument belongs to the
  // channel and there are three of them for the whole song, so entering a section that
  // plays a different one has to move the channel — and only then, because the preset
  // lookup is a search and this runs in the callback.
  int appliedProgram_[3] = {-1, -1, -1};
  float sfScratch_[3][kSfScratch * 2]{};  // stereo interleaved, one per melodic channel
  Strip strips_[4];                       // drums, piano, guitar, bass
  std::atomic<float> stripLow_[4]{}, stripMid_[4]{}, stripHigh_[4]{}, stripThreshold_[4]{};
  std::atomic<float> stripRatio_[4]{};
  std::atomic<float> reduction_[4]{};
  std::atomic<float> levels_[5]{};
  std::atomic<int> loopOnly_{-1};
  std::atomic<bool> stripsDirty_{true};
  // A sine pip with a 40 ms decay. A sample would have to be shipped, loaded and kept
  // in step with the bank; three floats do the same job and are always ready.
  std::atomic<bool> metronome_{true};
  // How the click sounds: set together from the platform thread, read by the callback.
  // The defaults match AppSettings in Dart.
  std::atomic<float> clickVolume_{.7f};
  std::atomic<int> clickSound_{kSStick};
  std::atomic<bool> clickAccent_{true};
  std::atomic<int> clickDivision_{1};
  std::atomic<bool> previewClick_{false};
  float clickLevel_ = 0, clickPhase_ = 0, clickFreq_ = 1000, clickDecay_ = .9994f;
  float loadAverage_ = 0, loadPeak_ = 0;  // callback-owned, published through the atomics below
  float triggerPeak_ = 0, quietPeak_ = 0;
  bool triggeredThisBlock_ = false;
  int blocksSinceStart_ = 0;
  std::atomic<float> loadAvg_{0}, loadMax_{0}, loadTriggerMax_{0}, loadQuietMax_{0};
  std::atomic<int> peakFrames_{0}, peakVoices_{0}, peakMicros_{0}, lateBlocks_{0};
};
Engine engine;
#ifndef CHORD_AUDIO_WEB
const char* chars(JNIEnv* env, jstring value) { return value ? env->GetStringUTFChars(value, nullptr) : ""; }
void release(JNIEnv* env, jstring value, const char* chars) { if (value) env->ReleaseStringUTFChars(value, chars); }
#endif
}

// The Android bridge. The web's counterpart is chord-composer/engine/web_glue.cpp.
#ifndef CHORD_AUDIO_WEB

extern "C" JNIEXPORT jboolean JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeStart(JNIEnv*, jobject, jint countInBeats) { return engine.start(countInBeats); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeStop(JNIEnv*, jobject) { engine.stop(); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeReleaseAudio(JNIEnv*, jobject) { engine.closeStream(); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetBpm(JNIEnv*, jobject, jfloat bpm) { engine.setBpm(bpm); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetSwing(JNIEnv*, jobject, jfloat value) { engine.setSwing(value); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetMeter(JNIEnv*, jobject, jint stepsPerBar, jint stepsPerBeat) { engine.setMeter(stepsPerBar, stepsPerBeat); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetStep(JNIEnv* env, jobject, jint section, jstring track, jstring row, jint step, jint value) { const char* t=chars(env,track); const char* r=chars(env,row); engine.setStep(section,t,r,step,value); release(env,track,t); release(env,row,r); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeClearTrack(JNIEnv* env, jobject, jint section, jstring track) { const char* t=chars(env,track); engine.clearTrack(section,t); release(env,track,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetProgram(JNIEnv* env, jobject, jint section, jstring track, jint program) { const char* t=chars(env,track); engine.setProgram(section,t,program); release(env,track,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetTimbre(JNIEnv* env, jobject, jint section, jstring track, jint value) { const char* t=chars(env,track); engine.setTimbre(section,t,value); release(env,track,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetNoteLength(JNIEnv* env, jobject, jint section, jstring track, jfloat steps) { const char* t=chars(env,track); engine.setNoteLength(section,t,steps); release(env,track,t); }
extern "C" JNIEXPORT jboolean JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLoadSample(JNIEnv* env, jobject, jint slot, jbyteArray pcm, jfloat gain) {
  const jsize bytes = env->GetArrayLength(pcm);
  jbyte* raw = env->GetByteArrayElements(pcm, nullptr);
  const bool ok = sampleBank.load(slot, reinterpret_cast<const int16_t*>(raw), bytes / 2, gain);
  env->ReleaseByteArrayElements(pcm, raw, JNI_ABORT);
  return ok;
}
extern "C" JNIEXPORT jboolean JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLoadSoundFont(JNIEnv* env, jobject, jbyteArray sf2) {
  if (soundFont.load(std::memory_order_acquire)) return true;  // load once
  const jsize bytes = env->GetArrayLength(sf2);
  jbyte* raw = env->GetByteArrayElements(sf2, nullptr);
  tsf* font = tsf_load_memory(raw, bytes);
  env->ReleaseByteArrayElements(sf2, raw, JNI_ABORT);
  if (!font) return false;
  soundFont.store(font, std::memory_order_release);
  engine.configureSoundFont();
  return true;
}
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetDrumSound(JNIEnv* env, jobject, jint section, jstring row, jint value) { const char* r=chars(env,row); engine.setDrumSound(section,r,value); release(env,row,r); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetSilence(JNIEnv* env, jobject, jint section, jstring track, jboolean silent) { const char* t=chars(env,track); engine.setSilence(section,t,silent); release(env,track,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetPatternBars(JNIEnv* env, jobject, jint section, jstring track, jint bars) { const char* t=chars(env,track); engine.setPatternBars(section,t,bars); release(env,track,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetFill(JNIEnv* env, jobject, jint section, jint from, jint mask, jintArray steps) {
  const jsize count = env->GetArrayLength(steps);
  jint* raw = env->GetIntArrayElements(steps, nullptr);
  engine.setFill(section, from, mask, reinterpret_cast<const int*>(raw), count);
  env->ReleaseIntArrayElements(steps, raw, JNI_ABORT);
}

extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetSectionCount(JNIEnv*, jobject, jint count) { engine.beginArrangement(count); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetSection(JNIEnv*, jobject, jint index, jint loop, jboolean infinite, jint chordCount) { engine.section(index, loop, infinite, chordCount); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetChord(JNIEnv* env, jobject, jint section, jint index, jstring root, jstring type, jint halfBeats, jint bass) { const char* r=chars(env,root); const char* t=chars(env,type); engine.chord(section,index,r,t,halfBeats,bass); release(env,root,r); release(env,type,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeCommitArrangement(JNIEnv*, jobject) { engine.commitArrangement(); }
extern "C" JNIEXPORT jlong JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativePosition(JNIEnv*, jobject) { return static_cast<jlong>(engine.position()); }
extern "C" JNIEXPORT jfloat JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLoadAverage(JNIEnv*, jobject) { return engine.loadAverage(); }
extern "C" JNIEXPORT jfloat JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLoadPeak(JNIEnv*, jobject) { return engine.loadPeak(); }
extern "C" JNIEXPORT jfloat JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLoadTriggerPeak(JNIEnv*, jobject) { return engine.loadTriggerPeak(); }
extern "C" JNIEXPORT jfloat JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLoadQuietPeak(JNIEnv*, jobject) { return engine.loadQuietPeak(); }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativePeakFrames(JNIEnv*, jobject) { return engine.peakFrames(); }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativePeakVoices(JNIEnv*, jobject) { return engine.peakVoices(); }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativePeakMicros(JNIEnv*, jobject) { return engine.peakMicros(); }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeXruns(JNIEnv*, jobject) { return engine.xruns(); }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLateBlocks(JNIEnv*, jobject) { return engine.lateBlocks(); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeResetLoad(JNIEnv*, jobject) { engine.resetLoad(); }
extern "C" JNIEXPORT jboolean JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeIsPlaying(JNIEnv*, jobject) { return engine.playing(); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetMixer(JNIEnv* env, jobject, jstring track, jfloat value, jboolean muted) { const char* t=chars(env,track); engine.mixer(t,value,muted); release(env,track,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetPan(JNIEnv* env, jobject, jstring track, jfloat value) { const char* t=chars(env,track); engine.pan(t,value); release(env,track,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetReverb(JNIEnv*, jobject, jfloat size, jfloat mix) { engine.reverb(size,mix); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetStrip(JNIEnv* env, jobject, jstring track, jfloat low, jfloat mid, jfloat high, jfloat threshold, jfloat ratio) { const char* t=chars(env,track); engine.strip(t,low,mid,high,threshold,ratio); release(env,track,t); }
extern "C" JNIEXPORT jfloat JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeGainReduction(JNIEnv*, jobject, jint bus) { return engine.gainReduction(bus); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLoopOnly(JNIEnv*, jobject, jint index) { engine.loopOnly(index); }
extern "C" JNIEXPORT jfloat JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeLevel(JNIEnv*, jobject, jint bus) { return engine.level(bus); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetMetronome(JNIEnv*, jobject, jboolean enabled, jfloat volume, jint sound, jboolean accent, jint division) { engine.metronome(enabled,volume,sound,accent,division); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativePreviewMetronome(JNIEnv*, jobject) { engine.previewClick(); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativePreviewChord(JNIEnv* env, jobject, jint section, jint root, jstring type, jint bass, jstring track) { const char* ty=chars(env,type); const char* tr=chars(env,track); engine.preview(section,root,ty,bass,tr); release(env,type,ty); release(env,track,tr); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativePreviewOff(JNIEnv* env, jobject, jstring track) { const char* t=chars(env,track); engine.previewOff(t); release(env,track,t); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSetVoicing(JNIEnv* env, jobject, jint section, jstring track, jint low, jint high) { const char* t=chars(env,track); engine.voicing(section,t,low,high); release(env,track,t); }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeSounding(JNIEnv*, jobject, jint track, jint word) { return static_cast<jint>(engine.soundingWord(track,word)); }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeStruck(JNIEnv*, jobject, jint track, jint word) { return static_cast<jint>(engine.struckWord(track,word)); }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeDrumStruck(JNIEnv*, jobject) { return static_cast<jint>(engine.drumStruckWord()); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativePreviewDrum(JNIEnv* env, jobject, jint section, jstring row) { const char* r=chars(env,row); engine.previewDrum(section,r); release(env,row,r); }
extern "C" JNIEXPORT void JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeOpenAudio(JNIEnv*, jobject) { engine.openStream(); }
// Called straight from Dart through dart:ffi, so a tap on the kit does not wait on a
// platform channel. It only queues onto an open output: 0 means use the channel, which
// can open one.
extern "C" __attribute__((visibility("default"), used)) int32_t chord_audio_preview_drum(int32_t section, int32_t row) { return engine.queuePreview(section, row) ? 1 : 0; }
extern "C" JNIEXPORT jint JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeExportWav(JNIEnv* env, jobject, jstring path, jint steps, jfloat tail) { const char* p=chars(env,path); const int frames=engine.exportWav(p,steps,tail); release(env,path,p); return frames; }
extern "C" JNIEXPORT jfloat JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeExportProgress(JNIEnv*, jobject) { return engine.exportProgress(); }
extern "C" JNIEXPORT jboolean JNICALL Java_com_eliascorsino_chord_1sequencer_MainActivity_nativeHasInstruments(JNIEnv*, jobject) { return engine.hasInstruments(); }
#endif  // CHORD_AUDIO_WEB
