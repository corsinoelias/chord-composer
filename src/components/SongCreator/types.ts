// ── Legacy token model (used only by LyricsStep parser internals) ─────────────
export interface WordToken {
  id: string;
  text: string;
  chord: string;
  duration: number;
  isSpace: boolean;
}

export interface EditorLine {
  id: string;
  tokens: WordToken[];
}

export interface AudioRange {
  startSec: number;
  endSec: number;
}

export interface EditorSection {
  id: string;
  name: string;
  lines: EditorLine[];
  repeatCount: number; // how many times the section plays back-to-back. Default 1 (no repeat).
  // Which slice of the song's shared audioTrack (if any) plays under this section.
  audioRange?: AudioRange;
}

// ── Primary editing model ─────────────────────────────────────────────────────
// One "slot" = one chord anchor + the lyric text that sits under it
export interface ChordSlot {
  id: string;
  chord: string;    // e.g. "Am", "" = no chord
  duration: number; // beats (default 4)
  lyric: string;    // text under this chord
}

export interface ChordLine {
  id: string;
  slots: ChordSlot[];
}

export interface SectionData {
  id: string;
  name: string;
  lines: ChordLine[];
}

export interface SongMeta {
  title: string;
  artist: string;
  // Songwriter/composer, when different from the performing artist (covers). Empty
  // string = same as artist. See supabase/migrations/20260731_add_composer_and_moderation.sql.
  composerName: string;
  album: string;
  key: string;
  capo: number;
  bpm: number;
  genre: string[];
  style: string;
  // Vocal/reference recording shared by the whole song — a single file uploaded to
  // Supabase Storage (`path` is its storage object path, needed to delete/replace it).
  // Sliced per section via EditorSection.audioRange, or as one continuous span via
  // audioWholeRange.
  audioTrack?: { url: string; path: string };
  audioWholeRange?: AudioRange;
}
