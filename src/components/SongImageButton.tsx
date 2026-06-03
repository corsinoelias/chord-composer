import { useState, useEffect } from 'react';
import { parseLyricLine, type Song } from '@/data/songs';
import { generateSongImage, downloadCanvasAsPng, type ImageSection } from '@/lib/songImage';

// Transpose helpers (same as SongChordPlayer)
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);
function noteIndex(n: string) { const i = SHARPS.indexOf(n); return i !== -1 ? i : FLATS.indexOf(n); }
function transposeChordStr(c: string, s: number, flats: boolean) {
  const m = c.match(/^([A-G][#b]?)(.*)/); if (!m) return c;
  const i = noteIndex(m[1]); if (i === -1) return c;
  return (flats ? FLATS : SHARPS)[((i + s) % 12 + 12) % 12] + m[2];
}
function transposeKey(key: string, s: number) {
  const minor = key.endsWith('m') && key.length > 1;
  const root = minor ? key.slice(0, -1) : key;
  const i = noteIndex(root); if (i === -1) return key;
  return (FLAT_KEYS.has(key) ? FLATS : SHARPS)[((i + s) % 12 + 12) % 12] + (minor ? 'm' : '');
}

interface Props {
  song: Song;
}

export default function SongImageButton({ song }: Props) {
  const [transpose, setTranspose] = useState(0);
  const [busy, setBusy] = useState(false);

  // Stay in sync with the player's transposition
  useEffect(() => {
    const handler = (e: Event) => {
      setTranspose((e as CustomEvent<{ semitones: number }>).detail.semitones);
    };
    window.addEventListener('song-transpose', handler);
    return () => window.removeEventListener('song-transpose', handler);
  }, []);

  function handleClick() {
    setBusy(true);
    setTimeout(() => {
      const displayKey = transpose === 0 ? song.key : transposeKey(song.key, transpose);
      const useFlats = FLAT_KEYS.has(displayKey);

      const sections: ImageSection[] = song.sections.map(sec => ({
        name: sec.name,
        lines: sec.lines.map(line =>
          parseLyricLine(line).map(tok => ({
            chord: tok.chord ? transposeChordStr(tok.chord, transpose, useFlats) : '',
            lyrics: tok.lyrics,
          }))
        ),
      }));

      const canvas = generateSongImage(
        song.title, song.artist, displayKey,
        song.capo, song.bpm, sections, song.slug, transpose
      );
      downloadCanvasAsPng(canvas, `${song.slug}.png`);
      setBusy(false);
    }, 50);
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title="Download chord sheet as image (PNG)"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:border-primary/40 disabled:opacity-50"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      {busy ? 'Generating…' : 'Image'}
    </button>
  );
}
