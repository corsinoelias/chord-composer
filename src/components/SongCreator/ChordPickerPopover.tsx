import { useState, useRef, useEffect } from 'react';
import { getDiatonicChords } from '@/lib/musicKeys';
import { X, Search } from 'lucide-react';

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
const DUR_LABELS: Record<number, string> = { 0.5: '½b', 1: '1b', 2: '2b', 3: '3b', 4: '4b' };

// Common chord extensions to append to diatonic root for suggestions
const EXTENSIONS = ['7', 'maj7', 'm7', 'sus2', 'sus4', 'add9', 'dim7', 'm7b5'];

export default function ChordPickerPopover({
  songKey, currentChord, currentDuration,
  recentChords, onSelect, onDurationChange, onRemove, onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const diatonic = getDiatonicChords(songKey);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.trim();

  // When searching: filter diatonic + recent + generate extension matches
  const suggestions = q
    ? [...new Set([...diatonic, ...recentChords])]
        .filter(c => c.toLowerCase().startsWith(q.toLowerCase()))
    : [];

  function pick(chord: string) { onSelect(chord); onClose(); }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter') {
      if (suggestions.length > 0) pick(suggestions[0]);
      else if (q) pick(q);
    }
  }

  return (
    <div
      className="absolute z-50 top-full left-0 mt-1 w-72 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type any chord… Am7, Fmaj7, Bb…"
          className="flex-1 text-sm bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground/50"
        />
        {q && (
          <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {q ? (
          /* ── Search results ── */
          <div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {suggestions.slice(0, 12).map(c => (
                  <ChordChip key={c} label={c} active={c === currentChord} onClick={() => pick(c)} />
                ))}
              </div>
            )}
            <button
              onClick={() => pick(q)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary border border-dashed border-primary/40 hover:border-primary/70 hover:bg-primary/5 rounded-xl py-2 transition-colors"
            >
              + Use "{q}"
            </button>
          </div>
        ) : (
          /* ── Default: key suggestions + recent ── */
          <>
            {/* Key chords */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Key of {songKey}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {diatonic.map(c => (
                  <ChordChip key={c} label={c} active={c === currentChord} onClick={() => pick(c)} />
                ))}
              </div>
            </div>

            {/* Extensions row */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Common extensions
              </p>
              <div className="flex flex-wrap gap-1">
                {EXTENSIONS.map(ext => {
                  const root = diatonic[0]?.replace(/m$/, '') ?? 'C';
                  const label = `${root}${ext}`;
                  return (
                    <button
                      key={ext}
                      onClick={() => pick(label)}
                      className="text-[11px] px-2 py-0.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      {ext}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recent */}
            {recentChords.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Recent</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentChords.slice(0, 8).map(c => (
                    <ChordChip key={c} label={c} active={c === currentChord} onClick={() => pick(c)} small />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Duration */}
        {currentChord && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Duration</p>
            <div className="flex gap-1.5">
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
                  {DUR_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Remove */}
        {currentChord && (
          <button
            onClick={() => { onRemove(); onClose(); }}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-xl py-1.5 transition-colors border border-destructive/20"
          >
            <X className="w-3 h-3" /> Remove chord
          </button>
        )}
      </div>
    </div>
  );
}

function ChordChip({ label, active, onClick, small }: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`${small ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1'} font-bold rounded-xl border transition-colors
        ${active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-foreground border-border hover:border-primary/50 hover:bg-primary/5'
        }`}
    >
      {label}
    </button>
  );
}
