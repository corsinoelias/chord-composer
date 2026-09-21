import { useState, memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { type Section } from '@/lib/sections';
import { type Chord } from '@/lib/musicTheory';
import { type StylePattern } from '@/lib/styles';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Copy, GripVertical, LayoutGrid, Minus, MoreVertical, Plus, Repeat, Trash2 } from 'lucide-react';
import { SortableChord } from './SortableChord';
import { SectionArrangementMenu, arrangementSummary, type SectionArrangement } from './SectionArrangementMenu';
import { ChordSuggestions } from './ChordSuggestions';
import { sectionColorVar } from '@/lib/sectionColors';

const VARIATION_LABELS = { bass: 'Bass', piano: 'Piano', guitar: 'Guitar' } as const;

interface SectionCardProps {
  section: Section;
  sectionIndex: number;
  currentChordIndex: number;
  globalChordOffset: number;
  totalSections: number;
  isLooping?: boolean;
  /** Something is playing somewhere — sections that aren't it are held back. */
  isPlaying?: boolean;
  /** Tempo, so each chord's beat dots can fill themselves as it sounds. */
  bpm: number;
  styleId: string;
  style?: StylePattern;
  selectedChordIds: Set<string>;
  onVariationChange?: (sectionIndex: number, instrument: 'bass' | 'piano' | 'guitar', variationId: string) => void;
  onAddChord: (sectionIndex: number) => void;
  onChordClick: (sectionIndex: number, chordIndex: number) => void;
  onChordSelect: (sectionIndex: number, chordIndex: number, ctrl: boolean) => void;
  onRepeatChange: (sectionIndex: number, repeatCount: number) => void;
  onNameChange: (sectionIndex: number, name: string) => void;
  onDelete: (sectionIndex: number) => void;
  onDuplicate: (sectionIndex: number) => void;
  onToggleLoop: (sectionIndex: number) => void;
  onSetProgression: (sectionIndex: number, chords: Chord[]) => void;
  transposition?: number;
  preferFlats?: boolean;
  /** Per-section arrangement (rhythm, tracks, sounds). The menu only shows when given. */
  onArrangementChange?: (sectionIndex: number, next: SectionArrangement) => void;
  /** Styles a section may pick; with the song's style, needed for the menu. */
  availableStyles?: StylePattern[];
  songStyle?: StylePattern;
  onEditSectionRhythm?: (sectionIndex: number) => void;
}

export const SectionCard = memo(function SectionCard({
  section,
  sectionIndex,
  currentChordIndex,
  globalChordOffset,
  isLooping,
  isPlaying = false,
  bpm,
  styleId,
  style,
  selectedChordIds,
  onVariationChange,
  onAddChord,
  onChordClick,
  onChordSelect,
  onRepeatChange,
  onNameChange,
  onDelete,
  onDuplicate,
  onToggleLoop,
  onSetProgression,
  transposition = 0,
  preferFlats = false,
  onArrangementChange,
  availableStyles,
  songStyle,
  onEditSectionRhythm,
}: SectionCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const colorVar = sectionColorVar(sectionIndex);

  // Dragging the card itself reorders sections; the grip is the only handle, so a
  // pointer-down anywhere else in the header still edits the name or presses a button.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  // Droppable zone for the section (for cross-section chord drops)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `section-drop-${sectionIndex}`,
  });

  const handleNameSubmit = () => {
    if (editName.trim()) {
      onNameChange(sectionIndex, editName.trim());
    } else {
      setEditName(section.name);
    }
    setIsEditingName(false);
  };

  // Calculate which chord in this section is playing
  const getLocalPlayingIndex = (): number => {
    if (currentChordIndex < 0) return -1;
    const localIndex = currentChordIndex - globalChordOffset;
    const sectionLength = section.chords.length;
    if (sectionLength === 0) return -1;
    const adjustedIndex = localIndex % sectionLength;
    if (localIndex >= 0 && localIndex < sectionLength * section.repeatCount) {
      return adjustedIndex;
    }
    return -1;
  };

  const localPlayingIndex = getLocalPlayingIndex();
  const isLive = isPlaying && localPlayingIndex >= 0;

  // Generate unique chord IDs that include section index
  const chordIds = section.chords.map(c => `chord-${sectionIndex}-${c.id}`);

  // Per-instrument melodic variations for the active style — only worth showing a picker
  // when there's more than one to choose from (e.g. Merengue's 9 bass variations). These
  // moved out of the header into the section options panel, beside the track they belong
  // to. Falls back to the first variation, matching resolveVariation().
  const sectionVariationIdKey = {
    bass: 'bassVariationId',
    piano: 'pianoVariationId',
    guitar: 'guitarVariationId',
  } as const;
  const variationPickers = (['bass', 'piano', 'guitar'] as const).map((key) => {
    const melodic = style?.melodic?.[key];
    const variations = melodic?.variations ?? [];
    if (!melodic?.enabled || variations.length < 2) return null;
    const activeId = section[sectionVariationIdKey[key]] ?? variations[0].id;
    return { key, label: VARIATION_LABELS[key], variations, activeId };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  const arrangement: SectionArrangement = {
    styleId: section.styleId,
    trackStyles: section.trackStyles,
    patterns: section.patterns,
    silenced: section.silenced,
    sounds: section.sounds,
  };
  const summary = availableStyles ? arrangementSummary(arrangement, availableStyles) : null;
  const canOpenOptions = !!onArrangementChange && !!availableStyles && !!(songStyle ?? style);

  const iconBtn = 'cp-btn cp-ib cp-gh';

  return (
    <section
      ref={setNodeRef}
      className="cp-card"
      aria-label={section.name}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        opacity: isDragging ? 0.5 : isPlaying && !isLive ? 0.62 : undefined,
        borderColor: isLive || isOver ? `color-mix(in srgb, ${isOver ? 'var(--cp-ac)' : colorVar} 60%, transparent)` : undefined,
        boxShadow: isLive
          ? `0 0 0 4px color-mix(in srgb, ${colorVar} 12%, transparent)`
          : isOver
            ? '0 0 0 4px color-mix(in srgb, var(--cp-ac) 12%, transparent)'
            : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-1.5 pb-1.5 pt-2.5 lg:gap-2.5 lg:pr-3">
        <button
          className="cp-gr hidden lg:flex"
          aria-label={`Drag to reorder ${section.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>

        <span
          className="shrink-0"
          style={{
            width: 12,
            height: 12,
            borderRadius: isLive ? 6 : 4,
            background: colorVar,
            boxShadow: isLive ? `0 0 0 4px color-mix(in srgb, ${colorVar} 28%, transparent)` : undefined,
          }}
          aria-hidden="true"
        />

        {isEditingName ? (
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') {
                setEditName(section.name);
                setIsEditingName(false);
              }
            }}
            className="h-7 w-32 text-sm font-bold"
            autoFocus
          />
        ) : (
          <button
            className="min-w-0 truncate border-0 bg-transparent p-0 text-[15px] font-bold tracking-tight"
            style={{ color: 'var(--cp-tx)' }}
            onClick={() => {
              setEditName(section.name);
              setIsEditingName(true);
            }}
            aria-label={`Rename ${section.name}`}
          >
            {section.name}
          </button>
        )}

        {/* Only shown when the section actually differs from the song. Opens the same
            panel as Options, which is why that Popover is controlled from here. On a
            phone it moves to its own row under the header — see below. */}
        {canOpenOptions && summary && (
          <button
            className="cp-rc hidden min-w-0 lg:inline-flex"
            onClick={() => setOptionsOpen(true)}
            aria-label={`${section.name} plays ${summary}. Open section options.`}
          >
            <LayoutGrid size={14} className="shrink-0" />
            <span className="cp-sub">{summary}</span>
          </button>
        )}

        <div className="flex-grow" />

        <button
          className={isLooping ? 'cp-btn cp-ib' : iconBtn}
          style={{
            width: 36,
            height: 36,
            ...(isLooping
              ? {
                  background: `color-mix(in srgb, ${colorVar} 22%, transparent)`,
                  borderColor: colorVar,
                  color: colorVar,
                }
              : {}),
          }}
          onClick={() => onToggleLoop(sectionIndex)}
          aria-pressed={!!isLooping}
          aria-label={isLooping ? `Stop looping ${section.name}` : `Loop ${section.name}`}
        >
          <Repeat size={18} />
        </button>

        <div className="cp-step">
          <button
            onClick={() => onRepeatChange(sectionIndex, section.repeatCount - 1)}
            disabled={section.repeatCount <= 1}
            aria-label="Fewer repeats"
          >
            <Minus size={14} />
          </button>
          <span className="cp-mono min-w-[26px] text-center text-xs font-bold">×{section.repeatCount}</span>
          <button
            onClick={() => onRepeatChange(sectionIndex, section.repeatCount + 1)}
            aria-label="More repeats"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Phone: one overflow menu instead of Options + duplicate + delete, as drawn. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="cp-btn cp-ib cp-gh lg:hidden"
              style={{ width: 40, height: 40 }}
              aria-label={`${section.name} options`}
            >
              <MoreVertical size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canOpenOptions && (
              <DropdownMenuItem onClick={() => setOptionsOpen(true)}>
                <LayoutGrid size={14} className="mr-2" />Section options…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDuplicate(sectionIndex)}>
              <Copy size={14} className="mr-2" />Duplicate section
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(sectionIndex)}>
              <Trash2 size={14} className="mr-2" />Delete section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {canOpenOptions && (
          <SectionArrangementMenu
            arrangement={arrangement}
            onChange={(next) => onArrangementChange!(sectionIndex, next)}
            songStyle={(songStyle ?? style)!}
            styles={availableStyles!}
            sectionName={section.name}
            onEditRhythm={onEditSectionRhythm ? () => onEditSectionRhythm(sectionIndex) : undefined}
            open={optionsOpen}
            onOpenChange={setOptionsOpen}
            variationPickers={variationPickers}
            onVariationChange={
              onVariationChange ? (instrument, id) => onVariationChange(sectionIndex, instrument, id) : undefined
            }
            trigger={
              <button
                className="cp-btn cp-opt hidden lg:inline-flex"
                aria-haspopup="menu"
                aria-expanded={optionsOpen}
                aria-label={`${section.name} options`}
              >
                Options
                <ChevronDown size={16} />
                {summary && <b className="cp-dot" />}
              </button>
            }
          />
        )}

        <div className="cp-dv mx-0.5 hidden lg:block" style={{ height: 20 }} />

        <button
          className={`${iconBtn} hidden lg:inline-flex`}
          style={{ width: 36, height: 36 }}
          onClick={() => onDuplicate(sectionIndex)}
          aria-label={`Duplicate ${section.name}`}
        >
          <Copy size={18} />
        </button>
        <button
          className={`${iconBtn} hidden lg:inline-flex`}
          style={{ width: 36, height: 36 }}
          onClick={() => onDelete(sectionIndex)}
          aria-label={`Delete ${section.name}`}
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Phone: the "differs from the song" chip gets its own full-width row */}
      {canOpenOptions && summary && (
        <div className="px-3 pb-1 lg:hidden">
          <button
            className="cp-rc w-full justify-start"
            style={{ height: 36, fontSize: 13 }}
            onClick={() => setOptionsOpen(true)}
            aria-label={`${section.name} plays ${summary}. Open section options.`}
          >
            <LayoutGrid size={14} className="shrink-0" />
            <span className="cp-sub">{summary}</span>
          </button>
        </div>
      )}

      {/* Chords */}
      <div ref={setDroppableRef}>
        {section.chords.length === 0 ? (
          <div
            className="mx-4 flex h-20 items-center justify-center rounded-xl text-xs"
            style={{
              border: `1.5px dashed ${isOver ? 'var(--cp-ac)' : 'var(--cp-ln2)'}`,
              color: isOver ? 'var(--cp-act)' : 'var(--cp-mu)',
              background: isOver ? 'color-mix(in srgb, var(--cp-ac) 6%, transparent)' : undefined,
            }}
          >
            {isOver ? 'Drop chord here' : 'No chords yet'}
          </div>
        ) : (
          <SortableContext items={chordIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-2 px-3 pt-1.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3 lg:px-4 lg:pt-2">
              {section.chords.map((chord, index) => {
                const compoundId = `chord-${sectionIndex}-${chord.id}`;
                return (
                  <SortableChord
                    key={chord.id}
                    chord={chord}
                    chordId={compoundId}
                    index={index}
                    isPlaying={localPlayingIndex === index && isPlaying}
                    bpm={bpm}
                    rawIndex={currentChordIndex}
                    isSelected={selectedChordIds.has(compoundId)}
                    hasSelection={selectedChordIds.size > 0}
                    onClick={() => onChordClick(sectionIndex, index)}
                    onSelectToggle={(ctrl) => onChordSelect(sectionIndex, index, ctrl)}
                    transposition={transposition}
                    preferFlats={preferFlats}
                    isOutOfScale={false}
                  />
                );
              })}
            </div>
          </SortableContext>
        )}

        <div className="flex flex-wrap items-center gap-2 px-3 pb-4 pt-3 lg:px-4">
          <button
            className="cp-btn cp-dash"
            style={{ height: 36 }}
            onClick={() => onAddChord(sectionIndex)}
          >
            <Plus size={16} />
            Add Chord
          </button>

          <ChordSuggestions
            styleId={styleId}
            onSetProgression={(chords) => onSetProgression(sectionIndex, chords)}
          />
        </div>
      </div>
    </section>
  );
});
