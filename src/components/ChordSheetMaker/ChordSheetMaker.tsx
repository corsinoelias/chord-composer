import { useCallback, useEffect, useRef, useState } from 'react';
import {
  diatonic, transposeKey, transposeChord, isFlatKey, type ChartNotation, KEYS_CHROMATIC,
} from '@/lib/chordSheet/chordSheetCore';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { saveChordSheet, updateChordSheet, getMyChordSheetById, type ChordSheet } from '@/lib/chordSheets';
import { defaultLayout, resolveStyleLayout, type StyleLayout } from '@/lib/chordSheet/presets';
import { ensureAuth } from '@/lib/supabase';
import { generateSlug } from '@/lib/musicKeys';
import { AuthModal } from '@/components/AuthModal';
import { InteractiveSheet } from './InteractiveSheet';
import { useChordSheetDrag } from './useChordSheetDrag';
import { ChordDragGhost } from './ChordDragGhost';
import { StageMode } from './StageMode';
import { StyleControls } from './StyleControls';
import { Library } from './Library';

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

interface ChordSheetDoc {
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
  instrument: 'guitar', chartType: 'standard', text: SAMPLE_TEXT, layout: defaultLayout(),
};

const BLANK_DOC: ChordSheetDoc = {
  title: '', artist: '', baseKey: 'C', semi: 0, capo: 0,
  instrument: 'guitar', chartType: 'standard', text: '', layout: defaultLayout(),
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
  const [isPublished, setIsPublished] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingActionRef = useRef<(() => void) | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

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
      setIsPublished(sheet.is_published);
      setSaveStatus('saved');
    });
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

  async function doSave(publish: boolean) {
    setSaveStatus('saving');
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
      if (ok) { setIsPublished(publish); setSaveStatus('saved'); setRefreshToken((t) => t + 1); }
      else setSaveStatus('error');
      return;
    }

    const slug = generateSlug(title, doc.artist || 'chord-sheet');
    const saved = await saveChordSheet({ ...payload, slug });
    if (saved) {
      setSongId(saved.id);
      setIsPublished(publish);
      setSaveStatus('saved');
      setEditParam(saved.id);
      setRefreshToken((t) => t + 1);
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
    setIsPublished(false);
    setSaveStatus('idle');
    setEditParam(null);
    setScreen('editor');
  }

  function handleOpen(sheet: ChordSheet) {
    setDoc(docFromSheet(sheet));
    setSongId(sheet.id);
    setIsPublished(sheet.is_published);
    setSaveStatus('saved');
    setEditParam(sheet.id);
    setScreen('editor');
  }

  async function handleDuplicate(sheet: ChordSheet) {
    const title = `${sheet.title} (copy)`;
    const slug = generateSlug(title, sheet.artist || 'chord-sheet');
    const saved = await saveChordSheet({
      slug, title, artist: sheet.artist, baseKey: sheet.baseKey, capo: sheet.capo,
      text: sheet.text, layout: sheet.layout, is_published: false,
    });
    if (saved) setRefreshToken((t) => t + 1);
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

  const insertChord = useCallback((chord: string) => {
    const el = textRef.current;
    if (!el) return;
    const start = el.selectionStart ?? doc.text.length;
    const end = el.selectionEnd ?? start;
    const token = `[${chord}]`;
    const next = doc.text.slice(0, start) + token + doc.text.slice(end);
    patch({ text: next });
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }, [doc.text, patch]);

  // ── Drag & drop of chords onto the live preview ──
  // Character-precise pointer drag (see useChordSheetDrag / chordHitTest), not a DnD
  // library: an existing chip is picked up straight off the sheet, a palette chip is picked
  // up here and dropped onto the sheet by the same engine.
  const getText = useCallback(() => docRef.current.text, []);
  const applyText = useCallback((next: string) => patch({ text: next }), [patch]);
  const { drag, selected, beginDrag, beginPaletteDrag } = useChordSheetDrag({ getText, onChange: applyText, onFlash: flash });

  if (screen === 'library') {
    return (
      <>
        <Library onOpen={handleOpen} onNew={handleNew} onDuplicate={handleDuplicate} refreshToken={refreshToken} />
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
            onClick={() => window.print()}
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

      <div className="no-print flex flex-wrap items-end gap-5 border-b border-border px-5 py-2.5">
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

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground">Base key</span>
          <select
            value={doc.baseKey}
            onChange={(e) => patch({ baseKey: e.target.value, semi: 0 })}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs outline-none"
          >
            {KEYS_CHROMATIC.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div className="h-9 w-px self-stretch bg-border" />

        <StyleControls layout={doc.layout} onChange={(p) => patch({ layout: { ...doc.layout, ...p } })} />
      </div>

      <div className="csm-shell grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(300px,0.85fr)_1.15fr]">
        <section className="no-print flex min-h-0 flex-col border-b border-border bg-card lg:border-b-0 lg:border-r">
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
          <textarea
            ref={textRef}
            value={doc.text}
            onChange={(e) => patch({ text: e.target.value })}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none border-t border-border bg-background px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
          />
        </section>

        <section className="csm-sheet-pane min-h-0 overflow-auto bg-muted/20 px-4 py-6 sm:px-8">
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
          />
        </section>
      </div>

      <ChordDragGhost drag={drag} />

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
          .csm-paper { box-shadow: none !important; border: 0 !important; max-width: none !important; }
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
      onClick={() => onInsert(stored)}
      title="Click to insert · drag onto the preview to place it"
      className="cursor-grab rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary hover:bg-primary/20 active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    >
      {shown}
    </button>
  );
}
