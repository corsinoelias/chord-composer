import { useCallback, useEffect, useRef, useState } from 'react';
import {
  diatonic, transposeKey, transposeChord, isFlatKey, moveChord, removeChord, lineTokens, replaceLine, playChord,
  type ChartNotation,
} from '@/lib/chordSheet/chordSheetCore';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { saveChordSheet, updateChordSheet, getMyChordSheetById, type ChordSheet } from '@/lib/chordSheets';
import { newSheetLayout, resolveStyleLayout, type StyleLayout } from '@/lib/chordSheet/presets';
import { songToSheetSeed } from '@/lib/chordSheet/songToSheet';
import { getPublicSongBySlug } from '@/lib/publicSongs';
import { ensureAuth } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { generateSlug } from '@/lib/musicKeys';
import { readStoredNotation } from '@/lib/songNotation';
import { AuthModal } from '@/components/AuthModal';
import { InteractiveSheet } from './InteractiveSheet';
import { useChordSheetDrag } from './useChordSheetDrag';
import { ChordDragGhost } from './ChordDragGhost';
import { ChordProEditor, type ChordProEditorHandle } from './ChordProEditor';
import { StageMode } from './StageMode';
import { StyleControls } from './StyleControls';
import { Library } from './Library';
import { useIsNarrow } from './useIsNarrow';
import { MobileChrome, type MobileSheetId } from './MobileChrome';

const DRAFT_KEY = 'chord-sheet-maker-draft-v1';

const SAMPLE_TEXT = `Intro
[G] [C] | [G] [D]

Verse 1
[G]Amazing grace how [G7]sweet the [C]sound
That [G]saved a wretch like [Em]me [D]
I [G]once was lost but [G7]now am [C]found
Was [G]blind but [D]now I [G]see

Chorus
[C]My chains are [G]gone, I've been set [D]free
My [Em]God, my [C]Savior has [G]ransomed [D]me
And like a [C]flood His [G]mercy [D]reigns
Unending [Em]love, a[C]mazing [G]grace

Outro
[C] [G] | [D] [G]`;

export interface ChordSheetDoc {
  title: string;
  artist: string;
  baseKey: string;
  semi: number;
  capo: number;
  instrument: DiagramInstrument | 'piano';
  chartType: ChartNotation;
  text: string;
  /** Presentation only — preset, fonts, columns, alignment, scale, paper, diagram spot. */
  layout: StyleLayout;
}

const SAMPLE_DOC: ChordSheetDoc = {
  title: 'Amazing Grace', artist: 'Traditional', baseKey: 'G', semi: 0, capo: 0,
  instrument: 'guitar', chartType: 'standard', text: SAMPLE_TEXT, layout: newSheetLayout(),
};

const BLANK_DOC: ChordSheetDoc = {
  title: '', artist: '', baseKey: 'C', semi: 0, capo: 0,
  instrument: 'guitar', chartType: 'standard', text: '', layout: newSheetLayout(),
};

function loadDraft(): ChordSheetDoc {
  if (typeof window === 'undefined') return SAMPLE_DOC;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = { ...SAMPLE_DOC, ...JSON.parse(raw) };
      return { ...parsed, layout: resolveStyleLayout(parsed.layout) };
    }
  } catch { /* ignore malformed draft */ }
  return SAMPLE_DOC;
}

// `sheet.layout` holds instrument/chartType and the style fields flattened together in
// one jsonb column — resolveStyleLayout ignores the keys it doesn't own, so this is safe
// even for a sheet saved before Phase C shipped (instrument/chartType only, no style yet).
function docFromSheet(sheet: ChordSheet): ChordSheetDoc {
  const raw = (sheet.layout ?? {}) as { instrument?: DiagramInstrument | 'piano'; chartType?: ChartNotation };
  return {
    title: sheet.title, artist: sheet.artist, baseKey: sheet.baseKey, semi: 0, capo: sheet.capo ?? 0,
    instrument: raw.instrument ?? 'guitar', chartType: raw.chartType ?? 'standard',
    text: sheet.text, layout: resolveStyleLayout(sheet.layout),
  };
}

function setEditParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('edit', id); else url.searchParams.delete('edit');
  window.history.replaceState(null, '', url.pathname + url.search);
}

const CHART_TYPES: { value: ChartNotation; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'number', label: 'Nashville numbers' },
  { value: 'fixed', label: 'Solfège (fixed Do)' },
  { value: 'movable', label: 'Solfège (movable Do)' },
];

const INSTRUMENTS: { value: DiagramInstrument | 'piano'; label: string }[] = [
  { value: 'guitar', label: 'Guitar' },
  { value: 'ukulele', label: 'Ukulele' },
  { value: 'piano', label: 'Piano' },
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function ChordSheetMaker() {
  const [screen, setScreen] = useState<'editor' | 'library'>('editor');
  const [doc, setDoc] = useState<ChordSheetDoc>(loadDraft);
  const [songId, setSongId] = useState<string | null>(null);
  const [songSlug, setSongSlug] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingActionRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<ChordProEditorHandle>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const narrow = useIsNarrow();

  // ── Mobile chrome state (Phase 3) — bottom tab bar, Key/Layout rails, Style/Font/More
  // bottom sheets, the line-edit modal, and the full-screen ChordPro source editor. Only
  // MobileChrome (mounted when `narrow`) reads most of these; `mobileMode` also gates the
  // tap-to-edit-line behavior on InteractiveSheet and the nudge-pill's visibility below.
  const [mobileMode, setMobileMode] = useState<'view' | 'edit'>('view');
  const [sheet, setSheet] = useState<MobileSheetId>('');
  const [lineEdit, setLineEdit] = useState<{ src: number; value: string } | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const lineEditRef = useRef(lineEdit);
  lineEditRef.current = lineEdit;

  const flash = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }, []);

  // On first mount only: `?edit=<id>` resumes a specific song (own draft or published),
  // regardless of what's sitting in the local scratch draft.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit');
    if (!id) return;
    getMyChordSheetById(id).then((sheet) => {
      if (!sheet) return;
      setDoc(docFromSheet(sheet));
      setSongId(sheet.id);
      setSongSlug(sheet.slug);
      setIsPublished(sheet.is_published);
      setSaveStatus('saved');
      resetHistory();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-on-mount only
  }, []);

  // `?from=<song-slug>` seeds the editor with a song from the Songs catalogue, converted
  // to ChordPro by src/lib/chordSheet/songToSheet.ts. Same shape as SongCreator's `?edit=`
  // handler (src/components/SongCreator/index.tsx): the slug is resolved on the client
  // against Supabase, with a toast when it doesn't resolve. Deliberately Supabase-only —
  // scripts/seed-songs.ts publishes the static SONGS array into public_songs, so reaching
  // for src/data/songs.ts as a fallback would drag 833 lines of lyrics into this bundle to
  // cover rows that are already there. `?edit=` wins: resuming a saved chart beats seeding.
  //
  // Seeding is destructive — the maker has one draft slot (DRAFT_KEY). Untouched sample
  // text or an empty sheet is replaced silently; real unsaved work asks first. The param
  // is stripped either way, so a refresh can't re-seed over edits made since.
  // Seeds the editor with a song from the Songs catalogue, converted to ChordPro by
  // src/lib/chordSheet/songToSheet.ts. Shared by two callers on purpose: the `?from=`
  // link handled below, and the library's Public tab, which lists the same catalogue.
  // One function means the Public tab inherits the guardrails the link already had
  // rather than growing a second, subtly different seed path.
  //
  // Seeding is destructive — the maker has one draft slot (DRAFT_KEY). Untouched sample
  // text or an empty sheet is replaced silently; real unsaved work asks first.
  const seedFromSongSlug = useCallback(async (
    slug: string,
    opts: { entryPoint: 'song_link' | 'library_public'; semi?: number },
  ) => {
    const song = await getPublicSongBySlug(slug);
    if (!song) { flash("Couldn't find that song"); return; }
    const current = docRef.current.text.trim();
    const untouched = !current || current === SAMPLE_TEXT.trim();
    if (!untouched && !window.confirm(`Replace the sheet you're working on with "${song.title}"?`)) return;
    // Chord spelling follows the visitor across the site. `SongNotation` is a strict
    // subset of `ChartNotation` (see src/lib/songNotation.ts — no mapping table needed),
    // and readStoredNotation already prefers an explicit `?notation=` over the stored
    // preference, so a link shared in Nashville numbers opens in Nashville numbers even
    // for someone whose own default is letters. Applied only here, at seed time: doing it
    // on every mount would silently overwrite the chart type a saved sheet chose.
    setDoc({
      ...BLANK_DOC, ...songToSheetSeed(song), semi: opts.semi ?? 0,
      chartType: readStoredNotation(),
      layout: newSheetLayout(),
    });
    setSongId(null);
    setSongSlug(null);
    setIsPublished(false);
    setSaveStatus('idle');
    setEditParam(null);
    resetHistory();
    setScreen('editor');
    analytics.sheetSeeded(opts.entryPoint, slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetHistory is stable; docRef is a ref
  }, [flash]);

  // `?from=<song-slug>` seeds from a link. Same shape as SongCreator's `?edit=` handler
  // (src/components/SongCreator/index.tsx): the slug is resolved on the client against
  // Supabase, with a toast when it does not resolve. Deliberately Supabase-only —
  // scripts/seed-songs.ts publishes the static SONGS array into public_songs, so reaching
  // for src/data/songs.ts as a fallback would drag 833 lines of lyrics into this bundle to
  // cover rows that are already there. `?edit=` wins: resuming a saved chart beats seeding.
  //
  // The params are stripped before the fetch resolves, so a refresh can never re-seed over
  // edits made since — including when the visitor declines the confirm.
  //
  // `?transpose=` carries the key the visitor was already reading in (the song page and
  // /songs/pdf/ both transpose on the fly), so the sheet opens where they left off rather
  // than snapping back to the recorded key.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('from');
    if (!slug || params.get('edit')) return;
    const semi = Math.max(-11, Math.min(11, parseInt(params.get('transpose') ?? '', 10) || 0));
    const url = new URL(window.location.href);
    url.searchParams.delete('from');
    url.searchParams.delete('transpose');
    window.history.replaceState(null, '', url.pathname + url.search);
    void seedFromSongSlug(slug, { entryPoint: 'song_link', semi });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed-on-mount only
  }, []);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(doc)); } catch { /* storage may be unavailable (private mode, quota) */ }
  }, [doc]);

  const patch = useCallback((p: Partial<ChordSheetDoc>) => {
    setDoc((d) => ({ ...d, ...p }));
    setSaveStatus((s) => (s === 'saved' ? 'idle' : s));
  }, []);

  async function requireAuthThen(action: () => void) {
    const userId = await ensureAuth();
    if (userId) { action(); return; }
    pendingActionRef.current = action;
    setAuthModalOpen(true);
  }

  function handleAuthSuccess() {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }

  // Publish/unpublish is reported only on an actual transition. The Save button passes
  // the sheet's current visibility straight through, so firing on `publish` alone would
  // report a re-publish on every ordinary save of an already-public chart.
  function trackSaved(isUpdate: boolean, wasPublished: boolean, publish: boolean) {
    analytics.sheetSaved(isUpdate);
    if (publish && !wasPublished) analytics.sheetPublished();
    else if (!publish && wasPublished) analytics.sheetUnpublished();
  }

  async function doSave(publish: boolean) {
    setSaveStatus('saving');
    // Captured before the write: doSave sets isPublished on success, so reading it
    // afterwards would compare the new value against itself and never see a change.
    const wasPublished = isPublished;
    const title = doc.title.trim() || 'Untitled';
    const payload = {
      title,
      artist: doc.artist,
      baseKey: doc.baseKey,
      capo: doc.capo || undefined,
      text: doc.text,
      layout: { instrument: doc.instrument, chartType: doc.chartType, ...doc.layout },
      is_published: publish,
    };

    if (songId) {
      const ok = await updateChordSheet(songId, payload);
      if (ok) { setIsPublished(publish); setSaveStatus('saved'); setRefreshToken((t) => t + 1); trackSaved(true, wasPublished, publish); }
      else setSaveStatus('error');
      return;
    }

    const slug = generateSlug(title, doc.artist || 'chord-sheet');
    const saved = await saveChordSheet({ ...payload, slug });
    if (saved) {
      setSongId(saved.id);
      setSongSlug(saved.slug);
      setIsPublished(publish);
      setSaveStatus('saved');
      setEditParam(saved.id);
      setRefreshToken((t) => t + 1);
      trackSaved(false, wasPublished, publish);
    } else {
      setSaveStatus('error');
    }
  }

  function handleSave(publish: boolean) {
    requireAuthThen(() => doSave(publish));
  }

  function handleNew() {
    setDoc(BLANK_DOC);
    setSongId(null);
    setSongSlug(null);
    setIsPublished(false);
    setSaveStatus('idle');
    setEditParam(null);
    setScreen('editor');
    resetHistory();
    resetMobileChrome();
  }

  function handleOpen(sheet: ChordSheet) {
    setDoc(docFromSheet(sheet));
    setSongId(sheet.id);
    setSongSlug(sheet.slug);
    setIsPublished(sheet.is_published);
    setSaveStatus('saved');
    setEditParam(sheet.id);
    setScreen('editor');
    resetHistory();
    resetMobileChrome();
  }

  async function handleDuplicate(sheet: ChordSheet) {
    const title = `${sheet.title} (copy)`;
    const slug = generateSlug(title, sheet.artist || 'chord-sheet');
    const saved = await saveChordSheet({
      slug, title, artist: sheet.artist, baseKey: sheet.baseKey, capo: sheet.capo,
      text: sheet.text, layout: sheet.layout, is_published: false,
    });
    if (saved) { setRefreshToken((t) => t + 1); analytics.sheetDuplicated(); }
  }

  const displayKey = transposeKey(doc.baseKey, doc.semi);
  // Chips are labelled in the on-screen (transposed) key but the *stored* token is always
  // in the song's base key — the preview re-applies `semi` at render time, so inserting the
  // transposed name would double-transpose it (C shown as D, saved as D, rendered as E).
  const storeChord = useCallback(
    (shown: string) => (doc.semi ? transposeChord(shown, -doc.semi, isFlatKey(doc.baseKey)) : shown),
    [doc.semi, doc.baseKey],
  );
  const palette = diatonic(displayKey);
  // Same transpose used by InteractiveSheet's live preview — MobileChrome needs it too, for
  // the "copy as text" / "email" export actions (sheetToPlainText renders in the on-screen key).
  const chordName = useCallback(
    (raw: string) => transposeChord(raw, doc.semi, isFlatKey(displayKey)),
    [doc.semi, displayKey],
  );

  // ── Undo/redo — 40-entry history of `doc.text`, one entry per burst of typing (a fresh
  // entry only after a 600ms pause) or per discrete action (a drag/drop, a click-to-insert).
  // Kept in refs (not state) so pushUndo/popUndo always see the latest stack synchronously;
  // the counters below only exist to re-render the undo/redo buttons' enabled state.
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const lastTypedRef = useRef(0);

  const pushUndo = useCallback(() => {
    undoRef.current = [...undoRef.current, docRef.current.text].slice(-40);
    redoRef.current = [];
    setUndoCount(undoRef.current.length);
    setRedoCount(0);
  }, []);

  const resetHistory = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
  }, []);

  const resetMobileChrome = useCallback(() => {
    setMobileMode('view');
    setSheet('');
    setLineEdit(null);
    setSourceOpen(false);
  }, []);

  const insertChord = useCallback((chord: string) => {
    const next = editorRef.current?.insertChordAtCaret(chord);
    if (next == null) return;
    pushUndo();
    lastTypedRef.current = 0;
    patch({ text: next });
  }, [patch, pushUndo]);

  // One undo entry per burst of typing in the ChordPro textarea: a fresh entry only after
  // a pause, so holding a key down doesn't fill the stack with one entry per character.
  const textEdit = useCallback((value: string) => {
    const now = Date.now();
    if (now - lastTypedRef.current > 600) pushUndo();
    lastTypedRef.current = now;
    patch({ text: value });
  }, [patch, pushUndo]);

  // ── Drag & drop of chords onto the live preview ──
  // Character-precise pointer drag (see useChordSheetDrag / chordHitTest), not a DnD
  // library: an existing chip is picked up straight off the sheet, a palette chip is picked
  // up here and dropped onto the sheet by the same engine. Every drag/drop is a discrete
  // action (unlike typing), so it always pushes its own undo entry.
  const getText = useCallback(() => docRef.current.text, []);
  const applyDragChange = useCallback((next: string) => {
    pushUndo();
    patch({ text: next });
  }, [pushUndo, patch]);
  const { drag, selected, setSelected, beginDrag, beginPaletteDrag } = useChordSheetDrag({ getText, onChange: applyDragChange, onFlash: flash });

  const popUndo = useCallback(() => {
    lastTypedRef.current = 0;
    if (!undoRef.current.length) return;
    const prev = undoRef.current[undoRef.current.length - 1];
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, docRef.current.text].slice(-40);
    setUndoCount(undoRef.current.length);
    setRedoCount(redoRef.current.length);
    setSelected(null);
    patch({ text: prev });
    flash('Undone');
  }, [patch, flash, setSelected]);

  const popRedo = useCallback(() => {
    lastTypedRef.current = 0;
    if (!redoRef.current.length) return;
    const next = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, docRef.current.text].slice(-40);
    setUndoCount(undoRef.current.length);
    setRedoCount(redoRef.current.length);
    setSelected(null);
    patch({ text: next });
    flash('Redone');
  }, [patch, flash, setSelected]);

  const nudge = useCallback((delta: number) => {
    if (!selected) return;
    const tk = lineTokens(docRef.current.text.split('\n')[selected.src] || '');
    const c = tk.chords[selected.ci];
    if (!c) return;
    const at = Math.max(0, Math.min(tk.plain.length, c.at + delta));
    pushUndo();
    patch({ text: moveChord(docRef.current.text, selected.src, selected.ci, at, delta > 0) });
  }, [selected, pushUndo, patch]);

  const removeSelected = useCallback(() => {
    if (!selected) return;
    pushUndo();
    patch({ text: removeChord(docRef.current.text, selected.src, selected.ci) });
    setSelected(null);
    flash('Chord removed');
  }, [selected, pushUndo, patch, setSelected, flash]);

  const selectedChord = selected ? lineTokens(doc.text.split('\n')[selected.src] || '').chords[selected.ci] : null;
  const selectedLabel = selectedChord ? `${selectedChord.chord} · char ${selectedChord.at}` : '';

  // ── Mobile line-edit sheet + full-screen source editor — all discrete text mutations,
  // so (like drag/drop) each one pushes its own undo entry rather than coalescing.
  const onTapLine = useCallback((src: number) => {
    const raw = docRef.current.text.split('\n')[src] ?? '';
    setLineEdit({ src, value: raw });
  }, []);

  const onLineEditChange = useCallback((value: string) => {
    const le = lineEditRef.current;
    if (!le) return;
    const now = Date.now();
    if (now - lastTypedRef.current > 600) pushUndo();
    lastTypedRef.current = now;
    setLineEdit({ ...le, value });
    patch({ text: replaceLine(docRef.current.text, le.src, value) });
  }, [patch, pushUndo]);

  const closeLineEdit = useCallback(() => {
    lastTypedRef.current = 0;
    setLineEdit(null);
  }, []);

  const insertLineAfter = useCallback(() => {
    const le = lineEditRef.current;
    if (!le) return;
    const lines = docRef.current.text.split('\n');
    lines.splice(le.src + 1, 0, 'New line');
    pushUndo();
    lastTypedRef.current = 0;
    patch({ text: lines.join('\n') });
    setLineEdit({ src: le.src + 1, value: 'New line' });
  }, [patch, pushUndo]);

  const deleteLine = useCallback(() => {
    const le = lineEditRef.current;
    if (!le) return;
    const lines = docRef.current.text.split('\n');
    lines.splice(le.src, 1);
    pushUndo();
    patch({ text: lines.join('\n') });
    setLineEdit(null);
    flash('Line deleted');
  }, [patch, pushUndo, flash]);

  const addLine = useCallback(() => {
    pushUndo();
    patch({ text: docRef.current.text ? `${docRef.current.text}\nNew line` : 'New line' });
    flash('Line added — tap it to edit');
  }, [patch, pushUndo, flash]);

  const addSection = useCallback(() => {
    pushUndo();
    const base = docRef.current.text;
    patch({ text: `${base ? `${base}\n` : ''}\nSection\nNew line` });
    flash('Section added');
  }, [patch, pushUndo, flash]);

  const appendChordToLine = useCallback((chord: string) => {
    const le = lineEditRef.current;
    if (!le) return;
    const value = `${le.value}[${chord}]`;
    pushUndo();
    lastTypedRef.current = 0;
    setLineEdit({ ...le, value });
    patch({ text: replaceLine(docRef.current.text, le.src, value) });
  }, [patch, pushUndo]);

  const onSourceChange = useCallback((value: string) => {
    textEdit(value);
  }, [textEdit]);

  // Cmd/Ctrl+S to save, Cmd/Ctrl+Z (Shift = redo) for history, and — while a chord is
  // selected — arrow keys nudge it a character at a time, Backspace/Delete removes it,
  // Escape deselects. Stage mode owns its own keydown handler while it's open.
  useEffect(() => {
    if (stageOpen || lineEdit || sourceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave(isPublished);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) popRedo(); else popUndo();
        return;
      }
      if (!selected) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(1); }
      else if (e.key === 'Escape') setSelected(null);
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeSelected(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSave/isPublished read fresh via closure each effect re-run
  }, [stageOpen, lineEdit, sourceOpen, selected, nudge, removeSelected, popUndo, popRedo, setSelected, isPublished]);

  if (screen === 'library') {
    return (
      <>
        <Library
          onOpen={handleOpen}
          onNew={handleNew}
          onDuplicate={handleDuplicate}
          onSeedSong={(slug) => void seedFromSongSlug(slug, { entryPoint: 'library_public' })}
          refreshToken={refreshToken}
        />
        <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} onSuccess={handleAuthSuccess} entryPoint="chord_sheet_maker_library" />
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="csm-hdr flex flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">♪</div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-foreground">Chord Sheet Maker</div>
            <div className="text-[10px] tracking-wide text-muted-foreground">
              {saveStatus === 'saving' ? 'SAVING…' : saveStatus === 'error' ? 'SAVE FAILED' : songId ? (isPublished ? 'SAVED · PUBLIC' : 'SAVED · PRIVATE') : 'DRAFT · NOT SAVED YET'}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2" style={{ maxWidth: 520 }}>
          <input
            value={doc.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Song title"
            className="min-w-0 flex-[3] rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary/50"
          />
          <input
            value={doc.artist}
            onChange={(e) => patch({ artist: e.target.value })}
            placeholder="Artist"
            className="min-w-0 flex-[2] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScreen('library')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent/40"
          >
            ← Library
          </button>
          <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5 lg:hidden">
            {(['view', 'edit'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMobileMode(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${mobileMode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={popUndo}
              disabled={undoCount === 0}
              title="Undo (Ctrl+Z)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-sm text-foreground hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={popRedo}
              disabled={redoCount === 0}
              title="Redo (Ctrl+Shift+Z)"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-sm text-foreground hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↻
            </button>
          </div>
          {songId && (
            <button
              type="button"
              onClick={() => handleSave(!isPublished)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${isPublished ? 'border-primary/30 text-primary' : 'border-border text-muted-foreground'} hover:bg-accent/40`}
              title={isPublished ? 'Make private' : 'Publish to the public library'}
            >
              {isPublished ? '🌐 Public' : '🔒 Private'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setStageOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent/40"
            title="Full-screen performance view"
          >
            Stage
          </button>
          <button
            type="button"
            onClick={() => { analytics.sheetPrinted(); window.print(); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-accent/40"
          >
            Print / PDF
          </button>
          <button
            type="button"
            onClick={() => handleSave(isPublished)}
            disabled={saveStatus === 'saving'}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
        {saveStatus === 'error' && (
          <p className="w-full text-xs text-destructive">Couldn't save — check your connection and try again. Nothing was lost, your draft is still here.</p>
        )}
      </header>

      <div className="no-print hidden flex-wrap items-end gap-5 border-b border-border px-5 py-2.5 lg:flex">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Transpose Key</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => patch({ semi: doc.semi - 1 })} className="h-7 w-7 rounded-md border border-border text-sm hover:border-primary/50 hover:text-primary" aria-label="Down a semitone">−</button>
            <span className="min-w-[70px] rounded-md border border-border bg-card px-2 py-1 text-center font-mono text-xs font-bold text-primary">{displayKey}</span>
            <button type="button" onClick={() => patch({ semi: doc.semi + 1 })} className="h-7 w-7 rounded-md border border-border text-sm hover:border-primary/50 hover:text-primary" aria-label="Up a semitone">+</button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Capo</span>
          <select
            value={doc.capo}
            onChange={(e) => patch({ capo: Number(e.target.value) })}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => i).map((n) => (
              <option key={n} value={n}>{n === 0 ? 'None' : n}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Chart Type</span>
          <select
            value={doc.chartType}
            onChange={(e) => patch({ chartType: e.target.value as ChartNotation })}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs outline-none"
          >
            {CHART_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Instrument</span>
          <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
            {INSTRUMENTS.map((i) => (
              <button
                key={i.value}
                type="button"
                onClick={() => patch({ instrument: i.value })}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${doc.instrument === i.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-9 w-px self-stretch bg-border" />

        <StyleControls layout={doc.layout} onChange={(p) => patch({ layout: { ...doc.layout, ...p } })} />
      </div>

      <div className="csm-shell grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(300px,0.85fr)_1.15fr]">
        <section className="no-print hidden min-h-0 flex-col border-b border-border bg-card lg:flex lg:border-b-0 lg:border-r">
          <div className="px-4 pb-2 pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">ChordPro source</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Type <span className="font-mono text-primary">[G]like this</span>, click a chord to insert it at the cursor, or drag one onto the preview.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            <span className="mr-1 self-center text-[10px] font-bold text-muted-foreground">IN KEY</span>
            {palette.map((c) => (
              <PaletteChip key={c} shown={c} stored={storeChord(c)} onInsert={insertChord} onBeginDrag={beginPaletteDrag} />
            ))}
          </div>
          <ChordProEditor
            ref={editorRef}
            value={doc.text}
            onChange={textEdit}
            semi={doc.semi}
            chordDisplay={chordName}
            chordStore={storeChord}
            onBeginChipDrag={beginDrag}
            className="min-h-0 flex-1 overflow-y-auto border-t border-border bg-background px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
          />
        </section>

        <section className="csm-sheet-pane min-h-0 overflow-auto bg-muted/20 px-4 pb-28 pt-6 sm:px-8 lg:pb-6">
          <InteractiveSheet
            text={doc.text}
            title={doc.title}
            artist={doc.artist}
            baseKey={doc.baseKey}
            semi={doc.semi}
            capo={doc.capo}
            instrument={doc.instrument}
            chartType={doc.chartType}
            layout={doc.layout}
            drag={drag}
            selected={selected}
            onBeginDrag={beginDrag}
            onTapLine={narrow && mobileMode === 'edit' ? onTapLine : undefined}
          />

          {selected && selectedLabel && (!narrow || mobileMode === 'edit') && (
            <div className="no-print sticky bottom-2.5 z-10 mt-3.5 flex justify-center">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-3.5 pr-1.5 shadow-lg">
                <span className="text-xs text-muted-foreground">{selectedLabel}</span>
                <button type="button" onClick={() => nudge(-1)} title="Move left one character" className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-sm text-foreground hover:bg-accent/40">←</button>
                <button type="button" onClick={() => nudge(1)} title="Move right one character" className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-sm text-foreground hover:bg-accent/40">→</button>
                <button type="button" onClick={removeSelected} title="Remove this chord" className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-sm text-destructive hover:bg-accent/40">×</button>
                <button type="button" onClick={() => setSelected(null)} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Done</button>
              </div>
            </div>
          )}
        </section>
      </div>

      <ChordDragGhost drag={drag} />

      {narrow && !stageOpen && (
        <MobileChrome
          mobileMode={mobileMode}
          onMobileModeChange={setMobileMode}
          sheet={sheet}
          onSheetChange={setSheet}
          doc={doc}
          displayKey={displayKey}
          chordName={chordName}
          palette={palette}
          storeChord={storeChord}
          onPatch={patch}
          onLayoutChange={(p) => patch({ layout: { ...doc.layout, ...p } })}
          onSourceChange={onSourceChange}
          lineEdit={lineEdit}
          onLineEditChange={onLineEditChange}
          onLineEditClose={closeLineEdit}
          onLineInsertAfter={insertLineAfter}
          onLineDelete={deleteLine}
          onLineAppendChord={appendChordToLine}
          onAddLine={addLine}
          onAddSection={addSection}
          sourceOpen={sourceOpen}
          onSourceOpen={() => setSourceOpen(true)}
          onSourceClose={() => setSourceOpen(false)}
          isPublished={isPublished}
          songSlug={songSlug}
          onStage={() => setStageOpen(true)}
          flash={flash}
        />
      )}

      {toast && (
        <div className="no-print fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-lg">
          {toast}
        </div>
      )}

      <style>{`
        @page { size: ${doc.layout.pageSize === 'a4' ? 'A4' : 'letter'}; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          .csm-shell { display: block !important; }
          .csm-sheet-pane { overflow: visible !important; background: #fff !important; }
          .csm-pages { gap: 0 !important; }
          .csm-page-wrap { break-after: page; page-break-after: always; }
          .csm-page-wrap:last-child { break-after: auto; page-break-after: auto; }
          .csm-page-reserve { width: auto !important; height: auto !important; }
          .csm-paper { box-shadow: none !important; border: 0 !important; width: auto !important; min-height: 0 !important; max-width: none !important; transform: none !important; overflow: visible !important; }
          .csm-sec-title, .csm-line { break-inside: avoid; }
        }
      `}</style>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} onSuccess={handleAuthSuccess} entryPoint="chord_sheet_maker_save" />

      {stageOpen && (
        <StageMode
          text={doc.text}
          title={doc.title}
          artist={doc.artist}
          baseKey={doc.baseKey}
          semi={doc.semi}
          onSemiChange={(s) => patch({ semi: s })}
          capo={doc.capo}
          instrument={doc.instrument}
          chartType={doc.chartType}
          layout={doc.layout}
          onExit={() => setStageOpen(false)}
        />
      )}
    </div>
  );
}

/** An "in key" chip: click to insert at the textarea cursor (unchanged), or drag onto a
 *  word in the preview. The drag payload carries the base-key `stored` token; the label
 *  shows the transposed name. */
function PaletteChip({ shown, stored, onInsert, onBeginDrag }: {
  shown: string;
  stored: string;
  onInsert: (chord: string) => void;
  onBeginDrag: (e: React.PointerEvent, chord: string, label: string) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => onBeginDrag(e, stored, shown)}
      onClick={() => { playChord(shown); onInsert(stored); }}
      title="Click to insert · drag onto the preview to place it"
      className="cursor-grab rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary hover:bg-primary/20 active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    >
      {shown}
    </button>
  );
}
