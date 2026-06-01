import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';

// ─── Chord data ───────────────────────────────────────────────────────────────

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ALT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};
const QUALITIES = [
  { label: 'Major',   suffix: '',     display: '' },
  { label: 'Minor',   suffix: 'm',    display: 'm' },
  { label: 'Dom 7',   suffix: '7',    display: '7' },
  { label: 'Min 7',   suffix: 'm7',   display: 'm7' },
  { label: 'Maj 7',   suffix: 'maj7', display: 'maj7' },
  { label: 'Sus 2',   suffix: 'sus2', display: 'sus2' },
  { label: 'Sus 4',   suffix: 'sus4', display: 'sus4' },
  { label: 'Add 9',   suffix: 'add9', display: 'add9' },
  { label: '9',       suffix: '9',    display: '9' },
  { label: 'Maj 9',   suffix: 'maj9', display: 'maj9' },
  { label: 'Min 9',   suffix: 'm9',   display: 'm9' },
  { label: 'Dim',     suffix: 'dim',  display: 'dim' },
  { label: 'Aug',     suffix: 'aug',  display: 'aug' },
  { label: 'm7b5',    suffix: 'm7b5', display: 'm7b5' },
  { label: 'Dim 7',   suffix: 'dim7', display: 'dim7' },
];

const ALL_CHORDS: string[] = ROOTS.flatMap(root =>
  QUALITIES.map(q => `${root}${q.suffix}`)
);

const QUICK_PICKS = [
  'C', 'Cm', 'C7', 'Cmaj7',
  'D', 'Dm', 'D7', 'Dm7',
  'E', 'Em', 'E7', 'Em7',
  'F', 'Fm', 'F7', 'Fmaj7',
  'G', 'Gm', 'G7', 'Gmaj7',
  'A', 'Am', 'A7', 'Am7',
  'B', 'Bm', 'B7', 'Bm7',
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onSelect: (chord: string) => void;
  onClose: () => void;
  recentChords?: string[];
}

export default function ChordPicker({ onSelect, onClose, recentChords = [] }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = query.trim()
    ? ALL_CHORDS.filter(c =>
        c.toLowerCase().startsWith(query.toLowerCase()) ||
        (ALT[c.split(/(?=[A-Z])/)[0]] && c.replace(c.split(/(?=[A-Z])/)[0], ALT[c.split(/(?=[A-Z])/)[0]]).toLowerCase().startsWith(query.toLowerCase()))
      ).slice(0, 24)
    : [];

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    if (e.key === 'Enter' && filtered.length > 0) {
      onSelect(filtered[0]);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden w-72">

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a chord…"
          className="flex-1 text-sm bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground text-xs">
            ✕
          </button>
        )}
      </div>

      <div className="p-2 max-h-64 overflow-y-auto">
        {/* Search results */}
        {query && filtered.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {filtered.map(chord => (
              <button
                key={chord}
                onClick={() => onSelect(chord)}
                className="px-2.5 py-1 text-xs font-bold font-mono rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {chord}
              </button>
            ))}
          </div>
        )}

        {query && filtered.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-3">No chords match "{query}"</div>
        )}

        {/* Recent chords */}
        {!query && recentChords.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">Recent</p>
            <div className="flex flex-wrap gap-1.5">
              {recentChords.slice(0, 8).map(chord => (
                <button
                  key={chord}
                  onClick={() => onSelect(chord)}
                  className="px-2.5 py-1 text-xs font-bold font-mono rounded-lg bg-muted text-foreground border border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {chord}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick picks */}
        {!query && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">Common</p>
            <div className="grid grid-cols-4 gap-1">
              {QUICK_PICKS.map(chord => (
                <button
                  key={chord}
                  onClick={() => onSelect(chord)}
                  className="px-2 py-1.5 text-xs font-bold font-mono rounded-lg bg-background text-foreground border border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-colors text-center"
                >
                  {chord}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="px-3 py-2 border-t border-border/50">
        <p className="text-xs text-muted-foreground">
          Press <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-xs">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
