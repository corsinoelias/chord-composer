export interface WordToken {
  id: string;
  text: string;
  chord: string;
  duration: number; // beats, default 2
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

export interface SongMeta {
  title: string;
  artist: string;
  key: string;
  capo: number;
  bpm: number;
  genre: string[];
  style: string;
}
