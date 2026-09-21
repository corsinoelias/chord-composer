import { memo, useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Repeat } from 'lucide-react';
import { type Section, sectionHasArrangement } from '@/lib/sections';
import { sectionColorMap } from '@/lib/sectionColors';

const BEATS_PER_BAR = 4;

/** Beats in one pass of a section. */
function sectionBeats(section: Section): number {
  return section.chords.reduce((sum, c) => sum + (c.duration ?? 4), 0);
}

function formatTime(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface Segment {
  section: Section;
  index: number;
  /** Bars in one pass, rounded up — a half-empty bar still occupies one. */
  bars: number;
  /** Bars across every repeat: what sets the segment's share of the strip. */
  totalBars: number;
  colorVar: string;
  /** 0–1 of this segment already played, or null when it is not the live one. */
  fill: number | null;
  isActive: boolean;
  differs: boolean;
}

interface StructureBarProps {
  sections: Section[];
  currentChordIndex: number;
  isPlaying: boolean;
  loopingSectionIndex: number | null;
  bpm: number;
  onJumpToSection: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onAddSection: () => void;
  /** Inside the mobile header the strip is already on a surface: drop the card chrome. */
  bare?: boolean;
}

/**
 * A live overview of the song: one segment per section, each as wide as its share of the
 * bars, so the strip doubles as the progress bar. Drag to reorder, click to jump.
 *
 * This is what replaced the per-section up/down arrows and the separate thin progress
 * line — both are gone from the page, so reordering has to work from here (pointer drag,
 * or focus + Alt/⌥ + ←/→) and from the grip on each section card.
 */
export const StructureBar = memo(function StructureBar({
  sections,
  currentChordIndex,
  isPlaying,
  loopingSectionIndex,
  bpm,
  onJumpToSection,
  onReorder,
  onAddSection,
  bare = false,
}: StructureBarProps) {
  const sensors = useSensors(
    // Mouse drags after a few pixels; touch needs a hold, so a swipe still scrolls the
    // strip sideways on a phone instead of grabbing a segment.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const { segments, totalBars, elapsedSeconds, totalSeconds } = useMemo(() => {
    // Where the playhead is, as an index into the flattened chord list — the same
    // numbering `currentChordIndex` uses.
    const playedChords = currentChordIndex >= 0 ? currentChordIndex : -1;
    let activeIndex = -1;
    let activeFraction = 0;

    if (playedChords >= 0) {
      if (loopingSectionIndex !== null) {
        // While looping, playback still counts from the section's global offset.
        let offset = 0;
        for (let i = 0; i < loopingSectionIndex; i++) {
          offset += sections[i].chords.length * sections[i].repeatCount;
        }
        const sec = sections[loopingSectionIndex];
        const span = Math.max(1, sec.chords.length * sec.repeatCount);
        activeIndex = loopingSectionIndex;
        activeFraction = (((playedChords - offset) % span) + span) % span / span;
      } else {
        let remaining = playedChords;
        for (let i = 0; i < sections.length; i++) {
          const span = sections[i].chords.length * sections[i].repeatCount;
          if (span > 0 && remaining < span) {
            activeIndex = i;
            activeFraction = remaining / span;
            break;
          }
          remaining -= span;
        }
      }
    }

    const colors = sectionColorMap(sections);
    let bars = 0;
    let beatsBefore = 0;
    let elapsedBeats = 0;

    const segs: Segment[] = sections.map((section, index) => {
      const beats = sectionBeats(section);
      const passBars = Math.max(1, Math.ceil(beats / BEATS_PER_BAR));
      const total = passBars * section.repeatCount;
      bars += total;

      const isActive = isPlaying && index === activeIndex;
      if (isActive) elapsedBeats = beatsBefore + beats * section.repeatCount * activeFraction;
      beatsBefore += beats * section.repeatCount;

      return {
        section,
        index,
        bars: passBars,
        totalBars: total,
        colorVar: colors.get(section.id)!,
        fill: isActive ? activeFraction : index < activeIndex && loopingSectionIndex === null ? 1 : null,
        isActive,
        differs: sectionHasArrangement(section),
      };
    });

    const beatsTotal = sections.reduce((sum, s) => sum + sectionBeats(s) * s.repeatCount, 0);
    return {
      segments: segs,
      totalBars: bars,
      elapsedSeconds: (elapsedBeats / bpm) * 60,
      totalSeconds: (beatsTotal / bpm) * 60,
    };
  }, [sections, currentChordIndex, isPlaying, loopingSectionIndex, bpm]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = sections.findIndex(s => s.id === active.id);
    const to = sections.findIndex(s => s.id === over.id);
    if (from >= 0 && to >= 0) onReorder(from, to);
  };

  const activeSegment = segments.find(s => s.isActive);

  return (
    <section
      className={bare ? 'pt-2.5' : 'cp-card p-3.5 pb-4 lg:px-4'}
      aria-label="Song structure"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 lg:mb-3">
        <span className="cp-lbl">Structure</span>
        <span className="cp-mono text-xs font-bold" style={{ color: 'var(--cp-tx2)' }}>
          {totalBars} bars · {isPlaying ? `${formatTime(elapsedSeconds)} / ` : ''}{formatTime(totalSeconds)}
        </span>
        <div className="flex-grow" />
        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--cp-mu)' }}>
          {bare ? (
            'Hold & drag to reorder'
          ) : isPlaying && activeSegment ? (
            <>
              <span className="cp-pd" style={{ width: 6, height: 6 }} />
              {loopingSectionIndex !== null
                ? `Looping ${activeSegment.section.name}`
                : `Playing ${activeSegment.section.name}`} · click a section to jump
            </>
          ) : (
            <>
              <GripVertical size={14} aria-hidden="true" />
              Drag to reorder · click to jump
            </>
          )}
        </span>
      </div>

      <div className="overflow-x-auto pb-1.5 pt-1.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sections.map(s => s.id)} strategy={horizontalListSortingStrategy}>
            <div className="cp-trk min-w-max lg:min-w-0" role="list" aria-label="Sections in playback order">
              {segments.map(segment => (
                <StructureSegment
                  key={segment.section.id}
                  segment={segment}
                  isLooping={loopingSectionIndex === segment.index}
                  totalSections={sections.length}
                  onJump={() => onJumpToSection(segment.index)}
                  onReorder={onReorder}
                />
              ))}
              <button className="cp-sc cp-ad" onClick={onAddSection} aria-label="Add section">
                <Plus size={18} />
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </section>
  );
});

interface StructureSegmentProps {
  segment: Segment;
  isLooping: boolean;
  totalSections: number;
  onJump: () => void;
  onReorder: (from: number, to: number) => void;
}

function StructureSegment({ segment, isLooping, totalSections, onJump, onReorder }: StructureSegmentProps) {
  const { section, index, bars, totalBars, colorVar, fill, isActive, differs } = segment;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  // Alt/⌥ + ←/→ moves the focused segment, so reordering is reachable without a pointer
  // now that the per-section arrows are gone.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const to = index + (e.key === 'ArrowLeft' ? -1 : 1);
      if (to >= 0 && to < totalSections) onReorder(index, to);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onJump();
    }
  };

  const repeatDividers = Array.from({ length: Math.max(0, section.repeatCount - 1) }, (_, i) => (
    <span
      key={i}
      className="cp-rp"
      style={{ left: `${((i + 1) / section.repeatCount) * 100}%` }}
      aria-hidden="true"
    />
  ));

  return (
    <div
      ref={setNodeRef}
      className="relative min-w-[72px]"
      style={{
        flex: `${totalBars} 1 0`,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 3 : undefined,
      }}
    >
      <div
        role="listitem"
        tabIndex={0}
        aria-label={`${section.name}, ${bars} bar${bars === 1 ? '' : 's'}${
          section.repeatCount > 1 ? `, repeats ${section.repeatCount}×` : ''
        }${differs ? ', has its own rhythm' : ''}`}
        onClick={onJump}
        onKeyDown={handleKeyDown}
        className={`cp-sc w-full ${isActive ? 'cp-on' : ''} ${
          !isActive && isLooping ? 'cp-dim-seg' : ''
        }`}
        style={{
          ['--cp-c' as string]: colorVar,
          flex: '1 1 0',
          minWidth: 0,
          opacity: isDragging ? 0.4 : undefined,
          boxShadow: isDragging ? '0 18px 40px rgba(18,22,31,.22)' : undefined,
        }}
        {...attributes}
        {...listeners}
      >
        {fill !== null && <span className="cp-fl" style={{ width: `${fill * 100}%` }} />}
        {repeatDividers}
        <GripVertical size={16} className="relative shrink-0" style={{ color: 'var(--cp-mu)' }} aria-hidden="true" />
        <span className="cp-t">
          <span className="cp-n">{section.name}</span>
          <span className="cp-m">{bars} bar{bars === 1 ? '' : 's'}</span>
        </span>
        {section.repeatCount > 1 && <span className="cp-x">×{section.repeatCount}</span>}
        {isLooping && (
          <Repeat size={14} className="relative shrink-0" style={{ color: 'var(--cp-c)' }} aria-hidden="true" />
        )}
        {differs && <i className="cp-rm" title="Has its own rhythm, sounds or tracks" />}
      </div>
      {/* The playhead sits on the wrapper, not inside the segment, so it can overhang the
          segment's rounded, clipped box top and bottom as drawn. */}
      {isActive && fill !== null && (
        <div className="cp-ph" style={{ left: `${fill * 100}%` }} aria-hidden="true" />
      )}
    </div>
  );
}
