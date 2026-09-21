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
import { type DetectedKey } from '@/lib/keyDetect';
import { chordDegree } from '@/lib/keyPalette';
import { type StylePattern } from '@/lib/styles';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Copy, GripVertical, LayoutGrid, MoreHorizontal, Plus, Repeat, SlidersHorizontal, Trash2 } from 'lucide-react';
import { SortableChord } from './SortableChord';
import { SectionArrangementMenu, arrangementSummary, type SectionArrangement } from './SectionArrangementMenu';
import { ChordSuggestions } from './ChordSuggestions';

const VARIATION_LABELS = { bass: 'Bass', piano: 'Piano', guitar: 'Guitar' } as const;

/** Repeats go round 1…8 on a tap, as in the Android app. */
const MAX_REPEATS = 8;

interface SectionCardProps {
  section: Section;
  sectionIndex: number;
  currentChordIndex: number;
  globalChordOffset: number;
  totalSections: number;
  isLooping?: boolean;
  /** This section's own colour — see sectionColorMap. */
  color: string;
  /** Something is playing somewhere. */
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
  onChordDelete: (sectionIndex: number, chordIndex: number) => void;
  onChordDuplicate: (sectionIndex: number, chordIndex: number) => void;
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
  /** What the song plays on each track, so an inherited row in the options panel names it. */
  songSounds?: Partial<Record<'drums' | 'bass' | 'piano' | 'guitar', string>>;
  /** The song's key as the chords are stored (untransposed), for each chord's numeral. */
  songKey?: DetectedKey | null;
  /** Beats in a bar: a chord takes one grid column per bar it lasts. */
  beatsPerBar?: number;
}

/**
 * One section of the song, as the Android app draws it (lib/features/arrangement/
 * section_card.dart): a header washed in the section's colour — its name, the rhythm it
 * plays if that is its own, how many times it goes round (which time round, while it
 * plays), loop, its rhythm and a menu — over a four-column grid of chords, each as wide
 * as the bars it lasts, with "+ Chord" and "Suggest" waiting where the next chord would go.
 */
export const SectionCard = memo(function SectionCard({
  section,
  sectionIndex,
  currentChordIndex,
  globalChordOffset,
  isLooping,
  color,
  isPlaying = false,
  bpm,
  styleId,
  style,
  selectedChordIds,
  onVariationChange,
  onAddChord,
  onChordClick,
  onChordSelect,
  onChordDelete,
  onChordDuplicate,
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
  songSounds,
  songKey = null,
  beatsPerBar = 4,
}: SectionCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [optionsOpen, setOptionsOpen] = useState(false);

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

  // Which chord of this section is playing, and which time round the section is on
  const chordCount = section.chords.length;
  const localIndex = currentChordIndex - globalChordOffset;
  const inSection =
    currentChordIndex >= 0 && chordCount > 0 && localIndex >= 0 && localIndex < chordCount * section.repeatCount;
  const localPlayingIndex = inSection ? localIndex % chordCount : -1;
  const isLive = isPlaying && localPlayingIndex >= 0;
  const currentRepeat = isLive ? Math.floor(localIndex / chordCount) + 1 : 0;

  const chordIds = section.chords.map(c => `chord-${sectionIndex}-${c.id}`);

  // Per-instrument melodic variations for the active style — only worth a picker when
  // there's more than one. They live in the section options panel, beside their track.
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

  // A chord takes a column per bar it lasts; "+ Chord" and "Suggest" fill what is left of
  // the last row, the way the app lays them out.
  const spanOf = (chord: Chord) => Math.min(4, Math.max(1, Math.ceil((chord.duration ?? beatsPerBar) / beatsPerBar)));
  const used = chordCount === 0
    ? 2
    : section.chords.reduce((cells, chord) => {
        const span = spanOf(chord);
        const start = (cells % 4) + span > 4 ? Math.ceil(cells / 4) * 4 : cells;
        return start + span;
      }, 0) % 4;
  const free = used === 0 ? 0 : 4 - used;

  const addTile = (className: string) => (
    <button className={`cp-tile ${className}`} onClick={() => onAddChord(sectionIndex)} aria-label={`Add chord to ${section.name}`}>
      <Plus size={16} />
      Chord
    </button>
  );
  const suggestTile = (className: string) => (
    <ChordSuggestions
      styleId={styleId}
      variant="tile"
      className={className}
      onSetProgression={(chords) => onSetProgression(sectionIndex, chords)}
    />
  );

  return (
    <section
      ref={setNodeRef}
      className={`cp-sec ${isLive ? 'cp-live' : ''}`}
      aria-label={section.name}
      style={{
        ['--cp-sc' as string]: color,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      <div className={`cp-sh ${isOver && chordCount > 0 ? 'cp-drop' : ''}`}>
        <button className="cp-sgrip" aria-label={`Drag to reorder ${section.name}`} {...attributes} {...listeners}>
          <GripVertical size={14} />
        </button>
        <span className="cp-sdot" aria-hidden="true" />

        {isEditingName ? (
          <input
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
            className="cp-sname ml-1 w-36 rounded-md"
            style={{ background: 'var(--cp-s1)', boxShadow: 'inset 0 0 0 1.5px var(--cp-ac)', padding: '4px 6px' }}
            aria-label="Section name"
            autoFocus
          />
        ) : (
          <button
            className="cp-sname ml-1"
            onClick={() => {
              setEditName(section.name);
              setIsEditingName(true);
            }}
            aria-label={`Rename ${section.name}`}
          >
            {section.name}
          </button>
        )}

        {/* The rhythm this section plays when it isn't the song's, in its colour */}
        {canOpenOptions && summary && (
          <button
            className="cp-stag hidden sm:inline-block"
            onClick={() => setOptionsOpen(true)}
            aria-label={`${section.name} plays ${summary}. Open section options.`}
          >
            {summary}
          </button>
        )}

        <div className="flex-grow" />

        <button
          className="cp-rep"
          onClick={() => onRepeatChange(sectionIndex, section.repeatCount >= MAX_REPEATS ? 1 : section.repeatCount + 1)}
          aria-label={
            isLive
              ? `Time ${Math.min(currentRepeat, section.repeatCount)} of ${section.repeatCount}. Tap for more repeats`
              : `Plays ${section.repeatCount} time${section.repeatCount === 1 ? '' : 's'}. Tap for more`
          }
          title="Repeats"
        >
          <span>
            {isLive && section.repeatCount > 1
              ? `${Math.min(currentRepeat, section.repeatCount)} / ${section.repeatCount}`
              : `×${section.repeatCount}`}
          </span>
        </button>

        <button
          className={`cp-loop ${isLooping ? 'cp-on' : ''}`}
          onClick={() => onToggleLoop(sectionIndex)}
          aria-pressed={!!isLooping}
          aria-label={isLooping ? `Stop looping ${section.name}` : `Loop ${section.name}`}
          title={isLooping ? 'Stop looping' : 'Loop this section'}
        >
          <span><Repeat size={15} /></span>
        </button>

        {onEditSectionRhythm && (
          <button
            className="cp-icb"
            style={{ width: 34 }}
            onClick={() => onEditSectionRhythm(sectionIndex)}
            aria-label={`Edit the rhythm of ${section.name}`}
            title="Edit this section's rhythm"
          >
            <LayoutGrid size={17} />
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="cp-icb" style={{ width: 34 }} aria-label={`${section.name} options`}>
              <MoreHorizontal size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canOpenOptions && (
              <DropdownMenuItem onClick={() => setOptionsOpen(true)}>
                <SlidersHorizontal size={14} className="mr-2" />Section options…
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
            songSounds={songSounds}
            open={optionsOpen}
            onOpenChange={setOptionsOpen}
            variationPickers={variationPickers}
            onVariationChange={
              onVariationChange ? (instrument, id) => onVariationChange(sectionIndex, instrument, id) : undefined
            }
            // Opened from the tag or the menu; this only anchors the panel.
            trigger={<span className="block h-0 w-0" aria-hidden="true" />}
          />
        )}
      </div>

      {/* Chords */}
      <div ref={setDroppableRef}>
        <SortableContext items={chordIds} strategy={rectSortingStrategy}>
          <div className="cp-grid">
            {chordCount === 0 && (
              <div
                className="cp-empty"
                style={{
                  gridColumn: 'span 2',
                  ...(isOver ? { borderColor: 'var(--cp-ac)', color: 'var(--cp-act)' } : {}),
                }}
              >
                {isOver ? 'Drop chord here' : 'No chords yet'}
              </div>
            )}

            {section.chords.map((chord, index) => {
              const compoundId = `chord-${sectionIndex}-${chord.id}`;
              return (
                <SortableChord
                  key={chord.id}
                  chord={chord}
                  chordId={compoundId}
                  index={index}
                  span={spanOf(chord)}
                  isPlaying={localPlayingIndex === index && isPlaying}
                  bpm={bpm}
                  rawIndex={currentChordIndex}
                  isSelected={selectedChordIds.has(compoundId)}
                  hasSelection={selectedChordIds.size > 0}
                  onClick={() => onChordClick(sectionIndex, index)}
                  onSelectToggle={(ctrl) => onChordSelect(sectionIndex, index, ctrl)}
                  onDelete={() => onChordDelete(sectionIndex, index)}
                  onDuplicate={() => onChordDuplicate(sectionIndex, index)}
                  transposition={transposition}
                  preferFlats={preferFlats}
                  isOutOfScale={false}
                  degree={chordDegree(chord, songKey)}
                />
              );
            })}

            {free >= 2 ? (
              <>
                {addTile('cp-v')}
                {suggestTile('cp-v')}
              </>
            ) : free === 1 ? (
              <div className="flex flex-col gap-1.5">
                {addTile('flex-1')}
                {suggestTile('flex-1')}
              </div>
            ) : (
              <>
                <div style={{ gridColumn: 'span 2' }}>{addTile('h-10')}</div>
                <div style={{ gridColumn: 'span 2' }}>{suggestTile('h-10')}</div>
              </>
            )}
          </div>
        </SortableContext>
      </div>
    </section>
  );
});
