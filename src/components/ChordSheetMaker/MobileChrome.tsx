import { useEffect, useRef, useState } from 'react';
import { playChord, type ChartNotation } from '@/lib/chordSheet/chordSheetCore';
import { sheetToPlainText } from '@/lib/chordSheet/plainText';
import { fileToDataUri } from '@/lib/chordSheet/imageAsset';
import { PRESETS, SWATCHES, PAGE_SIZES, type StyleLayout, type PresetId, type FontRoleName, type FontFamily } from '@/lib/chordSheet/presets';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import type { ChordSheetDoc } from './ChordSheetMaker';
import { ChordProEditor, type ChordProEditorHandle } from './ChordProEditor';

// Mobile-only chrome: bottom tab bar + two "rails" (Key, Layout) + three bottom sheets
// (Style, Font, More/export) + an edit bar + a line-edit modal + a full-screen ChordPro
// source editor. Ported from the reference prototype's mobile mode — see the Phase 3 plan
// in ChordSheetMaker.tsx's history. Mounted only when useIsNarrow() is true; desktop never
// renders this component at all (its toolbar row + source pane cover the same ground).

export type MobileSheetId = '' | 'rail' | 'rail2' | 'style' | 'font' | 'share';

interface Props {
  mobileMode: 'view' | 'edit';
  onMobileModeChange: (m: 'view' | 'edit') => void;
  sheet: MobileSheetId;
  onSheetChange: (s: MobileSheetId) => void;

  doc: ChordSheetDoc;
  displayKey: string;
  chordName: (raw: string) => string;
  palette: string[];
  storeChord: (shown: string) => string;
  onPatch: (p: Partial<ChordSheetDoc>) => void;
  onLayoutChange: (p: Partial<StyleLayout>) => void;
  onSourceChange: (value: string) => void;

  lineEdit: { src: number; value: string } | null;
  onLineEditChange: (value: string) => void;
  onLineEditClose: () => void;
  onLineInsertAfter: () => void;
  onLineDelete: () => void;
  onLineAppendChord: (chord: string) => void;
  onAddLine: () => void;
  onAddSection: () => void;

  sourceOpen: boolean;
  onSourceOpen: () => void;
  onSourceClose: () => void;

  isPublished: boolean;
  songSlug: string | null;
  onStage: () => void;
  flash: (msg: string) => void;
}

const CHART_CHIPS: { value: ChartNotation; label: string; short: string }[] = [
  { value: 'standard', label: 'Standard chart', short: 'A B C' },
  { value: 'number', label: 'Nashville numbers', short: '1 4 5' },
  { value: 'fixed', label: 'Do-Re-Mi (fixed)', short: 'Do fixed' },
  { value: 'movable', label: 'Do-Re-Mi (movable)', short: 'Do movable' },
];

const FONT_ROLES: { value: FontRoleName; label: string }[] = [
  { value: 'heading', label: 'Title' }, { value: 'section', label: 'Section' },
  { value: 'chords', label: 'Chords' }, { value: 'lyrics', label: 'Lyrics' },
];
const FAMILY_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' }, { value: 'hand', label: 'Handwritten' },
];
const INSTRUMENTS: { value: DiagramInstrument | 'piano'; label: string }[] = [
  { value: 'guitar', label: 'Guitar' }, { value: 'ukulele', label: 'Ukulele' }, { value: 'piano', label: 'Piano' },
];
const DIAGRAM_SPOTS: { value: StyleLayout['diagramSpot']; label: string }[] = [
  { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'none', label: 'Hidden' },
];

const TABS: { id: MobileSheetId; icon: string; label: string }[] = [
  { id: 'rail', icon: '🔑', label: 'Key' },
  { id: 'rail2', icon: '▦', label: 'Layout' },
  { id: 'style', icon: '🎨', label: 'Style' },
  { id: 'font', icon: 'A', label: 'Text' },
  { id: 'share', icon: '⋯', label: 'More' },
];

const SHEET_TITLES: Record<string, string> = { style: 'Page style', font: 'Typography', share: 'View, export & share' };
const SHEET_TIERS = ['34vh', '58vh', '88vh'];

function railChip(active: boolean) {
  return `flex-shrink-0 min-h-[44px] rounded-[11px] border px-3.5 text-xs font-semibold ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`;
}

export function MobileChrome({
  mobileMode, onMobileModeChange, sheet, onSheetChange,
  doc, displayKey, chordName, palette, storeChord, onPatch, onLayoutChange, onSourceChange,
  lineEdit, onLineEditChange, onLineEditClose, onLineInsertAfter, onLineDelete, onLineAppendChord, onAddLine, onAddSection,
  sourceOpen, onSourceOpen, onSourceClose,
  isPublished, songSlug, onStage, flash,
}: Props) {
  const [fontRole, setFontRole] = useState<FontRoleName>('lyrics');
  const [tier, setTier] = useState(1);
  useEffect(() => setTier(1), [sheet]);
  const lineInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (lineEdit) requestAnimationFrame(() => lineInputRef.current?.focus());
    // Deliberately keyed on `lineEdit?.src` alone — refocusing on every keystroke (lineEdit.value
    // changes as the user types) would steal the caret back to the end of the textarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineEdit?.src]);
  const sourceEditorRef = useRef<ChordProEditorHandle>(null);
  useEffect(() => {
    if (sourceOpen) requestAnimationFrame(() => sourceEditorRef.current?.focus());
  }, [sourceOpen]);

  const railOpen = sheet === 'rail';
  const layoutRailOpen = sheet === 'rail2';
  const editBarOpen = mobileMode === 'edit' && !railOpen && !layoutRailOpen;
  const sheetOpen = sheet !== '' && !railOpen && !layoutRailOpen;
  const railBottom = 'calc(66px + env(safe-area-inset-bottom))';
  const role = doc.layout.fonts[fontRole];

  function patchFont(patch: Partial<typeof role>) {
    onLayoutChange({ fonts: { ...doc.layout.fonts, [fontRole]: { ...role, ...patch } } });
  }

  function applyPreset(id: PresetId) {
    const p = PRESETS[id];
    onLayoutChange({ preset: id, fonts: JSON.parse(JSON.stringify(p.fonts)), columns: p.columns, scale: p.scale });
  }

  const logoInputRef = useRef<HTMLInputElement>(null);
  const wmInputRef = useRef<HTMLInputElement>(null);
  async function pickLogo(file: File | undefined) {
    if (!file) return;
    try { onLayoutChange({ assets: { ...doc.layout.assets, logo: await fileToDataUri(file, 300) } }); } catch { /* not a readable image — ignore */ }
  }
  async function pickWatermark(file: File | undefined) {
    if (!file) return;
    try { onLayoutChange({ assets: { ...doc.layout.assets, watermark: await fileToDataUri(file, 900) } }); } catch { /* not a readable image — ignore */ }
  }

  async function runExport(id: string) {
    switch (id) {
      case 'copy': {
        const text = sheetToPlainText(doc.text, displayKey, doc.chartType, chordName);
        await navigator.clipboard?.writeText(text);
        flash('Sheet copied as text');
        break;
      }
      case 'chordpro':
        await navigator.clipboard?.writeText(doc.text);
        flash('ChordPro source copied');
        break;
      case 'print':
        window.print();
        break;
      case 'download': {
        const blob = new Blob([doc.text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${(doc.title || 'chord-sheet').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase()}.chordpro`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        flash('Downloaded');
        break;
      }
      case 'share':
        if (songSlug && isPublished) {
          await navigator.clipboard?.writeText(`${location.origin}/chord-sheet-maker/${songSlug}`);
          flash('Share link copied');
        } else {
          flash('Publish this sheet first to get a share link');
        }
        break;
      case 'email': {
        const text = sheetToPlainText(doc.text, displayKey, doc.chartType, chordName);
        location.href = `mailto:?subject=${encodeURIComponent(doc.title)}&body=${encodeURIComponent(text)}`;
        break;
      }
    }
  }

  return (
    <>
      {railOpen && (
        <div
          className="csm-mobile-only no-print fixed left-0 right-0 z-[54] flex items-center gap-2 overflow-x-auto border-t border-border bg-card px-3 py-2.5 shadow-[0_-3px_14px_rgba(0,0,0,0.06)]"
          style={{ bottom: railBottom }}
        >
          <button type="button" onClick={() => onPatch({ semi: doc.semi - 1 })} className="h-11 w-[46px] flex-shrink-0 rounded-[11px] border border-border bg-background text-xl">−</button>
          <span className="min-w-[92px] flex-shrink-0 text-center font-mono text-[15px] font-bold text-primary">{displayKey}</span>
          <button type="button" onClick={() => onPatch({ semi: doc.semi + 1 })} className="h-11 w-[46px] flex-shrink-0 rounded-[11px] border border-border bg-background text-xl">+</button>
          <span className="h-7 w-px flex-shrink-0 bg-border" />
          <span className="flex-shrink-0 text-[10px] font-bold tracking-wider text-muted-foreground">CAPO</span>
          {Array.from({ length: 12 }, (_, n) => n).map((n) => (
            <button key={n} type="button" onClick={() => onPatch({ capo: n })} className={railChip(doc.capo === n)}>{n === 0 ? 'None' : n}</button>
          ))}
          <span className="h-7 w-px flex-shrink-0 bg-border" />
          {CHART_CHIPS.map((c) => (
            <button key={c.value} type="button" onClick={() => onPatch({ chartType: c.value })} className={`${railChip(doc.chartType === c.value)} whitespace-nowrap`}>{c.short}</button>
          ))}
        </div>
      )}

      {layoutRailOpen && (
        <div
          className="csm-mobile-only no-print fixed left-0 right-0 z-[54] flex items-center gap-2.5 overflow-x-auto border-t border-border bg-card px-3 py-2.5 shadow-[0_-3px_14px_rgba(0,0,0,0.06)]"
          style={{ bottom: railBottom }}
        >
          <span className="flex-shrink-0 text-[10px] font-bold tracking-wider text-muted-foreground">COLS</span>
          {[1, 2].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onLayoutChange({ columns: n as 1 | 2 })}
              className={`flex h-11 w-12 flex-shrink-0 items-center justify-center gap-[3px] rounded-[11px] border px-2 ${doc.layout.columns === n ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}
            >
              <span className={`h-[18px] flex-1 rounded-sm ${doc.layout.columns === n ? 'bg-primary' : 'bg-muted-foreground'} opacity-80`} />
              {n === 2 && <span className={`h-[18px] flex-1 rounded-sm ${doc.layout.columns === n ? 'bg-primary' : 'bg-muted-foreground'} opacity-80`} />}
            </button>
          ))}
          <span className="h-7 w-px flex-shrink-0 bg-border" />
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onLayoutChange({ align: a })}
              className={`flex h-11 w-[46px] flex-shrink-0 items-center justify-center rounded-[11px] border text-sm ${doc.layout.align === a ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
            >
              {a === 'left' ? '⇤' : a === 'center' ? '⇔' : '⇥'}
            </button>
          ))}
          <span className="h-7 w-px flex-shrink-0 bg-border" />
          <span className="flex-shrink-0 text-[10px] font-bold tracking-wider text-muted-foreground">{doc.layout.scale}%</span>
          <input
            type="range" min={70} max={180} step={5} value={doc.layout.scale}
            onChange={(e) => onLayoutChange({ scale: Number(e.target.value) })}
            className="h-1.5 w-[130px] flex-shrink-0 accent-primary"
          />
        </div>
      )}

      {editBarOpen && (
        <div
          className="csm-mobile-only no-print fixed left-0 right-0 z-[54] flex items-center gap-2 overflow-x-auto border-t border-primary/30 bg-primary/[0.06] px-3 py-2.5"
          style={{ bottom: railBottom }}
        >
          <span className="flex-shrink-0 text-[11px] font-bold tracking-wide text-primary">EDITING</span>
          <button type="button" onClick={onAddLine} className="min-h-[44px] flex-shrink-0 rounded-[11px] border border-primary/40 bg-card px-4 text-[13px] font-semibold text-primary">+ Line</button>
          <button type="button" onClick={onAddSection} className="min-h-[44px] flex-shrink-0 rounded-[11px] border border-primary/40 bg-card px-4 text-[13px] font-semibold text-primary">+ Section</button>
          <button type="button" onClick={onSourceOpen} className="min-h-[44px] flex-shrink-0 rounded-[11px] border border-border bg-card px-4 text-[13px] font-semibold text-muted-foreground">Full text</button>
        </div>
      )}

      <div
        className="csm-mobile-only no-print fixed inset-x-0 bottom-0 z-[55] flex gap-1 border-t border-border bg-card px-2.5 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.07)]"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSheetChange(sheet === t.id ? '' : t.id)}
            className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-[3px] rounded-[11px] px-0.5 ${sheet === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
          >
            <span className="text-[17px] leading-none">{t.icon}</span>
            <span className="text-[9.5px] font-semibold tracking-wide">{t.label}</span>
          </button>
        ))}
      </div>

      {sheetOpen && (
        <div
          className="csm-mobile-only no-print fixed inset-0 z-[56] flex items-end bg-black/40"
          onClick={() => onSheetChange('')}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full overflow-auto rounded-t-[20px] bg-card px-4"
            style={{ maxHeight: SHEET_TIERS[tier] ?? '58vh', paddingBottom: 'calc(22px + env(safe-area-inset-bottom))', transition: 'max-height 0.2s ease' }}
          >
            <button type="button" onClick={() => setTier((n) => (n + 1) % 3)} className="flex w-full justify-center py-2 pb-3" title="Resize panel">
              <span className="h-1 w-[38px] rounded-full bg-border" />
            </button>
            <div className="mb-3 text-xs font-bold text-foreground">{SHEET_TITLES[sheet]}</div>

            {sheet === 'style' && (
              <div className="pb-2">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Print paper</div>
                <div className="mb-4 flex gap-2">
                  {PAGE_SIZES.map((p) => (
                    <button key={p.value} type="button" onClick={() => onLayoutChange({ pageSize: p.value })} className={`min-h-[44px] flex-1 rounded-[11px] border text-[13px] font-bold ${doc.layout.pageSize === p.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground'}`}>{p.label}</button>
                  ))}
                </div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Page style</div>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyPreset(id)}
                      className={`relative min-h-16 rounded-xl border p-2.5 text-left ${doc.layout.preset === id ? 'border-primary bg-primary/10' : 'border-border'}`}
                      style={{ background: doc.layout.preset === id ? undefined : PRESETS[id].paper }}
                    >
                      <span className="mb-1.5 block h-5 rounded border border-border" style={{ background: PRESETS[id].paper }} />
                      <span className="text-[12.5px] font-semibold" style={{ color: doc.layout.preset === id ? undefined : PRESETS[id].ink }}>{PRESETS[id].label}</span>
                      {doc.layout.preset === id && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">✓</span>}
                    </button>
                  ))}
                </div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Diagrams · {doc.instrument}</div>
                <div className="mb-1.5 flex gap-1.5">
                  {INSTRUMENTS.map((i) => (
                    <button key={i.value} type="button" onClick={() => onPatch({ instrument: i.value })} className={`min-h-[46px] flex-1 rounded-[11px] border text-[12.5px] font-semibold ${doc.instrument === i.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground'}`}>{i.label}</button>
                  ))}
                </div>
                <div className="mb-4 flex gap-1.5">
                  {DIAGRAM_SPOTS.map((d) => (
                    <button key={d.value} type="button" onClick={() => onLayoutChange({ diagramSpot: d.value })} className={`min-h-[44px] flex-1 rounded-[11px] border text-[12.5px] font-semibold ${doc.layout.diagramSpot === d.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>{d.label}</button>
                  ))}
                </div>

                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Background</div>
                <div className="mb-2 flex gap-1.5">
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
                  <button type="button" onClick={() => logoInputRef.current?.click()} className="min-h-[44px] flex-1 rounded-[11px] border border-dashed border-border text-[12.5px] font-semibold text-muted-foreground">
                    {doc.layout.assets.logo ? '✓ Logo' : '+ Logo'}
                  </button>
                  <input ref={wmInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickWatermark(e.target.files?.[0])} />
                  <button type="button" onClick={() => wmInputRef.current?.click()} className="min-h-[44px] flex-1 rounded-[11px] border border-dashed border-border text-[12.5px] font-semibold text-muted-foreground">
                    {doc.layout.assets.watermark ? '✓ Watermark' : '+ Watermark'}
                  </button>
                </div>
                {doc.layout.assets.logo && (
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Logo</span>
                    <input type="range" min={24} max={90} value={doc.layout.assets.logoH ?? 46} onChange={(e) => onLayoutChange({ assets: { ...doc.layout.assets, logoH: Number(e.target.value) } })} className="flex-1 accent-primary" />
                    <button type="button" onClick={() => onLayoutChange({ assets: { ...doc.layout.assets, logo: undefined } })} className="text-muted-foreground">×</button>
                  </div>
                )}
                {doc.layout.assets.watermark && (
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Watermark</span>
                    <input type="range" min={3} max={40} value={doc.layout.assets.wmOpacity ?? 12} onChange={(e) => onLayoutChange({ assets: { ...doc.layout.assets, wmOpacity: Number(e.target.value) } })} className="flex-1 accent-primary" />
                    <button type="button" onClick={() => onLayoutChange({ assets: { ...doc.layout.assets, watermark: undefined } })} className="text-muted-foreground">×</button>
                  </div>
                )}
              </div>
            )}

            {sheet === 'font' && (
              <div className="pb-2">
                <div className="mb-3 flex gap-1.5 overflow-x-auto">
                  {FONT_ROLES.map((r) => (
                    <button key={r.value} type="button" onClick={() => setFontRole(r.value)} className={`min-h-[40px] flex-shrink-0 rounded-[11px] border px-3.5 text-xs font-semibold ${fontRole === r.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground'}`}>{r.label}</button>
                  ))}
                </div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Family</div>
                <div className="mb-4 grid grid-cols-2 gap-1.5">
                  {FAMILY_OPTIONS.map((f) => (
                    <button key={f.value} type="button" onClick={() => patchFont({ family: f.value })} className={`min-h-11 rounded-[11px] px-3 text-left text-sm ${role.family === f.value ? 'bg-primary/10 text-primary' : 'bg-background text-foreground'}`}>{f.label}</button>
                  ))}
                </div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Size · {role.scale}%</div>
                <input type="range" min={60} max={180} step={5} value={role.scale} onChange={(e) => patchFont({ scale: Number(e.target.value) })} className="mb-4 w-full accent-primary" />
                <div className="flex items-center gap-2 pb-1">
                  <button type="button" onClick={() => patchFont({ bold: !role.bold })} className={`flex h-10 w-10 items-center justify-center rounded-[11px] border text-sm font-bold ${role.bold ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>B</button>
                  {SWATCHES.map((s) => (
                    <button key={s.value} type="button" title={s.title} onClick={() => patchFont({ color: s.value })} className="h-8 w-8 rounded-full border-2" style={{ background: s.value, borderColor: role.color === s.value ? PRESETS[doc.layout.preset].ink : 'transparent' }} />
                  ))}
                </div>
              </div>
            )}

            {sheet === 'share' && (
              <div className="pb-2">
                <div className="mb-4 flex gap-2">
                  <button type="button" onClick={() => { onSheetChange(''); onStage(); }} className="min-h-12 flex-1 rounded-[11px] bg-primary text-sm font-bold text-primary-foreground">Stage mode</button>
                  <button type="button" onClick={() => { onSheetChange(''); onSourceOpen(); }} className="min-h-12 flex-1 rounded-[11px] border border-border text-sm font-semibold text-foreground">Edit ChordPro</button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    { id: 'copy', label: 'Copy sheet as text' },
                    { id: 'chordpro', label: 'Copy ChordPro source' },
                    { id: 'print', label: 'Print or save as PDF' },
                    { id: 'download', label: 'Download .chordpro file' },
                    { id: 'share', label: 'Copy a share link' },
                    { id: 'email', label: 'Email this sheet' },
                  ].map((a) => (
                    <button key={a.id} type="button" onClick={() => runExport(a.id)} className="min-h-12 rounded-[11px] border border-border bg-background px-4 text-left text-sm font-semibold text-foreground hover:border-primary/40">{a.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {lineEdit && (
        <div className="csm-mobile-only no-print fixed inset-0 z-[58] flex items-end bg-black/40" onClick={onLineEditClose}>
          <div onClick={(e) => e.stopPropagation()} className="flex w-full flex-col gap-3 rounded-t-[20px] bg-card p-4" style={{ paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Edit line</span>
              <button type="button" onClick={onLineEditClose} className="text-lg text-muted-foreground">×</button>
            </div>
            <textarea
              ref={lineInputRef}
              value={lineEdit.value}
              onChange={(e) => onLineEditChange(e.target.value)}
              spellCheck={false}
              rows={2}
              className="resize-none rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary/50"
            />
            <div className="flex flex-wrap gap-1.5">
              <span className="mr-1 self-center text-[10px] font-bold text-muted-foreground">IN KEY</span>
              {palette.map((c) => (
                <button key={c} type="button" onClick={() => { playChord(c); onLineAppendChord(storeChord(c)); }} className="rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary">{c}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onLineInsertAfter} className="min-h-11 flex-1 rounded-[11px] border border-border text-xs font-semibold text-foreground">+ Line below</button>
              <button type="button" onClick={onLineDelete} className="min-h-11 flex-1 rounded-[11px] border border-destructive/40 text-xs font-semibold text-destructive">Delete</button>
              <button type="button" onClick={onLineEditClose} className="min-h-11 flex-1 rounded-[11px] bg-primary text-xs font-bold text-primary-foreground">Done</button>
            </div>
          </div>
        </div>
      )}

      {sourceOpen && (
        <div className="csm-mobile-only no-print fixed inset-0 z-[57] flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-bold text-foreground">ChordPro source</span>
            <button type="button" onClick={onSourceClose} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">Done</button>
          </div>
          <ChordProEditor
            ref={sourceEditorRef}
            value={doc.text}
            onChange={onSourceChange}
            className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
          />
        </div>
      )}
    </>
  );
}
