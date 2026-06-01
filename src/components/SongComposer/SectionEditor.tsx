import { useState, useRef, useCallback, useEffect } from 'react';
import { Trash2, GripVertical, Plus, ChevronDown, ChevronUp, Download } from 'lucide-react';
import ChordPicker from './ChordPicker';
import { parseLyricLine } from '@/data/songs';

interface Props {
  sectionId: string;
  name: string;
  lines: string[];
  index: number;
  recentChords: string[];
  onNameChange: (name: string) => void;
  onLinesChange: (lines: string[]) => void;
  onDelete: () => void;
  onChordUsed: (chord: string) => void;
}

export default function SectionEditor({
  sectionId,
  name,
  lines,
  recentChords,
  onNameChange,
  onLinesChange,
  onDelete,
  onChordUsed,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerForLine, setPickerForLine] = useState<number | null>(null);
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const cursorPosRef = useRef<number>(0);

  // Auto-resize textarea height to content
  const autoResize = useCallback((ta: HTMLTextAreaElement | null) => {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    textareaRefs.current.forEach(ta => autoResize(ta));
  }, [lines, autoResize]);

  // Insert chord at cursor in a specific line textarea
  const insertChord = useCallback((chord: string, lineIdx: number) => {
    const ta = textareaRefs.current.get(lineIdx);
    const pos = ta ? cursorPosRef.current : (lines[lineIdx]?.length ?? 0);
    const current = lines[lineIdx] ?? '';
    const newLine = current.slice(0, pos) + `[${chord}]` + current.slice(pos);
    const newLines = [...lines];
    newLines[lineIdx] = newLine;
    onLinesChange(newLines);
    onChordUsed(chord);

    // Restore cursor after the inserted chord
    setTimeout(() => {
      if (ta) {
        const newPos = pos + chord.length + 2;
        ta.selectionStart = ta.selectionEnd = newPos;
        ta.focus();
        autoResize(ta);
      }
    }, 0);

    setPickerOpen(false);
    setPickerForLine(null);
  }, [lines, onLinesChange, onChordUsed, autoResize]);

  const openPicker = (lineIdx: number) => {
    const ta = textareaRefs.current.get(lineIdx);
    if (ta) cursorPosRef.current = ta.selectionStart ?? lines[lineIdx]?.length ?? 0;
    setPickerForLine(lineIdx);
    setPickerOpen(true);
  };

  const handleLineChange = (lineIdx: number, value: string) => {
    const newLines = [...lines];
    newLines[lineIdx] = value;
    onLinesChange(newLines);
  };

  const handleLineKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, lineIdx: number) => {
    const ta = e.currentTarget;

    // [ → open chord picker
    if (e.key === '[') {
      e.preventDefault();
      cursorPosRef.current = ta.selectionStart ?? 0;
      openPicker(lineIdx);
      return;
    }

    // Enter → add new line after current, preserving indent
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newLines = [...lines];
      newLines.splice(lineIdx + 1, 0, '');
      onLinesChange(newLines);
      setTimeout(() => {
        textareaRefs.current.get(lineIdx + 1)?.focus();
      }, 0);
      return;
    }

    // Backspace on empty line → remove line and focus previous
    if (e.key === 'Backspace' && lines[lineIdx] === '' && lines.length > 1) {
      e.preventDefault();
      const newLines = lines.filter((_, i) => i !== lineIdx);
      onLinesChange(newLines);
      setTimeout(() => {
        const prevIdx = Math.max(0, lineIdx - 1);
        const prevTa = textareaRefs.current.get(prevIdx);
        if (prevTa) {
          prevTa.focus();
          prevTa.selectionStart = prevTa.selectionEnd = prevTa.value.length;
        }
      }, 0);
    }
  };

  const addLine = () => {
    onLinesChange([...lines, '']);
    setTimeout(() => {
      textareaRefs.current.get(lines.length)?.focus();
    }, 0);
  };

  // Compute chord highlights for a line (positions of [Chord] tokens)
  const getHighlightedLine = (line: string) => {
    return line.replace(/\[([^\]]+)\]/g, (match) =>
      `<mark class="chord-mark">${match}</mark>`
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/20">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />

        <input
          value={name}
          onChange={e => onNameChange(e.target.value)}
          className="flex-1 text-xs font-semibold uppercase tracking-wider text-primary bg-transparent outline-none placeholder:text-muted-foreground/50 min-w-0"
          placeholder="Section name…"
        />

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-1">

          {/* Line editors */}
          {lines.map((line, li) => (
            <div key={`${sectionId}-${li}`} className="relative group">
              <div className="relative">
                {/* Highlighted overlay (renders behind textarea) */}
                <div
                  aria-hidden
                  className="absolute inset-0 px-3 py-1.5 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words pointer-events-none text-transparent select-none"
                  style={{ wordBreak: 'break-word' }}
                  dangerouslySetInnerHTML={{ __html: getHighlightedLine(line) + '​' }}
                />

                {/* Actual textarea */}
                <textarea
                  ref={el => {
                    if (el) { textareaRefs.current.set(li, el); autoResize(el); }
                    else textareaRefs.current.delete(li);
                  }}
                  value={line}
                  onChange={e => { handleLineChange(li, e.target.value); autoResize(e.target); }}
                  onKeyDown={e => handleLineKeyDown(e, li)}
                  onSelect={e => { cursorPosRef.current = (e.target as HTMLTextAreaElement).selectionStart; }}
                  onClick={e => { cursorPosRef.current = (e.target as HTMLTextAreaElement).selectionStart; }}
                  placeholder={li === 0 ? 'Type lyrics… press [ to insert a chord' : ''}
                  rows={1}
                  className="relative w-full px-3 py-1.5 text-sm font-mono bg-transparent text-foreground placeholder:text-muted-foreground/40 outline-none resize-none leading-relaxed rounded-lg hover:bg-accent/20 focus:bg-accent/30 transition-colors"
                  style={{ minHeight: '2rem', overflow: 'hidden' }}
                />

                {/* Insert chord button — shows on focus/hover */}
                <button
                  onClick={() => openPicker(li)}
                  onMouseDown={e => {
                    e.preventDefault(); // Don't steal focus from textarea
                    const ta = textareaRefs.current.get(li);
                    if (ta) cursorPosRef.current = ta.selectionStart ?? 0;
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity px-1.5 py-0.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded hover:bg-primary/20"
                >
                  [+]
                </button>
              </div>

              {/* Chord picker for this line */}
              {pickerOpen && pickerForLine === li && (
                <div className="absolute z-50 left-0 top-full mt-1">
                  <ChordPicker
                    onSelect={chord => insertChord(chord, li)}
                    onClose={() => { setPickerOpen(false); setPickerForLine(null); }}
                    recentChords={recentChords}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Add line */}
          <button
            onClick={addLine}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-1"
          >
            <Plus className="w-3 h-3" />
            Add line
          </button>
        </div>
      )}

      {/* Chord highlight styles */}
      <style>{`
        .chord-mark {
          background: transparent;
          color: hsl(var(--primary));
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
