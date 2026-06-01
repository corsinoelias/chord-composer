import { useRef, useCallback } from 'react';
import type { SectionData, ChordSlot } from './types';
import { makeLine } from './dataModel';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  sections: SectionData[];
  onChange: (sections: SectionData[]) => void;
}

export default function LyricsTab({ sections, onChange }: Props) {

  const patchLyric = useCallback((sId: string, lId: string, slotId: string, lyric: string) => {
    onChange(sections.map(s => s.id !== sId ? s : {
      ...s,
      lines: s.lines.map(l => l.id !== lId ? l : {
        ...l,
        slots: l.slots.map(sl => sl.id !== slotId ? sl : { ...sl, lyric }),
      }),
    }));
  }, [sections, onChange]);

  const addLine = (sId: string) =>
    onChange(sections.map(s => s.id !== sId ? s : { ...s, lines: [...s.lines, makeLine()] }));

  const deleteLine = (sId: string, lId: string) =>
    onChange(sections.map(s => s.id !== sId ? s : { ...s, lines: s.lines.filter(l => l.id !== lId) }));

  const hasChords = sections.some(s => s.lines.some(l => l.slots.some(sl => sl.chord)));

  if (!hasChords) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl">🎵</div>
        <p className="text-sm font-medium text-foreground">Add chords first</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Go to the <strong>Chords</strong> tab and add some chord blocks. Then come back here to write the lyrics under each one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map(section => (
        <div key={section.id} className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Section name */}
          <div className="px-4 py-2 border-b border-border bg-muted/30">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {section.name}
            </span>
          </div>

          <div className="p-4 space-y-4">
            {section.lines.map(line => {
              const chordsInLine = line.slots.filter(sl => sl.chord);

              return (
                <div key={line.id} className="group">
                  {chordsInLine.length === 0 ? (
                    <p className="text-xs text-muted-foreground/40 italic">
                      No chords in this line — add chords in the Chords tab
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-x-1 gap-y-4 items-end">
                      {line.slots.map(slot => (
                        slot.chord
                          ? <LyricCell
                              key={slot.id}
                              slot={slot}
                              onLyricChange={lyric => patchLyric(section.id, line.id, slot.id, lyric)}
                              allSlots={line.slots}
                            />
                          : null
                      ))}

                      {/* Delete line */}
                      <button
                        onClick={() => deleteLine(section.id, line.id)}
                        disabled={section.lines.length <= 1}
                        className="mb-0.5 opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all disabled:opacity-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => addLine(section.id)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50 hover:border-primary/40 rounded-lg py-1.5 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add line
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Single lyric cell ─────────────────────────────────────────────────────────
interface CellProps {
  slot: ChordSlot;
  allSlots: ChordSlot[];
  onLyricChange: (text: string) => void;
}

function LyricCell({ slot, onLyricChange }: CellProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-size: grow with content
  const width = Math.max(48, (slot.lyric.length || slot.chord.length) * 9 + 24);

  return (
    <span className="inline-flex flex-col items-start" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Chord label — read-only in lyrics mode */}
      <span className="text-xs font-bold text-primary mb-1 px-1 py-0.5 bg-primary/10 rounded-md border border-primary/20 leading-none">
        {slot.chord}
        {slot.duration !== 4 && (
          <span className="ml-1 text-[10px] opacity-60">{slot.duration}b</span>
        )}
      </span>

      {/* Lyric text input */}
      <input
        ref={inputRef}
        value={slot.lyric}
        onChange={e => onLyricChange(e.target.value)}
        placeholder="…"
        className="text-sm text-foreground bg-transparent border-0 border-b-2 border-border/40 focus:border-primary focus:outline-none leading-relaxed placeholder:text-muted-foreground/30 transition-colors"
        style={{ width }}
      />
    </span>
  );
}
