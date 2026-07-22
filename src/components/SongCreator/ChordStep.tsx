import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { EditorSection, WordToken, SongMeta, AudioRange } from './types';
import { sectionsToSongFormat, tokensToRawLine, parseLineToTokens, makeEmptyLine, makeNewSection } from './lyricsParser';
import { parseSectionBody } from './textParser';
import ChordPalette from './ChordPalette';
import { ChordEditModal } from '@/components/ChordEditModal';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DurationDots } from '@/components/DurationDots';
import { StyleSelector } from '@/components/StyleSelector';
import SongChordPlayer from '@/components/SongChordPlayer';
import { PlaybackProvider, usePlayback } from '@/contexts/PlaybackContext';
import { createSection, type Section } from '@/lib/sections';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { playChordPreview } from '@/lib/audioEngine';
import type { Song } from '@/data/songs';
import { ALL_KEYS, SONG_GENRES } from '@/lib/musicKeys';
import { parseChordString, serializeChords } from '@/lib/chordParser';
import type { Chord } from '@/lib/musicTheory';
import { uploadSongAudio, deleteSongAudio, type SongAudioUploadResult, type SongAudioUploadError } from '@/lib/songAudio';
import AudioRangeEditor from './AudioRangeEditor';

import {
  Music2, Plus, Trash2, Pencil, Check, X,
  GripVertical, ChevronDown, ChevronUp, Copy, Play, Square, ClipboardPaste, AudioLines,
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
  const slash = c.indexOf('/')
  const [chordPart, bassPart] = slash !== -1 ? [c.slice(0, slash), c.slice(slash + 1)] : [c, undefined]
  const m = chordPart.match(/^([A-G][#b]?)(.*)/)
  if (!m) return c
  const transposed = transposeNote(m[1], s, flats) + m[2]
  if (!bassPart) return transposed
  const bm = bassPart.match(/^([A-G][#b]?)(.*)/)
  if (!bm) return transposed + '/' + bassPart
  return transposed + '/' + transposeNote(bm[1], s, flats) + bm[2]
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
  const base = `${c.root}${c.accidental}${q}`;
  return c.bassNote ? `${base}/${c.bassNote}` : base;
}

// ── ID helpers ────────────────────────────────────────────────────────────────
let _n = 9999;
const nid = () => String(++_n);

function cloneSection(s: EditorSection, suffix = ' (2)'): EditorSection {
  return { id: nid(), name: s.name + suffix, lines: s.lines.map(l => ({ id: nid(), tokens: l.tokens.map(t => ({ ...t, id: nid() })) })), repeatCount: s.repeatCount, audioRange: s.audioRange };
}
function cloneLine(l: EditorSection['lines'][number]) {
  return { id: nid(), tokens: l.tokens.map(t => ({ ...t, id: nid() })) };
}

const SECTION_PRESETS = ['Intro','Verse 1','Verse 2','Pre-chorus','Chorus','Bridge','Outro','Solo','Interlude'];

// Sentinel for `playingSectionId` when previewing the whole song's vocal clip from the
// audio modal — distinct from any real section id, and from `null` (nothing playing).
const WHOLE_SONG_AUDIO_PREVIEW_ID = '__whole_song_audio_preview__';

interface EditingChord { sectionId: string; lineId: string; tokenId: string; chord: Chord | null; duration: number; }

interface Props {
  sections: EditorSection[];
  meta: SongMeta;
  onMetaChange: (meta: SongMeta) => void;
  onBack: () => void;
  onPublish: (sections: EditorSection[]) => void;
  isPublishing: boolean;
  isEditMode?: boolean;
  // Song id to key the shared audio file's Storage path off of — stable across
  // renders even before the song has a real DB row (see SongCreator/index.tsx).
  songId: string;
  // Gates an action behind login, opening the sign-in modal and retrying once
  // successful — same mechanism onPublish itself uses.
  onRequireAuth: (action: () => void) => void;
}

export default function ChordStep({ sections: init, meta, onMetaChange, onBack, onPublish, isPublishing, isEditMode, songId, onRequireAuth }: Props) {
  const [sections, setSections] = useState(init);
  const [savedSectionsJson, setSavedSectionsJson] = useState(() => JSON.stringify(init));
  const [savedMetaJson, setSavedMetaJson] = useState(() => JSON.stringify(meta));
  const [editingChord, setEditingChord] = useState<EditingChord | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineText, setEditingLineText] = useState('');
  const [showMeta, setShowMeta] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draggingChord, setDraggingChord] = useState<string | null>(null);
  const [playingSectionId, setPlayingSectionId] = useState<string | null>(null);
  // null = closed, 'new' = creating a new section, otherwise = appending lines to that section id
  const [pasteTarget, setPasteTarget] = useState<'new' | string | null>(null);
  const [pasteName, setPasteName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const closePasteImport = () => { setPasteTarget(null); setPasteName(''); setPasteText(''); };

  // null = closed, 'whole' = whole-song reference clip, otherwise = a section id
  const [audioModalTarget, setAudioModalTarget] = useState<'whole' | string | null>(null);
  const [isAttachingAudio, setIsAttachingAudio] = useState(false);
  const [attachAudioError, setAttachAudioError] = useState<string | null>(null);

  const hasChanges = JSON.stringify(sections) !== savedSectionsJson || JSON.stringify(meta) !== savedMetaJson;
  const lineEditRef = useRef<HTMLTextAreaElement>(null);

  const { state: pbState, play, stop } = usePlayback();
  const { isPlaying, currentChordIndex } = pbState;

  // Reset playing state when playback ends
  useEffect(() => { if (!isPlaying) setPlayingSectionId(null); }, [isPlaying]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => { if (editingLineId) lineEditRef.current?.focus(); }, [editingLineId]);

  // ── Section ops ───────────────────────────────────────────────────────────────
  const addSection    = () => setSections(p => [...p, makeNewSection(`Section ${p.length + 1}`)]);
  const deleteSection = (id: string) => setSections(p => p.filter(s => s.id !== id));
  const renameSect    = (id: string, name: string) => setSections(p => p.map(s => s.id === id ? { ...s, name } : s));
  const changeRepeat  = (id: string, repeatCount: number) => setSections(p => p.map(s => s.id === id ? { ...s, repeatCount: Math.max(1, repeatCount) } : s));
  const duplicateSection = (id: string) => setSections(p => {
    const i = p.findIndex(s => s.id === id);
    const next = [...p]; next.splice(i + 1, 0, cloneSection(p[i])); return next;
  });
  const confirmPasteImport = () => {
    const lines = parseSectionBody(pasteText);
    if (lines.length === 0) return;
    if (pasteTarget === 'new') {
      setSections(p => [...p, { id: nid(), name: pasteName.trim() || `Section ${p.length + 1}`, lines, repeatCount: 1 }]);
    } else if (pasteTarget) {
      const targetId = pasteTarget;
      setSections(p => p.map(s => s.id === targetId ? { ...s, lines: [...s.lines, ...lines] } : s));
    }
    closePasteImport();
  };

  // ── Vocal reference audio ───────────────────────────────────────────────────────
  const anySectionHasAudioRange = sections.some(s => s.audioRange);

  const handleAttachAudioFile = (file: File) => {
    onRequireAuth(async () => {
      setIsAttachingAudio(true);
      setAttachAudioError(null);
      const result = await uploadSongAudio(songId, file);
      setIsAttachingAudio(false);
      if (!result.ok) { setAttachAudioError((result as SongAudioUploadError).reason); return; }
      const { url, path } = result as SongAudioUploadResult;
      onMetaChange({ ...meta, audioTrack: { url, path } });
    });
  };

  // Picking a different file invalidates every existing range (they were marked against
  // the old file's timeline), so clear them all rather than leave stale offsets around.
  const handleReplaceAudioFile = () => {
    if (meta.audioTrack) deleteSongAudio(meta.audioTrack.path);
    onMetaChange({ ...meta, audioTrack: undefined, audioWholeRange: undefined });
    setSections(p => p.map(s => ({ ...s, audioRange: undefined })));
    setAttachAudioError(null);
  };

  const handleAudioRangeChange = (range: AudioRange | undefined) => {
    if (audioModalTarget === 'whole') {
      onMetaChange({ ...meta, audioWholeRange: range });
    } else if (audioModalTarget) {
      const targetId = audioModalTarget;
      setSections(p => p.map(s => s.id === targetId ? { ...s, audioRange: range } : s));
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const type = active.data.current?.type;
    if (type === 'chord' || type === 'palette-chord') {
      setDraggingChord(active.data.current.chord);
    }
  };

  const handleDragEnd = ({ active: a, over: o }: DragEndEvent) => {
    setDraggingChord(null);
    if (!o) return;

    if (a.data.current?.type === 'palette-chord' && o.data.current?.type === 'chord-target') {
      // Palette drag: assign the palette chord to the target token
      const chord = a.data.current.chord as string;
      const dstId = o.data.current.tokenId as string;
      setSections(prev => prev.map(sec => ({
        ...sec,
        lines: sec.lines.map(l => ({
          ...l,
          tokens: l.tokens.map(t => t.id === dstId ? { ...t, chord, duration: 4 } : t),
        })),
      })));
    } else if (a.data.current?.type === 'chord' && o.data.current?.type === 'chord-target') {
      const srcId = a.data.current.tokenId as string;
      const dstId = o.data.current.tokenId as string;
      if (srcId === dstId) return;

      setSections(prev => {
        let srcChord = '', srcDur = 4, dstChord = '', dstDur = 4;
        for (const sec of prev)
          for (const line of sec.lines)
            for (const t of line.tokens) {
              if (t.id === srcId) { srcChord = t.chord; srcDur = t.duration; }
              if (t.id === dstId) { dstChord = t.chord; dstDur = t.duration; }
            }

        return prev.map(sec => ({
          ...sec,
          lines: sec.lines.map(l => ({
            ...l,
            tokens: l.tokens.map(t => {
              if (t.id === srcId) return { ...t, chord: dstChord, duration: dstDur };
              if (t.id === dstId) return { ...t, chord: srcChord, duration: srcDur };
              return t;
            }),
          })),
        }));
      });
    } else if (
      (a.data.current?.type === 'palette-chord' || a.data.current?.type === 'chord') &&
      o.data.current?.type === 'line-drop'
    ) {
      // Drop on an empty line — add a new chord token
      const chord = a.data.current.chord as string;
      // Moving an existing chord keeps its duration; a fresh palette chord starts at the default.
      const duration = a.data.current?.type === 'chord' ? (a.data.current.duration as number) : 4;
      const srcTokenId = a.data.current?.tokenId as string | undefined;
      const { lineId: dstLine } = o.data.current as { lineId: string };

      setSections(prev => {
        let next = prev.map(sec => ({
          ...sec,
          lines: sec.lines.map(l => {
            if (l.id !== dstLine) return l;
            const newToken: WordToken = { id: nid(), text: '', chord, duration, isSpace: false };
            const kept = l.tokens.filter(t => t.isSpace || t.text.trim() || t.chord);
            return { ...l, tokens: [...kept, newToken] };
          }),
        }));
        // If moving from an existing token, clear the source
        if (srcTokenId) {
          next = next.map(sec => ({
            ...sec,
            lines: sec.lines.map(l => ({
              ...l,
              tokens: l.tokens.map(t => t.id === srcTokenId ? { ...t, chord: '', duration: 4 } : t),
            })),
          }));
        }
        return next;
      });
    } else if (!a.data.current?.type && a.id !== o.id) {
      setSections(p => arrayMove(p, p.findIndex(s => s.id === a.id), p.findIndex(s => s.id === o.id)));
    }
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

  const duplicateToken = useCallback((sid: string, lid: string, tid: string) => {
    setSections(p => p.map(s => s.id !== sid ? s : {
      ...s,
      lines: s.lines.map(l => l.id !== lid ? l : {
        ...l,
        tokens: l.tokens.flatMap(t => t.id !== tid ? [t] : [t, { ...t, id: nid(), text: '' }]),
      }),
    }));
  }, []);

  const openChordModal = (sid: string, lid: string, tid: string, currentChord: string, duration: number) => {
    const parsed = currentChord ? stringToChord(currentChord) : null;
    // Inject token duration so the modal shows the actual chord duration, not the parser default
    const chord = parsed ? { ...parsed, duration } : null;
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

  // ── Now-playing chord highlight ─────────────────────────────────────────────
  // Same token order handlePlaySection uses to build the chords array passed to
  // the audio engine, so pbState.currentChordIndex indexes straight into it.
  const playingChordTokenIds = useMemo(() => {
    if (!playingSectionId) return [] as string[];
    const section = sections.find(s => s.id === playingSectionId);
    if (!section) return [] as string[];
    return section.lines.flatMap(l => l.tokens).filter(t => t.chord && !t.isSpace).map(t => t.id);
  }, [sections, playingSectionId]);

  const activeTokenId = useMemo(() => {
    if (!isPlaying || currentChordIndex < 0 || playingChordTokenIds.length === 0) return null;
    return playingChordTokenIds[currentChordIndex % playingChordTokenIds.length] ?? null;
  }, [isPlaying, currentChordIndex, playingChordTokenIds]);

  // Play / stop a whole section
  const handlePlaySection = useCallback(async (section: EditorSection) => {
    if (isPlaying && playingSectionId === section.id) { stop(); return; }
    if (isPlaying) stop();

    const chords = section.lines.flatMap(l => l.tokens)
      .filter(t => t.chord && !t.isSpace)
      .flatMap(t => parseChordString(t.chord).map(c => ({ ...c, duration: t.duration })));

    if (!chords.length) return;
    setPlayingSectionId(section.id);
    await play([{ ...createSection(section.name), chords, repeatCount: section.repeatCount }], {
      ...playbackOpts(),
      // createSection() above mints a fresh Section.id, so section-keyed sectionRanges
      // wouldn't match here — since this call only ever plays one section at a time,
      // its own audioRange (if any) can just be treated as the whole clip for this play().
      audioTrack: meta.audioTrack && section.audioRange
        ? { url: meta.audioTrack.url, wholeRange: section.audioRange }
        : undefined,
    });
  }, [isPlaying, playingSectionId, play, stop, playbackOpts, meta.audioTrack]);

  // ── Whole-song audio-clip preview (audio modal, "whole song" target) ───────────
  // Builds one temporary Section per editor section (mirrors handlePlaySection's own
  // per-section conversion) so the vocal reference plays back-to-back with the actual
  // chord progression, exactly like the real thing — not the acapella clip alone.
  const buildEditorPlaybackSections = useCallback((): Section[] => {
    return sections.map(section => {
      const chords = section.lines.flatMap(l => l.tokens)
        .filter(t => t.chord && !t.isSpace)
        .flatMap(t => parseChordString(t.chord).map(c => ({ ...c, duration: t.duration })));
      return { ...createSection(section.name), chords, repeatCount: section.repeatCount };
    });
  }, [sections]);

  // createSection() mints a fresh id per playback Section, so section-keyed
  // sectionRanges have to be matched by array position against the editor's own
  // sections[i].audioRange, the same trick SongChordPlayer's buildAudioTrack uses.
  const buildEditorAudioTrack = useCallback((playbackSections: Section[]) => {
    if (!meta.audioTrack) return undefined;
    if (meta.audioWholeRange) return { url: meta.audioTrack.url, wholeRange: meta.audioWholeRange };
    const sectionRanges: Record<string, AudioRange> = {};
    playbackSections.forEach((sec, i) => {
      const range = sections[i]?.audioRange;
      if (range) sectionRanges[sec.id] = range;
    });
    return Object.keys(sectionRanges).length > 0 ? { url: meta.audioTrack.url, sectionRanges } : undefined;
  }, [meta.audioTrack, meta.audioWholeRange, sections]);

  const handlePreviewWholeSongAudio = useCallback(async () => {
    if (isPlaying && playingSectionId === WHOLE_SONG_AUDIO_PREVIEW_ID) { stop(); return; }
    if (isPlaying) stop();

    const playbackSections = buildEditorPlaybackSections();
    if (!playbackSections.some(s => s.chords.length > 0)) return;
    setPlayingSectionId(WHOLE_SONG_AUDIO_PREVIEW_ID);
    await play(playbackSections, { ...playbackOpts(), audioTrack: buildEditorAudioTrack(playbackSections) });
  }, [isPlaying, playingSectionId, play, stop, playbackOpts, buildEditorPlaybackSections, buildEditorAudioTrack]);

  // Whichever target the audio modal is currently showing, is ITS preview (not some
  // unrelated section played from the main list) the thing actually sounding right now?
  const isAudioModalChordsPreviewPlaying = isPlaying && (
    audioModalTarget === 'whole'
      ? playingSectionId === WHOLE_SONG_AUDIO_PREVIEW_ID
      : audioModalTarget !== null && playingSectionId === audioModalTarget
  );

  const handleToggleAudioModalChordsPreview = useCallback(() => {
    if (audioModalTarget === 'whole') { handlePreviewWholeSongAudio(); return; }
    if (!audioModalTarget) return;
    const section = sections.find(s => s.id === audioModalTarget);
    if (section) handlePlaySection(section);
  }, [audioModalTarget, sections, handlePlaySection, handlePreviewWholeSongAudio]);

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

  // ── Collision detection: sections only collide with sections ─────────────────
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeType = args.active.data.current?.type;
    if (!activeType) {
      // Section drag — filter out chord/line droppables
      const sectionOnly = args.droppableContainers.filter(c => !c.data.current?.type);
      return closestCenter({ ...args, droppableContainers: sectionOnly });
    }
    return closestCenter(args);
  }, []);

  // ── Preview song ──────────────────────────────────────────────────────────────
  const previewSong: Song = {
    slug: 'preview', title: meta.title || 'Preview', artist: meta.artist || '',
    key: meta.key, capo: meta.capo || undefined, bpm: meta.bpm, style: meta.style,
    description: '', tags: [], relatedProgressions: [], genre: meta.genre,
    sections: sectionsToSongFormat(sections),
    audioTrack: meta.audioTrack, audioWholeRange: meta.audioWholeRange,
  };

  const totalChords = sections.flatMap(s => s.lines.flatMap(l => l.tokens)).filter(t => t.chord).length;

  // ── Paste-import preview ────────────────────────────────────────────────────
  const pastePreviewLines = useMemo(() => parseSectionBody(pasteText), [pasteText]);
  const pastePreviewChordCount = pastePreviewLines.flatMap(l => l.tokens).filter(t => t.chord).length;

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
            <div className="col-span-2"><label className="block text-xs font-medium text-muted-foreground mb-1">Album</label>
              <input value={meta.album} onChange={e => onMetaChange({ ...meta, album: e.target.value })}
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
            <StyleSelector
              selectedStyleId={meta.style}
              onStyleChange={style => onMetaChange({ ...meta, style })}
              showCustom={false}
              triggerClassName="w-full h-9 bg-background border-border rounded-lg px-2 py-2 text-sm"
            />
          </div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-2">Referencia vocal (toda la canción)</label>
            <button
              onClick={() => setAudioModalTarget('whole')}
              disabled={anySectionHasAudioRange}
              title={anySectionHasAudioRange ? 'Hay una referencia vocal adjuntada por sección — quitala para usar una de toda la canción' : undefined}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5
                ${meta.audioWholeRange ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
            >
              <AudioLines className="w-3.5 h-3.5" />
              {meta.audioWholeRange ? 'Editar referencia vocal' : 'Adjuntar referencia vocal'}
            </button>
          </div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-2">Genre</label>
            <div className="flex flex-wrap gap-1.5">
              {SONG_GENRES.map(g => {
                const on = meta.genre.includes(g);
                return <button key={g} onClick={() => onMetaChange({ ...meta, genre: on ? meta.genre.filter(x => x !== g) : [...meta.genre, g] })}
                  className={`text-xs capitalize px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:border-primary/40'}`}>{g}</button>;
              })}</div></div>
        </div>
      )}

      {/* ── Editor + chord palette aside ── */}
      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 items-start">

          {/* Sections column */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
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
                    activeTokenId={playingSectionId === section.id ? activeTokenId : null}
                    bpm={meta.bpm}
                    rawIndex={currentChordIndex}
                    onRename={renameSect}
                    onDelete={deleteSection}
                    onDuplicate={duplicateSection}
                    onRepeatChange={changeRepeat}
                    onPlaySection={handlePlaySection}
                    onOpenAudioModal={setAudioModalTarget}
                    wholeSongAudioActive={!!meta.audioWholeRange}
                    onAddLine={addLine}
                    onPasteLines={setPasteTarget}
                    onDeleteLine={deleteLine}
                    onDuplicateLine={duplicateLine}
                    onStartEditLine={startEditLine}
                    onCommitLineEdit={commitLineEdit}
                    onCancelLineEdit={() => setEditingLineId(null)}
                    onEditingLineTextChange={setEditingLineText}
                    onOpenChordModal={openChordModal}
                    onPreviewChord={previewChord}
                    onUpdateToken={updateToken}
                    onDuplicateChord={duplicateToken}
                    isDraggingChord={!!draggingChord}
                  />
                ))}
              </div>
            </SortableContext>

            <div className="flex gap-2">
              <button onClick={addSection}
                className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground border-2 border-dashed border-border/50 hover:border-primary/40 rounded-xl py-3 transition-colors">
                <Plus className="w-4 h-4" /> Add section
              </button>
              <button onClick={() => setPasteTarget('new')}
                className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground border-2 border-dashed border-border/50 hover:border-primary/40 rounded-xl py-3 transition-colors">
                <ClipboardPaste className="w-4 h-4" /> Paste chords
              </button>
            </div>
          </div>

          {/* Chord palette aside — sticky */}
          <div className="w-36 shrink-0 sticky top-20 self-start">
            <ChordPalette songKey={meta.key} />
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingChord && (
            <span className="inline-flex items-center text-xs font-bold text-primary bg-primary/20 border border-primary/60 rounded-lg px-2.5 py-1 shadow-lg cursor-grabbing select-none">
              {draggingChord}
            </span>
          )}
        </DragOverlay>
      </DndContext>

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
        songKey={meta.key}
        onPreview={partial => {
          const c = { root: 'C', accidental: '', quality: 'maj', duration: 4, id: 'preview', ...partial } as import('@/lib/musicTheory').Chord;
          playChordPreview(c);
        }}
      />

      {/* ── Preview modal ── */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent aria-describedby={undefined} className="w-[calc(100%-1rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <Music2 className="w-4 h-4 text-primary shrink-0" />
            <DialogTitle asChild>
              <span className="font-semibold text-foreground truncate">{meta.title || 'Preview'}</span>
            </DialogTitle>
            {meta.artist && <span className="text-sm text-muted-foreground truncate">— {meta.artist}</span>}
          </div>
          <PlaybackProvider>
            <SongChordPlayer song={previewSong} inline />
          </PlaybackProvider>
        </DialogContent>
      </Dialog>

      {/* ── Paste chords modal ── */}
      <Dialog open={pasteTarget !== null} onOpenChange={o => { if (!o) closePasteImport(); }}>
        <DialogContent aria-describedby={undefined} className="w-[calc(100%-1rem)] sm:max-w-lg p-0 gap-0">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <ClipboardPaste className="w-4 h-4 text-primary shrink-0" />
            <DialogTitle asChild>
              <span className="font-semibold text-foreground">
                {pasteTarget === 'new'
                  ? 'Paste chords into a new section'
                  : `Paste chords into ${sections.find(s => s.id === pasteTarget)?.name ?? 'section'}`}
              </span>
            </DialogTitle>
          </div>
          <div className="p-5 space-y-3">
            {pasteTarget === 'new' && (
              <input
                value={pasteName}
                onChange={e => setPasteName(e.target.value)}
                placeholder="Section name (e.g. Chorus)"
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            )}
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={'G#m E B F#\nAlle Alle Alleluia\nG#m E B F#\nYou get all the praise, we say'}
              rows={8}
              spellCheck={false}
              autoFocus
              className="w-full border border-border rounded-xl px-3 py-2 bg-background text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Chords above lyrics, or <code className="bg-muted px-1 rounded">[Chord]inline</code> — same format as "From text".
              {pasteText.trim() && (
                <span className="ml-1 text-primary font-medium">
                  {pastePreviewChordCount} {pastePreviewChordCount === 1 ? 'chord' : 'chords'} detected
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <button onClick={closePasteImport}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
              Cancel
            </button>
            <button
              onClick={confirmPasteImport}
              disabled={pastePreviewLines.length === 0}
              className="px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pasteTarget === 'new' ? 'Add section' : 'Add lines'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Vocal reference audio modal ── */}
      <AudioClipModal
        target={audioModalTarget}
        onTargetChange={target => { if (isAudioModalChordsPreviewPlaying) stop(); setAudioModalTarget(target); }}
        onClose={() => { if (isAudioModalChordsPreviewPlaying) stop(); setAudioModalTarget(null); }}
        sections={sections}
        audioTrack={meta.audioTrack}
        audioWholeRange={meta.audioWholeRange}
        onAttachFile={handleAttachAudioFile}
        onReplaceFile={handleReplaceAudioFile}
        onRangeChange={handleAudioRangeChange}
        attachError={attachAudioError}
        isAttaching={isAttachingAudio}
        isChordsPreviewPlaying={isAudioModalChordsPreviewPlaying}
        onToggleChordsPreview={handleToggleAudioModalChordsPreview}
      />
    </div>
  );
}

// ── AppendDropZone — explicit "add chord here" target at the end of a line ────
// Separate registered droppable so closestCenter distinguishes it from token targets.
function AppendDropZone({ lineId, sectionId }: { lineId: string; sectionId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'append-' + lineId,
    data: { type: 'line-drop', sectionId, lineId },
  });
  return (
    <span
      ref={setNodeRef}
      className={`self-center inline-flex items-center text-[10px] font-medium px-2.5 py-1.5 rounded-lg border border-dashed transition-all select-none cursor-copy
        ${isOver
          ? 'text-primary border-primary/70 bg-primary/15 scale-105'
          : 'text-primary/50 border-primary/35 bg-primary/5 hover:text-primary/70 hover:border-primary/50'}`}
    >
      + acorde
    </span>
  );
}

// ── LineDropZone — droppable wrapper for lines ───────────────────────────────
function LineDropZone({ lineId, sectionId, children, isDraggingChord }: {
  lineId: string; sectionId: string; isDraggingChord: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'linedrop-' + lineId,
    data: { type: 'line-drop', sectionId, lineId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 flex flex-wrap items-start gap-x-1 gap-y-4 py-1 min-h-[3rem] rounded-lg transition-all
        ${isOver
          ? 'bg-primary/10 ring-2 ring-dashed ring-primary/50'
          : isDraggingChord
            ? 'ring-1 ring-dashed ring-primary/20 bg-primary/[0.02]'
            : ''}`}
    >
      {children}
      {isDraggingChord && <AppendDropZone lineId={lineId} sectionId={sectionId} />}
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
  activeTokenId: string | null;
  bpm: number;
  rawIndex: number;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRepeatChange: (id: string, repeatCount: number) => void;
  onPlaySection: (section: EditorSection) => void;
  onOpenAudioModal: (sectionId: string) => void;
  wholeSongAudioActive: boolean;
  onAddLine: (sid: string) => void;
  onPasteLines: (sid: string) => void;
  onDeleteLine: (sid: string, lid: string) => void;
  onDuplicateLine: (sid: string, lid: string) => void;
  onStartEditLine: (lid: string, tokens: WordToken[]) => void;
  onCommitLineEdit: (sid: string, lid: string) => void;
  onCancelLineEdit: () => void;
  onEditingLineTextChange: (text: string) => void;
  onOpenChordModal: (sid: string, lid: string, tid: string, chord: string, duration: number) => void;
  onPreviewChord: (chord: string) => void;
  onUpdateToken: (sid: string, lid: string, tid: string, patch: Partial<WordToken>) => void;
  onDuplicateChord: (sid: string, lid: string, tid: string) => void;
  isDraggingChord: boolean;
}

function SortableSection({ section, canDelete, isPlaying, isDraggingChord, ...props }: SortableSectionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 } as React.CSSProperties;
  const [nameFocused, setNameFocused] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const hasChords = section.lines.some(l => l.tokens.some(t => t.chord));

  return (
    <div ref={setNodeRef} style={style}
      className={`rounded-2xl border bg-card shadow-sm hover:shadow-md transition-all ${isPlaying ? 'border-primary/50 bg-primary/5 shadow-primary/10' : 'border-border'}`}>
      {/* Section header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 transition-colors ${collapsed ? 'rounded-2xl' : 'border-b rounded-t-2xl'} ${isPlaying ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-muted/20'}`}>
        <button {...attributes} {...listeners} className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none transition-colors">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="text-muted-foreground/40 hover:text-muted-foreground shrink-0 transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
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
          {/* Vocal reference audio */}
          <button
            onClick={() => props.onOpenAudioModal(section.id)}
            disabled={props.wholeSongAudioActive}
            title={props.wholeSongAudioActive
              ? 'Hay una referencia vocal activa para toda la canción — quitala para usar audio por sección'
              : section.audioRange ? 'Editar referencia vocal de esta sección' : 'Adjuntar referencia vocal a esta sección'}
            className={`p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              section.audioRange
                ? 'text-primary bg-primary/10 hover:bg-primary/20'
                : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
            }`}
          >
            <AudioLines className="w-3.5 h-3.5" />
          </button>
          {/* Repeat count */}
          <div className="relative">
            <button
              onClick={() => props.onRepeatChange(section.id, section.repeatCount === 1 ? 2 : section.repeatCount + 1)}
              title="Repeat this section"
              className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold transition-colors ${
                section.repeatCount > 1
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground/50 hover:text-foreground hover:border-primary/40'
              }`}
            >
              ×{section.repeatCount}
            </button>
            {section.repeatCount > 1 && (
              <button
                onClick={() => props.onRepeatChange(section.id, section.repeatCount - 1)}
                title="Reduce repeat count"
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground text-[9px] leading-none flex items-center justify-center hover:scale-110 transition-transform"
              >
                −
              </button>
            )}
          </div>
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
      {!collapsed && <div className="p-4 space-y-3">
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
                {(() => {
                  // "chord-only" = no real lyrics text — allows dropping more chords at any point
                  const hasText = line.tokens.some(t => t.text.trim() && !t.isSpace);
                  const isChordOnly = !hasText;
                  const isBlank = line.tokens.length === 0 || (line.tokens.length === 1 && !line.tokens[0].text && !line.tokens[0].chord);
                  return (
                    <LineDropZone lineId={line.id} sectionId={section.id} isDraggingChord={isDraggingChord}>
                      {isBlank ? (
                        <span className="text-xs text-muted-foreground/30 italic self-center">
                          Empty — drag a chord here or click ✎ to add text
                        </span>
                      ) : (
                        line.tokens.map(token => (
                          <TokenChip
                            key={token.id} token={token}
                            sectionId={section.id} lineId={line.id}
                            isDraggingChord={isDraggingChord}
                            isActive={token.id === props.activeTokenId}
                            bpm={props.bpm}
                            rawIndex={props.rawIndex}
                            onOpenModal={() => props.onOpenChordModal(section.id, line.id, token.id, token.chord, token.duration)}
                            onRemove={() => props.onUpdateToken(section.id, line.id, token.id, { chord: '', duration: 4 })}
                            onPreview={() => props.onPreviewChord(token.chord)}
                            onDuplicate={() => props.onDuplicateChord(section.id, line.id, token.id)}
                          />
                        ))
                      )}
                    </LineDropZone>
                  );
                })()}

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

        <div className="flex gap-2 mt-1">
          <button onClick={() => props.onAddLine(section.id)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary border border-dashed border-border/50 hover:border-primary/40 rounded-xl py-2 transition-colors">
            <Plus className="w-3 h-3" /> Add line
          </button>
          <button onClick={() => props.onPasteLines(section.id)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary border border-dashed border-border/50 hover:border-primary/40 rounded-xl py-2 transition-colors">
            <ClipboardPaste className="w-3 h-3" /> Paste chords
          </button>
        </div>
      </div>}
    </div>
  );
}

// ── TokenChip ─────────────────────────────────────────────────────────────────
interface ChipProps {
  token: WordToken;
  sectionId: string;
  lineId: string;
  isDraggingChord?: boolean;
  isActive?: boolean;
  bpm: number;
  rawIndex: number;
  onOpenModal: () => void;
  onRemove: () => void;
  onPreview: () => void;
  onDuplicate: () => void;
}

function TokenChip({ token, sectionId, lineId, isDraggingChord, isActive, bpm, rawIndex, onOpenModal, onRemove, onPreview, onDuplicate }: ChipProps) {
  if (token.isSpace) return <span className="text-sm select-none">{token.text}</span>;

  const hasChord = !!token.chord;

  // Draggable — only when this token has a chord
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: 'drag-' + token.id,
    disabled: !hasChord,
    data: { type: 'chord', sectionId, lineId, tokenId: token.id, chord: token.chord, duration: token.duration },
  });

  // Droppable — always, so any chord can be dropped here
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'drop-' + token.id,
    data: { type: 'chord-target', sectionId, lineId, tokenId: token.id },
  });

  const handleChordClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    onPreview();
    onOpenModal();
  };

  return (
    <span
      ref={setDropRef}
      className={`group/chip relative inline-flex flex-col items-start rounded-lg transition-colors
        ${isOver ? 'bg-primary/10 outline outline-2 outline-primary/40 outline-offset-1' : ''}`}
      style={{ fontFamily: 'var(--font-mono, monospace)' }}
    >
      {/* Chord area */}
      <span className="flex items-center gap-0.5 min-h-[1.75em] mb-0.5">
        {hasChord ? (
          <>
            {/* Chord badge — draggable + click opens modal */}
            <button
              ref={setDragRef}
              {...attributes}
              {...listeners}
              onClick={handleChordClick}
              className={`inline-flex flex-col items-center gap-[3px] text-xs font-bold text-primary rounded-lg px-2 py-1 transition-all hover:shadow-sm leading-none border
                ${isActive
                  ? 'bg-primary/20 border-primary/60 scale-105'
                  : 'bg-primary/10 hover:bg-primary/20 border-primary/20 hover:border-primary/60'}
                ${isDragging ? 'opacity-30 cursor-grabbing' : 'cursor-grab active:cursor-grabbing'}`}
            >
              <DurationDots duration={token.duration} isActive={!!isActive} bpm={bpm} uid={token.id} rawIndex={rawIndex} size={7} />
              <span>{token.chord}</span>
            </button>

            {/* Duplicate on hover */}
            <button
              onMouseDown={e => { e.stopPropagation(); onDuplicate(); }}
              className="opacity-0 group-hover/chip:opacity-100 p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
              title="Duplicate chord"
            >
              <Copy className="w-3 h-3" />
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
            className={`text-[11px] text-muted-foreground hover:text-primary border border-dashed rounded-lg px-1.5 py-0.5 transition-all whitespace-nowrap leading-none
              ${isOver
                ? 'opacity-100 border-primary/60 bg-primary/5 text-primary'
                : isDraggingChord
                  ? 'opacity-80 border-primary/40 bg-primary/5 text-primary/60'
                  : 'opacity-20 group-hover/chip:opacity-100 border-border hover:border-primary/60 hover:bg-primary/5'}`}
          >
            +
          </button>
        )}
      </span>

      {/* Word text */}
      <span className={`text-sm leading-relaxed transition-colors duration-100 ${
        isActive ? 'text-foreground font-semibold underline decoration-primary/60 underline-offset-4' : hasChord ? 'text-foreground' : 'text-muted-foreground/80'
      }`}>
        {token.text}
      </span>
    </span>
  );
}

// ── Read-only lyrics/chords reference shown next to the waveform — lets the person
// trimming a clip see where the section's actual words land, instead of guessing blind
// from the audio alone ────────────────────────────────────────────────────────────
function SectionLyricsPreview({ section }: { section: EditorSection }) {
  const hasContent = section.lines.some(l => l.tokens.some(t => t.chord || t.text.trim()));
  if (!hasContent) {
    return <p className="text-xs text-muted-foreground italic">Esta sección todavía no tiene acordes ni letra.</p>;
  }
  return (
    <div className="space-y-2">
      {section.lines.map(line => (
        <div key={line.id} className="flex flex-wrap gap-x-1 gap-y-1.5">
          {line.tokens.map(token => {
            if (token.isSpace) return <span key={token.id} className="text-sm">{token.text}</span>;
            if (!token.chord && !token.text.trim()) return null;
            return (
              <span key={token.id} className="inline-flex flex-col items-start" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                <span className="text-[10px] font-bold text-primary leading-none mb-0.5 h-3">{token.chord}</span>
                <span className="text-sm text-foreground leading-snug">{token.text}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function WholeSongLyricsPreview({ sections }: { sections: EditorSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map(s => (
        <div key={s.id}>
          <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest mb-1">{s.name}</p>
          <SectionLyricsPreview section={s} />
        </div>
      ))}
    </div>
  );
}

// ── AudioClipModal — attach the shared song audio file, pick which section (or the
// whole song) it applies to, and mark a start/end range for that target ───────────
interface AudioClipModalProps {
  target: 'whole' | string | null; // null = closed
  onTargetChange: (target: 'whole' | string) => void;
  onClose: () => void;
  sections: EditorSection[];
  audioTrack?: { url: string };
  audioWholeRange?: AudioRange;
  onAttachFile: (file: File) => void;
  onReplaceFile: () => void;
  onRangeChange: (range: AudioRange | undefined) => void; // applies to the current target
  attachError: string | null;
  isAttaching: boolean;
  // Real synced playback (chords + vocal reference together, via the same audio engine
  // path as the section Play buttons) — separate from the raw scrub-preview inside
  // AudioRangeEditor, which stays isolated for precise trimming.
  isChordsPreviewPlaying: boolean;
  onToggleChordsPreview: () => void;
}

function AudioClipModal({
  target, onTargetChange, onClose, sections, audioTrack, audioWholeRange,
  onAttachFile, onReplaceFile, onRangeChange, attachError, isAttaching,
  isChordsPreviewPlaying, onToggleChordsPreview,
}: AudioClipModalProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Guard against the target section having been deleted out from under the modal
  // (e.g. a future non-blocking dialog variant, or a bulk-edit path) — close rather
  // than show a picker referencing a section that no longer exists.
  useEffect(() => {
    if (target && target !== 'whole' && !sections.some(s => s.id === target)) onClose();
  }, [target, sections, onClose]);

  const currentSection = target && target !== 'whole' ? sections.find(s => s.id === target) : null;
  const currentRange = target === 'whole' ? audioWholeRange : currentSection?.audioRange;
  const anySectionHasRange = sections.some(s => s.audioRange);
  const wholeActive = !!audioWholeRange;
  // Other sections' clips on the same shared file, shown as reference bands while
  // editing this one — irrelevant (and always empty) in whole-song scope.
  const otherRanges = target && target !== 'whole'
    ? sections.filter(s => s.id !== target && s.audioRange).map(s => ({ label: s.name, range: s.audioRange! }))
    : [];

  const chipClass = (active: boolean, disabled: boolean) => `text-xs px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap
    ${active ? 'bg-primary text-primary-foreground border-primary font-semibold' : 'border-border text-muted-foreground hover:border-primary/40'}
    ${disabled ? 'opacity-30 cursor-not-allowed hover:border-border' : ''}`;

  return (
    <Dialog open={target !== null} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="w-[calc(100%-1rem)] sm:max-w-5xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <AudioLines className="w-4 h-4 text-primary shrink-0" />
          <DialogTitle asChild>
            <span className="font-semibold text-foreground truncate">Referencia vocal</span>
          </DialogTitle>
        </div>

        {/* Section picker — choose what this clip/range applies to, without closing */}
        {audioTrack && (
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">¿A qué parte se refiere?</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onTargetChange('whole')}
                disabled={anySectionHasRange && target !== 'whole'}
                title={anySectionHasRange ? 'Hay recortes por sección — quitalos para usar uno de toda la canción' : undefined}
                className={chipClass(target === 'whole', anySectionHasRange && target !== 'whole')}
              >
                Toda la canción
              </button>
              {sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => onTargetChange(s.id)}
                  disabled={wholeActive && target !== s.id}
                  title={wholeActive ? 'Hay una referencia para toda la canción — quitala para usar recortes por sección' : undefined}
                  className={chipClass(target === s.id, wholeActive && target !== s.id)}
                >
                  {s.name}{s.audioRange ? ' •' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="p-5 space-y-4">
          {!audioTrack ? (
            <div>
              <input
                type="file"
                accept="audio/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) onAttachFile(f); }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-sm file:font-medium file:cursor-pointer hover:file:bg-primary/20"
              />
              {isAttaching && <p className="text-xs text-muted-foreground mt-2">Cargando…</p>}
              {attachError && <p className="text-xs text-destructive mt-2">{attachError}</p>}
              <p className="text-xs text-muted-foreground mt-3">
                Subí la grabación completa de la canción (voz + instrumentos) una sola vez.
                Después vas a poder recortar qué parte suena en cada sección. Se guarda con
                la canción y suena también en su página pública — te va a pedir iniciar
                sesión si todavía no lo hiciste.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
              <div className="space-y-4 min-w-0">
                <AudioRangeEditor
                  audioUrl={audioTrack.url}
                  range={currentRange}
                  onRangeChange={onRangeChange}
                  otherRanges={otherRanges}
                  targetLabel={target === 'whole' ? 'toda la canción' : currentSection ? `"${currentSection.name}"` : 'esta sección'}
                  isChordsPreviewPlaying={isChordsPreviewPlaying}
                  onToggleChordsPreview={onToggleChordsPreview}
                  chordsPreviewLabel={target === 'whole' ? 'Escuchar toda la canción con los acordes' : 'Escuchar esta sección con los acordes'}
                />
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="text-xs text-destructive/80 hover:text-destructive transition-colors"
                >
                  Eliminar referencia de audio
                </button>
              </div>

              {/* Lyrics/chords reference — see where the section's text lands so the
                  audio cut can be lined up with where it actually starts/ends */}
              <div className="lg:border-l lg:border-border lg:pl-5 lg:max-h-[26rem] lg:overflow-y-auto">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                  {target === 'whole' ? 'Letra de toda la canción' : `Letra — ${currentSection?.name ?? ''}`}
                </p>
                {target === 'whole'
                  ? <WholeSongLyricsPreview sections={sections} />
                  : currentSection && <SectionLyricsPreview section={currentSection} />}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
            Listo
          </button>
        </div>
      </DialogContent>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la referencia de audio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el archivo adjunto y todos los recortes marcados, tanto por sección
              como el de toda la canción. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onReplaceFile(); setConfirmDeleteOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
