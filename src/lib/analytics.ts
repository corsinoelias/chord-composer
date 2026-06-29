declare function gtag(...args: unknown[]): void;

function track(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || typeof window.gtag === 'undefined') return;
  window.gtag('event', eventName, params);
}

export const analytics = {
  // Editor
  playProgression: (styleId: string) => track('play_progression', { style_id: styleId }),
  stopProgression: () => track('stop_progression'),
  exportWav: () => track('export_wav'),
  chordAdded: (quality: string) => track('chord_added', { chord_quality: quality }),
  songSaved: () => track('song_saved'),
  songShared: () => track('song_shared'),
  transpositionChanged: (semitones: number) => track('transposition_changed', { semitones }),

  // Bass tab
  bassTabPlay: () => track('bass_tab_play'),
  bassTabExport: () => track('bass_tab_export'),
  bassTabPresetLoaded: (presetName: string) => track('bass_tab_preset_loaded', { preset_name: presetName }),
  bassTabShared: () => track('bass_tab_shared'),
};
