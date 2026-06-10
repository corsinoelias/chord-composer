#!/usr/bin/env python3
"""
Slices the Cubase WAV export into 29 individual bass note samples.

Usage:
  python scripts/slice_bass_samples.py <path/to/export.wav> [mode_name]

  mode_name defaults to 'modo'. Output goes to public/samples/<mode_name>/

Examples:
  python scripts/slice_bass_samples.py bass_recording_export.wav modo
  python scripts/slice_bass_samples.py bass_recording_export_slap.wav slap
  python scripts/slice_bass_samples.py bass_recording_export_finger.wav finger
  python scripts/slice_bass_samples.py bass_recording_export_muted.wav muted
"""

import sys
import os
import json
import wave
import struct
import numpy as np

# ── Timing parameters (must match generate_recording_midi.py) ────────────────
BPM            = 60
NOTE_BEATS     = 3
GAP_BEATS      = 1
SLOT_SEC       = (NOTE_BEATS + GAP_BEATS) * 60 / BPM   # 4.0 seconds per note
CAPTURE_SEC    = NOTE_BEATS * 60 / BPM + 1.0            # capture note + 1s tail

MIDI_START     = 40   # E1 en Cubase (cuerda E al aire)
MIDI_END       = 68   # Ab4 en Cubase

# ── Adjust if Cubase adds a silent pre-roll or offset ────────────────────────
CUBASE_OFFSET_SEC = 0.0   # increase (e.g. 0.05) if notes start too late

def get_output_dir(mode: str) -> str:
    return os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'samples', mode)
    )

NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']


def midi_freq(n: int) -> float:
    return 440.0 * 2.0 ** ((n - 69) / 12.0)


def midi_name(n: int) -> str:
    return NOTE_NAMES[n % 12] + str(n // 12 - 1)


def read_wav(path: str):
    try:
        import soundfile as sf
        samples, sr = sf.read(path, dtype='float32', always_2d=True)
        return samples.T, sr  # (channels, frames)
    except ImportError:
        pass

    # Fallback: built-in wave module (PCM only)
    with wave.open(path, 'r') as wf:
        n_channels   = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate  = wf.getframerate()
        n_frames     = wf.getnframes()
        raw          = wf.readframes(n_frames)

    if sample_width == 3:
        # 24-bit: convert 3-byte LE samples to int32
        raw_arr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        padded  = np.zeros((len(raw_arr), 4), dtype=np.uint8)
        padded[:, :3] = raw_arr
        padded[raw_arr[:, 2] >= 0x80, 3] = 0xFF  # sign extend
        samples = np.frombuffer(padded.tobytes(), dtype='<i4').astype(np.float32) / 2**23
    else:
        dtype_map = {1: np.int8, 2: np.int16, 4: np.int32}
        dtype     = dtype_map.get(sample_width, np.int16)
        max_val   = float(2 ** (sample_width * 8 - 1))
        samples   = np.frombuffer(raw, dtype=dtype).astype(np.float32) / max_val

    return samples.reshape(-1, n_channels).T, sample_rate


def save_wav_stereo(path: str, audio: np.ndarray, sr: int) -> None:
    a16 = np.clip(audio * 32767, -32767, 32767).astype(np.int16)
    with wave.open(path, 'w') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(a16.T.flatten().tobytes())


def auto_detect_offset(samples: np.ndarray, sample_rate: int) -> float:
    """
    Detect the actual start of the first note by finding the first sample
    that exceeds a noise threshold. Returns offset in seconds.
    """
    mono   = np.abs(samples).max(axis=0) if samples.ndim == 2 else np.abs(samples)
    # smooth over 5ms window
    window = max(1, int(0.005 * sample_rate))
    smoothed = np.convolve(mono, np.ones(window) / window, mode='same')
    threshold = 0.01
    hits = np.where(smoothed > threshold)[0]
    if len(hits) == 0:
        return 0.0
    detected = hits[0] / sample_rate
    print(f"  Auto-detected first note at {detected:.3f}s")
    return detected


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/slice_bass_samples.py <export.wav> [mode_name]")
        sys.exit(1)

    wav_path  = sys.argv[1]
    mode_name = sys.argv[2] if len(sys.argv) >= 3 else 'modo'
    OUTPUT_DIR = get_output_dir(mode_name)

    if not os.path.exists(wav_path):
        print(f"File not found: {wav_path}")
        sys.exit(1)

    print(f"Reading {wav_path} ...")
    print(f"Mode: {mode_name} -> {OUTPUT_DIR}")
    samples, sr = read_wav(wav_path)
    total_sec = samples.shape[-1] / sr
    print(f"  {total_sec:.1f}s  |  {sr} Hz  |  {samples.shape[0]} ch")

    # Auto-detect offset if CUBASE_OFFSET_SEC is 0
    offset = CUBASE_OFFSET_SEC
    if offset == 0.0:
        offset = auto_detect_offset(samples, sr)

    # Make stereo
    if samples.ndim == 1 or samples.shape[0] == 1:
        mono = samples.flatten()
        samples = np.stack([mono, mono])

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    manifest = {
        'mode':         mode_name,
        'sampleRate':   sr,
        'noteDuration': float(NOTE_BEATS * 60 / BPM),
        'notes':        {}
    }

    note_range = list(range(MIDI_START, MIDI_END + 1))
    print(f"\nSlicing {len(note_range)} notes (offset={offset:.3f}s)...\n")

    for i, midi_note in enumerate(note_range):
        name = midi_name(midi_note)
        start_sec  = offset + i * SLOT_SEC
        end_sec    = start_sec + CAPTURE_SEC
        start_smp  = int(start_sec * sr)
        end_smp    = min(int(end_sec * sr), samples.shape[-1])

        if start_smp >= samples.shape[-1]:
            print(f"  {name:5s} — SKIPPED (beyond end of file)")
            continue

        chunk = samples[:, start_smp:end_smp]

        # Fade out last 300ms to avoid hard cut
        fade_n = min(int(0.3 * sr), chunk.shape[1])
        chunk  = chunk.copy()
        chunk[:, -fade_n:] *= np.linspace(1.0, 0.0, fade_n)

        fname = f"{name}.wav"
        fpath = os.path.join(OUTPUT_DIR, fname)
        save_wav_stereo(fpath, chunk, sr)

        peak = float(np.max(np.abs(chunk)))
        print(f"  {name:5s} (MIDI {midi_note:2d})  {start_sec:.2f}s -> {end_sec:.2f}s  peak={peak:.3f}  -> {fname}")

        manifest['notes'][str(midi_note)] = {
            'file': fname,
            'freq': round(midi_freq(midi_note), 4),
            'name': name,
        }

    manifest_path = os.path.join(OUTPUT_DIR, 'manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"\nDone. {len(manifest['notes'])} samples + manifest.json -> {OUTPUT_DIR}")
    print("\nIf notes sound cut off at the start, re-run with:")
    print("  CUBASE_OFFSET_SEC = <detected_value + small_correction>")


if __name__ == '__main__':
    main()
