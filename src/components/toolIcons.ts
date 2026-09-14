// Shared icon set for tool cards. Consumed by ToolIcon.astro, which supplies the
// <svg> wrapper — these are inner paths only, so each caller picks its own size.
//
// House rules for adding one: 24×24 viewBox, stroke-width 2, round caps and joins,
// no fill except solid dots (fret markers, active steps), which set fill and
// stroke="none" on the element itself.

export type ToolIconName =
  | 'tuner'
  | 'metronome'
  | 'bass'
  | 'bass-tab'
  | 'guitar'
  | 'circle'
  | 'transpose'
  | 'key'
  | 'chords'
  | 'scales'
  | 'drums'
  | 'piano'
  | 'step-grid'
  | 'sheet'
  | 'drum-tab'

export const TOOL_ICON_PATHS: Record<ToolIconName, string> = {
  tuner: '<path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>',
  metronome: '<polygon points="5 3 19 3 22 21 2 21"/><line x1="12" y1="21" x2="12" y2="8"/><line x1="12" y1="8" x2="7" y2="13"/>',
  bass: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'bass-tab': '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>',
  guitar: '<line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="2" y1="18" x2="22" y2="18"/><line x1="2" y1="21" x2="22" y2="21"/><circle cx="7" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="13" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="2" fill="currentColor" stroke="none"/>',
  circle: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="8.17" y2="8.17"/><line x1="15.83" y1="15.83" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="15.83" y2="8.17"/><line x1="8.17" y1="15.83" x2="4.93" y2="19.07"/>',
  transpose: '<path d="m3 7 5-5 5 5"/><path d="M8 2v20"/><path d="m21 17-5 5-5-5"/><path d="M16 22V2"/>',
  key: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  chords: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><line x1="9" y1="9" x2="21" y2="7"/>',
  scales: '<line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="18" x2="22" y2="18"/><circle cx="6" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="2" fill="currentColor" stroke="none"/><circle cx="14" cy="18" r="2" fill="currentColor" stroke="none"/>',
  drums: '<rect x="3" y="8" width="18" height="10" rx="5"/><line x1="7" y1="3" x2="5" y2="8"/><line x1="17" y1="3" x2="19" y2="8"/>',
  // Keyboard: three white keys with the black ones sitting over the joins. The dividers
  // only run the lower half, the way they do on a real keyboard — drawing them full
  // height turns the whole icon into a grid at 20px.
  piano: '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="8.7" y1="12" x2="8.7" y2="18"/><line x1="15.3" y1="12" x2="15.3" y2="18"/><rect x="7.2" y="6" width="3" height="6" rx="0.6" fill="currentColor" stroke="none"/><rect x="13.8" y="6" width="3" height="6" rx="0.6" fill="currentColor" stroke="none"/>',
  // Two rows of steps, some on and some off — what the drum machine actually looks like.
  'step-grid': '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="7" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1.4"/><circle cx="17" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="7" cy="15" r="1.4"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="17" cy="15" r="1.4"/>',
  // A page with two lines of text under a folded corner: the chord sheet.
  sheet: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  // Three staff lines with cymbal crosses and a drum notehead, the way drum notation writes them.
  'drum-tab': '<line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="18" x2="22" y2="18"/><path d="m5 4 4 4M9 4 5 8"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="m15 16 4 4M19 16l-4 4"/>',
}
