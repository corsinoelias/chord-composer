/**
 * Songs System
 * 
 * Defines the Song data model and utility functions
 */

import type { Section } from './sections';
import { migrateSoundId, type InstrumentState, type InstrumentType } from './instruments';
import type { MelodicData, DegreePattern } from './bassScale';
import { type NoteLengths } from './noteLengths';

/**
 * The shared song document (docs/plan-paridad-web-app.md, "SongDoc"): this shape, stored as
 * is in progressions.data and read and written by both the web and the Flutter app.
 *
 * Bumped only for changes an older reader cannot absorb. A reader that meets a higher
 * version opens the song read-only and never writes it back; everything else it does not
 * know is carried through untouched (see unknownSongFields).
 */
export const SONG_SCHEMA_VERSION = 6;

export interface Song {
  /** Absent in every song saved before the app could open them: reads as 4. */
  schemaVersion?: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sections: Section[];
  bpm: number;
  styleId: string;
  transposition: number;
  instrumentSettings: InstrumentState[];
  metronomeEnabled: boolean;
  melodic?: MelodicData;
}

const KNOWN_SONG_KEYS = new Set([
  'schemaVersion', 'id', 'title', 'createdAt', 'updatedAt', 'sections', 'bpm', 'styleId',
  'transposition', 'instrumentSettings', 'metronomeEnabled', 'melodic',
]);

/**
 * Everything in a saved song this build does not model — written by the Flutter app (key,
 * meter, mixer, voicings…) or by a newer web. The editor keeps it aside on load and puts it
 * back on save, so an edit here never deletes what the other client wrote.
 */
export function unknownSongFields(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k]) => !KNOWN_SONG_KEYS.has(k)));
}

/**
 * The note lengths a song carries, where the Android app keeps them: app.noteLengths, steps
 * per track, 0 for held. Values the app does not offer are left out, so they play the web's
 * own length rather than something neither client can show.
 */
export function songNoteLengths(song: unknown): NoteLengths {
  const raw = (song as { app?: { noteLengths?: Record<string, unknown> } })?.app?.noteLengths;
  const out: NoteLengths = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const track of ['piano', 'guitar', 'bass'] as const) {
    const steps = raw[track];
    if (typeof steps === 'number' && NOTE_LENGTH_STEPS.includes(steps)) out[track] = steps;
  }
  return out;
}

/** [extras] (what the editor does not model) with [lengths] written into its app block. */
export function withNoteLengths(extras: Record<string, unknown>, lengths: NoteLengths): Record<string, unknown> {
  const app = { ...((extras.app as Record<string, unknown> | undefined) ?? {}) };
  if (Object.keys(lengths).length) app.noteLengths = { ...lengths };
  else delete app.noteLengths;
  const next = { ...extras };
  if (Object.keys(app).length) next.app = app;
  else delete next.app;
  return next;
}

/** The song's own swing ratio (app.swing, 1-3, as the app clamps it), or undefined to play the rhythm's. */
export function songSwing(song: unknown): number | undefined {
  const raw = (song as { app?: { swing?: unknown } })?.app?.swing;
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(1, Math.min(3, raw)) : undefined;
}

/** [extras] with [ratio] written into its app block (or taken out, for the rhythm's own). */
export function withSwing(extras: Record<string, unknown>, ratio: number | undefined): Record<string, unknown> {
  const app = { ...((extras.app as Record<string, unknown> | undefined) ?? {}) };
  if (ratio !== undefined) app.swing = ratio;
  else delete app.swing;
  const next = { ...extras };
  if (Object.keys(app).length) next.app = app;
  else delete next.app;
  return next;
}

/**
 * The mixer as the app saves it (its MixerState, the song's `mixer` block): where each track
 * sits, the master, the reverb send, and the tone and compression of the channels somebody
 * actually shaped. Only these — each is an engine setting that means the same thing on both
 * sides, so a song carries them across untranslated.
 *
 * The per-track faders and mutes stay out of it, in `instrumentSettings`: the web multiplies a
 * fader by its own balance between the tracks and by the sound's measured gain (TRACK_TRIM and
 * relativeSoundGain in appEngine/fromSong.ts) before the engine sees it, so the same number in
 * the app's `mixer.drums` would not be the same mix — and writing it there would overwrite what
 * the app had. Solo is saved by neither: muting a track is a decision about the mix, soloing one
 * is a way of listening to it for a moment.
 */
export interface SongStrip {
  low: number;
  mid: number;
  high: number;
  threshold: number;
  ratio: number;
}

export interface SongMixer {
  master: number;
  pan: Record<InstrumentType, number>;
  reverbSize: number;
  reverbMix: number;
  /** Sparse: a track with no entry is flat and uncompressed, which is nearly every track. */
  strips: Partial<Record<InstrumentType, SongStrip>>;
}

const MIX_TRACKS: InstrumentType[] = ['drums', 'piano', 'guitar', 'bass'];
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined;

/** What the song says about the mixer; anything missing or unreadable is simply left out. */
export function songMixer(song: unknown): Partial<SongMixer> {
  const raw = (song as { mixer?: unknown })?.mixer;
  if (!raw || typeof raw !== 'object') return {};
  const json = raw as Record<string, unknown>;
  const out: Partial<SongMixer> = {};
  const master = num(json.master, 0, 1);
  if (master !== undefined) out.master = master;
  const size = num(json.reverbSize, 0, 1);
  if (size !== undefined) out.reverbSize = size;
  const mix = num(json.reverbMix, 0, 1);
  if (mix !== undefined) out.reverbMix = mix;
  if (json.pan && typeof json.pan === 'object') {
    const pan: Partial<Record<InstrumentType, number>> = {};
    for (const track of MIX_TRACKS) {
      const value = num((json.pan as Record<string, unknown>)[track], -1, 1);
      if (value !== undefined) pan[track] = value;
    }
    if (Object.keys(pan).length) out.pan = { drums: 0, piano: 0, guitar: 0, bass: 0, ...pan };
  }
  if (json.strips && typeof json.strips === 'object') {
    const strips: Partial<Record<InstrumentType, SongStrip>> = {};
    for (const track of MIX_TRACKS) {
      const s = (json.strips as Record<string, unknown>)[track];
      if (!s || typeof s !== 'object') continue;
      const r = s as Record<string, unknown>;
      strips[track] = {
        low: num(r.low, -12, 12) ?? 0,
        mid: num(r.mid, -12, 12) ?? 0,
        high: num(r.high, -12, 12) ?? 0,
        threshold: num(r.threshold, -40, 0) ?? 0,
        ratio: num(r.ratio, 1, 12) ?? 1,
      };
    }
    if (Object.keys(strips).length) out.strips = strips;
  }
  return out;
}

/**
 * [extras] with [mixer] written into its `mixer` block, keeping whatever else the block held
 * (the app writes keys this build does not model). A flat strip is taken out rather than
 * written as five zeroes.
 */
export function withMixer(extras: Record<string, unknown>, mixer: SongMixer): Record<string, unknown> {
  const previous = (extras.mixer as Record<string, unknown> | undefined) ?? {};
  const strips: Record<string, SongStrip> = {};
  for (const track of MIX_TRACKS) {
    const strip = mixer.strips[track];
    if (!strip) continue;
    if (strip.low === 0 && strip.mid === 0 && strip.high === 0 && strip.ratio <= 1) continue;
    strips[track] = strip;
  }
  const next = { ...extras };
  next.mixer = {
    ...previous,
    master: mixer.master,
    pan: { ...mixer.pan },
    reverbSize: mixer.reverbSize,
    reverbMix: mixer.reverbMix,
    ...(Object.keys(strips).length ? { strips } : {}),
  };
  if (!Object.keys(strips).length) delete (next.mixer as Record<string, unknown>).strips;
  return next;
}

/** The lengths the app offers (lib/core/music/constants.dart noteLengths): Short, 16th, 8th, 1/4, Hold. */
export const NOTE_LENGTH_STEPS = [0.5, 1, 2, 4, 0];

/** A song written by a newer format than this build understands: open it, never save it. */
export function isNewerSongFormat(song: Pick<Song, 'schemaVersion'>): boolean {
  return (song.schemaVersion ?? 4) > SONG_SCHEMA_VERSION;
}

export function generateSongId(): string {
  return `song_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createSong(title: string = 'Untitled Song'): Song {
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id: generateSongId(),
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [],
    bpm: 100,
    styleId: 'rock_basic',
    transposition: 0,
    instrumentSettings: [],
    metronomeEnabled: true,
  };
}

/**
 * Calculate total duration in seconds
 */
export function getSongDuration(song: Song): number {
  const totalBeats = song.sections.reduce((total, section) => {
    const sectionBeats = section.chords.reduce((sum, chord) => sum + chord.duration, 0);
    return total + (sectionBeats * section.repeatCount);
  }, 0);
  
  return (totalBeats / song.bpm) * 60;
}

/**
 * Format duration as mm:ss
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Migrate a raw song JSON object from any previous schema version to the current Song shape.
 * Safe to call on already-migrated songs (no-op when fields are current).
 */
export function migrateLegacySong(raw: unknown): Song {
  const r = raw as Record<string, unknown>;

  // v1 → v2: bassScalePattern/bassScaleLoopBars/bassScaleEnabled → melodic
  if (r.bassScalePattern && !r.melodic) {
    const firstVar = {
      id: `sv_mig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Var 1',
      pattern: r.bassScalePattern as DegreePattern,
      loopBars: (r.bassScaleLoopBars as 1 | 2 | 4) ?? 1,
    };
    const melodic: MelodicData = {
      bass: { variations: [firstVar], enabled: (r.bassScaleEnabled as boolean) ?? false },
      piano: { variations: [], enabled: false },
      guitar: { variations: [], enabled: false },
    };
    r.melodic = melodic;
  }

  // v5 → v6: the shared sound list (docs/sonidos-comunes.md §7e). Ids saved before it are
  // read by version, not by whether they still exist: `slap` was the web's own recording and
  // is now the SoundFont's, so a song that says `slap` means the recording.
  if ((r.schemaVersion as number | undefined ?? 4) < 6) {
    const settings = r.instrumentSettings as InstrumentState[] | undefined;
    if (Array.isArray(settings)) {
      r.instrumentSettings = settings.map((inst) => (
        inst?.id && inst.soundTypeId ? { ...inst, soundTypeId: migrateSoundId(inst.id, inst.soundTypeId) } : inst
      ));
    }
    const sections = r.sections as Section[] | undefined;
    if (Array.isArray(sections)) {
      for (const section of sections) {
        if (!section?.sounds) continue;
        section.sounds = Object.fromEntries(
          Object.entries(section.sounds).map(([track, id]) => [track, migrateSoundId(track as InstrumentType, id as string)]),
        );
      }
    }
    r.schemaVersion = SONG_SCHEMA_VERSION;
  }

  return r as unknown as Song;
}

/**
 * Get a preview of chords as a string
 */
export function getChordsPreview(song: Song, maxChords: number = 6): string {
  const allChords: string[] = [];
  
  for (const section of song.sections) {
    for (const chord of section.chords) {
      const chordName = `${chord.root}${chord.accidental}${chord.quality === 'maj' ? '' : chord.quality}`;
      allChords.push(chordName);
      if (allChords.length >= maxChords) {
        return allChords.join(' - ') + '...';
      }
    }
  }
  
  return allChords.join(' - ') || 'No chords';
}
