/**
 * MIDI Exporter
 *
 * Generates a Standard MIDI File (SMF Format 0) from a chord progression.
 * No external dependencies — the MIDI binary format is simple enough to
 * write directly, the same way WAV is built in mp3Encoder.ts.
 */

import { type Section } from './sections';
import { chordToMidiNotes } from './musicTheory';

const TICKS_PER_BEAT = 480; // standard resolution
const VELOCITY = 80;        // mf dynamic (~mezzo-forte)
const CHANNEL = 0;          // MIDI channel 1

/** Encode a number as a MIDI Variable Length Quantity (VLQ). */
function writeVLQ(out: number[], value: number): void {
  if (value < 0x80) {
    out.push(value);
    return;
  }
  const buf: number[] = [];
  let v = value;
  buf.push(v & 0x7F);
  v >>>= 7;
  while (v > 0) {
    buf.push((v & 0x7F) | 0x80);
    v >>>= 7;
  }
  for (let i = buf.length - 1; i >= 0; i--) out.push(buf[i]);
}

function writeU32BE(out: number[], v: number): void {
  out.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF);
}

function writeU16BE(out: number[], v: number): void {
  out.push((v >>> 8) & 0xFF, v & 0xFF);
}

/**
 * Converts a chord progression to a MIDI file and triggers a browser download.
 *
 * @param sections      - Progression sections (including repeatCount)
 * @param bpm           - Tempo in beats per minute
 * @param transposition - Semitone offset (matches editor transposition)
 * @param filename      - Download filename (without extension)
 */
export function exportMidi(
  sections: Section[],
  bpm: number,
  transposition: number = 0,
  filename: string = 'chord-progression'
): void {
  const track: number[] = [];

  // ── Tempo event (FF 51 03 tt tt tt) ────────────────────────────────────────
  const μsPerBeat = Math.round(60_000_000 / bpm);
  track.push(0x00); // Δt = 0
  track.push(0xFF, 0x51, 0x03);
  track.push((μsPerBeat >>> 16) & 0xFF, (μsPerBeat >>> 8) & 0xFF, μsPerBeat & 0xFF);

  // ── Program Change: Acoustic Grand Piano (GM #1, program 0) ────────────────
  track.push(0x00); // Δt = 0
  track.push(0xC0 | CHANNEL, 0x00);

  // ── Chord events ───────────────────────────────────────────────────────────
  sections.forEach(section => {
    for (let rep = 0; rep < section.repeatCount; rep++) {
      section.chords.forEach(chord => {
        const notes = chordToMidiNotes(chord)
          .map(n => Math.max(0, Math.min(127, n + transposition)));

        const durationTicks = Math.round(chord.duration * TICKS_PER_BEAT);

        // Note ON — all notes start simultaneously (Δt 0 between them)
        notes.forEach((note, i) => {
          writeVLQ(track, 0); // Δt = 0 for every note
          track.push(0x90 | CHANNEL, note, VELOCITY);
        });

        // Note OFF — first note carries the full chord duration; rest are Δt 0
        notes.forEach((note, i) => {
          writeVLQ(track, i === 0 ? durationTicks : 0);
          track.push(0x80 | CHANNEL, note, 0);
        });
      });
    }
  });

  // ── End of Track ───────────────────────────────────────────────────────────
  track.push(0x00, 0xFF, 0x2F, 0x00);

  // ── Assemble the SMF file ──────────────────────────────────────────────────
  const file: number[] = [];

  // MThd header
  file.push(0x4D, 0x54, 0x68, 0x64); // "MThd"
  writeU32BE(file, 6);                // header length = 6 (always)
  writeU16BE(file, 0);                // format 0 (single track)
  writeU16BE(file, 1);                // 1 track
  writeU16BE(file, TICKS_PER_BEAT);  // 480 ticks/beat

  // MTrk chunk
  file.push(0x4D, 0x54, 0x72, 0x6B); // "MTrk"
  writeU32BE(file, track.length);
  file.push(...track);

  // ── Download ───────────────────────────────────────────────────────────────
  const safe = (filename.trim().replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_')) || 'chord-progression';
  const blob = new Blob([new Uint8Array(file)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
