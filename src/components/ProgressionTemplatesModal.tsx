/**
 * Progression templates, laid out as the Android app lays out its lists (the "Mis
 * canciones" artboard): search, filter pills, and a card per progression with its chords
 * as a coloured strip, a round play button to hear it and "Use" to put it in the song.
 * A bottom sheet on a phone, a centred panel on a wide screen, like the chord editor.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type Chord } from '@/lib/musicTheory';
import { GENRE_PROGRESSIONS, progressionToChords, type ChordProgression } from '@/lib/chordProgressions';
import { playChordPreview } from '@/lib/audioEngine';
import { getTransposedChordName } from '@/lib/chordNotes';
import { qualityClass } from '@/lib/chordColors';
import { Check, ChevronLeft, Music, Play, Search, Square } from 'lucide-react';

interface ProgressionTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (chords: Chord[], templateName: string) => void;
}

const HUE: Record<string, string> = {
  '': 'var(--cp-maj)',
  'cp-min': 'var(--cp-min)',
  'cp-sev': 'var(--cp-sev)',
  'cp-sus': 'var(--cp-sus)',
  'cp-dim': 'var(--cp-dim)',
  'cp-aug': 'var(--cp-aug)',
};

interface Entry {
  genreId: string;
  genreName: string;
  index: number;
  prog: ChordProgression;
}

export function ProgressionTemplatesModal({
  open,
  onOpenChange,
  onSelect,
}: ProgressionTemplatesModalProps) {
  const [selectedGenre, setSelectedGenre] = useState<string>(GENRE_PROGRESSIONS[0]?.id || 'pop');
  const [query, setQuery] = useState('');
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopPreview = useCallback(() => {
    previewTimeoutRef.current.forEach(t => clearTimeout(t));
    previewTimeoutRef.current = [];
    setPreviewingId(null);
  }, []);

  const playPreview = useCallback((chords: Chord[], id: string) => {
    stopPreview();
    setPreviewingId(id);
    const chordDuration = 550;
    chords.forEach((chord, index) => {
      previewTimeoutRef.current.push(setTimeout(() => playChordPreview(chord), index * chordDuration));
    });
    previewTimeoutRef.current.push(setTimeout(() => setPreviewingId(null), chords.length * chordDuration + 400));
  }, [stopPreview]);

  const handleSelect = useCallback((entry: Entry) => {
    stopPreview();
    onSelect(progressionToChords(entry.prog), entry.prog.name);
    setAppliedId(`${entry.genreId}-${entry.index}`);
    setTimeout(() => {
      onOpenChange(false);
      setAppliedId(null);
    }, 500);
  }, [onSelect, onOpenChange, stopPreview]);

  const handlePreview = useCallback((entry: Entry) => {
    const id = `${entry.genreId}-${entry.index}`;
    if (previewingId === id) {
      stopPreview();
      return;
    }
    playPreview(progressionToChords(entry.prog), id);
  }, [previewingId, stopPreview, playPreview]);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      stopPreview();
      setAppliedId(null);
    }
    onOpenChange(next);
  }, [onOpenChange, stopPreview]);

  // A search looks through every genre; otherwise the list is the chosen genre's.
  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const all = GENRE_PROGRESSIONS.flatMap((g) =>
      g.progressions.map((prog, index) => ({ genreId: g.id, genreName: g.name, index, prog })),
    );
    if (q) {
      return all.filter(({ prog, genreName }) =>
        [prog.name, genreName, ...(prog.examples ?? [])].some((t) => t.toLowerCase().includes(q)),
      );
    }
    return all.filter((e) => e.genreId === selectedGenre);
  }, [query, selectedGenre]);

  const searching = query.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="cp-dlg flex max-h-[92dvh] w-full max-w-[600px] flex-col gap-0 rounded-[22px] p-0 max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 sm:rounded-[22px]">
        <div className="flex shrink-0 flex-col gap-3 px-4 pb-3 pt-2 sm:pt-4">
          <div className="cp-grab sm:hidden" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <button className="cp-icb -ml-2.5" onClick={() => handleOpenChange(false)} aria-label="Back">
              <ChevronLeft size={20} />
            </button>
            <DialogTitle className="m-0 flex-1 text-[22px] font-extrabold tracking-[-0.02em]" style={{ color: 'var(--cp-tx)' }}>
              Templates
            </DialogTitle>
            <DialogDescription className="sr-only">Famous chord progressions to start a section from</DialogDescription>
          </div>

          <label
            className="flex h-11 items-center gap-2 rounded-xl px-3"
            style={{ background: 'var(--cp-s1)', border: '1px solid var(--cp-ln)', color: 'var(--cp-mu)' }}
          >
            <Search size={17} />
            <input
              placeholder="Search by name, genre or song"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 border-0 bg-transparent text-sm outline-none"
              style={{ color: 'var(--cp-tx)' }}
              aria-label="Search templates"
            />
          </label>

          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Genres">
            {GENRE_PROGRESSIONS.map((genre) => {
              const on = !searching && selectedGenre === genre.id;
              return (
                <button
                  key={genre.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => { setQuery(''); setSelectedGenre(genre.id); }}
                  className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold"
                  style={on
                    ? { background: 'var(--cp-tx)', color: 'var(--cp-s1)', border: '1px solid var(--cp-tx)' }
                    : { background: 'transparent', color: 'var(--cp-tx2)', border: '1px solid var(--cp-ln)' }}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-5">
          <span className="cp-lbl">
            {searching ? 'Results' : GENRE_PROGRESSIONS.find((g) => g.id === selectedGenre)?.name} · {entries.length}
          </span>

          {entries.map((entry) => {
            const id = `${entry.genreId}-${entry.index}`;
            const isPreviewing = previewingId === id;
            const isApplied = appliedId === id;
            const { prog } = entry;
            return (
              <div
                key={id}
                className="flex flex-col gap-2.5 p-3"
                style={{
                  background: isApplied ? 'color-mix(in srgb, var(--cp-sev) 10%, var(--cp-s1))' : 'var(--cp-s1)',
                  border: `1px solid ${isApplied ? 'var(--cp-sev)' : 'var(--cp-ln)'}`,
                  borderRadius: 16,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="truncate text-[15px] font-bold">{prog.name}</span>
                    {(searching || (prog.examples && prog.examples.length > 0)) && (
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cp-mu)' }}>
                        {prog.examples && prog.examples.length > 0 && <Music size={12} className="shrink-0" aria-hidden="true" />}
                        <span className="truncate">
                          {[searching ? entry.genreName : null, ...(prog.examples ?? [])].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handlePreview(entry)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={isPreviewing
                      ? { background: 'var(--cp-ac)', color: '#FFFFFF', border: 0 }
                      : { background: 'var(--cp-acs)', color: 'var(--cp-act)', border: 0 }}
                    aria-label={isPreviewing ? `Stop preview of ${prog.name}` : `Hear ${prog.name}`}
                  >
                    {isPreviewing
                      ? <Square size={14} fill="currentColor" strokeWidth={0} />
                      : <Play size={16} fill="currentColor" strokeWidth={0} className="ml-0.5" />}
                  </button>
                  <button
                    onClick={() => handleSelect(entry)}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-0 px-4 text-sm font-bold text-white"
                    style={{ background: isApplied ? 'var(--cp-sev)' : 'var(--cp-ac)' }}
                  >
                    {isApplied ? <><Check size={15} />Added</> : 'Use'}
                  </button>
                </div>
                <div className="flex h-[22px] gap-[3px]" aria-label={prog.chords.map((c) => getTransposedChordName({ id: '', duration: 4, ...c }, 0, c.accidental === 'b', true)).join(', ')}>
                  {prog.chords.map((c, i) => (
                    <span
                      key={i}
                      className="cp-mono flex min-w-0 flex-1 items-center overflow-hidden rounded-[5px] pl-[5px] text-[10px] font-bold"
                      style={{ background: HUE[qualityClass(c.quality)] ?? HUE[''], color: '#14181F' }}
                      aria-hidden="true"
                    >
                      <span className="truncate">{getTransposedChordName({ id: '', duration: 4, ...c }, 0, c.accidental === 'b', true)}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {entries.length === 0 && (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--cp-mu)' }}>
              No templates matching "<span style={{ color: 'var(--cp-tx)' }}>{query}</span>"
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
