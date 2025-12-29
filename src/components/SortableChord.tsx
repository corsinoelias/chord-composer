import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Chord } from '@/lib/musicTheory';
import { ChordBlock } from './ChordBlock';

interface SortableChordProps {
  chord: Chord;
  chordId: string; // Unique ID including section index
  index: number;
  isPlaying: boolean;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function SortableChord({
  chord,
  chordId,
  index,
  isPlaying,
  onClick,
  onDelete,
  onDuplicate,
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
    zIndex: isDragging ? 10 : 'auto',
  };

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    // Only trigger click if not dragging
    if (!isDragging) {
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
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        isDragging={isDragging}
        fixedWidth
      />
    </div>
  );
}