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
  onDelete: () => void;
  onDuplicate: () => void;
  onSelectToggle: (ctrl: boolean) => void;
  transposition?: number;
}

export function SortableChord({
  chord,
  chordId,
  index,
  isPlaying,
  isSelected,
  hasSelection,
  onClick,
  onDelete,
  onDuplicate,
  onSelectToggle,
  transposition = 0,
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
    opacity: isDragging ? 0.3 : 1,
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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className="cursor-pointer touch-none select-none"
    >
      <ChordBlock
        chord={chord}
        isPlaying={isPlaying}
        isSelected={isSelected}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        isDragging={isDragging}
        fixedWidth
        transposition={transposition}
      />
    </div>
  );
}
