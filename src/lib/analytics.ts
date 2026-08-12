declare function gtag(...args: unknown[]): void;

// GA4 reads these event parameters as traffic attribution, not as custom dimensions:
// sending one overwrites the session's real acquisition source. Until 2026-08-12 several
// events here sent a param literally named `source`, which is why 'save_cta', 'cta_block',
// 'chart', 'aside' and 'export_nudge' turned up as sessionSource with medium '(not set)'
// and filled the "Unassigned" channel — ~2% of sessions, all of them high-intent. Use
// `entry_point` instead. This list is the backstop so it can't come back by accident;
// data collected before the rename stays wrong (GA4 does not reprocess).
const RESERVED_GA4_PARAMS = ['source', 'medium', 'campaign', 'term', 'content'];

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

  // Standalone tool pages
  toolWidgetUsed: (tool: string) => track('tool_widget_used', { tool }),

  // Bass tab
  bassTabPlay: () => track('bass_tab_play'),
  bassTabExport: (format: string) => track('bass_tab_export', { format }),
  bassTabPresetLoaded: (presetName: string) => track('bass_tab_preset_loaded', { preset_name: presetName }),
  bassTabShared: () => track('bass_tab_shared'),
};
