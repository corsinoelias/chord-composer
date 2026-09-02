import { useRef, useState } from 'react';
import { ensureAuth } from '@/lib/supabase';
import { generateSlug } from '@/lib/musicKeys';
import { saveChordSheet, type ChordSheet } from '@/lib/chordSheets';
import { AuthModal } from '@/components/AuthModal';
import { SheetPaper } from './SheetPaper';
import { StageMode } from './StageMode';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import type { ChartNotation } from '@/lib/chordSheet/chordSheetCore';
import { resolveStyleLayout } from '@/lib/chordSheet/presets';

interface Props {
  sheet: ChordSheet;
}

/** Read-only view of a published chart, with a "Save a copy" fork into the viewer's own
 *  library — the destination for public Library cards and the landing page's featured
 *  charts. Mirrors the fork-on-edit pattern documented for progressions in CLAUDE.md,
 *  adapted to this table (a plain insert with a fresh slug, not a share-link fork). */
export function ChordSheetView({ sheet }: Props) {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [forking, setForking] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

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

  async function doFork() {
    setForking(true);
    const title = `${sheet.title} (copy)`;
    const slug = generateSlug(title, sheet.artist || 'chord-sheet');
    const saved = await saveChordSheet({
      slug, title, artist: sheet.artist, baseKey: sheet.baseKey, capo: sheet.capo,
      text: sheet.text, layout: sheet.layout, is_published: false,
    });
    setForking(false);
    if (saved) window.location.href = `/chord-sheet-maker/editor/?edit=${saved.id}`;
  }

  const raw = (sheet.layout ?? {}) as { instrument?: DiagramInstrument | 'piano'; chartType?: ChartNotation };
  const styleLayout = resolveStyleLayout(sheet.layout);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <a href="/chord-sheet-maker/" className="text-sm text-muted-foreground hover:text-primary transition-colors">← Chord Sheet Maker</a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStageOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/40"
            title="Full-screen performance view"
          >
            Stage
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/40"
          >
            Print / PDF
          </button>
          <button
            type="button"
            onClick={() => requireAuthThen(doFork)}
            disabled={forking}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {forking ? 'Saving a copy…' : 'Save a copy to my library →'}
          </button>
        </div>
      </div>

      <SheetPaper
        text={sheet.text}
        title={sheet.title}
        artist={sheet.artist}
        baseKey={sheet.baseKey}
        semi={0}
        capo={sheet.capo ?? 0}
        instrument={raw.instrument ?? 'guitar'}
        chartType={raw.chartType ?? 'standard'}
        layout={styleLayout}
        paginate
      />

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} onSuccess={handleAuthSuccess} entryPoint="chord_sheet_maker_fork" />

      {stageOpen && (
        <StageMode
          text={sheet.text}
          title={sheet.title}
          artist={sheet.artist}
          baseKey={sheet.baseKey}
          semi={0}
          capo={sheet.capo ?? 0}
          instrument={raw.instrument ?? 'guitar'}
          chartType={raw.chartType ?? 'standard'}
          layout={styleLayout}
          onExit={() => setStageOpen(false)}
        />
      )}

      <style>{`
        @page { size: ${styleLayout.pageSize === 'a4' ? 'A4' : 'letter'}; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .csm-pages { gap: 0 !important; }
          .csm-page-wrap { break-after: page; page-break-after: always; }
          .csm-page-wrap:last-child { break-after: auto; page-break-after: auto; }
          .csm-page-reserve { width: auto !important; height: auto !important; }
          .csm-paper { box-shadow: none !important; border: 0 !important; width: auto !important; min-height: 0 !important; max-width: none !important; transform: none !important; margin: 0 !important; overflow: visible !important; }
          .csm-sec-title, .csm-line { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
