import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Section } from '@/lib/sections';
import { SectionCardContent } from './SectionCardContent';

interface SortableSectionProps {
  section: Section;
  sectionIndex: number;
  currentChordIndex: number;
  globalChordOffset: number;
  totalSections: number;
  isLooping?: boolean;
  onAddChord: () => void;
  onChordClick: (chordIndex: number) => void;
  onChordDelete: (chordIndex: number) => void;
  onChordDuplicate: (chordIndex: number) => void;
  onChordReorder: (fromIndex: number, toIndex: number) => void;
  onRepeatChange: (repeatCount: number) => void;
  onNameChange: (name: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleLoop: () => void;
}

export function SortableSection({
  section,
  sectionIndex,
  currentChordIndex,
  globalChordOffset,
  totalSections,
  isLooping,
  onAddChord,
  onChordClick,
  onChordDelete,
  onChordDuplicate,
  onChordReorder,
  onRepeatChange,
  onNameChange,
  onDelete,
  onDuplicate,
  onToggleLoop,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SectionCardContent
        section={section}
        sectionIndex={sectionIndex}
        currentChordIndex={currentChordIndex}
        globalChordOffset={globalChordOffset}
        totalSections={totalSections}
        isLooping={isLooping}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        onAddChord={onAddChord}
        onChordClick={onChordClick}
        onChordDelete={onChordDelete}
        onChordDuplicate={onChordDuplicate}
        onChordReorder={onChordReorder}
        onRepeatChange={onRepeatChange}
        onNameChange={onNameChange}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onToggleLoop={onToggleLoop}
      />
    </div>
  );
}
