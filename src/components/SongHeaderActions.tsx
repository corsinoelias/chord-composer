import { useState, useEffect } from 'react';
import { Share2, Printer, Image as ImageIcon, Pencil, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { parseLyricLine, type Song } from '@/data/songs';
import { generateSongImage, downloadCanvasAsPng, type ImageSection } from '@/lib/songImage';
import { analytics } from '@/lib/analytics';
import { useSongNotation } from '@/hooks/useSongNotation';
import { displayChord } from '@/lib/songNotation';

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
  // The PNG export is a picture of the chart, so it has to be spelled the way the chart on
  // screen is — otherwise someone reading in numbers downloads an image in letters.
  const [notation] = useSongNotation();
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
            chord: tok.chord
              ? displayChord(transposeChordStr(tok.chord, transpose, useFlats), displayKey, notation)
              : '',
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

  // Share stays on the page; the rest lives behind "···" (Sep 2026 redesign) — the header had
  // four same-weight buttons competing with Play.
  const pdfHref = `/songs/pdf/${song.slug}/${transpose !== 0 ? `?transpose=${transpose}` : ''}`;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={handleShare} title={shareTitle} className={iconButtonClass}>
        <Share2 className="w-4 h-4 shrink-0" />
        <span className={labelClass}>{shareTitle}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Print, image and more" title="Print, image and more" className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-border transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* The href carries the transposition the chart is showing, the same way the PNG
              export below does. Without it someone transposes to their key, hits Print, and
              gets the recorded key back — /songs/pdf/ has always accepted ?transpose=. */}
          <DropdownMenuItem asChild>
            <a href={pdfHref} target="_blank" rel="noopener" onClick={() => analytics.songPdfOpened(song.slug)} className="cursor-pointer">
              <Printer className="w-4 h-4 mr-2 text-muted-foreground" />
              Print / PDF
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleDownloadImage} disabled={imageBusy} className="cursor-pointer">
            <ImageIcon className="w-4 h-4 mr-2 text-muted-foreground" />
            Save as image
          </DropdownMenuItem>
          {isLocalhost && (
            <DropdownMenuItem asChild>
              <a href={editUrl} className="cursor-pointer">
                <Pencil className="w-4 h-4 mr-2 text-muted-foreground" />
                Edit song
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
