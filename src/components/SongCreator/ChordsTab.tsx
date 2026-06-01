import { useState, useRef, useEffect } from 'react';
import type { SectionData, ChordSlot, SongMeta } from './types';
import { makeSlot, makeLine, makeSection } from './dataModel';
import ChordPickerPopover from './ChordPickerPopover';
import { Plus, Trash2, GripVertical, X } from 'lucide-react';

interface Props {
  sections: SectionData[];
  meta: SongMeta;
  onChange: (sections: SectionData[]) => void;
}

interface ActivePicker { sectionId: string; lineId: string; slotId: string; }

export default function ChordsTab({ sections, meta, onChange }: Props) {
  const [active, setActive] = useState<ActivePicker | null>(null);
  const [recentChords, setRecentChords] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ── Section ops ─────────────────────────────────────────────────────────────
  const addSection = () => onChange([...sections, makeSection(`Section ${sections.length + 1}`)]);
  const deleteSection = (id: string) => onChange(sections.filter(s => s.id !== id));
  const renameSection = (id: string, name: string) =>
    onChange(sections.map(s => s.id === id ? { ...s, name } : s));

  // ── Line ops ─────────────────────────────────────────────────────────────────
  const addLine = (sId: string) =>
    onChange(sections.map(s => s.id === sId ? { ...s, lines: [...s.lines, makeLine()] } : s));
  const deleteLine = (sId: string, lId: string) =>
    onChange(sections.map(s => s.id === sId ? { ...s, lines: s.lines.filter(l => l.id !== lId) } : s));

  // ── Slot ops ─────────────────────────────────────────────────────────────────
  const addSlot = (sId: string, lId: string) =>
    onChange(sections.map(s => s.id !== sId ? s : {
      ...s,
      lines: s.lines.map(l => l.id !== lId ? l : { ...l, slots: [...l.slots, makeSlot()] }),
    }));

  const removeSlot = (sId: string, lId: string, slotId: string) =>
    onChange(sections.map(s => s.id !== sId ? s : {
      ...s,
      lines: s.lines.map(l => l.id !== lId ? l : { ...l, slots: l.slots.filter(sl => sl.id !== slotId) }),
    }));

  const patchSlot = (sId: string, lId: string, slotId: string, patch: Partial<ChordSlot>) =>
    onChange(sections.map(s => s.id !== sId ? s : {
      ...s,
      lines: s.lines.map(l => l.id !== lId ? l : {
        ...l,
        slots: l.slots.map(sl => sl.id !== slotId ? sl : { ...sl, ...patch }),
      }),
    }));

  const handleAssign = (sId: string, lId: string, slotId: string, chord: string) => {
    patchSlot(sId, lId, slotId, { chord });
    setRecentChords(prev => [chord, ...prev.filter(c => c !== chord)].slice(0, 8));
    setActive(null);
  };

  return (
    <div ref={ref} className="space-y-3">
      {sections.map(section => (
        <div key={section.id} className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Section header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            <input
              value={section.name}
              onChange={e => renameSection(section.id, e.target.value)}
              className="flex-1 text-xs font-bold uppercase tracking-widest text-muted-foreground bg-transparent focus:outline-none focus:text-foreground min-w-0"
            />
            <button
              onClick={() => deleteSection(section.id)}
              disabled={sections.length <= 1}
              className="text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-20 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Lines */}
          <div className="p-3 space-y-3">
            {section.lines.map(line => (
              <div key={line.id} className="group flex items-start gap-2">
                <div className="flex-1 flex flex-wrap gap-2">
                  {line.slots.map(slot => (
                    <ChordBlock
                      key={slot.id}
                      slot={slot}
                      isActive={active?.slotId === slot.id}
                      songKey={meta.key}
                      recentChords={recentChords}
                      onOpen={() => setActive({ sectionId: section.id, lineId: line.id, slotId: slot.id })}
                      onClose={() => setActive(null)}
                      onAssign={chord => handleAssign(section.id, line.id, slot.id, chord)}
                      onDurationChange={d => patchSlot(section.id, line.id, slot.id, { duration: d })}
                      onRemove={() => removeSlot(section.id, line.id, slot.id)}
                    />
                  ))}

                  {/* Add chord */}
                  <button
                    onClick={() => addSlot(section.id, line.id)}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 flex items-center justify-center text-muted-foreground hover:text-primary transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Delete line */}
                <button
                  onClick={() => deleteLine(section.id, line.id)}
                  disabled={section.lines.length <= 1}
                  className="mt-5 opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all disabled:opacity-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <button
              onClick={() => addLine(section.id)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 hover:border-primary/40 rounded-lg py-1.5 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add line
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={addSection}
        className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground border-2 border-dashed border-border/60 hover:border-primary/40 rounded-xl py-3 transition-colors"
      >
        <Plus className="w-4 h-4" /> Add section
      </button>
    </div>
  );
}

// ── Chord block ───────────────────────────────────────────────────────────────
interface BlockProps {
  slot: ChordSlot;
  isActive: boolean;
  songKey: string;
  recentChords: string[];
  onOpen: () => void;
  onClose: () => void;
  onAssign: (chord: string) => void;
  onDurationChange: (d: number) => void;
  onRemove: () => void;
}

function ChordBlock({ slot, isActive, songKey, recentChords, onOpen, onClose, onAssign, onDurationChange, onRemove }: BlockProps) {
  const isEmpty = !slot.chord;

  return (
    <div className="group/block relative">
      <button
        onClick={onOpen}
        className={`
          flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-xl border-2 transition-all
          ${isEmpty
            ? 'border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5'
            : 'border-border bg-card hover:border-primary/60 hover:bg-primary/5 shadow-sm'
          }
        `}
      >
        <span className={`text-sm font-bold leading-none ${isEmpty ? 'text-muted-foreground/40' : 'text-foreground'}`}>
          {slot.chord || '?'}
        </span>
        <span className={`text-[10px] font-medium ${isEmpty ? 'text-muted-foreground/30' : 'text-primary'}`}>
          {slot.duration}b
        </span>
      </button>

      {/* Remove button — top-right corner on hover */}
      {!isEmpty && (
        <button
          onMouseDown={e => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover/block:opacity-100 transition-opacity flex items-center justify-center"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Popover */}
      {isActive && (
        <ChordPickerPopover
          songKey={songKey}
          currentChord={slot.chord}
          currentDuration={slot.duration}
          recentChords={recentChords}
          onSelect={onAssign}
          onDurationChange={onDurationChange}
          onRemove={onRemove}
          onClose={onClose}
        />
      )}
    </div>
  );
}
