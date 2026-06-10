#!/usr/bin/env python3
"""
Generate bass samples for chord-composer Bass Tab Player.
Primary: MODO BASS 2 VST3 via pedalboard (Spotify)
Fallback: Karplus-Strong physical modeling synthesis

Setup:
  winget install Python.Python.3.12
  pip install pedalboard numpy

Run:
  python scripts/generate_bass_samples.py
"""

import os
import json
import wave
import struct
import numpy as np

SAMPLE_RATE   = 44100
NOTE_DURATION = 3.0       # seconds of sustain
TAIL_DURATION = 1.5       # seconds of release tail after note-off
VELOCITY      = 100       # MIDI velocity (0-127)
MIDI_START    = 28        # E1 (lowest open string)
MIDI_END      = 56        # G#3 (reasonable upper limit with pitch-shift)

NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

VST3_PATH = r"C:\Program Files\Common Files\VST3\MODO BASS 2.vst3"
OUTPUT_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'samples', 'modo')
)


def midi_freq(n: int) -> float:
    return 440.0 * 2.0 ** ((n - 69) / 12.0)


def midi_name(n: int) -> str:
    return NOTE_NAMES[n % 12] + str(n // 12 - 1)


def save_wav_stereo(path: str, audio: np.ndarray, sr: int = SAMPLE_RATE) -> None:
    """Save (2, N) float32 array as 16-bit stereo WAV."""
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio * (0.88 / peak)
    a16 = np.clip(audio * 32767, -32767, 32767).astype(np.int16)
    with wave.open(path, 'w') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(a16.T.flatten().tobytes())


def ks_bass(midi_note: int, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Karplus-Strong physical modeling bass synthesis.
    Returns (2, N) float32 stereo array.
    """
    freq    = midi_freq(midi_note)
    total_n = int((NOTE_DURATION + TAIL_DURATION) * sr)
    period  = max(2, int(round(sr / freq)))

    rng  = np.random.default_rng(seed=42 + midi_note)
    init = rng.uniform(-1.0, 1.0, period)

    # Low-pass filter initial excitation → dark bass timbre
    kernel = np.array([0.25, 0.5, 0.25])
    for _ in range(5):
        init = np.convolve(init, kernel, mode='same')
    init /= (np.max(np.abs(init)) + 1e-12)

    # Karplus-Strong recurrence: y[n] = b * 0.5 * (y[n-P] + y[n-P+1])
    # Using an extended buffer to avoid circular indexing overhead
    buf = np.zeros(total_n + period + 1)
    buf[:period] = init
    b = 0.9998  # decay factor; close to 1 = long sustain

    for i in range(period, total_n + period):
        buf[i] = b * 0.5 * (buf[i - period] + buf[i - period + 1])

    out = buf[period : period + total_n].copy()

    # ADSR envelope
    atk_n     = int(0.010 * sr)       # 10ms attack
    sus_end_n = int(NOTE_DURATION * sr)
    rel_n     = total_n - sus_end_n

    out[:atk_n] *= np.linspace(0.0, 1.0, atk_n)
    if rel_n > 0:
        out[sus_end_n:] *= np.linspace(1.0, 0.0, rel_n)

    # Normalize
    peak = np.max(np.abs(out))
    if peak > 0:
        out /= peak
    out *= 0.85

    f32 = out.astype(np.float32)
    return np.stack([f32, f32])


def render_modo_bass():
    """
    Render all notes via MODO BASS 2 VST3 using pedalboard.
    Returns (dict[midi → ndarray], mode_str).
    """
    from pedalboard import load_plugin  # type: ignore

    print(f"Loading plugin: {VST3_PATH}")
    plugin = load_plugin(VST3_PATH)
    print("Plugin loaded successfully.\n")

    total_n = int((NOTE_DURATION + TAIL_DURATION) * SAMPLE_RATE)
    results: dict = {}

    for n in range(MIDI_START, MIDI_END + 1):
        name = midi_name(n)
        print(f"  {name:5s} (MIDI {n:2d}) ... ", end='', flush=True)

        # Silence input — instrument plugin generates audio from MIDI
        audio_in = np.zeros((2, total_n), dtype=np.float32)

        # MIDI: note-on at t=0, note-off after NOTE_DURATION seconds
        midi_msgs = [
            (0.0,           bytes([0x90, n, VELOCITY])),  # note on
            (NOTE_DURATION, bytes([0x80, n, 0])),          # note off
        ]

        audio_out = plugin.process(
            audio_in, SAMPLE_RATE,
            midi_messages=midi_msgs,
            reset=True,
        )

        peak = float(np.max(np.abs(audio_out)))
        results[n] = audio_out
        print(f"peak={peak:.3f}")

    return results, 'modo'


def render_ks_all():
    """Render all notes with Karplus-Strong. Returns (dict, mode_str)."""
    print("Using Karplus-Strong synthesis (fallback).\n")
    results: dict = {}
    for n in range(MIDI_START, MIDI_END + 1):
        name = midi_name(n)
        print(f"  {name:5s} (MIDI {n:2d}) ...", end='', flush=True)
        results[n] = ks_bass(n)
        print(" done")
    return results, 'ks'


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Output: {OUTPUT_DIR}\n")

    # Try MODO BASS 2 first, fall back to Karplus-Strong
    try:
        import pedalboard  # noqa: F401
        results, mode = render_modo_bass()
    except Exception as exc:
        print(f"\nMODO BASS 2 not available ({exc})")
        print("Falling back to Karplus-Strong synthesis.\n")
        results, mode = render_ks_all()

    # Save WAVs and manifest
    manifest = {
        'mode': mode,
        'sampleRate': SAMPLE_RATE,
        'noteDuration': NOTE_DURATION,
        'notes': {}
    }

    print()
    for midi_note, audio in sorted(results.items()):
        name  = midi_name(midi_note)
        fname = f"{name}.wav"
        fpath = os.path.join(OUTPUT_DIR, fname)
        save_wav_stereo(fpath, audio)
        manifest['notes'][str(midi_note)] = {
            'file': fname,
            'freq': round(midi_freq(midi_note), 4),
            'name': name,
        }
        print(f"  Saved {fname}")

    manifest_path = os.path.join(OUTPUT_DIR, 'manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    label = 'MODO BASS 2 (real VST samples)' if mode == 'modo' else 'Karplus-Strong (synthesis)'
    print(f"\nDone. {len(results)} samples + manifest.json")
    print(f"Mode: {label}")


if __name__ == '__main__':
    main()
