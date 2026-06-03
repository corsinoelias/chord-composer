import { useState, useCallback, useRef } from 'react';
import { GENRE_PROGRESSIONS, progressionToChords, type ChordProgression } from '@/lib/chordProgressions';
import { playChordPreview } from '@/lib/audioEngine';
import { type Chord } from '@/lib/musicTheory';
import { formatChord } from '@/lib/musicTheory';
import { Play, Square, ArrowRight, Sparkles } from 'lucide-react';

// Show only the most recognisable genres in the starter
const STARTER_GENRES = ['pop', 'rock', 'jazz', 'blues', 'latin', 'folk'];

interface Props {
  onSelect: (chords: Chord[], styleId?: string) => void;
  onStartBlank: () => void;
}

const GENRE_STYLES: Record<string, string> = {
  pop: 'pop_basic', rock: 'rock_basic', jazz: 'jazz_swing',
  blues: 'blues_shuffle', latin: 'merengue', folk: 'folk_strum',
};

const GENRE_EMOJIS: Record<string, string> = {
  pop: '🎤', rock: '🎸', jazz: '🎷', blues: '🎹', latin: '💃', folk: '🪕',
};

export function NewSongStarter({ onSelect, onStartBlank }: Props) {
  const [activeGenre, setActiveGenre] = useState('pop');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const genre = GENRE_PROGRESSIONS.find(g => g.id === activeGenre)
    ?? GENRE_PROGRESSIONS.find(g => g.id === 'pop')!;
  const progressions = genre.progressions.slice(0, 6);

  const stopPreview = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setPreviewingId(null);
  }, []);

  const handlePreview = useCallback((prog: ChordProgression, id: string) => {
    if (previewingId === id) { stopPreview(); return; }
    stopPreview();
    setPreviewingId(id);
    const chords = progressionToChords(prog);
    chords.forEach((chord, i) => {
      const t = setTimeout(() => playChordPreview(chord), i * 520);
      timeoutsRef.current.push(t);
    });
    const end = setTimeout(() => setPreviewingId(null), chords.length * 520 + 400);
    timeoutsRef.current.push(end);
  }, [previewingId, stopPreview]);

  const handleSelect = useCallback((prog: ChordProgression) => {
    stopPreview();
    onSelect(progressionToChords(prog), GENRE_STYLES[activeGenre]);
  }, [activeGenre, onSelect, stopPreview]);

  function chordLabel(c: Chord) {
    return `${c.root}${c.accidental}${c.quality === 'maj' ? '' : c.quality === 'min' ? 'm' : c.quality}`;
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">What do you want to create?</h1>
          <p className="text-sm text-muted-foreground">Pick a starting progression or start from scratch</p>
        </div>

        {/* Genre tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {STARTER_GENRES.map(id => {
            const g = GENRE_PROGRESSIONS.find(x => x.id === id);
            if (!g) return null;
            return (
              <button
                key={id}
                onClick={() => setActiveGenre(id)}
                className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border transition-all
                  ${activeGenre === id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5'
                  }`}
              >
                <span>{GENRE_EMOJIS[id]}</span>
                {g.name}
              </button>
            );
          })}
        </div>

        {/* Progression list */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {progressions.map((prog, idx) => {
            const id = `${activeGenre}-${idx}`;
            const isPreviewing = previewingId === id;
            const chords = progressionToChords(prog);
            const chordNames = chords.map(chordLabel).join(' · ');

            return (
              <div key={id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                {/* Preview */}
                <button
                  onClick={() => handlePreview(prog, id)}
                  className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all
                    ${isPreviewing
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                    }`}
                  title={isPreviewing ? 'Stop preview' : 'Preview chords'}
                >
                  {isPreviewing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{prog.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{chordNames}</span>
                  </div>
                  {prog.examples && prog.examples.length > 0 && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                      {prog.examples.slice(0, 3).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Apply */}
                <button
                  onClick={() => handleSelect(prog)}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all opacity-0 group-hover:opacity-100"
                >
                  Use this →
                </button>
              </div>
            );
          })}
        </div>

        {/* Start blank */}
        <div className="mt-6 text-center">
          <button
            onClick={onStartBlank}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Start with blank canvas
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}
