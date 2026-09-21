/**
 * Progression Templates Modal
 * 
 * Allows users to quickly load famous chord progressions.
 * Organized by genre with song examples and audio preview.
 */

import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { type Chord, generateChordId, formatChord } from '@/lib/musicTheory';
import { GENRE_PROGRESSIONS, progressionToChords } from '@/lib/chordProgressions';
import { playChordPreview } from '@/lib/audioEngine';
import { FileMusic, Music, Play, Square, Check, X } from 'lucide-react';
import { qualityClass } from '@/lib/chordColors';

interface ProgressionTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (chords: Chord[], templateName: string) => void;
}

export function ProgressionTemplatesModal({
  open,
  onOpenChange,
  onSelect,
}: ProgressionTemplatesModalProps) {
  const [selectedGenre, setSelectedGenre] = useState<string>(GENRE_PROGRESSIONS[0]?.id || 'pop');
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
      const timeout = setTimeout(() => {
        playChordPreview(chord);
      }, index * chordDuration);
      previewTimeoutRef.current.push(timeout);
    });
    
    const endTimeout = setTimeout(() => {
      setPreviewingId(null);
    }, chords.length * chordDuration + 400);
    previewTimeoutRef.current.push(endTimeout);
  }, [stopPreview]);

  const handleSelect = useCallback((genreId: string, progIdx: number) => {
    stopPreview();
    const genre = GENRE_PROGRESSIONS.find(g => g.id === genreId);
    if (!genre) return;
    
    const prog = genre.progressions[progIdx];
    const chords = progressionToChords(prog);
    onSelect(chords, prog.name);
    
    // Show applied state, then close
    const id = `${genreId}-${progIdx}`;
    setAppliedId(id);
    setTimeout(() => {
      onOpenChange(false);
      setAppliedId(null);
    }, 500);
  }, [onSelect, onOpenChange, stopPreview]);

  const handlePreview = useCallback((genreId: string, progIdx: number) => {
    const id = `${genreId}-${progIdx}`;
    if (previewingId === id) {
      stopPreview();
      return;
    }
    const genre = GENRE_PROGRESSIONS.find(g => g.id === genreId);
    if (!genre) return;
    const chords = progressionToChords(genre.progressions[progIdx]);
    playPreview(chords, id);
  }, [previewingId, stopPreview, playPreview]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      stopPreview();
      setAppliedId(null);
    }
    onOpenChange(open);
  }, [onOpenChange, stopPreview]);

  const currentGenre = GENRE_PROGRESSIONS.find(g => g.id === selectedGenre) || GENRE_PROGRESSIONS[0];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="cp-dlg flex max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-[680px] flex-col gap-0 rounded-[20px] p-0 sm:rounded-[20px]">
        <div className="flex h-[72px] shrink-0 items-center justify-between pl-6 pr-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px]"
              style={{ background: 'color-mix(in srgb, var(--cp-ac) 16%, transparent)', color: 'var(--cp-act)' }}
              aria-hidden="true"
            >
              <FileMusic size={18} />
            </span>
            <DialogTitle className="m-0 text-xl font-extrabold tracking-tight" style={{ color: 'var(--cp-tx)' }}>
              Progression Templates
            </DialogTitle>
          </div>
          <button className="cp-btn cp-ib cp-gh" onClick={() => handleOpenChange(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Genre tabs */}
        <div
          className="flex shrink-0 gap-1.5 overflow-x-auto px-6 pb-4"
          style={{ borderBottom: '1px solid var(--cp-ln)' }}
          role="tablist"
          aria-label="Genres"
        >
          {GENRE_PROGRESSIONS.map((genre) => (
            <button
              key={genre.id}
              role="tab"
              aria-selected={selectedGenre === genre.id}
              className={`cp-tg ${selectedGenre === genre.id ? 'cp-on' : ''}`}
              onClick={() => setSelectedGenre(genre.id)}
            >
              {genre.name}
            </button>
          ))}
        </div>

        {/* Progressions list */}
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-6 py-4">
          {currentGenre.progressions.map((prog, idx) => {
            const id = `${currentGenre.id}-${idx}`;
            const isPreviewing = previewingId === id;
            const isApplied = appliedId === id;

            return (
              <div
                key={idx}
                className="cp-rw"
                style={isApplied ? { borderColor: 'var(--cp-sev)', background: 'color-mix(in srgb, var(--cp-sev) 8%, var(--cp-s2))' } : undefined}
              >
                <div className="flex min-w-0 flex-grow flex-col gap-[9px]">
                  <span className="text-[15px] font-bold tracking-tight">{prog.name}</span>
                  <div className="flex flex-wrap gap-[5px]">
                    {prog.chords.slice(0, 8).map((chord, i) => (
                      <span key={i} className={`cp-cc ${qualityClass(chord.quality)}`}>
                        {chord.root}
                        {chord.accidental === '#' ? '♯' : chord.accidental === 'b' ? '♭' : ''}
                        {chord.quality === 'maj' ? '' : chord.quality}
                      </span>
                    ))}
                    {prog.chords.length > 8 && (
                      <span className="self-center text-xs" style={{ color: 'var(--cp-mu)' }}>
                        +{prog.chords.length - 8}
                      </span>
                    )}
                  </div>
                  {prog.examples && prog.examples.length > 0 && (
                    <span className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--cp-mu)' }}>
                      <Music size={14} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">{prog.examples.join(' · ')}</span>
                    </span>
                  )}
                </div>

                <button
                  className="cp-btn cp-ib shrink-0"
                  onClick={() => handlePreview(currentGenre.id, idx)}
                  aria-label={isPreviewing ? `Stop preview of ${prog.name}` : `Preview ${prog.name}`}
                >
                  {isPreviewing ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
                <button
                  className="cp-btn cp-pri shrink-0"
                  style={{ padding: '0 20px', ...(isApplied ? { background: 'var(--cp-sev)', borderColor: 'var(--cp-sev)' } : {}) }}
                  onClick={() => handleSelect(currentGenre.id, idx)}
                >
                  {isApplied ? <><Check size={16} />Applied</> : 'Use'}
                </button>
              </div>
            );
          })}
        </div>

        <div
          className="flex h-[52px] shrink-0 items-center justify-center gap-2 text-xs"
          style={{ borderTop: '1px solid var(--cp-ln)', color: 'var(--cp-mu)' }}
        >
          <Play size={14} aria-hidden="true" />
          <span>Preview a progression, then press Use to apply it</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
