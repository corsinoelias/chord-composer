interface StructureItem {
  sectionIndex: number;
  name: string;
  repeatCount: number;
}

interface SongStructureMapProps {
  items: StructureItem[];
  activeSectionIndex: number | null;
  queuedSectionIndex: number | null;
  onSelect: (si: number) => void;
}

// The whole arrangement in one glance — today that information only comes from scrolling the
// entire song. Click a chip to jump/queue that exact instance (a repeated section further down
// the array is its own chip, not merged with the first). overflow-x-auto instead of wrapping —
// on a phone this reads left-to-right like a timeline instead of reflowing into a stack.
export function SongStructureMap({ items, activeSectionIndex, queuedSectionIndex, onSelect }: SongStructureMapProps) {
  if (items.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-2 border border-border rounded-xl bg-card overflow-x-auto min-w-0 flex-1">
      <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground mr-0.5">
        Structure
      </span>
      {items.map(item => {
        const isActive = item.sectionIndex === activeSectionIndex;
        const isQueued = item.sectionIndex === queuedSectionIndex;
        return (
          <button
            key={item.sectionIndex}
            type="button"
            onClick={() => onSelect(item.sectionIndex)}
            className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11.5px] font-semibold transition-colors
              ${isActive
                ? 'border-primary/40 bg-primary/10 text-primary'
                : isQueued
                  ? 'border-primary/40 border-dashed bg-primary/5 text-primary/80'
                  : 'border-transparent bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
              }
            `}
          >
            {item.name}
            {item.repeatCount > 1 && (
              <span className={`text-[9.5px] font-bold ${isActive ? 'text-primary/70' : 'text-muted-foreground/70'}`}>
                ×{item.repeatCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
