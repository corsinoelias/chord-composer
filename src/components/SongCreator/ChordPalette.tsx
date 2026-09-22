import { useDraggable } from '@dnd-kit/core';
import { useEffect, useRef } from 'react';
import { getDiatonicChords } from '@/lib/musicKeys';
import { parseChordString } from '@/lib/chordParser';
import { playChordHold } from '@/lib/appEngine/preview';
import { GripVertical } from 'lucide-react';

function DraggableChord({ chord }: { chord: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: 'palette-' + chord,
    data: { type: 'palette-chord', chord, duration: 4 },
  });
  const stopRef = useRef<(() => void) | null>(null);

  function stopSound() {
    stopRef.current?.();
    stopRef.current = null;
    window.removeEventListener('pointerup', stopSound);
    window.removeEventListener('pointercancel', stopSound);
  }

  function startSound() {
    stopSound();
    const chordObj = parseChordString(chord)[0];
    if (!chordObj) return;
    stopRef.current = playChordHold(chordObj);
    window.addEventListener('pointerup', stopSound);
    window.addEventListener('pointercancel', stopSound);
  }

  useEffect(() => stopSound, []);

  function handlePointerDown(e: React.PointerEvent) {
    (listeners as Record<string, (e: React.PointerEvent) => void> | undefined)?.onPointerDown?.(e);
    startSound();
  }

  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      title={`Click to play, drag "${chord}" onto a word or empty line`}
      className={`flex items-center gap-1.5 w-full text-sm font-bold px-3 py-2 rounded-lg border
        cursor-grab active:cursor-grabbing select-none transition-all touch-none
        ${isDragging
          ? 'opacity-30 scale-95'
          : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:border-primary/50 hover:shadow-sm'
        }`}
    >
      <GripVertical className="w-3 h-3 opacity-40 shrink-0" />
      {chord}
    </span>
  );
}

interface Props {
  songKey: string;
}

export default function ChordPalette({ songKey }: Props) {
  const chords = getDiatonicChords(songKey);

  return (
    <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 space-y-2">
      <div className="text-[11px] font-semibold text-primary/60 uppercase tracking-widest px-1">
        Key of {songKey}
      </div>
      <div className="flex flex-col gap-1">
        {chords.map(chord => (
          <DraggableChord key={chord} chord={chord} />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/50 text-center pt-1 leading-tight">
        drag to a word<br/>or empty line
      </p>
    </div>
  );
}
