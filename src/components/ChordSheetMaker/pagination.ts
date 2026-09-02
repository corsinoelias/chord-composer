import type { DocSection, DocLine } from '@/lib/chordSheet/chordSheetCore';

// Pure chunking logic for the Canva-style paginated preview — no DOM, no React. Takes a
// flattened section/line list plus real measured heights (from PaginatedPaper's hidden
// measurer) and decides where each page break falls.

export type PageUnit =
  | { kind: 'title'; key: string; si: number; name: string }
  | { kind: 'line'; key: string; si: number; line: DocLine };

export function flattenSections(sections: DocSection[]): PageUnit[] {
  const out: PageUnit[] = [];
  sections.forEach((sec, si) => {
    if (sec.name) out.push({ kind: 'title', key: `t${si}`, si, name: sec.name });
    sec.lines.forEach((line) => out.push({ kind: 'line', key: `l${line.src}`, si, line }));
  });
  return out;
}

/** Greedy pagination: walk the flat unit list, start a new page whenever the next unit
 *  would overflow the current page's remaining budget. `budgetForPage` lets page 1 reserve
 *  room for the title/artist header and a top diagram strip that only it carries. A lone
 *  section title stranded at the bottom of a page is pulled onto the next one, so a heading
 *  never separates from its first line. Always places at least one unit per page, even if
 *  it alone exceeds the budget (a huge scale factor, say) — a page that's too short to hold
 *  anything isn't a page. */
export function paginateUnits(units: PageUnit[], heights: number[], budgetForPage: (pageIndex: number) => number): PageUnit[][] {
  const pages: PageUnit[][] = [];
  let current: PageUnit[] = [];
  let used = 0;
  for (let i = 0; i < units.length; i++) {
    const h = heights[i] ?? 0;
    const budget = budgetForPage(pages.length);
    if (current.length && used + h > budget) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(units[i]);
    used += h;
  }
  if (current.length) pages.push(current);

  for (let p = 0; p < pages.length - 1; p++) {
    const page = pages[p];
    const last = page[page.length - 1];
    if (last && last.kind === 'title') {
      pages[p + 1].unshift(page.pop()!);
    }
  }
  return pages.filter((p) => p.length > 0);
}

/** Regroups one page's flat units back into section-shaped chunks for rendering, so
 *  consecutive lines sharing a section index render inside one wrapper — and a section
 *  continuing from a previous page doesn't repeat its heading (its title unit stayed on the
 *  earlier page). */
export function groupPageBySection(page: PageUnit[]): { si: number; title: string | null; lines: PageUnit[] }[] {
  const groups: { si: number; title: string | null; lines: PageUnit[] }[] = [];
  for (const unit of page) {
    if (unit.kind === 'title') {
      groups.push({ si: unit.si, title: unit.name, lines: [] });
      continue;
    }
    let g = groups[groups.length - 1];
    if (!g || g.si !== unit.si) { g = { si: unit.si, title: null, lines: [] }; groups.push(g); }
    g.lines.push(unit);
  }
  return groups;
}
