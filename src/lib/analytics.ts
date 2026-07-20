declare function gtag(...args: unknown[]): void;

function track(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof gtag === 'undefined') return;
  gtag('event', eventName, params);
}

export const analytics = {
  // Auth — `source` identifies which entry point opened the modal (e.g.
  // 'save_cta', 'export_nudge') so conversion can be compared per entry point.
  signUp: (source?: string) => track('sign_up', { method: 'email', source }),
  login: (source?: string) => track('login', { method: 'email', source }),
  logout: () => track('logout'),
  saveCtaClicked: () => track('save_cta_clicked'),
  authModalCancelled: (source?: string) => track('auth_modal_cancelled', { source }),
  exportNudgeShown: () => track('export_nudge_shown'),
  exportNudgeClicked: () => track('export_nudge_clicked'),

  // Songs
  playSong: (songSlug: string, songTitle: string) => track('play_song', { song_slug: songSlug, song_title: songTitle }),
  songPdfExported: (songSlug: string) => track('song_pdf_exported', { song_slug: songSlug }),

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
