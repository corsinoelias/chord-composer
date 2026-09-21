import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  transposition?: number;
  preferFlats?: boolean;
  isOutOfScale?: boolean;
  /** Tempo and playback index, so the beat dots fill themselves while the chord sounds. */
  bpm?: number;
  rawIndex?: number | string;
}

export function SortableChord({
  chord,
  chordId,
  isPlaying,
  isSelected,
  hasSelection,
  onClick,
  onSelectToggle,
  transposition = 0,
  preferFlats = false,
  isOutOfScale = false,
  bpm = 120,
  rawIndex = 0,
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

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className="block w-full touch-none select-none border-0 bg-transparent p-0 text-left"
      aria-label={`Edit chord`}
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
      />
    </button>
  );
}
