/**
 * Centralized Playback State Context
 * Single source of truth for all playback-related state
 * Includes Media Session API for background playback on mobile
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { type Section } from '@/lib/sections';
import { type InstrumentState, getDefaultInstrumentStates } from '@/lib/instruments';
import { type StylePattern, MUSICAL_STYLES, resolveActiveStyle, getSlotsPerBar } from '@/lib/styles';
import { getStyleOverride, getCustomStyles } from '@/lib/customStyles';
import { type MelodicData } from '@/lib/bassScale';
import { makeStyleLookup } from '@/lib/sectionPlayback';
import { AppPlayback, startedAppEngine, type AppSong } from '@/lib/appEngine/player';
import { type NoteLengths } from '@/lib/noteLengths';

interface PlaybackState {
  isPlaying: boolean;
  currentChordIndex: number;
  // NOTE: `currentStep` (the 16th-note playhead) is deliberately NOT part of this state
  // object. It changes ~6.7x/sec, and any field in `state` re-renders EVERY usePlayback()
  // consumer on change — including the huge editor tree, which starved the audio
  // scheduler and caused crackle. It now flows through a separate ref+listener channel
  // (subscribeStep/getStep, read via useCurrentStep) so only the tiny playhead UI
  // re-renders. See useCurrentStep below.
  bpm: number;
  metronomeEnabled: boolean;
}

interface PlaybackContextValue {
  // State
  state: PlaybackState;

  // Actions
  play: (sections: Section[], options: PlayOptions) => Promise<void>;
  // Preloads everything play() would await (samples, bass sample dir, guitar soundfont)
  // WITHOUT starting playback — call this when a pre-roll/countdown begins so the load
  // overlaps that window and play() then starts instantly. Idempotent & fire-and-forget.
  warmup: (options: PlayOptions) => Promise<void>;
  // keepContext is accepted for callers written for the old web engine and ignored: the app's
  // engine never closes its AudioContext, so every stop is immediate and cheap.
  stop: (opts?: { keepContext?: boolean }) => void;
  setBpm: (bpm: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;

  // For live updates during playback
  updatePlaybackOptions: (options: Partial<PlayOptions>) => void;

  // High-frequency 16th-note playhead — separate channel (see PlaybackState note).
  subscribeStep: (cb: () => void) => () => void;
  getStep: () => number;

  // Continuous playback position — chordIndex + (0-1 progress through that chord) as one
  // float, updated every animation frame from the real audio clock. Deliberately a SINGLE
  // combined number rather than separate index/fraction values: splitting them across
  // `state.currentChordIndex` (React state) and a fraction-only fast channel let the two
  // update in different commits, so a UI combining them could render one already-advanced
  // and the other not yet — a visible backward-then-forward flicker at every chord boundary.
  // Same separate-channel reasoning as subscribeStep otherwise: only a UI that actually
  // renders a continuous scrub position (see usePlaybackPosition) should re-render this often.
  subscribePlaybackPosition: (cb: () => void) => () => void;
  getPlaybackPosition: () => number;
}

interface PlayOptions {
  bpm: number;
  metronome: boolean;
  instruments: InstrumentState[];
  styleId: string;
  transposition: number;
  liveEditedStyle?: StylePattern | null;
  customStyles?: StylePattern[];
  // Whether the WHOLE `sections` array restarts from the top once it reaches the end.
  // Defaults to true (existing behavior for every caller that predates this field — a full
  // progression looping forever). Callers that want a single deliberate pass (e.g. "play just
  // this section once") pass false and get notified via the natural-stop path (see `stop()`
  // wiring in `play` below) instead of the engine silently going quiet mid-UI-"playing" state.
  loop?: boolean;
  // Called when a `loop: false` pass reaches its natural end. Defaults to `stop()` — a
  // caller that wants to chain into something else (e.g. the song page playing the next
  // section instead of just going quiet) passes its own and is responsible for stopping
  // itself eventually (there's nothing left to chain to at the end of a song).
  onEnded?: () => void;
  loopingSectionIndex?: number | null;
  melodic?: MelodicData;
  // Count one bar in on the engine's cowbell before the song (4 beats in 4/4, 6 in 6/8), on
  // the engine's own clock so the song lands on the beat after — see CountdownOverlay.
  countIn?: boolean;
  sections?: Section[];
  // How long each track's notes ring (the app's note length, saved as app.noteLengths).
  noteLengths?: NoteLengths;
  // Vocal/reference audio — a single file, sliced per section (keyed by Section.id) or
  // as one continuous span for the whole song. Decoded once per URL (see
  // audioTrackBufferRef) and muted while transposition !== 0 (local-only prototype).
  audioTrack?: {
    url: string;
    wholeRange?: { startSec: number; endSec: number };
    sectionRanges?: Record<string, { startSec: number; endSec: number }>;
  };
  // Manual mute/volume for the vocal reference track (mobile performance console's "Voz"
  // channel). Independent of — and combined with (OR'd for mute) — the automatic mute while
  // transposition !== 0 above; the engine is the one that reconciles both.
  vocalMuted?: boolean;
  vocalVolume?: number;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function usePlayback() {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
}

// Subscribe to the 16th-note playhead without re-rendering on every other playback
// state change (and without forcing the whole usePlayback() tree to re-render on every
// step). Only components that actually display the playhead should call this.
export function useCurrentStep(): number {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('useCurrentStep must be used within a PlaybackProvider');
  }
  return useSyncExternalStore(context.subscribeStep, context.getStep, context.getStep);
}

// Continuous chordIndex+fraction position, for continuously-animated scrub UIs (e.g. a
// song's progress bar). Isolate any consumer to the smallest component possible — see the
// subscribePlaybackPosition note on PlaybackContextValue.
export function usePlaybackPosition(): number {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlaybackPosition must be used within a PlaybackProvider');
  }
  return useSyncExternalStore(context.subscribePlaybackPosition, context.getPlaybackPosition, context.getPlaybackPosition);
}

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    currentChordIndex: -1,
    bpm: 100,
    metronomeEnabled: true,
  });

  // 16th-note playhead channel — a ref + listener set instead of React state, so the
  // ~6.7x/sec updates during playback don't re-render every usePlayback() consumer
  // (only useCurrentStep subscribers). See the PlaybackState note above.
  const stepRef = useRef(-1);
  const stepListenersRef = useRef<Set<() => void>>(new Set());
  const setStep = useCallback((step: number) => {
    if (stepRef.current === step) return;
    stepRef.current = step;
    stepListenersRef.current.forEach(l => l());
  }, []);
  const subscribeStep = useCallback((cb: () => void) => {
    stepListenersRef.current.add(cb);
    return () => { stepListenersRef.current.delete(cb); };
  }, []);
  const getStep = useCallback(() => stepRef.current, []);

  // Continuous chordIndex+fraction position — see PlaybackContextValue note.
  const playbackPositionRef = useRef(-1);
  const playbackPositionListenersRef = useRef<Set<() => void>>(new Set());
  const setPlaybackPosition = useCallback((position: number) => {
    // 1/1000 granularity is well past what's visible on a scrub bar — skipping smaller
    // deltas avoids notifying listeners (and re-rendering them) on every single rAF tick.
    if (Math.abs(playbackPositionRef.current - position) < 0.001) return;
    playbackPositionRef.current = position;
    playbackPositionListenersRef.current.forEach(l => l());
  }, []);
  const subscribePlaybackPosition = useCallback((cb: () => void) => {
    playbackPositionListenersRef.current.add(cb);
    return () => { playbackPositionListenersRef.current.delete(cb); };
  }, []);
  const getPlaybackPosition = useCallback(() => playbackPositionRef.current, []);

  const rafRef = useRef<number>();
  const optionsRef = useRef<PlayOptions | null>(null);
  const sectionsRef = useRef<Section[]>([]);
  // The app's engine does the playing (docs/motor-unico-wasm.md); this is one provider's
  // hold on it — the page has one engine, however many providers it has.
  const appRef = useRef(new AppPlayback());

  // The style currently in effect, resolved from the live options.
  const resolveCurrentStyle = useCallback((): StylePattern => {
    const opts = optionsRef.current;
    if (!opts) return MUSICAL_STYLES[0];
    return resolveActiveStyle(
      opts.styleId,
      opts.liveEditedStyle,
      opts.customStyles ?? getCustomStyles(),
      getStyleOverride,
    );
  }, []);
  // The song as the engine takes it, from the live options.
  const appSong = useCallback((): AppSong => {
    const opts = optionsRef.current!;
    const style = resolveCurrentStyle();
    return {
      song: {
        sections: opts.sections ?? sectionsRef.current,
        bpm: opts.bpm,
        transposition: opts.transposition,
        instrumentSettings: opts.instruments,
        metronomeEnabled: opts.metronome,
        noteLengths: opts.noteLengths,
      },
      style: opts.melodic ? { ...style, melodic: opts.melodic } : style,
      lookup: makeStyleLookup(opts.customStyles ?? getCustomStyles(), getStyleOverride, opts.liveEditedStyle),
      loopingSectionIndex: opts.loopingSectionIndex,
    };
  }, [resolveCurrentStyle]);

  // Caches the decoded vocal-reference buffer by URL so replaying/looping the same
  // song doesn't re-fetch+decode on every play() call within the session.
  const audioTrackBufferRef = useRef<{ url: string; buffer: AudioBuffer } | null>(null);
  const audioPreloaded = useRef(false);
  // Identifies this PlaybackProvider instance — multiple can exist at once (e.g. one
  // per ChordEmbed on a page), but they all share the same underlying audio engine.
  // When one instance starts playing, every other instance needs to hear about it so
  // its own "isPlaying" UI doesn't get stuck showing active after the engine moved on.
  const instanceIdRef = useRef(`pb_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  // Reset our own UI state (without touching the shared engine) when a different
  // PlaybackProvider instance takes over playback.
  useEffect(() => {
    const handleOtherInstanceStarted = (e: Event) => {
      const startedId = (e as CustomEvent<{ instanceId: string }>).detail?.instanceId;
      if (startedId === instanceIdRef.current) return;
      appRef.current.detach();
      setState(prev => ({ ...prev, isPlaying: false, currentChordIndex: -1 }));
      setStep(-1);
    };
    window.addEventListener('chordplayer:playback-started', handleOtherInstanceStarted);
    return () => window.removeEventListener('chordplayer:playback-started', handleOtherInstanceStarted);
  }, [setStep]);

  // Fetch the engine and its sounds during browser idle time, so the first Play does not
  // wait on the download. Idle rather than on mount so it does not compete with the page's
  // own rendering; the interaction listeners are a safety net for a starved idle callback.
  // requestIdleCallback isn't available in Safari, hence the setTimeout fallback.
  useEffect(() => {
    const triggerPreload = () => {
      if (!audioPreloaded.current) {
        audioPreloaded.current = true;
        AppPlayback.preload();
        window.removeEventListener('click', triggerPreload);
        window.removeEventListener('touchstart', triggerPreload);
        window.removeEventListener('keydown', triggerPreload);
      }
    };

    const ric = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(cb, 1500));
    const cic = window.cancelIdleCallback ?? window.clearTimeout;
    const idleHandle = ric(triggerPreload, { timeout: 4000 });

    window.addEventListener('click', triggerPreload);
    window.addEventListener('touchstart', triggerPreload);
    window.addEventListener('keydown', triggerPreload);

    return () => {
      cic(idleHandle);
      window.removeEventListener('click', triggerPreload);
      window.removeEventListener('touchstart', triggerPreload);
      window.removeEventListener('keydown', triggerPreload);
    };
  }, []);

  // Some mobile browsers suspend audio when the page is hidden; resume it on the way back.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!state.isPlaying) return;
      const ctx = startedAppEngine()?.ctx;
      if (ctx?.state === 'suspended') ctx.resume().catch(console.warn);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state.isPlaying]);

  // keepContext is kept for callers written for the web engine; the engine never closes its
  // context, so every stop is the quick kind now.
  const stop = useCallback((_opts?: { keepContext?: boolean }) => {
    // Always, not only when this provider started it: the page has one engine, and a Stop
    // must silence it whoever set it going.
    appRef.current.stop();
    setState(prev => ({
      ...prev,
      isPlaying: false,
      currentChordIndex: -1,
    }));
    setStep(-1);
  }, [setStep]);

  // Setup Media Session for background playback on mobile
  const setupMediaSession = useCallback((songTitle: string = 'Chord Progression') => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: songTitle,
      artist: 'Chord Player',
      album: 'Practice Session',
    });

    navigator.mediaSession.playbackState = 'playing';

    navigator.mediaSession.setActionHandler('play', async () => {
      try {
        const ctx = startedAppEngine()?.ctx;
        if (ctx?.state === 'suspended') await ctx.resume();
      } catch (e) {
        console.warn('MediaSession play handler failed:', e);
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => stop());
    navigator.mediaSession.setActionHandler('stop', () => stop());
  }, [stop]);

  // Vocal reference audio: decoded once per URL (cached across replays within the session),
  // whatever the transposition — only the audible gain depends on it, so returning to key 0
  // needs no re-fetch. Decoded at the engine's rate; an AudioBuffer is plain data.
  const decodeVocal = useCallback(async (options: PlayOptions): Promise<AudioBuffer | null> => {
    if (!options.audioTrack) return null;
    const { url } = options.audioTrack;
    if (audioTrackBufferRef.current?.url === url) return audioTrackBufferRef.current.buffer;
    try {
      const res = await fetch(url);
      const buffer = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await res.arrayBuffer());
      audioTrackBufferRef.current = { url, buffer };
      return buffer;
    } catch (err) {
      console.warn('Vocal reference audio failed to load/decode:', err);
      return null;
    }
  }, []);

  const play = useCallback(async (sections: Section[], options: PlayOptions) => {
    sectionsRef.current = sections;
    optionsRef.current = options;
    if (!sections.some(s => (s?.chords?.length ?? 0) > 0)) return;

    // Tell every other PlaybackProvider instance on the page that we're now the
    // active player, so their own UI (Play/Stop button, chord highlighting) resets
    // instead of staying stuck "playing" after the shared engine moved on to us.
    window.dispatchEvent(new CustomEvent('chordplayer:playback-started', {
      detail: { instanceId: instanceIdRef.current },
    }));

    try {
      const once = !(options.loop ?? true);
      const vocalBuffer = await decodeVocal(options);
      const style = resolveCurrentStyle();
      const stepsPerBeat = Math.max(1, Math.round(16 / (style.timeSignature?.denominator ?? 4)));
      const countInBeats = options.countIn ? Math.round(getSlotsPerBar(style) / stepsPerBeat) : 0;
      await appRef.current.play({
        ...appSong(),
        once,
        onEnded: once ? () => (options.onEnded ?? stop)() : undefined,
        vocal: vocalBuffer ? {
          buffer: vocalBuffer,
          wholeRange: options.audioTrack?.wholeRange,
          sectionRanges: options.audioTrack?.sectionRanges,
          // Muted while transposed: a recording cannot follow the key.
          muted: () => (optionsRef.current?.transposition ?? 0) !== 0 || !!optionsRef.current?.vocalMuted,
          volume: () => optionsRef.current?.vocalVolume ?? 1,
        } : undefined,
      }, countInBeats);
      setState(prev => ({
        ...prev,
        isPlaying: true,
        // No chord is under way while the engine counts in: anything that animates the current
        // chord (the song map's fill glides through it on a timer) would otherwise start four
        // beats early. The position loop below sets chord 0 when the song's first step sounds.
        currentChordIndex: countInBeats > 0 ? -1 : 0,
        bpm: options.bpm,
        metronomeEnabled: options.metronome,
      }));
      setupMediaSession('Chord Progression');
    } catch (err) {
      appRef.current.stop();
      setState(prev => ({ ...prev, isPlaying: false }));
      console.error('[AUDIO] play() failed', err);
    }
  }, [stop, setupMediaSession, appSong, decodeVocal, resolveCurrentStyle]);

  // Opens the engine ahead of play() — call it when a count-in starts, from the tap that
  // started it, so the engine is ready when the count reaches zero.
  const warmup = useCallback(async (_options: PlayOptions) => {
    AppPlayback.warmup();
  }, []);

  const setBpm = useCallback((bpm: number) => {
    setState(prev => ({ ...prev, bpm }));
    if (optionsRef.current) {
      optionsRef.current.bpm = bpm;
    }
    appRef.current.send([['setBpm', bpm]]);
  }, []);

  const setMetronomeEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, metronomeEnabled: enabled }));
    if (optionsRef.current) {
      optionsRef.current.metronome = enabled;
      if (appRef.current.active) void appRef.current.update(appSong());
    }
  }, [appSong]);

  // Live changes: the engine hears them on its next step. update() sends only the mix when
  // only the mix changed, so a fader never cuts a note short.
  const updatePlaybackOptions = useCallback((updates: Partial<PlayOptions>) => {
    if (!optionsRef.current) return;
    optionsRef.current = { ...optionsRef.current, ...updates };
    if (appRef.current.active) void appRef.current.update(appSong());
  }, [appSong]);

  // Cleanup on unmount
  useEffect(() => {
    const app = appRef.current;
    return () => { if (app.active) app.stop(); };
  }, []);

  // Chord index, 16th-note playhead and continuous position, read from the engine's state
  // every animation frame (it reports ~30 times a second; position() carries the clock on
  // between reports).
  useEffect(() => {
    if (!state.isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPlaybackPosition(-1);
      setStep(-1);
      return;
    }
    const loop = () => {
      const at = appRef.current.position();
      if (at) {
        setStep(at.step);
        setState(prev => prev.currentChordIndex === at.chordIndex ? prev : { ...prev, currentChordIndex: at.chordIndex });
        setPlaybackPosition(at.position);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state.isPlaying, setPlaybackPosition, setStep]);

  const value: PlaybackContextValue = {
    state,
    play,
    warmup,
    stop,
    setBpm,
    setMetronomeEnabled,
    updatePlaybackOptions,
    subscribeStep,
    getStep,
    subscribePlaybackPosition,
    getPlaybackPosition,
  };

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}
