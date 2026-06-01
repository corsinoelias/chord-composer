import { useState, useCallback, useRef, useEffect } from 'react';
import type { EditorSection, WordToken, SongMeta } from './types';
import { sectionsToSongFormat, tokensToRawLine, parseLineToTokens, makeEmptyLine, makeNewSection } from './lyricsParser';
import ChordPickerPopover from './ChordPickerPopover';
import SongChordPlayer from '@/components/SongChordPlayer';
import type { Song } from '@/data/songs';
import { ALL_KEYS, SONG_GENRES } from '@/lib/musicKeys';
import {
  Music2, Eye, EyeOff, Plus, Trash2, Pencil, Check, X, GripVertical,
  ChevronDown, ChevronUp
} from 'lucide-react';

interface Props {
  sections: EditorSection[];
  meta: SongMeta;
  onMetaChange: (meta: SongMeta) => void;
  onBack: () => void;
  onPublish: (sections: EditorSection[]) => void;
  isPublishing: boolean;
  isEditMode?: boolean;
}

interface ActivePicker {
  sectionId: string;
  lineId: string;
  tokenId: string;
}

const STYLES = [
  { id: 'pop_basic', label: 'Pop' },
  { id: 'rock_basic', label: 'Rock' },
  { id: 'jazz_swing', label: 'Jazz' },
  { id: 'folk_strum', label: 'Folk' },
  { id: 'blues_shuffle', label: 'Blues' },
  { id: 'lofi_chill', label: 'Lo-fi' },
];

// ── uid for new nodes ─────────────────────────────────────────────────────────
let _n = 9999;
const nid = () => String(++_n);

export default function ChordStep({
  sections: initialSections,
  meta,
  onMetaChange,
  onBack,
  onPublish,
  isPublishing,
  isEditMode,
}: Props) {
  const [sections, setSections] = useState(initialSections);
  const [active, setActive] = useState<ActivePicker | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineText, setEditingLineText] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [showMeta, setShowMeta] = useState(false);
  const [recentChords, setRecentChords] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineEditRef = useRef<HTMLTextAreaElement>(null);

  // Close chord picker on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setActive(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Focus textarea when entering line edit mode
  useEffect(() => {
    if (editingLineId) lineEditRef.current?.focus();
  }, [editingLineId]);

  // ── Section operations ────────────────────────────────────────────────────
  const addSection = () =>
    setSections(prev => [...prev, makeNewSection(`Section ${prev.length + 1}`)]);

  const deleteSection = (id: string) =>
    setSections(prev => prev.filter(s => s.id !== id));

  const renameSect = (id: string, name: string) =>
    setSections(prev => prev.map(s => s.id === id ? { ...s, name } : s));

  // ── Line operations ───────────────────────────────────────────────────────
  const addLine = (sectionId: string) =>
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, lines: [...s.lines, makeEmptyLine()] } : s
    ));

  const deleteLine = (sectionId: string, lineId: string) =>
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, lines: s.lines.filter(l => l.id !== lineId) } : s
    ));

  const startEditLine = (lineId: string, tokens: WordToken[]) => {
    setActive(null);
    setEditingLineId(lineId);
    setEditingLineText(tokensToRawLine(tokens));
  };

  const commitLineEdit = (sectionId: string, lineId: string) => {
    const newTokens = parseLineToTokens(editingLineText);
    setSections(prev => prev.map(s =>
      s.id !== sectionId ? s : {
        ...s,
        lines: s.lines.map(l =>
          l.id !== lineId ? l : { ...l, tokens: newTokens }
        ),
      }
    ));
    setEditingLineId(null);
  };

  // ── Token operations ──────────────────────────────────────────────────────
  const updateToken = useCallback((sectionId: string, lineId: string, tokenId: string, patch: Partial<WordToken>) => {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : {
      ...s,
      lines: s.lines.map(l => l.id !== lineId ? l : {
        ...l,
        tokens: l.tokens.map(t => t.id !== tokenId ? t : { ...t, ...patch }),
      }),
    }));
    if (patch.chord) setRecentChords(prev => [patch.chord!, ...prev.filter(c => c !== patch.chord)].slice(0, 8));
  }, []);

  // ── Live preview song ─────────────────────────────────────────────────────
  const previewSong: Song = {
    slug: 'preview',
    title: meta.title || 'Preview',
    artist: meta.artist || '',
    key: meta.key,
    capo: meta.capo || undefined,
    bpm: meta.bpm,
    style: meta.style,
    description: '',
    tags: [],
    relatedProgressions: [],
    genre: meta.genre,
    sections: sectionsToSongFormat(sections),
  };

  const totalChords = sections.flatMap(s => s.lines.flatMap(l => l.tokens)).filter(t => t.chord).length;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setShowMeta(v => !v)}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            {meta.title || 'Song details'}
            {showMeta ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {totalChords > 0 && (
            <span className="text-xs text-primary font-medium">{totalChords} chord{totalChords !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-1.5"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? 'Hide preview' : 'Preview'}
          </button>
        </div>
      </div>

      {/* ── Metadata panel ── */}
      {showMeta && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
              <input
                value={meta.title}
                onChange={e => onMetaChange({ ...meta, title: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Artist</label>
              <input
                value={meta.artist}
                onChange={e => onMetaChange({ ...meta, artist: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Key</label>
              <select
                value={meta.key}
                onChange={e => onMetaChange({ ...meta, key: e.target.value })}
                className="w-full border border-border rounded-lg px-2 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {ALL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Capo</label>
              <select
                value={meta.capo}
                onChange={e => onMetaChange({ ...meta, capo: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-2 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value={0}>None</option>
                {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>Capo {n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">BPM</label>
              <input
                type="number" min={40} max={240}
                value={meta.bpm}
                onChange={e => onMetaChange({ ...meta, bpm: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-2 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Rhythm style</label>
            <div className="flex gap-2 flex-wrap">
              {STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => onMetaChange({ ...meta, style: s.id })}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors
                    ${meta.style === s.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Genre</label>
            <div className="flex flex-wrap gap-1.5">
              {SONG_GENRES.map(g => {
                const active = meta.genre.includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => onMetaChange({ ...meta, genre: active ? meta.genre.filter(x => x !== g) : [...meta.genre, g] })}
                    className={`text-xs capitalize px-2.5 py-1 rounded-full border transition-colors
                      ${active ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Hint ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Hover una palabra → <strong className="text-foreground">+ chord</strong> para añadir</span>
        <span>Hover un acorde → <strong className="text-foreground">✎ editar</strong> · <strong className="text-foreground">🗑 quitar</strong></span>
        <span>Hover una línea → <strong className="text-foreground">✎</strong> para editar el texto</span>
      </div>

      <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>

        {/* ── Left: editor ── */}
        <div ref={containerRef} className="space-y-3">
          {sections.map((section, si) => (
            <div key={section.id} className="rounded-xl border border-border bg-card overflow-hidden">

              {/* Section header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                <input
                  value={section.name}
                  onChange={e => renameSect(section.id, e.target.value)}
                  className="flex-1 text-xs font-bold uppercase tracking-widest text-muted-foreground bg-transparent focus:outline-none focus:text-foreground min-w-0"
                />
                <button
                  onClick={() => deleteSection(section.id)}
                  disabled={sections.length <= 1}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-20 shrink-0"
                  title="Delete section"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Lines */}
              <div className="p-3 space-y-2">
                {section.lines.map((line) => (
                  <div key={line.id} className="group relative">
                    {editingLineId === line.id ? (
                      /* ── Line edit mode ── */
                      <div className="flex gap-2">
                        <textarea
                          ref={lineEditRef}
                          value={editingLineText}
                          onChange={e => setEditingLineText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitLineEdit(section.id, line.id); }
                            if (e.key === 'Escape') setEditingLineId(null);
                          }}
                          rows={2}
                          className="flex-1 text-sm font-mono border border-primary/40 rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                          placeholder="[Am]word [F]another word…"
                        />
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => commitLineEdit(section.id, line.id)}
                            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                            title="Save (Enter)"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingLineId(null)}
                            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                            title="Cancel (Esc)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Token view mode ── */
                      <div className="flex items-start gap-1 min-h-[2.5rem]">
                        <div className="flex-1 flex flex-wrap gap-x-0.5 gap-y-3 py-0.5">
                          {line.tokens.length === 0 || (line.tokens.length === 1 && line.tokens[0].text === '') ? (
                            <span className="text-xs text-muted-foreground/40 italic">Empty line — click ✎ to add text</span>
                          ) : (
                            line.tokens.map(token => (
                              <TokenChip
                                key={token.id}
                                token={token}
                                isActive={active?.tokenId === token.id}
                                songKey={meta.key}
                                recentChords={recentChords}
                                onOpen={() => setActive({ sectionId: section.id, lineId: line.id, tokenId: token.id })}
                                onClose={() => setActive(null)}
                                onAssign={chord => updateToken(section.id, line.id, token.id, { chord })}
                                onDurationChange={duration => updateToken(section.id, line.id, token.id, { duration })}
                                onRemove={() => updateToken(section.id, line.id, token.id, { chord: '', duration: 4 })}
                              />
                            ))
                          )}
                        </div>
                        {/* Action buttons (visible on hover) */}
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-4">
                          <button
                            onClick={() => startEditLine(line.id, line.tokens)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                            title="Edit line text"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => deleteLine(section.id, line.id)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Delete line"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add line */}
                <button
                  onClick={() => addLine(section.id)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/60 hover:border-primary/40 rounded-lg py-1.5 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add line
                </button>
              </div>
            </div>
          ))}

          {/* Add section */}
          <button
            onClick={addSection}
            className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground border-2 border-dashed border-border/60 hover:border-primary/40 rounded-xl py-3 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add section
          </button>
        </div>

        {/* ── Right: live preview ── */}
        {showPreview && (
          <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
              <Music2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live preview</span>
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
              <SongChordPlayer song={previewSong} />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </button>
        <button
          onClick={() => onPublish(sections)}
          disabled={isPublishing}
          className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPublishing
            ? (isEditMode ? 'Saving…' : 'Publishing…')
            : (isEditMode ? 'Save changes →' : 'Publish song →')
          }
        </button>
      </div>
    </div>
  );
}

// ── Single word chip ─────────────────────────────────────────────────────────
interface ChipProps {
  token: WordToken;
  isActive: boolean;
  songKey: string;
  recentChords: string[];
  onOpen: () => void;
  onClose: () => void;
  onAssign: (chord: string) => void;
  onDurationChange: (d: number) => void;
  onRemove: () => void;
}

function TokenChip({ token, isActive, songKey, recentChords, onOpen, onClose, onAssign, onDurationChange, onRemove }: ChipProps) {
  if (token.isSpace) return <span className="text-sm select-none">{token.text}</span>;

  const hasChord = !!token.chord;
  const durLabel = hasChord && token.duration !== 4 ? `${token.duration}b` : null;

  return (
    <span
      className="group/chip relative inline-flex flex-col items-start"
      style={{ fontFamily: 'var(--font-mono, monospace)' }}
    >
      {/* ── Row 1: chord area (fixed height so words stay aligned) ── */}
      <span className="flex items-center gap-0.5 min-h-[1.75em] mb-0.5">
        {hasChord ? (
          <>
            {/* Chord badge — click to open picker */}
            <button
              onClick={onOpen}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/50 rounded-md px-1.5 py-0.5 transition-colors leading-none"
            >
              {token.chord}
              {durLabel && (
                <span className="text-[10px] font-normal opacity-70">{durLabel}</span>
              )}
            </button>

            {/* ✎ and 🗑 — only visible on hover */}
            <span className="flex items-center gap-0.5 opacity-0 group-hover/chip:opacity-100 transition-opacity">
              <button
                onClick={onOpen}
                className="p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Edit chord"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onMouseDown={e => { e.stopPropagation(); onRemove(); }}
                className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Remove chord"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </>
        ) : (
          /* No chord: show "+ chord" button on hover */
          <button
            onClick={onOpen}
            className="opacity-0 group-hover/chip:opacity-100 text-[11px] text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/50 rounded-md px-1.5 py-0.5 transition-all whitespace-nowrap leading-none"
          >
            + chord
          </button>
        )}
      </span>

      {/* ── Row 2: word text (plain, not clickable) ── */}
      <span className={`text-sm leading-relaxed ${hasChord ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
        {token.text}
      </span>

      {/* ── Popover ── */}
      {isActive && (
        <ChordPickerPopover
          songKey={songKey}
          currentChord={token.chord}
          currentDuration={token.duration}
          recentChords={recentChords}
          onSelect={onAssign}
          onDurationChange={onDurationChange}
          onRemove={onRemove}
          onClose={onClose}
        />
      )}
    </span>
  );
}
