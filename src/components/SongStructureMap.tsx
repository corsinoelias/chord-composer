import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHorizontalScrollArrows } from '@/hooks/useHorizontalScrollArrows';
import { sectionShort, sectionStyle } from '@/lib/sectionKind';

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
  // "56 bars · 3:18"-style summary shown at the end of the row (optional).
  summary?: string;
}

// The whole arrangement in one glance — V1 C V2 C B B C — each chip in its section kind's colour
// (sectionKind.ts), the one playing filled solid. Click a chip to jump/queue that exact instance
// (a repeated section further down the array is its own chip, not merged with the first). The
// strip scrolls (rather than wrapping) so on a phone it reads left-to-right like a timeline; its
// scrollbar is hidden and replaced with prev/next arrows, since a mouse has no swipe gesture.
export function SongStructureMap({ items, activeSectionIndex, queuedSectionIndex, onSelect, summary }: SongStructureMapProps) {
  const { ref, canScrollLeft, canScrollRight, scrollByPage } = useHorizontalScrollArrows<HTMLDivElement>();

  if (items.length <= 1) return null;

  const arrow = 'shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-0 disabled:pointer-events-none transition-opacity';

  return (
    <nav aria-label="Song map" className="flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-2 min-w-0">
      <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground mr-1">
        Song map
      </span>
      <button type="button" onClick={() => scrollByPage(-1)} disabled={!canScrollLeft} aria-label="Scroll song map left" className={`hidden md:block ${arrow}`}>
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <div
        ref={ref}
        className="order-3 md:order-none basis-full md:basis-auto flex items-center gap-1.5 overflow-x-auto min-w-0 py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map(item => {
          const isActive = item.sectionIndex === activeSectionIndex;
          const isQueued = item.sectionIndex === queuedSectionIndex;
          const style = sectionStyle(item.name);
          return (
            <button
              key={item.sectionIndex}
              type="button"
              onClick={() => onSelect(item.sectionIndex)}
              title={`${item.name}${item.repeatCount > 1 ? ` ×${item.repeatCount}` : ''}${isQueued ? ' · plays next' : ''}`}
              aria-current={isActive ? 'true' : undefined}
              className={`shrink-0 inline-flex items-center gap-0.5 h-[30px] min-w-[38px] justify-center px-2.5 rounded-lg border text-[12.5px] font-bold transition-colors
                ${isActive ? style.solid : style.chip} ${isQueued ? 'border-dashed ring-2 ring-primary/30' : ''} hover:brightness-95`}
            >
              {sectionShort(item.name)}
              {item.repeatCount > 1 && <sup className="text-[9px] font-bold opacity-80">{item.repeatCount}</sup>}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => scrollByPage(1)} disabled={!canScrollRight} aria-label="Scroll song map right" className={`hidden md:block ${arrow}`}>
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      {summary && <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{summary}</span>}
    </nav>
  );
}
