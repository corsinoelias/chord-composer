import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DocLine, DocSection } from '@/lib/chordSheet/chordSheetCore';
import type { StyleLayout } from '@/lib/chordSheet/presets';
import type { DiagramInstrument } from '@/lib/chordSheet/chordDiagramLookup';
import { PAGE_PX, PAGE_PAD_X, PAGE_PAD_Y, PAGE_GAP } from '@/lib/chordSheet/pagePixels';
import { makeRoleStyle, presetPaper, presetRule, presetMeta } from './sheetChrome';
import { DiagramStrip } from './DiagramStrip';
import { flattenSections, paginateUnits, groupPageBySection, type PageUnit } from './pagination';
import { renderStaticLine, type StaticLineCtx } from './staticLine';
import { useFitScale } from './useFitScale';

// The Canva-style multi-page preview: real 96dpi page cards on a gray canvas, auto-fit-
// scaled to the pane, with genuine pagination — content is measured off-screen (see the
// hidden block below) and chunked into pages by pagination.ts, not just visually clipped.
// Shared by SheetPaper (paginate=true — the public chart + editor's Print/PDF button) and
// InteractiveSheet (the editor's live, draggable preview): both flow the same section/line
// list, they just render a `line` differently (static span vs. drag handle).

interface Props {
  layout: StyleLayout;
  title: string;
  artist: string;
  displayKey: string;
  capo: number;
  instrument: DiagramInstrument | 'piano';
  diagramChords: string[];
  sections: DocSection[];
  /** Real per-line render for the visible pages. */
  renderLine: (line: DocLine) => ReactNode;
  /** Used only for the hidden measurement pass — always the plain static renderer, even
   *  when `renderLine` is interactive, so off-screen chips never carry `data-csm-*`
   *  attributes the drag engine would treat as real drop targets. */
  staticCtx: StaticLineCtx;
}

function HeaderBlock({ layout, title, artist, displayKey, capo, roleStyle }: {
  layout: StyleLayout; title: string; artist: string; displayKey: string; capo: number;
  roleStyle: ReturnType<typeof makeRoleStyle>;
}) {
  const { logo, logoH = 46 } = layout.assets;
  return (
    <div className="mb-5 flex items-center justify-between gap-4 border-b pb-4" style={{ borderColor: presetRule(layout) }}>
      <div className="flex items-center gap-3">
        {logo && <img src={logo} alt="" className="shrink-0 object-contain" style={{ height: logoH }} />}
        <div>
          <h1 style={roleStyle('heading')}>{title || 'Untitled'}</h1>
          {artist && <p className="mt-0.5 text-sm" style={{ color: presetMeta(layout) }}>{artist}</p>}
        </div>
      </div>
      <div className="shrink-0 text-right font-mono text-xs leading-relaxed" style={{ color: presetMeta(layout) }}>
        <div>Key <strong style={{ fontSize: '13px', color: layout.fonts.chords.color }}>{displayKey}</strong></div>
        {capo > 0 && <div>Capo {capo}</div>}
      </div>
    </div>
  );
}

interface PageCardProps {
  layout: StyleLayout;
  pageW: number;
  pageH: number;
  scale: number;
  pageNum: number;
  totalPages: number;
  children: ReactNode;
}

function PageCard({ layout, pageW, pageH, scale, pageNum, totalPages, children }: PageCardProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [innerH, setInnerH] = useState(pageH);
  // Deliberately no dependency array — re-checks the real rendered height after every
  // render (content, scale, or column layout can all change it) and only calls setInnerH
  // when it actually moved, so this converges in one extra render rather than looping.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const h = innerRef.current?.offsetHeight;
    if (h && Math.abs(h - innerH) > 0.5) setInnerH(h);
  });
  const { watermark, wmScale = 60, wmOpacity = 12 } = layout.assets;
  return (
    <div className="csm-page-wrap flex w-full flex-col items-center">
      <div className="csm-page-reserve" style={{ width: pageW * scale, height: innerH * scale }}>
        <div
          ref={innerRef}
          className="csm-paper relative overflow-hidden rounded-lg border shadow-[0_10px_34px_rgba(0,0,0,0.14)]"
          style={{
            width: pageW, minHeight: pageH,
            padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px`,
            background: presetPaper(layout), borderColor: presetRule(layout),
            transform: `scale(${scale})`, transformOrigin: 'top left',
          }}
        >
          {watermark && (
            <img
              src={watermark}
              alt=""
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 select-none"
              style={{ width: `${wmScale}%`, opacity: wmOpacity / 100, transform: 'translate(-50%, -50%)', zIndex: 0 }}
            />
          )}
          <div className="relative" style={{ zIndex: 1 }}>{children}</div>
        </div>
      </div>
      <span className="no-print mt-2.5 text-[11px] font-medium text-muted-foreground">Page {pageNum} of {totalPages}</span>
    </div>
  );
}

export function PaginatedPaper({ layout, title, artist, displayKey, capo, instrument, diagramChords, sections, renderLine, staticCtx }: Props) {
  const roleStyle = makeRoleStyle(layout);
  const page = PAGE_PX[layout.pageSize];
  const contentW = page.w - PAGE_PAD_X * 2;
  const contentH = page.h - PAGE_PAD_Y * 2;
  const colW = layout.columns === 2 ? (contentW - 32) / 2 : contentW;

  const { ref: stackRef, scale } = useFitScale(page.w);

  const units = useMemo(() => flattenSections(sections), [sections]);

  const headerRef = useRef<HTMLDivElement>(null);
  const topDiagRef = useRef<HTMLDivElement>(null);
  const unitRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pages, setPages] = useState<PageUnit[][]>([[]]);

  const diagramsStrip = <DiagramStrip layout={layout} instrument={instrument} chords={diagramChords} chartType={staticCtx.chartType} displayKey={displayKey} />;

  useLayoutEffect(() => {
    const headerH = headerRef.current?.offsetHeight ?? 0;
    const topDiagH = layout.diagramSpot === 'top' ? (topDiagRef.current?.offsetHeight ?? 0) : 0;
    const tops = unitRefs.current.map((el) => el?.offsetTop ?? 0);
    const heights = units.map((_, i) => {
      if (i === units.length - 1) return unitRefs.current[i]?.offsetHeight ?? 0;
      return Math.max(0, tops[i + 1] - tops[i]);
    });
    // Page 1 loses some of its budget to the header + a top diagram strip, which only it
    // carries; every other page gets the full content height. `* columns` because a 2-col
    // page holds roughly twice the linear content (the browser balances the actual visual
    // split within the page — this only decides how much total content belongs there).
    const page1Budget = Math.max(1, (contentH - headerH - topDiagH - 24) * layout.columns);
    const restBudget = Math.max(1, contentH * layout.columns);
    const chunked = paginateUnits(units, heights, (pi) => (pi === 0 ? page1Budget : restBudget));
    setPages(chunked.length ? chunked : [[]]);
    // Re-measure whenever the flowed content, page geometry, or typography changes.
  }, [units, contentW, contentH, colW, layout.columns, layout.diagramSpot, layout.scale, layout.fonts, layout.align, layout.preset]);

  const totalPages = pages.length;

  return (
    <div ref={stackRef} className="csm-pages flex w-full flex-col items-center" style={{ gap: PAGE_GAP }}>
      {/* Hidden measurer: same typography and column width as the real thing, no
          data-csm-* attributes (see staticCtx above). `fixed` (not `absolute`) so it's
          positioned against the viewport, not `.csm-pages` — an absolutely-positioned
          off-screen box would otherwise inflate the scrollable pane's own scroll bounds. */}
      <div aria-hidden className="pointer-events-none fixed left-[-99999px] top-0">
        <div ref={headerRef} style={{ width: contentW }}>
          <HeaderBlock layout={layout} title={title} artist={artist} displayKey={displayKey} capo={capo} roleStyle={roleStyle} />
        </div>
        {layout.diagramSpot === 'top' && <div ref={topDiagRef} style={{ width: contentW }}>{diagramsStrip}</div>}
        <div style={{ width: colW }}>
          {units.map((u, i) => (
            <div key={u.key} ref={(el) => { unitRefs.current[i] = el; }}>
              {u.kind === 'title'
                ? <div className="csm-sec-title mb-2 uppercase tracking-widest" style={{ ...roleStyle('section'), fontSize: '10px' }}>{u.name}</div>
                : renderStaticLine(u.line, u.key, staticCtx)}
            </div>
          ))}
        </div>
      </div>

      {pages.map((pageUnits, pi) => (
        <PageCard key={pi} layout={layout} pageW={page.w} pageH={page.h} scale={scale} pageNum={pi + 1} totalPages={totalPages}>
          {pi === 0 && <HeaderBlock layout={layout} title={title} artist={artist} displayKey={displayKey} capo={capo} roleStyle={roleStyle} />}
          {pi === 0 && layout.diagramSpot === 'top' && diagramsStrip}
          <div style={layout.columns === 2 ? { columnCount: 2, columnGap: '2rem' } : undefined}>
            <div className="space-y-5">
              {groupPageBySection(pageUnits).map((g, gi) => (
                <div key={gi} style={{ breakInside: 'avoid' }}>
                  {g.title && <div className="csm-sec-title mb-2 uppercase tracking-widest" style={{ ...roleStyle('section'), fontSize: '10px' }}>{g.title}</div>}
                  <div className="flex flex-col gap-3">
                    {g.lines.map((u) => (u.kind === 'line' ? <Fragment key={u.key}>{renderLine(u.line)}</Fragment> : null))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {pi === totalPages - 1 && layout.diagramSpot === 'bottom' && diagramsStrip}
        </PageCard>
      ))}
    </div>
  );
}
