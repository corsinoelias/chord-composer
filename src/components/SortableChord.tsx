import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, X } from 'lucide-react';
import { type Chord } from '@/lib/musicTheory';
import { ChordBlock } from './ChordBlock';

interface SortableChordProps {
  chord: Chord;
  chordId: string;
  index: number;
  isPlaying: boolean;
  isSelected: boolean;
  hasSelection: boolean;
  onClick: () => void;
  onSelectToggle: (ctrl: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  transposition?: number;
  preferFlats?: boolean;
  isOutOfScale?: boolean;
  /** Tempo and playback index, so the beat dots fill themselves while the chord sounds. */
  bpm?: number;
  rawIndex?: number | string;
  /** The chord's numeral in the song's key, shown under its name. */
  degree?: { numeral: string; borrowed: boolean } | null;
  /** Grid columns the chord takes: one per bar it lasts. */
  span?: number;
}

export function SortableChord({
  chord,
  chordId,
  isPlaying,
  isSelected,
  hasSelection,
  onClick,
  onSelectToggle,
  onDelete,
  onDuplicate,
  transposition = 0,
  preferFlats = false,
  isOutOfScale = false,
  bpm = 120,
  rawIndex = 0,
  degree = null,
  span = 1,
}: SortableChordProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chordId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto' as const,
    gridColumn: span > 1 ? `span ${span}` : undefined,
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    const isModifier = e.ctrlKey || e.metaKey;
    // Enter/stay in selection mode with modifier OR when selection is already active
    if (isModifier || hasSelection) {
      e.preventDefault();
      onSelectToggle(isModifier);
    } else {
      onClick();
    }
  };

  // Delete / Ctrl+D on a focused chord, so the quick actions work without a pointer too.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      onDuplicate();
    }
  };

  // The quick actions sit outside the drag handle's reach: a pointer-down on them must
  // not start a drag, nor bubble up into the chord's own click (which opens the editor).
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div ref={setNodeRef} style={style} className="cp-chw relative">
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={handleClick}
        onKeyDown={(e) => { handleKeyDown(e); listeners?.onKeyDown?.(e); }}
        className="block h-full w-full touch-none select-none border-0 bg-transparent p-0 text-left"
        aria-label="Edit chord"
        aria-keyshortcuts="Delete Control+D"
      >
        <ChordBlock
          chord={chord}
          isPlaying={isPlaying}
          isSelected={isSelected}
          isDragging={isDragging}
          transposition={transposition}
          preferFlats={preferFlats}
          isOutOfScale={isOutOfScale}
          bpm={bpm}
          rawIndex={rawIndex}
          degree={degree}
        />
      </button>

      {!isDragging && (
        <div className="cp-cha" onPointerDown={stop}>
          <button
            type="button"
            onClick={(e) => { stop(e); onDuplicate(); }}
            aria-label="Duplicate chord"
            title="Duplicate (Ctrl+D)"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            className="cp-cha-del"
            onClick={(e) => { stop(e); onDelete(); }}
            aria-label="Delete chord"
            title="Delete (Del)"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
