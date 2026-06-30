declare function gtag(...args: unknown[]): void;

function track(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof gtag === 'undefined') return;
  gtag('event', eventName, params);
}

export const analytics = {
  // Songs
  playSong: (songSlug: string, songTitle: string) => track('play_song', { song_slug: songSlug, song_title: songTitle }),
  songPdfExported: (songSlug: string) => track('song_pdf_exported', { song_slug: songSlug }),

  // Editor
  playProgression: (styleId: string) => track('play_progression', { style_id: styleId }),
  exportWav: () => track('export_wav'),
  exportMidi: () => track('export_midi'),
  styleChanged: (styleId: string) => track('style_changed', { style_id: styleId }),
  templateUsed: (templateName: string) => track('template_used', { template_name: templateName }),

  // Bass tab
  bassTabPlay: () => track('bass_tab_play'),
  bassTabExport: (format: string) => track('bass_tab_export', { format }),
  bassTabPresetLoaded: (presetName: string) => track('bass_tab_preset_loaded', { preset_name: presetName }),
  bassTabShared: () => track('bass_tab_shared'),
};
