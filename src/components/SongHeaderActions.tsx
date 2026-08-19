import { useState, useEffect } from 'react';
import { Share2, Printer, Image as ImageIcon, Pencil } from 'lucide-react';
import { parseLyricLine, type Song } from '@/data/songs';
import { generateSongImage, downloadCanvasAsPng, type ImageSection } from '@/lib/songImage';

// Transpose helpers (same small duplicated set used in ChordAside.tsx / SongChordPlayer.tsx)
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
  isCommunity: boolean;
  isLocalhost: boolean;
}

// Icon-only (w-8 h-8) below sm — there's only ever room for a compact toolbar there. From sm
// up the buttons sit inline with the title where there's space to spare, so they widen out to
// fit an icon + label instead of making people guess what a bare glyph does.
const iconButtonClass =
  'inline-flex items-center justify-center gap-1.5 w-8 h-8 sm:w-auto sm:px-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const labelClass = 'hidden sm:inline text-sm font-medium';

export default function SongHeaderActions({ song, isCommunity, isLocalhost }: Props) {
  const [transpose, setTranspose] = useState(0);
  const [shareTitle, setShareTitle] = useState('Share');
  const [imageBusy, setImageBusy] = useState(false);

  // Stay in sync with the player's live transposition
  useEffect(() => {
    const handler = (e: Event) => {
      setTranspose((e as CustomEvent<{ semitones: number }>).detail.semitones);
    };
    window.addEventListener('song-transpose', handler);
    return () => window.removeEventListener('song-transpose', handler);
  }, []);

  async function handleShare() {
    const url = window.location.href;
    const title = document.title;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareTitle('Copied!');
        setTimeout(() => setShareTitle('Share'), 2000);
      }
    } catch {}
  }

  function handleDownloadImage() {
    setImageBusy(true);
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
      setImageBusy(false);
    }, 50);
  }

  const editUrl = isCommunity ? `/songs/new/?edit=${song.slug}` : `/songs/new/?from-static=${song.slug}`;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={handleShare} title={shareTitle} className={iconButtonClass}>
        <Share2 className="w-4 h-4 shrink-0" />
        <span className={labelClass}>{shareTitle}</span>
      </button>
      <a href={`/songs/pdf/${song.slug}/`} target="_blank" rel="noopener" title="Download PDF" className={iconButtonClass}>
        <Printer className="w-4 h-4 shrink-0" />
        <span className={labelClass}>Print</span>
      </a>
      <button onClick={handleDownloadImage} disabled={imageBusy} title="Download Image" className={iconButtonClass}>
        <ImageIcon className="w-4 h-4 shrink-0" />
        <span className={labelClass}>Image</span>
      </button>
      {isLocalhost && (
        <a href={editUrl} title="Edit song" className={iconButtonClass}>
          <Pencil className="w-4 h-4 shrink-0" />
          <span className={labelClass}>Edit</span>
        </a>
      )}
    </div>
  );
}
