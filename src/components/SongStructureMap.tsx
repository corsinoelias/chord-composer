import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHorizontalScrollArrows } from '@/hooks/useHorizontalScrollArrows';

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
// the array is its own chip, not merged with the first). The strip scrolls (rather than
// wrapping) so on a phone it reads left-to-right like a timeline instead of reflowing into a
// stack — its native scrollbar is hidden (a bare scrollbar under six pills read as a rendering
// glitch, not an intentional strip) and replaced with prev/next arrows, since hiding it also
// removes the only way a mouse (no drag/swipe gesture) had to move the strip.
export function SongStructureMap({ items, activeSectionIndex, queuedSectionIndex, onSelect }: SongStructureMapProps) {
  const { ref, canScrollLeft, canScrollRight, scrollByPage } = useHorizontalScrollArrows<HTMLDivElement>();

  if (items.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 px-2.5 py-2 border border-border rounded-xl bg-card min-w-0 flex-1">
      <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground mr-0.5">
        Structure
      </span>
      <button
        type="button"
        onClick={() => scrollByPage(-1)}
        disabled={!canScrollLeft}
        aria-label="Scroll structure left"
        className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-0 disabled:pointer-events-none transition-opacity"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <div
        ref={ref}
        className="flex items-center gap-1.5 overflow-x-auto min-w-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
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
      <button
        type="button"
        onClick={() => scrollByPage(1)}
        disabled={!canScrollRight}
        aria-label="Scroll structure right"
        className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-0 disabled:pointer-events-none transition-opacity"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
