declare function gtag(...args: unknown[]): void;

// GA4 reads these event parameters as traffic attribution, not as custom dimensions:
// sending one overwrites the session's real acquisition source. Until 2026-08-12 several
// events here sent a param literally named `source`, which is why 'save_cta', 'cta_block',
// 'chart', 'aside' and 'export_nudge' turned up as sessionSource with medium '(not set)'
// and filled the "Unassigned" channel — ~2% of sessions, all of them high-intent. Use
// `entry_point` instead. This list is the backstop so it can't come back by accident;
// data collected before the rename stays wrong (GA4 does not reprocess).
const RESERVED_GA4_PARAMS = ['source', 'medium', 'campaign', 'term', 'content'];

// Search terms are the only free-text user input this file ever sends, so they're the only
// place GA4's ban on PII can realistically be violated (someone pastes an email into the
// song search). Truncated because GA4 silently drops event params over 100 bytes, which
// would lose the whole term rather than the tail.
function cleanSearchTerm(term: string): string | undefined {
  const normalized = term.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes('@')) return '[redacted]';
  return normalized.slice(0, 80);
}

function track(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof gtag === 'undefined') return;
  if (params) {
    for (const key of RESERVED_GA4_PARAMS) {
      if (key in params) {
        delete params[key];
        console.warn(`[analytics] dropped reserved GA4 param "${key}" from ${eventName} — use entry_point`);
      }
    }
  }
  gtag('event', eventName, params);
}

export const analytics = {
  // Auth — `entry_point` identifies which entry point opened the modal (e.g.
  // 'save_cta', 'export_nudge') so conversion can be compared per entry point.
  signUp: (entryPoint?: string) => track('sign_up', { method: 'email', entry_point: entryPoint }),
  login: (entryPoint?: string) => track('login', { method: 'email', entry_point: entryPoint }),
  logout: () => track('logout'),
  saveCtaClicked: () => track('save_cta_clicked'),
  authModalCancelled: (entryPoint?: string) => track('auth_modal_cancelled', { entry_point: entryPoint }),
  exportNudgeShown: () => track('export_nudge_shown'),
  exportNudgeClicked: () => track('export_nudge_clicked'),

  // Song sharing. A share link is where brand-new people enter the editor, so the
  // funnel is tracked end to end and separately from the organic one: opened (a
  // visitor landed on someone's song) → forked (they edited it, making it theirs) →
  // sign_up with entry_point 'shared_song_fork' (they kept it).
  songShared: () => track('song_shared'),
  songUnshared: () => track('song_unshared'),
  sharedSongOpened: () => track('shared_song_opened'),
  sharedSongForked: () => track('shared_song_forked'),
  forkDraftRestored: () => track('fork_draft_restored'),

  // Songs — three distinct ways to hear audio on a song page. They're tracked
  // separately because they answer different questions: `play_song` is "play the
  // whole chart", `play_song_section` is "play just the chorus" (what someone
  // learning a part actually does), and `play_chord_preview` is "what does this
  // one chord sound like". Counting only `play_song` undercounts audio usage.
  playSong: (songSlug: string, songTitle: string) => track('play_song', { song_slug: songSlug, song_title: songTitle }),
  playSongSection: (songSlug: string, sectionName: string) => track('play_song_section', { song_slug: songSlug, section_name: sectionName }),
  playChordPreview: (songSlug: string, chord: string, entryPoint: 'chart' | 'aside') => track('play_chord_preview', { song_slug: songSlug, chord, entry_point: entryPoint }),
  songPdfExported: (songSlug: string) => track('song_pdf_exported', { song_slug: songSlug }),
  // Song page → editor. This is the SEO-traffic-to-product conversion: the visitor
  // arrived to read a chart and leaves with it loaded in the editor. Fires on an <a>
  // that navigates away — gtag sends via navigator.sendBeacon, which survives unload.
  // `entry_point` separates the three entry points, which are not comparable: 'player_bar'
  // is a small link in the transport row, 'cta_block' is the panel under the chart,
  // 'practice_tools' is a card two thirds down the page. The two Astro-rendered ones
  // fire the same event from an inline script in songs/[slug].astro, not from here.
  songEditorOpened: (songSlug: string, entryPoint: 'player_bar' | 'cta_block' | 'practice_tools') =>
    track('song_editor_opened', { song_slug: songSlug, entry_point: entryPoint }),

  // Editor
  playProgression: (styleId: string) => track('play_progression', { style_id: styleId }),
  exportWav: () => track('export_wav'),
  exportMidi: () => track('export_midi'),
  styleChanged: (styleId: string) => track('style_changed', { style_id: styleId }),
  templateUsed: (templateName: string) => track('template_used', { template_name: templateName }),

  // Editor — structure
  chordAdded: () => track('chord_added'),
  chordRemoved: () => track('chord_removed'),
  chordDuplicated: () => track('chord_duplicated'),
  chordsReordered: () => track('chords_reordered'),
  sectionAdded: () => track('section_added'),
  sectionDeleted: () => track('section_deleted'),
  sectionDuplicated: () => track('section_duplicated'),
  sectionMoved: () => track('section_moved'),

  // Editor — playback/sound
  transposed: (semitones: number) => track('transposed', { semitones }),
  metronomeToggled: (enabled: boolean) => track('metronome_toggled', { enabled }),
  variationChanged: (instrument: string) => track('variation_changed', { instrument }),
  effectChanged: (effect: 'eq' | 'reverb' | 'compressor') => track('effect_changed', { effect }),
  customStyleSaved: (mode: string) => track('custom_style_saved', { mode }),

  // Song library search (/songs/). `view_search_results` is GA4's own recommended event
  // name and `search_term` is the param its built-in Site search reporting reads — a
  // custom event name here would be invisible until someone registered a dimension for it.
  //
  // Both events fire only on a *settled* query (see the debounce in songs/index.astro),
  // never per keystroke: typing "wonderwall" one letter at a time would otherwise report
  // nine searches, eight of them for prefixes nobody searched for, and the top-terms
  // report would rank single letters.
  songSearch: (term: string, resultCount: number) =>
    track('view_search_results', { search_term: cleanSearchTerm(term), result_count: resultCount }),
  // The reason the search is worth building: a term that matched nothing is a song someone
  // came here for and the library doesn't have. Kept as its own event, not a result_count=0
  // filter on the one above, so the content-gap list is a report and not an exploration.
  // Needs a `search_term` custom dimension registered in GA4 to be queryable.
  songSearchNoResults: (term: string) =>
    track('search_no_results', { search_term: cleanSearchTerm(term) }),
  // Facet filters on the same page, kept separate from the search events because they
  // answer a different question: search says which songs people want, a filter says which
  // *axis* they browse by. If key turns out to be the axis people reach for, that's the
  // argument for a /songs/key/<k>/ landing page — and if it isn't, that's the argument
  // against building 12 of them. Only fires when a filter is applied, not when cleared.
  songFilterUsed: (filterType: 'key', filterValue: string, resultCount: number) =>
    track('song_filter_used', { filter_type: filterType, filter_value: filterValue, result_count: resultCount }),
  // Song requests. Opened and submitted are tracked separately because the gap between
  // them is the only way to tell "nobody wants this" from "the form is too much work" —
  // and `entry_point` separates the two that are not comparable: 'search_empty' is a
  // pre-filled form shown to someone whose search just failed, 'library' is a cold link at
  // the bottom of the page. The request itself lands in Supabase, not here; these events
  // only measure the funnel.
  songRequestOpened: (entryPoint: 'search_empty' | 'library') =>
    track('song_request_opened', { entry_point: entryPoint }),
  songRequested: (entryPoint: 'search_empty' | 'library') =>
    track('song_requested', { entry_point: entryPoint }),

  // Standalone tool pages
  toolWidgetUsed: (tool: string) => track('tool_widget_used', { tool }),

  // Bass tab
  bassTabPlay: () => track('bass_tab_play'),
  bassTabExport: (format: string) => track('bass_tab_export', { format }),
  bassTabPresetLoaded: (presetName: string) => track('bass_tab_preset_loaded', { preset_name: presetName }),
  bassTabShared: () => track('bass_tab_shared'),
};
