import { useState, useRef, useEffect } from 'react';
import { getDiatonicChords } from '@/lib/musicKeys';
import { X } from 'lucide-react';

interface Props {
  songKey: string;
  currentChord: string;
  currentDuration: number;
  recentChords: string[];
  onSelect: (chord: string) => void;
  onDurationChange: (duration: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

const DURATIONS = [0.5, 1, 2, 3, 4] as const;
const DURATION_LABELS: Record<number, string> = { 0.5: '½b', 1: '1b', 2: '2b', 3: '3b', 4: '4b' };

const COMMON_EXTRAS = ['7', 'maj7', 'm7', 'sus2', 'sus4', 'add9', 'dim'];

export default function ChordPickerPopover({ songKey, currentChord, currentDuration, recentChords, onSelect, onDurationChange, onRemove, onClose }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const diatonic = getDiatonicChords(songKey);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Filter by query if typed
  const allChords = [...new Set([...diatonic, ...recentChords])];
  const filtered = query.trim()
    ? allChords.filter(c => c.toLowerCase().includes(query.toLowerCase()))
    : allChords;

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && query.trim()) {
      onSelect(query.trim());
      onClose();
    }
  }

  return (
    <div
      className="absolute z-50 top-full left-0 mt-1 w-64 rounded-xl border border-border bg-card shadow-xl p-3"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Type any chord…"
        className="w-full text-sm bg-background border border-border rounded-lg px-3 py-1.5 mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />

      {/* Diatonic / filtered chords */}
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
        {query ? 'Matches' : `Key of ${songKey}`}
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(query ? filtered : diatonic).map(chord => (
          <button
            key={chord}
            onClick={() => { onSelect(chord); onClose(); }}
            className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors
              ${currentChord === chord
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:border-primary/50 hover:bg-primary/5'
              }`}
          >
            {chord}
          </button>
        ))}
        {query && filtered.length === 0 && (
          <button
            onClick={() => { onSelect(query.trim()); onClose(); }}
            className="text-xs font-bold px-2.5 py-1 rounded-lg border border-dashed border-primary/40 text-primary hover:bg-primary/5"
          >
            Use "{query.trim()}"
          </button>
        )}
      </div>

      {/* Extensions row */}
      {!query && (
        <>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Extensions</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {COMMON_EXTRAS.map(ext => {
              const label = `${diatonic[0]}${ext}`;
              return (
                <button
                  key={ext}
                  onClick={() => { onSelect(label); onClose(); }}
                  className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  +{ext}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Duration selector — only shown when a chord is assigned */}
      {currentChord && (
        <>
          <div className="border-t border-border/50 my-2" />
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Duration</p>
          <div className="flex gap-1.5 mb-3">
            {DURATIONS.map(d => (
              <button
                key={d}
                onClick={() => onDurationChange(d)}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-colors
                  ${currentDuration === d
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:border-primary/50'
                  }`}
              >
                {DURATION_LABELS[d]}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Remove chord */}
      {currentChord && (
        <button
          onClick={() => { onRemove(); onClose(); }}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg py-1.5 transition-colors border border-destructive/20"
        >
          <X className="w-3 h-3" />
          Remove chord
        </button>
      )}
    </div>
  );
}
