#!/usr/bin/env python3
"""
Generates bass_recording_session.mid — import this into Cubase with MODO BASS 2.

Layout (60 BPM):
  - 29 chromatic notes: E1 (MIDI 28) -> G#3 (MIDI 56)
  - Each note: 3 beats on + 1 beat silence = 4 seconds per note
  - Total duration: 116 seconds

Instructions for Cubase:
  1. Create new project at 60 BPM
  2. Add instrument track -> MODO BASS 2
  3. File -> Import -> MIDI file -> select bass_recording_session.mid
     (or drag it onto the track)
  4. Make sure the track output goes to MODO BASS 2
  5. File -> Export -> Audio Mixdown
     - Format: WAV, 44100 Hz, 24-bit, Stereo
     - Range: full project (0 to ~120 seconds)
     - Save as: bass_recording_export.wav (anywhere you want)
  6. Run: python scripts/slice_bass_samples.py <path-to-bass_recording_export.wav>
"""

import struct
import os

BPM            = 60
TICKS_PER_BEAT = 480
NOTE_BEATS     = 3     # how long each note is held
GAP_BEATS      = 1     # silence between notes

NOTE_ON_TICKS  = NOTE_BEATS * TICKS_PER_BEAT   # 1440
GAP_TICKS      = GAP_BEATS  * TICKS_PER_BEAT   #  480

MIDI_START = 40   # E1 en Cubase (cuerda E al aire)
MIDI_END   = 68   # Ab4 en Cubase (~29 notas cromáticas)

NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']


def vlq(value: int) -> bytes:
    """Encode integer as MIDI variable-length quantity."""
    buf = [value & 0x7F]
    value >>= 7
    while value:
        buf.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(buf))


def midi_name(n: int) -> str:
    return NOTE_NAMES[n % 12] + str(n // 12 - 1)


def build_midi() -> bytes:
    # ── Tempo meta-event: microseconds per beat ──────────────────────────────
    us_per_beat = int(60_000_000 / BPM)  # 1_000_000 at 60 BPM
    tempo_bytes = struct.pack('>I', us_per_beat)[1:]  # 3 bytes, big-endian
    tempo_event = vlq(0) + bytes([0xFF, 0x51, 0x03]) + tempo_bytes

    # ── Note events ──────────────────────────────────────────────────────────
    events = b''
    for i, note in enumerate(range(MIDI_START, MIDI_END + 1)):
        delta_on  = 0 if i == 0 else GAP_TICKS
        events += vlq(delta_on)  + bytes([0x90, note, 100])   # note on
        events += vlq(NOTE_ON_TICKS) + bytes([0x80, note, 0]) # note off

    # ── End of track ─────────────────────────────────────────────────────────
    events += vlq(0) + bytes([0xFF, 0x2F, 0x00])

    track_data = tempo_event + events

    # ── Assemble chunks ───────────────────────────────────────────────────────
    header = (
        b'MThd'
        + struct.pack('>I', 6)           # chunk length = 6
        + struct.pack('>H', 0)           # format 0 (single track)
        + struct.pack('>H', 1)           # 1 track
        + struct.pack('>H', TICKS_PER_BEAT)
    )
    track = b'MTrk' + struct.pack('>I', len(track_data)) + track_data

    return header + track


def main():
    out_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        '..', 'bass_recording_session.mid'
    )
    out_path = os.path.normpath(out_path)

    midi_data = build_midi()
    with open(out_path, 'wb') as f:
        f.write(midi_data)

    seconds_per_note = (NOTE_BEATS + GAP_BEATS) / BPM * 60
    total_sec = seconds_per_note * (MIDI_END - MIDI_START + 1)

    print(f"Written: {out_path}")
    print(f"Notes:   {MIDI_END - MIDI_START + 1} chromatic notes (E1 to G#3)")
    print(f"Tempo:   {BPM} BPM  ({NOTE_BEATS} beats on + {GAP_BEATS} beat silence per note)")
    print(f"Total:   {total_sec:.0f} seconds (~{total_sec/60:.1f} min)")
    print()
    print("Instructions:")
    print("  1. Cubase: New project, 60 BPM")
    print("  2. Add instrument track -> MODO BASS 2")
    print(f"  3. Import {os.path.basename(out_path)} onto the track")
    print("  4. Export -> Audio Mixdown -> WAV 44100 Hz, 24-bit, Stereo")
    print("  5. python scripts/slice_bass_samples.py <path/to/export.wav>")


if __name__ == '__main__':
    main()
