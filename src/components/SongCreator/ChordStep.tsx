import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { EditorSection, WordToken, SongMeta } from './types';
import { sectionsToSongFormat, tokensToRawLine, parseLineToTokens, makeEmptyLine, makeNewSection } from './lyricsParser';
import { ChordEditModal } from '@/components/ChordEditModal';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import SongChordPlayer from '@/components/SongChordPlayer';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { createSection } from '@/lib/sections';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { playChordPreview } from '@/lib/audioEngine';
import type { Song } from '@/data/songs';
import { ALL_KEYS, SONG_GENRES } from '@/lib/musicKeys';
import { parseChordString, serializeChords } from '@/lib/chordParser';
import type { Chord } from '@/lib/musicTheory';

import {
  Music2, Plus, Trash2, Pencil, Check, X,
  GripVertical, ChevronDown, ChevronUp, Copy, Play, Square,
} from 'lucide-react';

// ── Transpose helpers ─────────────────────────────────────────────────────────
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);

function noteIndex(n: string) { const i = SHARPS.indexOf(n); return i !== -1 ? i : FLATS.indexOf(n); }
function transposeNote(n: string, s: number, flats: boolean) {
  const i = noteIndex(n); if (i === -1) return n;
  return (flats ? FLATS : SHARPS)[((i + s) % 12 + 12) % 12];
}
function transposeChordStr(c: string, s: number, flats: boolean) {
  const m = c.match(/^([A-G][#b]?)(.*)/); if (!m) return c;
  return transposeNote(m[1], s, flats) + m[2];
}
function transposeKey(key: string, s: number) {
  const minor = key.endsWith('m') && key.length > 1;
  const root = minor ? key.slice(0, -1) : key;
  return transposeNote(root, s, FLAT_KEYS.has(key)) + (minor ? 'm' : '');
}
function transposeSections(secs: EditorSection[], s: number, flats: boolean): EditorSection[] {
  return secs.map(sec => ({
    ...sec,
    lines: sec.lines.map(l => ({
      ...l, tokens: l.tokens.map(t => ({ ...t, chord: transposeChordStr(t.chord, s, flats) })),
    })),
  }));
}

// ── Chord string ↔ Chord object ───────────────────────────────────────────────
function stringToChord(str: string): Chord | null {
  return parseChordString(str)[0] ?? null;
}
function chordToString(c: Chord): string {
  const q = c.quality === 'maj' ? '' : c.quality === 'min' ? 'm' : c.quality;
  return `${c.root}${c.accidental}${q}`;
}

// ── ID helpers ────────────────────────────────────────────────────────────────
let _n = 9999;
const nid = () => String(++_n);

function cloneSection(s: EditorSection, suffix = ' (2)'): EditorSection {
  return { id: nid(), name: s.name + suffix, lines: s.lines.map(l => ({ id: nid(), tokens: l.tokens.map(t => ({ ...t, id: nid() })) })) };
}
function cloneLine(l: EditorSection['lines'][number]) {
  return { id: nid(), tokens: l.tokens.map(t => ({ ...t, id: nid() })) };
}

const SECTION_PRESETS = ['Intro','Verse 1','Verse 2','Pre-chorus','Chorus','Bridge','Outro','Solo','Interlude'];

const STYLES = [
  { id: 'pop_basic', label: 'Pop' },{ id: 'rock_basic', label: 'Rock' },
  { id: 'jazz_swing', label: 'Jazz' },{ id: 'folk_strum', label: 'Folk' },
  { id: 'blues_shuffle', label: 'Blues' },{ id: 'lofi_chill', label: 'Lo-fi' },
];

interface EditingChord { sectionId: string; lineId: string; tokenId: string; chord: Chord | null; duration: number; }

interface Props {
  sections: EditorSection[];
  meta: SongMeta;
  onMetaChange: (meta: SongMeta) => void;
  onBack: () => void;
  onPublish: (sections: EditorSection[]) => void;
  isPublishing: boolean;
  isEditMode?: boolean;
}

export default function ChordStep({ sections: init, meta, onMetaChange, onBack, onPublish, isPublishing, isEditMode }: Props) {
  const [sections, setSections] = useState(init);
  const [savedSectionsJson, setSavedSectionsJson] = useState(() => JSON.stringify(init));
  const [savedMetaJson, setSavedMetaJson] = useState(() => JSON.stringify(meta));
  const [editingChord, setEditingChord] = useState<EditingChord | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineText, setEditingLineText] = useState('');
  const [showMeta, setShowMeta] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [playingSectionId, setPlayingSectionId] = useState<string | null>(null);

  const hasChanges = JSON.stringify(sections) !== savedSectionsJson || JSON.stringify(meta) !== savedMetaJson;
  const lineEditRef = useRef<HTMLTextAreaElement>(null);

  const { state: pbState, play, stop } = usePlayback();
  const { isPlaying } = pbState;

  // Reset playing state when playback ends
  useEffect(() => { if (!isPlaying) setPlayingSectionId(null); }, [isPlaying]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => { if (editingLineId) lineEditRef.current?.focus(); }, [editingLineId]);

  // ── Section ops ───────────────────────────────────────────────────────────────
  const addSection    = () => setSections(p => [...p, makeNewSection(`Section ${p.length + 1}`)]);
  const deleteSection = (id: string) => setSections(p => p.filter(s => s.id !== id));
  const renameSect    = (id: string, name: string) => setSections(p => p.map(s => s.id === id ? { ...s, name } : s));
  const duplicateSection = (id: string) => setSections(p => {
    const i = p.findIndex(s => s.id === id);
    const next = [...p]; next.splice(i + 1, 0, cloneSection(p[i])); return next;
  });
  const handleDragEnd = ({ active: a, over: o }: DragEndEvent) => {
    if (o && a.id !== o.id) setSections(p => arrayMove(p, p.findIndex(s => s.id === a.id), p.findIndex(s => s.id === o.id)));
  };

  // ── Line ops ──────────────────────────────────────────────────────────────────
  const addLine       = (sid: string) => setSections(p => p.map(s => s.id === sid ? { ...s, lines: [...s.lines, makeEmptyLine()] } : s));
  const deleteLine    = (sid: string, lid: string) => setSections(p => p.map(s => s.id === sid ? { ...s, lines: s.lines.filter(l => l.id !== lid) } : s));
  const duplicateLine = (sid: string, lid: string) => setSections(p => p.map(s => {
    if (s.id !== sid) return s;
    const i = s.lines.findIndex(l => l.id === lid);
    const next = [...s.lines]; next.splice(i + 1, 0, cloneLine(s.lines[i])); return { ...s, lines: next };
  }));

  const startEditLine  = (lid: string, tokens: WordToken[]) => { setEditingLineId(lid); setEditingLineText(tokensToRawLine(tokens)); };
  const commitLineEdit = (sid: string, lid: string) => {
    setSections(p => p.map(s => s.id !== sid ? s : { ...s, lines: s.lines.map(l => l.id !== lid ? l : { ...l, tokens: parseLineToTokens(editingLineText) }) }));
    setEditingLineId(null);
  };

  // ── Token ops ─────────────────────────────────────────────────────────────────
  const updateToken = useCallback((sid: string, lid: string, tid: string, patch: Partial<WordToken>) => {
    setSections(p => p.map(s => s.id !== sid ? s : { ...s, lines: s.lines.map(l => l.id !== lid ? l : { ...l, tokens: l.tokens.map(t => t.id !== tid ? t : { ...t, ...patch }) }) }));
  }, []);

  const openChordModal = (sid: string, lid: string, tid: string, currentChord: string, duration: number) => {
    const chord = currentChord ? stringToChord(currentChord) : null;
    setEditingChord({ sectionId: sid, lineId: lid, tokenId: tid, chord, duration });
  };

  // ── Playback helpers ──────────────────────────────────────────────────────────
  const playbackOpts = useCallback(() => ({
    bpm: meta.bpm, metronome: false,
    instruments: getDefaultInstrumentStates(),
    styleId: meta.style, transposition: 0,
    liveEditedStyle: null, customStyles: [], loopingSectionIndex: null,
  }), [meta.bpm, meta.style]);

  // Preview a single chord — short sound via audioEngine, no playback track
  const previewChord = useCallback((chordStr: string) => {
    if (!chordStr) return;
    const parsed = parseChordString(chordStr);
    if (!parsed.length) return;
    playChordPreview(parsed[0]);
  }, []);

  // Play / stop a whole section
  const handlePlaySection = useCallback(async (section: EditorSection) => {
    if (isPlaying && playingSectionId === section.id) { stop(); return; }
    if (isPlaying) stop();

    const chords = section.lines.flatMap(l => l.tokens)
      .filter(t => t.chord && !t.isSpace)
      .flatMap(t => parseChordString(t.chord).map(c => ({ ...c, duration: t.duration })));

    if (!chords.length) return;
    setPlayingSectionId(section.id);
    await play([{ ...createSection(section.name), chords }], playbackOpts());
  }, [isPlaying, playingSectionId, play, stop, playbackOpts]);

  const handleChordSave = (saved: Chord) => {
    if (!editingChord) return;
    const { sectionId: sid, lineId: lid, tokenId: tid } = editingChord;
    updateToken(sid, lid, tid, { chord: chordToString(saved), duration: saved.duration });
    setEditingChord(null);
  };

  const handleChordDelete = () => {
    if (!editingChord) return;
    const { sectionId: sid, lineId: lid, tokenId: tid } = editingChord;
    updateToken(sid, lid, tid, { chord: '', duration: 4 });
    setEditingChord(null);
  };

  // ── Transpose ─────────────────────────────────────────────────────────────────
  const applyTranspose = (n: number) => {
    const newKey = transposeKey(meta.key, n);
    setSections(p => transposeSections(p, n, FLAT_KEYS.has(newKey)));
    onMetaChange({ ...meta, key: newKey });
  };

  // ── Preview song ──────────────────────────────────────────────────────────────
  const previewSong: Song = {
    slug: 'preview', title: meta.title || 'Preview', artist: meta.artist || '',
    key: meta.key, capo: meta.capo || undefined, bpm: meta.bpm, style: meta.style,
    description: '', tags: [], relatedProgressions: [], genre: meta.genre,
    sections: sectionsToSongFormat(sections),
  };

  const totalChords = sections.flatMap(s => s.lines.flatMap(l => l.tokens)).filter(t => t.chord).length;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowMeta(v => !v)}
            className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
            {meta.title || 'Song details'}
            {showMeta ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {totalChords > 0 && <span className="text-xs text-muted-foreground">{totalChords} chords</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Transpose */}
          <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1.5 bg-background">
            <span className="text-xs text-muted-foreground mr-0.5">Key</span>
            <button onClick={() => applyTranspose(-1)} className="w-6 h-6 rounded text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">−</button>
            <span className="text-xs font-semibold text-foreground w-8 text-center">{meta.key}</span>
            <button onClick={() => applyTranspose(1)} className="w-6 h-6 rounded text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">+</button>
          </div>

          {/* Preview button */}
          <button onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 rounded-lg px-3 py-1.5 font-medium transition-colors">
            <Play className="w-3.5 h-3.5" /> Preview
          </button>
        </div>
      </div>

      {/* ── Meta panel ── */}
      {showMeta && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
              <input value={meta.title} onChange={e => onMetaChange({ ...meta, title: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
            <div><label className="block text-xs font-medium text-muted-foreground mb-1">Artist</label>
              <input value={meta.artist} onChange={e => onMetaChange({ ...meta, artist: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-muted-foreground mb-1">Key</label>
              <select value={meta.key} onChange={e => onMetaChange({ ...meta, key: e.target.value })}
                className="w-full border border-border rounded-lg px-2 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                {ALL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-muted-foreground mb-1">Capo</label>
              <select value={meta.capo} onChange={e => onMetaChange({ ...meta, capo: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-2 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value={0}>None</option>
                {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>Capo {n}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-muted-foreground mb-1">BPM</label>
              <input type="number" min={40} max={240} value={meta.bpm}
                onChange={e => onMetaChange({ ...meta, bpm: Number(e.target.value) })}
                className="w-full border border-border rounded-lg px-2 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" /></div>
          </div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-2">Style</label>
            <div className="flex gap-2 flex-wrap">
              {STYLES.map(s => (
                <button key={s.id} onClick={() => onMetaChange({ ...meta, style: s.id })}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${meta.style === s.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                  {s.label}</button>))}</div></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-2">Genre</label>
            <div className="flex flex-wrap gap-1.5">
              {SONG_GENRES.map(g => {
                const on = meta.genre.includes(g);
                return <button key={g} onClick={() => onMetaChange({ ...meta, genre: on ? meta.genre.filter(x => x !== g) : [...meta.genre, g] })}
                  className={`text-xs capitalize px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/40'}`}>{g}</button>;
              })}</div></div>
        </div>
      )}

      {/* ── Editor ── */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {sections.map(section => (
              <SortableSection
                key={section.id}
                section={section}
                canDelete={sections.length > 1}
                editingLineId={editingLineId}
                editingLineText={editingLineText}
                lineEditRef={lineEditRef}
                isPlaying={isPlaying && playingSectionId === section.id}
                onRename={renameSect}
                onDelete={deleteSection}
                onDuplicate={duplicateSection}
                onPlaySection={handlePlaySection}
                onAddLine={addLine}
                onDeleteLine={deleteLine}
                onDuplicateLine={duplicateLine}
                onStartEditLine={startEditLine}
                onCommitLineEdit={commitLineEdit}
                onCancelLineEdit={() => setEditingLineId(null)}
                onEditingLineTextChange={setEditingLineText}
                onOpenChordModal={openChordModal}
                onPreviewChord={previewChord}
                onUpdateToken={updateToken}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button onClick={addSection}
        className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground border-2 border-dashed border-border/50 hover:border-primary/40 rounded-xl py-3 transition-colors">
        <Plus className="w-4 h-4" /> Add section
      </button>

      {/* ── Sticky save bar ── */}
      <div className="sticky bottom-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t border-border">
        <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
              ← Back
            </button>
            {/* Unsaved changes indicator */}
            {hasChanges && !isPublishing && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Public indicator */}
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
              </svg>
              Saves publicly
            </span>

            <button
              onClick={() => {
                onPublish(sections);
                setSavedSectionsJson(JSON.stringify(sections));
                setSavedMetaJson(JSON.stringify(meta));
              }}
              disabled={isPublishing || (!hasChanges && isEditMode)}
              className={`px-6 py-2.5 font-semibold rounded-xl transition-all disabled:cursor-not-allowed
                ${hasChanges || !isEditMode
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md disabled:opacity-60'
                  : 'bg-muted text-muted-foreground border border-border disabled:opacity-50'
                }`}
            >
              {isPublishing
                ? (isEditMode ? 'Saving…' : 'Publishing…')
                : isEditMode
                  ? (hasChanges ? 'Save changes →' : 'Saved ✓')
                  : 'Publish song →'
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Chord edit modal (portal-based, no overflow clipping) ── */}
      <ChordEditModal
        open={!!editingChord}
        chord={editingChord?.chord ?? null}
        onClose={() => setEditingChord(null)}
        onSave={handleChordSave}
        onDelete={editingChord?.chord ? handleChordDelete : undefined}
        onPreview={partial => {
          const c = { root: 'C', accidental: '', quality: 'maj', duration: 4, id: 'preview', ...partial } as import('@/lib/musicTheory').Chord;
          playChordPreview(c);
        }}
      />

      {/* ── Preview modal ── */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <Music2 className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground">{meta.title || 'Preview'}</span>
            {meta.artist && <span className="text-sm text-muted-foreground">— {meta.artist}</span>}
          </div>
          <PlaybackProvider>
            <SongChordPlayer song={previewSong} />
          </PlaybackProvider>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── SortableSection ───────────────────────────────────────────────────────────
interface SortableSectionProps {
  section: EditorSection;
  canDelete: boolean;
  editingLineId: string | null;
  editingLineText: string;
  lineEditRef: React.RefObject<HTMLTextAreaElement>;
  isPlaying: boolean;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPlaySection: (section: EditorSection) => void;
  onAddLine: (sid: string) => void;
  onDeleteLine: (sid: string, lid: string) => void;
  onDuplicateLine: (sid: string, lid: string) => void;
  onStartEditLine: (lid: string, tokens: WordToken[]) => void;
  onCommitLineEdit: (sid: string, lid: string) => void;
  onCancelLineEdit: () => void;
  onEditingLineTextChange: (text: string) => void;
  onOpenChordModal: (sid: string, lid: string, tid: string, chord: string, duration: number) => void;
  onPreviewChord: (chord: string) => void;
  onUpdateToken: (sid: string, lid: string, tid: string, patch: Partial<WordToken>) => void;
}

function SortableSection({ section, canDelete, isPlaying, ...props }: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 } as React.CSSProperties;
  const [nameFocused, setNameFocused] = useState(false);

  const hasChords = section.lines.some(l => l.tokens.some(t => t.chord));

  return (
    <div ref={setNodeRef} style={style}
      className={`rounded-2xl border bg-card shadow-sm hover:shadow-md transition-all ${isPlaying ? 'border-primary/50 bg-primary/5 shadow-primary/10' : 'border-border'}`}>
      {/* Section header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b rounded-t-2xl transition-colors ${isPlaying ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-muted/20'}`}>
        <button {...attributes} {...listeners} className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none transition-colors">
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <div className="relative flex-1 min-w-0">
          <input
            value={section.name}
            onChange={e => props.onRename(section.id, e.target.value)}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setTimeout(() => setNameFocused(false), 150)}
            className={`w-full text-xs font-bold uppercase tracking-widest bg-transparent focus:outline-none transition-colors ${isPlaying ? 'text-primary' : 'text-muted-foreground focus:text-foreground'}`}
          />
          {nameFocused && (
            <div className="absolute top-full left-0 mt-1.5 z-50 flex flex-wrap gap-1 bg-card border border-border rounded-xl p-2 shadow-xl min-w-max">
              {SECTION_PRESETS.map(n => (
                <button key={n} onMouseDown={() => props.onRename(section.id, n)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors whitespace-nowrap">
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Play section button */}
          {hasChords && (
            <button
              onClick={() => props.onPlaySection(section)}
              title={isPlaying ? 'Stop' : `Play ${section.name}`}
              className={`p-1.5 rounded-lg transition-all ${
                isPlaying
                  ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
            >
              {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={() => props.onDuplicate(section.id)} title="Duplicate section"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => props.onDelete(section.id)} disabled={!canDelete} title="Delete section"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-20">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Lines */}
      <div className="p-4 space-y-3">
        {section.lines.map(line => (
          <div key={line.id} className="group">
            {props.editingLineId === line.id ? (
              <div className="flex gap-2">
                <textarea ref={props.lineEditRef} value={props.editingLineText}
                  onChange={e => props.onEditingLineTextChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); props.onCommitLineEdit(section.id, line.id); }
                    if (e.key === 'Escape') props.onCancelLineEdit();
                  }}
                  rows={2} placeholder="[Am]word [F:2]another…"
                  className="flex-1 text-sm font-mono border border-primary/40 rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => props.onCommitLineEdit(section.id, line.id)}
                    className="p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={props.onCancelLineEdit}
                    className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"><X className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex-1 flex flex-wrap gap-x-1 gap-y-4 py-1 min-h-[3rem]">
                  {line.tokens.length === 0 || (line.tokens.length === 1 && !line.tokens[0].text) ? (
                    <span className="text-xs text-muted-foreground/30 italic self-center">Empty — click ✎ to add text</span>
                  ) : (
                    line.tokens.map(token => (
                      <TokenChip
                        key={token.id} token={token}
                        onOpenModal={() => props.onOpenChordModal(section.id, line.id, token.id, token.chord, token.duration)}
                        onRemove={() => props.onUpdateToken(section.id, line.id, token.id, { chord: '', duration: 4 })}
                        onPreview={() => props.onPreviewChord(token.chord)}
                      />
                    ))
                  )}
                </div>

                {/* Line actions */}
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-3 shrink-0">
                  <button onClick={() => props.onStartEditLine(line.id, line.tokens)} title="Edit text"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => props.onDuplicateLine(section.id, line.id)} title="Duplicate line"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"><Copy className="w-3 h-3" /></button>
                  <button onClick={() => props.onDeleteLine(section.id, line.id)} title="Delete line"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            )}
          </div>
        ))}

        <button onClick={() => props.onAddLine(section.id)}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary border border-dashed border-border/50 hover:border-primary/40 rounded-xl py-2 transition-colors mt-1">
          <Plus className="w-3 h-3" /> Add line
        </button>
      </div>
    </div>
  );
}

// ── TokenChip ─────────────────────────────────────────────────────────────────
interface ChipProps {
  token: WordToken;
  onOpenModal: () => void;
  onRemove: () => void;
  onPreview: () => void;
}

function TokenChip({ token, onOpenModal, onRemove, onPreview }: ChipProps) {
  if (token.isSpace) return <span className="text-sm select-none">{token.text}</span>;

  const hasChord = !!token.chord;
  const durLabel = hasChord && token.duration !== 4 ? `${token.duration}b` : null;

  const handleChordClick = () => {
    onPreview();   // play the sound
    onOpenModal(); // open the edit modal
  };

  return (
    <span className="group/chip relative inline-flex flex-col items-start" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Chord area */}
      <span className="flex items-center gap-0.5 min-h-[1.75em] mb-0.5">
        {hasChord ? (
          <>
            {/* Chord badge — click plays sound + opens modal */}
            <button
              onClick={handleChordClick}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/60 rounded-lg px-2 py-0.5 transition-all hover:shadow-sm leading-none"
            >
              {token.chord}
              {durLabel && <span className="text-[10px] font-normal opacity-60">{durLabel}</span>}
            </button>

            {/* Remove on hover */}
            <button
              onMouseDown={e => { e.stopPropagation(); onRemove(); }}
              className="opacity-0 group-hover/chip:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              title="Remove chord"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        ) : (
          <button
            onClick={onOpenModal}
            className="opacity-20 group-hover/chip:opacity-100 text-[11px] text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/60 hover:bg-primary/5 rounded-lg px-1.5 py-0.5 transition-all whitespace-nowrap leading-none"
          >
            +
          </button>
        )}
      </span>

      {/* Word text */}
      <span className={`text-sm leading-relaxed ${hasChord ? 'text-foreground' : 'text-muted-foreground/80'}`}>
        {token.text}
      </span>
    </span>
  );
}
