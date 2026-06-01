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

export interface EditorSection {
  id: string;
  name: string;
  lines: EditorLine[];
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
  key: string;
  capo: number;
  bpm: number;
  genre: string[];
  style: string;
}
