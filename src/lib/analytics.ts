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

// Events fired from a continuously-changing control have to be coalesced or they drown out
// everything else in the property: `effect_changed` was called from inside the mixer's
// value-change handlers, so one fader drag sent ~100 events. Aug 2026: 6,344 events from 58
// users (110 each) — more than `chord_added` from a tenth of the people — which inflated
// eventCount and made per-user event averages across the whole property meaningless.
// Call sites should still fire on commit (pointer release) rather than per change; this is
// the backstop that keeps a drag stream from reaching GA4 if one doesn't.
//
// Trailing debounce, keyed per event+key so two different effects tweaked in the same window
// still report separately. The last call's params win, which is what you want for a slider:
// the value the user settled on, not the one they dragged through.
const COALESCE_MS = 1000;
const pendingTracks = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; eventName: string; params?: Record<string, unknown> }
>();

function flushPendingTracks() {
  for (const pending of pendingTracks.values()) {
    clearTimeout(pending.timer);
    track(pending.eventName, pending.params);
  }
  pendingTracks.clear();
}

// Without this, dragging a fader and immediately closing the tab loses the event entirely.
// `pagehide` (not `unload`) is the one that still fires on iOS Safari and bfcache navigations.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingTracks);
}

function trackCoalesced(eventName: string, key: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const mapKey = `${eventName}:${key}`;
  const existing = pendingTracks.get(mapKey);
  if (existing) clearTimeout(existing.timer);
  pendingTracks.set(mapKey, {
    eventName,
    params,
    timer: setTimeout(() => {
      pendingTracks.delete(mapKey);
      track(eventName, params);
    }, COALESCE_MS),
  });
}

/** Which progression widget an event came from — see the preview events below. */
export type PreviewSurface =
  | 'home_hero'
  | 'home_cards'
  | 'progressions_generator'
  | 'progressions_explorer'
  | 'progressions_keys'
  | 'progressions_songs';

export const analytics = {
  // Auth — `entry_point` identifies which entry point opened the modal (e.g.
  // 'save_cta', 'export_nudge') so conversion can be compared per entry point.
  // `method` distinguishes Google (ID-token, no email confirmation) from
  // email/password signups — without it every Google sign-in reports as 'email'
  // and the two flows are impossible to tell apart in GA4.
  signUp: (method: 'email' | 'google', entryPoint?: string) => track('sign_up', { method, entry_point: entryPoint }),
  login: (method: 'email' | 'google', entryPoint?: string) => track('login', { method, entry_point: entryPoint }),
  logout: () => track('logout'),
  saveCtaClicked: () => track('save_cta_clicked'),
  authModalCancelled: (entryPoint?: string) => track('auth_modal_cancelled', { entry_point: entryPoint }),
  passwordResetRequested: () => track('password_reset_requested'),
  passwordResetCompleted: () => track('password_reset_completed'),
  exportNudgeShown: () => track('export_nudge_shown'),
  exportNudgeClicked: () => track('export_nudge_clicked'),
  // Same nudge, earlier moment: an anonymous visitor who has added several chords by hand
  // has built something worth keeping but, in Aug–Sep 2026, only 22% of them ever pressed
  // Save. Sign-ups from it arrive as sign_up with entry_point 'build_nudge'.
  buildNudgeShown: () => track('build_nudge_shown'),
  buildNudgeClicked: () => track('build_nudge_clicked'),

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
  // Song pages — how long a listen actually lasts, and whether the 92% of visitors who
  // never press Play are choosing not to or the audio engine is failing them silently.
  // Aug 2026: neither question had a single data point behind it, which is what made a
  // hard cutoff at 20s an unverifiable guess. This block exists to replace the guess.
  //
  // Latency from click to first sound, bucketed rather than raw milliseconds so it reads
  // as a GA4 dimension without a numeric-range report: '<1s' feels instant, '1-3s' is a
  // beat, '>3s' is long enough that someone plausibly gave up and left before it started.
  // The raw rounded figure goes out twice because GA4 lets one parameter be a dimension
  // or a metric, never both. `latency_ms` is registered as a custom DIMENSION: individual
  // values, which is the only way to read the slowest plays (GA4 metrics sum, they have
  // no max). `latency_ms_value` is registered as a custom METRIC (milliseconds, Sept 2026):
  // sum ÷ event count gives the average latency per song. It has no data before then.
  songAudioReady: (songSlug: string, latencyBucket: '<1s' | '1-3s' | '>3s', latencyMs: number) => {
    const ms = Math.round(latencyMs);
    track('song_audio_ready', { song_slug: songSlug, latency_bucket: latencyBucket, latency_ms: ms, latency_ms_value: ms });
  },
  // `stage` is deliberately a single free label today ('play') rather than a granular
  // union — PlaybackContext.play() swallows its own errors (see the try/catch around
  // startPlayback there) and this only observes "isPlaying never went true after we
  // asked it to", not which internal step failed. Widen the union if a real stage
  // breakdown becomes available from the engine itself.
  songPlayFailed: (songSlug: string, stage: string) => track('song_play_failed', { song_slug: songSlug, stage }),
  // Fired once per threshold per page visit, on CUMULATIVE time spent actually playing
  // audio on this page (pausing and resuming several times still counts toward the same
  // total — a practice session stitched from short bursts is exactly the behavior this
  // exists to see). Not fired per section restart: only real listening time counts.
  songPlayProgress: (songSlug: string, milestone: '10s' | '30s' | '60s' | '180s') =>
    track('song_play_progress', { song_slug: songSlug, milestone }),
  // Distinguishes three very different reasons playback stopped: 'user' (someone paused
  // it deliberately — the closest thing to a rejection signal these pages have), 'ended'
  // (a solo-play chain ran out of sections to chain into — satisfaction, not rejection;
  // note the full song plays with loop:true and never reaches this path), 'navigated'
  // (they left the tab mid-song — fired straight from pagehide, not through the debounce
  // below, since there's no time left for a timer to fire). Debounced ~400ms on the
  // isPlaying-false transition so an internal section-to-section handoff (stop()
  // immediately followed by play() for the next section, still inside the same click)
  // never gets reported as a stop — see handleTransposeChange/trackCoalesced above for
  // the same "don't let an implementation detail become a fake user action" concern.
  songPlayStopped: (songSlug: string, reason: 'user' | 'ended' | 'navigated') =>
    track('song_play_stopped', { song_slug: songSlug, reason }),
  // Print/PDF funnel, tracked from both ends: `songPdfOpened` fires on the song page's
  // own Print link (GA is already loaded there), `songPdfExported` on the PDF page's
  // actual print button (see the GA snippet added to songs/pdf/[slug].astro — that page
  // writes its own <html> and doesn't inherit BaseLayout's script). The gap between the
  // two tells you whether the printable sheet delivers once someone reaches it, not just
  // whether the link gets clicked.
  songPdfOpened: (songSlug: string) => track('song_pdf_opened', { song_slug: songSlug }),
  songPdfExported: (songSlug: string) => track('song_pdf_exported', { song_slug: songSlug }),
  // MIDI export from a song page's practice panel. Named separately from the editor's
  // `exportMidi` (no song_slug there) so the two surfaces don't get merged in reporting —
  // this button renders unconditionally in production. The WAV button next to it shows once
  // the app's engine renders the file (see showWavExport in SongChordPlayer.tsx), from
  // 2026-09-22: song_export_wav, and song_export_wav_failed when the render throws.
  songExportMidi: (songSlug: string) => track('song_export_midi', { song_slug: songSlug }),
  songExportWav: (songSlug: string, ms: number) => track('song_export_wav', { song_slug: songSlug, latency_ms: Math.round(ms) }),
  songExportWavFailed: (songSlug: string) => track('song_export_wav_failed', { song_slug: songSlug }),
  // Songs — practice controls. These separate "played the song" from "sat down to work on
  // it": looping a section, muting an instrument to play its part, or slowing the tempo are
  // the behaviours that distinguish a practice session from a listen, and they're the ones
  // the desktop rail exists to enable (they were unreachable above `sm` before it).
  songLoopToggled: (songSlug: string, sectionName: string, enabled: boolean) =>
    track('song_loop_toggled', { song_slug: songSlug, section_name: sectionName, enabled }),
  songMixerChanged: (songSlug: string, channel: string, action: 'mute' | 'solo' | 'volume') =>
    track('song_mixer_changed', { song_slug: songSlug, channel, action }),
  songMetronomeToggled: (songSlug: string, enabled: boolean) =>
    track('song_metronome_toggled', { song_slug: songSlug, enabled }),
  // Which of the three chart densities (Lyrics+chords / Compact / Chords only) someone reaches
  // for — the signal that tells us whether the chords-only view (never offered before) is
  // actually used, versus being a mockup idea nobody touches.
  songDensityChanged: (songSlug: string, density: 'full' | 'compact' | 'lyrics' | 'chords') =>
    track('song_density_changed', { song_slug: songSlug, density }),
  // Which chord spelling someone reads a chart in. Added after a user asked for Nashville
  // numbers ("say the numbers… so I can add in passing chords"); this is how we find out
  // whether that's one player's habit or a whole segment reading charts the wrong way round.
  // Not coalesced, unlike transposing: it's a discrete pick from three buttons, not a stepper.
  songNotationChanged: (songSlug: string, notation: 'standard' | 'number' | 'roman' | 'fixed') =>
    track('song_notation_changed', { song_slug: songSlug, notation }),
  // Transposing on a song page — the highest-intent signal these pages have (it means
  // "I'm about to play this, and not in the original key"), and until Aug 2026 it was
  // only tracked from the editor's own transpose control, not this one. Coalesced per
  // song (same reasoning as effectChanged): the stepper's +/- buttons and the key
  // dropdown can both fire several times a second, and only the value someone settles
  // on is worth a row in GA4.
  songTransposed: (songSlug: string, semitones: number) =>
    trackCoalesced('song_transposed', songSlug, { song_slug: songSlug, semitones }),
  // The redesign's bet (Sep 2026): transposing sat at ~1% of song-page users while its only
  // control lived inside the Practice panel. These say which of the now-visible doors people
  // use — the phone's bottom bar, the desktop toolbar or the "Key" chip under the title.
  songKeyOpened: (songSlug: string, surface: 'dock' | 'toolbar' | 'chip' | 'table') =>
    track('song_key_opened', { song_slug: songSlug, surface }),
  songOptionsOpened: (songSlug: string) => track('song_options_opened', { song_slug: songSlug }),
  songPracticeOpened: (songSlug: string, surface: 'dock' | 'bar' | 'options') =>
    track('song_practice_opened', { song_slug: songSlug, surface }),
  songStripPinned: (songSlug: string, pinned: boolean) =>
    track('song_strip_pinned', { song_slug: songSlug, pinned }),
  // Reading aids added with the redesign's phase 2. Capo and text size are coalesced: people
  // step through a few values before settling, and only the one they keep matters.
  songCapoChanged: (songSlug: string, capo: number) =>
    trackCoalesced('song_capo_changed', songSlug, { song_slug: songSlug, capo }),
  songAutoscrollToggled: (songSlug: string, on: boolean, speed: number) =>
    track('song_autoscroll_toggled', { song_slug: songSlug, on, speed }),
  songStageToggled: (songSlug: string, on: boolean) =>
    track('song_stage_toggled', { song_slug: songSlug, on }),
  songTextSizeChanged: (songSlug: string, percent: number) =>
    trackCoalesced('song_text_size_changed', songSlug, { song_slug: songSlug, percent }),
  // Song page → editor. This is the SEO-traffic-to-product conversion: the visitor
  // arrived to read a chart and leaves with it loaded in the editor. Fires on an <a>
  // that navigates away — gtag sends via navigator.sendBeacon, which survives unload.
  // `entry_point` separates the entry points, which are not comparable: 'practice_panel'
  // is the Export row inside the on-demand Practice panel, 'cta_block' is the panel under
  // the chart, 'practice_tools' is a card two thirds down the page — all three real SEO
  // traffic reaches. The two Astro-rendered ones fire the same event from an inline
  // script in songs/[slug].astro, not from here.
  // 'player_bar' is NOT one of those three: it only renders inside SongPlayerBar's inline
  // mode, which is SongCreator's own preview dialog (src/components/SongCreator/ChordStep.tsx),
  // and /songs/new/ 302s to /songs/ for everyone but localhost. Any song_editor_opened with
  // this entry_point in GA4 is your own dev traffic, not a visitor converting off a song
  // page — read it as noise, or exclude your IP in GA4 so it stops showing up at all.
  songEditorOpened: (songSlug: string, entryPoint: 'player_bar' | 'practice_panel' | 'cta_block' | 'practice_tools') =>
    track('song_editor_opened', { song_slug: songSlug, entry_point: entryPoint }),

  // Progression previews on the marketing pages (home hero, /progressions/). Before Sept 2026
  // none of these surfaces sent a single event, so a redesign that dropped the home's
  // engaged sessions from 77% to 61% could only be read from session totals, never from
  // what people did on the page. `surface` separates the widgets, which are not comparable:
  // the hero demo is the first thing a visitor sees, the explorer cards are a browse list.
  // `progression` is the preset/card name, never user input.
  previewPlayed: (surface: PreviewSurface, progression: string) =>
    track('preview_played', { surface, progression }),
  previewFormulaSelected: (surface: PreviewSurface, progression: string) =>
    track('preview_formula_selected', { surface, progression }),
  // Coalesced per surface: the ♭/♯ steppers get tapped several times in a row to find a key.
  previewTransposed: (surface: PreviewSurface, progression: string, semitones: number) =>
    trackCoalesced('preview_transposed', surface, { surface, progression, semitones }),
  previewExported: (surface: PreviewSurface, format: 'midi' | 'wav', progression: string) =>
    track('preview_exported', { surface, format, progression }),
  // The conversion these pages exist for: a preview handed over to the Chord Player. Fires
  // on an <a> that navigates away — gtag's sendBeacon survives the unload.
  previewEditorOpened: (surface: PreviewSurface, progression: string) =>
    track('preview_editor_opened', { surface, progression }),
  // Static links on the home (song charts, genre pages, tools, the hero CTA). Fired from an
  // inline script in index.astro, so the section can stay plain HTML instead of an island.
  homeLinkClicked: (linkTarget: 'hero_cta' | 'sticky_cta' | 'song' | 'genre' | 'tool' | 'learn' | 'final_cta', label: string) =>
    track('home_link_clicked', { link_target: linkTarget, label }),

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
  // Per-section arrangement (docs/plan-paridad-web-app.md). Flags only, never style ids of
  // other users' rhythms.
  sectionArrangementChanged: (a: { styleId?: string; trackStyles?: object; patterns?: object; silenced?: object; sounds?: object }) =>
    track('section_arrangement_changed', {
      has_style: !!a.styleId,
      has_track_styles: !!a.trackStyles,
      has_patterns: !!a.patterns,
      silenced: Object.entries(a.silenced ?? {}).filter(([, v]) => v).map(([k]) => k).join(',') || 'none',
      has_sounds: !!a.sounds,
    }),
  // Coalesced per effect — see trackCoalesced. Callers fire this on commit (fader released,
  // switch toggled), never per value change.
  effectChanged: (effect: 'eq' | 'reverb' | 'compressor' | 'pan' | 'master') =>
    trackCoalesced('effect_changed', effect, { effect }),
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

  // Feedback / bug reports. Opened and submitted are tracked separately for the same
  // reason as the song-request pair above: the gap between them is the only way to tell
  // "nobody has anything to say" from "the form is too much work". `entry_point` says
  // which trigger opened it, which is how we find out whether the footer link is
  // discoverable enough or whether the widget needs to live closer to the app. The report
  // itself lands in Supabase, not here — never send the message text to GA4, it is
  // free-form user input and routinely contains PII.
  feedbackOpened: (entryPoint: string) => track('feedback_opened', { entry_point: entryPoint }),
  feedbackSubmitted: (kind: 'bug' | 'idea' | 'other', entryPoint: string) =>
    track('feedback_submitted', { kind, entry_point: entryPoint }),

  // Standalone tool pages
  toolWidgetUsed: (tool: string) => track('tool_widget_used', { tool }),

  // Bass tab
  bassTabPlay: () => track('bass_tab_play'),
  bassTabExport: (format: string) => track('bass_tab_export', { format }),
  bassTabPresetLoaded: (presetName: string) => track('bass_tab_preset_loaded', { preset_name: presetName }),
  bassTabShared: () => track('bass_tab_shared'),

  // Drum tab. `view` on the play event tells apart the three ways in — notation,
  // step grid, or pasted ASCII tab — which is the open question for this tool.
  drumTabPlay: (view: string) => track('drum_tab_play', { view }),
  drumTabPresetLoaded: (presetName: string, source: string) =>
    track('drum_tab_preset_loaded', { preset_name: presetName, source }),
  drumTabTextApplied: () => track('drum_tab_text_applied'),
  drumTabShared: () => track('drum_tab_shared'),
  drumTabExport: (format: 'midi' | 'wav') => track('drum_tab_export', { format }),
  drumTabImport: (format: 'midi') => track('drum_tab_import', { format }),
  // Saving and reloading your own tab: the signal that the tool is being used
  // to keep work rather than only to audition the included grooves.
  drumTabUserTabSaved: () => track('drum_tab_user_tab_saved'),
  drumTabUserTabLoaded: () => track('drum_tab_user_tab_loaded'),

  // Virtual Piano recording sharing. Login-gated (unlike everything else on the piano),
  // so `entry_point: 'piano_share'` on the resulting sign_up/login events is what
  // distinguishes a piano-driven account creation from the chord editor's
  // ('save_cta', 'export_nudge', 'shared_song_fork') in the same GA4 property.
  pianoRecordingShared: () => track('piano_recording_shared'),
  pianoRecordingUnshared: () => track('piano_recording_unshared'),
  sharedPianoRecordingOpened: () => track('shared_piano_recording_opened'),
  // Chord Sheet Maker. Until now this product shipped with zero instrumentation, which
  // is why questions as basic as "does anyone print one" had no answer. The chain is
  // tracked end to end because each gap between two links is a different failure:
  // cta_clicked -> seeded is "the link is broken or the song does not resolve",
  // seeded -> saved is "the editor lost them", saved -> printed is "the chart was not
  // worth paper". `entry_point` separates arrivals that are not comparable: a visitor
  // who came from a song page had a specific song in mind, one who came from the
  // library was browsing.
  sheetCtaClicked: (entryPoint: 'song_page' | 'song_pdf') =>
    track('sheet_cta_clicked', { entry_point: entryPoint }),
  sheetSeeded: (entryPoint: 'song_link' | 'library_public', songSlug: string) =>
    track('sheet_seeded', { entry_point: entryPoint, song_slug: songSlug }),
  // `is_update` tells a first save (a new chart exists now) from a re-save (an edit to
  // one that already did). Counting them together would report someone tidying one
  // chart all afternoon as a product with many charts.
  sheetSaved: (isUpdate: boolean) => track('sheet_saved', { is_update: isUpdate }),
  // Publishing is the only action that fills the public library, and an empty library
  // is what the Public tab and the landing page both have to work around today.
  sheetPublished: () => track('sheet_published'),
  sheetUnpublished: () => track('sheet_unpublished'),
  // The act the whole product exists for. Fired on the in-app Print button; a browser
  // Ctrl+P is not observable here, so this is a floor on printing, not a full count.
  sheetPrinted: () => track('sheet_printed'),
  // Copying an existing chart, the library equivalent of shared_song_forked.
  sheetDuplicated: () => track('sheet_duplicated'),
};
