import type { ChordView } from '@/hooks/useSyncedChordView';

const VIEWS: { id: ChordView; label: string }[] = [
  { id: 'guitar', label: 'guitar' },
  { id: 'piano', label: 'piano' },
  { id: 'ukulele', label: 'ukulele' },
];

interface Props {
  value: ChordView;
  onChange: (v: ChordView) => void;
  className?: string;
}

// Single shared control for both ChordAside ("Chords used") and SongChordPreview ("Now
// playing") — they used to each hand-roll their own version of this with slightly different
// labels/sizing, which read as two different UIs for the same choice. Kept intentionally tiny
// (both hosts are compact header bars) but now byte-for-byte identical between the two.
export function InstrumentViewSelector({ value, onChange, className = '' }: Props) {
  return (
    <div className={`inline-flex rounded-md border border-border overflow-hidden shrink-0 ${className}`}>
      {VIEWS.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          aria-pressed={value === v.id}
          className={`text-[10px] font-semibold px-2 py-1 transition-colors
            ${value === v.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
