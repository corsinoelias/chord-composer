/**
 * Centralized Playback State Context
 * Single source of truth for all playback-related state
 * Includes Media Session API for background playback on mobile
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { type Section } from '@/lib/sections';
import { type InstrumentState, getDefaultInstrumentStates, getSoundType } from '@/lib/instruments';
import { type StylePattern, MUSICAL_STYLES, resolveActiveStyle } from '@/lib/styles';
import { getStyleOverride, getCustomStyles } from '@/lib/customStyles';
import { type MelodicData, resolveVariation } from '@/lib/bassScale';
import { makeStyleLookup, resolveSectionPlayback } from '@/lib/sectionPlayback';
import { preloadSampleDirForMidis } from '@/lib/bassTab/sampleEngine';
import { collectMidiNotes } from '@/lib/engine/preloadPlan';
import {
  ensureSamplesLoaded,
  ensureGuitarSoundfontLoaded,
  scheduleProgression,
  stopPlayback as stopAudioPlayback,
  stopPlaybackKeepContext,
  preloadAudio,
  acquirePlaybackMutex,
  releasePlaybackMutex,
  getAudioContext,
  getChordSchedule,
  getStepSchedule,
  applyMixerLevels,
  ensurePianoNotes,
  clearChordSchedule,
} from '@/lib/audioEngine';
import { AppPlayback, appEngineEnabled, type AppSong } from '@/lib/appEngine/player';
import { type NoteLengths } from '@/lib/engine/eventBuilder';

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
  // keepContext: true skips closing the AudioContext — only safe when the caller is about to
  // immediately start a new play() as a continuation (see stopPlaybackKeepContext in
  // audioEngine.ts for why). Omit/false for a real stop (Stop button, switching to something
  // the user picked mid-flight) where closing the context is what kills already-scheduled audio.
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

  const cancelRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number>();
  const optionsRef = useRef<PlayOptions | null>(null);
  const sectionsRef = useRef<Section[]>([]);
  // The app's engine (?engine=app, docs/motor-unico-wasm.md phase 6). Only one of the two
  // engines plays at a time; appRef.current.active says whether it is this one.
  const useAppEngine = useRef(appEngineEnabled());
  const appRef = useRef(new AppPlayback());

  // The style currently in effect, resolved from the live options. Shared by the scheduler's
  // per-bar getStyle and by updatePlaybackOptions, which needs it to compute mixer levels.
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
  // The song as the app's engine takes it, from the live options.
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
      cancelRef.current = null;
      setState(prev => ({ ...prev, isPlaying: false, currentChordIndex: -1 }));
      setStep(-1);
    };
    window.addEventListener('chordplayer:playback-started', handleOtherInstanceStarted);
    return () => window.removeEventListener('chordplayer:playback-started', handleOtherInstanceStarted);
  }, [setStep]);

  // Pre-load audio during browser idle time so it's ready by the time the user hits
  // Play, instead of only starting the ~79MB sample fetch on their first interaction
  // (which made the very first Play feel laggy). Deferred to idle rather than fired
  // immediately on mount so it doesn't compete with the page's own critical-path
  // rendering/JS — this still runs well before most users would click Play.
  // requestIdleCallback isn't available in Safari, hence the setTimeout fallback.
  // The interaction listeners stay as a safety net (e.g. idle callback starved on a
  // busy page) — triggerPreload() is idempotent via audioPreloaded.current.
  useEffect(() => {
    const triggerPreload = () => {
      if (!audioPreloaded.current) {
        audioPreloaded.current = true;
        if (useAppEngine.current) AppPlayback.preload();
        else preloadAudio().catch(console.warn);
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

  // Handle visibility change to keep audio playing in background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!state.isPlaying) return;

      // When the page becomes hidden/visible, some mobile browsers suspend WebAudio.
      // Try to keep the existing AudioContext running.
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(console.warn);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state.isPlaying]);

  const stop = useCallback((opts?: { keepContext?: boolean }) => {
    // Always, not only when this provider started it: the page has one engine, and a Stop
    // must silence it whoever set it going.
    if (useAppEngine.current) appRef.current.stop();
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    if (opts?.keepContext) {
      stopPlaybackKeepContext();
    } else {
      stopAudioPlayback();
    }
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
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
      } catch (e) {
        console.warn('MediaSession play handler failed:', e);
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      stop();
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      stop();
    });
  }, [stop]);

  /**
   * El cuerpo real de play(). Separado para que play() pueda envolverlo en un try y liberar
   * el mutex si algo lanza — antes cualquier excepción aquí dejaba la reproducción bloqueada
   * de forma permanente.
   */
  const startPlayback = useCallback(async (sections: Section[], options: PlayOptions) => {
    // Stop any existing playback first
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    clearChordSchedule();

    sectionsRef.current = sections;
    optionsRef.current = options;

    const hasChords = sections.some(s => (s?.chords?.length ?? 0) > 0);
    if (!hasChords) {
      releasePlaybackMutex();
      return;
    }

    // Tell every other PlaybackProvider instance on the page that we're now the
    // active player, so their own UI (Play/Stop button, chord highlighting) resets
    // instead of staying stuck "playing" after the shared engine moved on to us.
    window.dispatchEvent(new CustomEvent('chordplayer:playback-started', {
      detail: { instanceId: instanceIdRef.current },
    }));

    // The app's engine plays songs that loop. A single pass that hands over to something
    // else, and the vocal reference track, stay on the web's engine for now.
    if (useAppEngine.current && (options.loop ?? true) && !options.audioTrack) {
      await appRef.current.play(appSong());
      setState(prev => ({
        ...prev,
        isPlaying: true,
        currentChordIndex: 0,
        bpm: options.bpm,
        metronomeEnabled: options.metronome,
      }));
      setupMediaSession('Chord Progression');
      return;
    }
    if (appRef.current.active) appRef.current.stop();

    try {
      await ensureSamplesLoaded();
    } catch (err) {
      console.warn('Sample loading issue, proceeding anyway:', err);
    }

    const getStyle = resolveCurrentStyle;

    const style = getStyle();

    // Soundfont-based guitar sounds (e.g. "Muted ★") load lazily over the network. This wait
    // happens BEFORE the isPlaying flip below, on purpose: nothing should start sounding, and
    // no chord-duration dots should start counting, until the real sample is ready. Sample-based
    // sounds (electric/acoustic/nylon) don't need this — they're preloaded by ensureSamplesLoaded().
    const guitarState = options.instruments.find(i => i.id === 'guitar');
    const guitarSoundId = guitarState?.soundTypeId ?? style.instrumentSounds?.guitar;
    if (guitarSoundId) {
      const guitarSoundDef = getSoundType('guitar', guitarSoundId);
      if (guitarSoundDef?.sf2Instrument) {
        await ensureGuitarSoundfontLoaded(guitarSoundId, guitarSoundDef.sf2Instrument);
      }
    }

    // Sample-based bass sounds (Fender/Slap/Finger/Muted) fetch+decode their sample
    // directory lazily, the first time a note actually needs it — fine for timing when
    // everything's already cached, but on a cold session that fetch+decode can take
    // longer than the gap between notes, and AudioBufferSourceNode.start(time) fires
    // IMMEDIATELY (not at `time`) once `time` has already passed. That's what made the
    // first few bass notes of a song sound rushed/glitchy on a fresh page load — same
    // root cause the offline WAV export already avoids via this same preload (see
    // renderProgressionOffline in audioEngine.ts). Awaiting it here, before the isPlaying
    // flip, mirrors the guitar soundfont wait above: nothing sounds until it's ready.
    //
    // Timeout-guarded (unlike a bare await) because decodeAudioData against a FRESHLY
    // re-created AudioContext can hang indefinitely — every stop() closes the previous
    // context (see stopPlayback), so switching sections quickly (Prev/Next, or a section
    // naturally ending and chaining into the next one) recreates it right away, and decoding
    // the same already-cached raw bytes against that brand-new context is what got stuck in
    // testing. A stuck decode here used to mean play() never reached setState(isPlaying:true)
    // — the whole player looked like it had silently stopped for good.
    const bassState = options.instruments.find(i => i.id === 'bass');
    const bassSoundId = bassState?.soundTypeId ?? style.instrumentSounds?.bass ?? 'fender';
    const bassSoundDef = getSoundType('bass', bassSoundId);
    if (bassSoundDef?.useSamples && bassSoundDef.samplePath) {
      try {
        // Solo las notas que esta canción va a tocar de verdad, no el banco entero. El
        // conjunto sale de simular la canción con el builder puro — ver engine/preloadPlan.ts.
        // Un banco completo son 30 muestras WAV de 692 KB: ~20 MB antes de la primera nota,
        // que en 4G medido eran 25 segundos de espera.
        const bassMidis = collectMidiNotes('bass', {
          sections,
          style,
          melodic: options.melodic,
          transposition: options.transposition,
          octaveOffset: bassSoundDef.octaveOffset,
        });
        await Promise.race([
          preloadSampleDirForMidis(getAudioContext(), bassSoundDef.samplePath, bassMidis),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500)),
        ]);
      } catch {
        console.warn(`[AUDIO] Bass sample preload for "${bassSoundDef.samplePath}" timed out — proceeding without it`);
      }
    }

    // Lo mismo para el piano. Solo se cargan de antemano las 25 notas del núcleo (para que
    // los previews de acorde no suenen sintetizados); el resto de la canción se pide aquí.
    // El piano SÍ tiene fallback a síntesis, así que un timeout degrada el timbre pero no
    // enmudece — por eso el margen es más corto que el del bajo.
    try {
      const pianoMidis = collectMidiNotes('piano', {
        sections,
        style,
        melodic: options.melodic,
        transposition: options.transposition,
      });
      await Promise.race([
        ensurePianoNotes(pianoMidis),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500)),
      ]);
    } catch {
      console.warn('[AUDIO] Piano note preload timed out — proceeding with synth fallback');
    }

    // Sounds a section swaps in (Section.sounds) load like the song's own: the SF2 guitar and
    // the sampled bass would otherwise start late the first time that section plays. Only
    // runs for songs that have any, so every other song takes exactly the path above.
    const sectionSounds = sections.flatMap(s => Object.entries(s.sounds ?? {}));
    for (const [track, soundId] of sectionSounds) {
      const def = getSoundType(track as 'bass' | 'guitar', soundId as string);
      try {
        if (track === 'guitar' && def?.sf2Instrument) {
          await Promise.race([
            ensureGuitarSoundfontLoaded(soundId as string, def.sf2Instrument),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000)),
          ]);
        } else if (track === 'bass' && def?.useSamples && def.samplePath) {
          const midis = collectMidiNotes('bass', {
            sections, style, melodic: options.melodic, transposition: options.transposition, octaveOffset: def.octaveOffset,
          });
          await Promise.race([
            preloadSampleDirForMidis(getAudioContext(), def.samplePath, midis),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500)),
          ]);
        }
      } catch {
        console.warn(`[AUDIO] Section sound preload "${track}:${soundId}" timed out — proceeding`);
      }
    }

    // Vocal reference audio: decode once per URL (cached across replays within the
    // session), regardless of the current transposition — only the audible gain depends
    // on transposition (see audioEngine.ts), so returning to key 0 mid-session doesn't
    // need a re-fetch.
    let decodedAudioTrackBuffer: AudioBuffer | null = null;
    if (options.audioTrack) {
      const { url } = options.audioTrack;
      if (audioTrackBufferRef.current?.url === url) {
        decodedAudioTrackBuffer = audioTrackBufferRef.current.buffer;
      } else {
        try {
          const res = await fetch(url);
          const arrayBuffer = await res.arrayBuffer();
          decodedAudioTrackBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
          audioTrackBufferRef.current = { url, buffer: decodedAudioTrackBuffer };
        } catch (err) {
          console.warn('Vocal reference audio failed to load/decode:', err);
        }
      }
    }

    setState(prev => ({
      ...prev,
      isPlaying: true,
      currentChordIndex: 0,
      bpm: options.bpm,
      metronomeEnabled: options.metronome,
    }));

    // Setup Media Session for background playback
    setupMediaSession('Chord Progression');

    const { cancel } = scheduleProgression(sections, options.bpm, {
      loop: options.loop ?? true,
      metronome: options.metronome,
      audioTrack: decodedAudioTrackBuffer ? {
        buffer: decodedAudioTrackBuffer,
        wholeRange: options.audioTrack?.wholeRange,
        sectionRanges: options.audioTrack?.sectionRanges,
      } : undefined,
      instruments: options.instruments,
      style,
      transposition: options.transposition,
      onLoopEnd: undefined,
      // Deliberate single pass (loop: false) reached its natural end. Callers that don't
      // care just get stop() (UI doesn't stay stuck "playing" forever); one that wants to
      // chain into something else (see SongChordPlayer's solo-section play) supplies its own.
      onEnded: () => (options.onEnded ?? stop)(),
      getStyle,
      // Dynamic getters for real-time updates without restart
      getMetronome: () => optionsRef.current?.metronome ?? true,
      getInstruments: () => optionsRef.current?.instruments ?? options.instruments,
      getTransposition: () => optionsRef.current?.transposition ?? 0,
      getBpm: () => optionsRef.current?.bpm ?? options.bpm,
      getVocalMuted: () => optionsRef.current?.vocalMuted ?? options.vocalMuted ?? false,
      getVocalVolume: () => optionsRef.current?.vocalVolume ?? options.vocalVolume ?? 1,
      getBassScale: (sectionId: string) => {
        const mel = optionsRef.current?.melodic;
        if (!mel) return null;
        const liveSections = optionsRef.current?.sections ?? sectionsRef.current;
        const sec = liveSections.find(s => s.id === sectionId);
        return resolveVariation(mel.bass, sec?.bassVariationId);
      },
      getPianoScale: (sectionId: string) => {
        const mel = optionsRef.current?.melodic;
        if (!mel) return null;
        const liveSections = optionsRef.current?.sections ?? sectionsRef.current;
        const sec = liveSections.find(s => s.id === sectionId);
        return resolveVariation(mel.piano, sec?.pianoVariationId);
      },
      getGuitarScale: (sectionId: string) => {
        const mel = optionsRef.current?.melodic;
        if (!mel) return null;
        const liveSections = optionsRef.current?.sections ?? sectionsRef.current;
        const sec = liveSections.find(s => s.id === sectionId);
        return resolveVariation(mel.guitar, sec?.guitarVariationId);
      },
      getSections: () => {
        const opts = optionsRef.current;
        return opts?.sections ?? sectionsRef.current;
      },
      // Per-section arrangement. Re-reads the live sections and styles every chord, like
      // the variation getters above, so a section's rhythm can change mid-playback.
      resolveSection: (sectionId: string, songStyle: StylePattern) => {
        const opts = optionsRef.current;
        const liveSections = opts?.sections ?? sectionsRef.current;
        const sec = liveSections.find(s => s.id === sectionId);
        if (!sec) return null;
        const lookup = makeStyleLookup(opts?.customStyles ?? getCustomStyles(), getStyleOverride, opts?.liveEditedStyle);
        return resolveSectionPlayback(sec, songStyle, lookup);
      },
      getNoteLengths: () => optionsRef.current?.noteLengths,
      getLoopingSectionId: () => {
        const opts = optionsRef.current;
        const loopIdx = opts?.loopingSectionIndex;
        if (loopIdx == null) return null;
        const all = opts?.sections ?? sectionsRef.current;
        return all[loopIdx]?.id ?? null;
      },
    });

    cancelRef.current = cancel;
  }, [stop, setupMediaSession, resolveCurrentStyle, appSong]);

  const play = useCallback(async (sections: Section[], options: PlayOptions) => {
    // Acquire mutex to prevent multiple instances
    if (!acquirePlaybackMutex()) {
      console.log('Playback already in progress, stopping first...');
      stop();
      // Small delay to allow cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!acquirePlaybackMutex()) {
        console.error('Could not acquire playback mutex');
        return;
      }
    }

    // A partir de aquí el mutex está TOMADO, y todo lo que sigue es asíncrono: cargar
    // samples, decodificar el soundfont, resolver el estilo. Si cualquiera de esos pasos
    // lanza, sin este try el mutex se quedaría tomado para siempre y la app no volvería a
    // reproducir hasta un stop() explícito — que nadie llama si el fallo fue silencioso.
    //
    // Solo se libera en el camino de ERROR: cuando play() termina bien, el mutex debe seguir
    // tomado, y es stopPlayback() quien lo suelta.
    try {
      await startPlayback(sections, options);
    } catch (err) {
      releasePlaybackMutex();
      setState(prev => ({ ...prev, isPlaying: false }));
      console.error('[AUDIO] play() falló; se libera el mutex para no dejar la reproducción bloqueada', err);
    }
  }, [stop, startPlayback]);

  // Preloads everything play() awaits, without starting playback — used to overlap
  // loading with the countdown so the first play doesn't freeze after the count hits 0.
  const warmup = useCallback(async (options: PlayOptions) => {
    if (useAppEngine.current && (options.loop ?? true) && !options.audioTrack) {
      AppPlayback.warmup();
      return;
    }
    try {
      await ensureSamplesLoaded();
    } catch { /* proceed — play() will retry/await as needed */ }

    const style = resolveActiveStyle(
      options.styleId,
      options.liveEditedStyle,
      options.customStyles ?? getCustomStyles(),
      getStyleOverride,
    );

    const guitarState = options.instruments.find(i => i.id === 'guitar');
    const guitarSoundId = guitarState?.soundTypeId ?? style.instrumentSounds?.guitar;
    if (guitarSoundId) {
      const guitarSoundDef = getSoundType('guitar', guitarSoundId);
      if (guitarSoundDef?.sf2Instrument) {
        try { await ensureGuitarSoundfontLoaded(guitarSoundId, guitarSoundDef.sf2Instrument); } catch { /* play() awaits it too */ }
      }
    }

    const bassState = options.instruments.find(i => i.id === 'bass');
    const bassSoundId = bassState?.soundTypeId ?? style.instrumentSounds?.bass ?? 'fender';
    const bassSoundDef = getSoundType('bass', bassSoundId);
    if (bassSoundDef?.useSamples && bassSoundDef.samplePath && options.sections?.length) {
      // Igual que en play(): solo las notas de esta canción. Si el llamante no pasó las
      // secciones no hay forma de saber cuáles son, y bajarse el banco entero por si acaso
      // es justo lo que se está eliminando — se deja para play(), que sí las tiene.
      const bassMidis = collectMidiNotes('bass', {
        sections: options.sections,
        style,
        melodic: options.melodic,
        transposition: options.transposition,
          octaveOffset: bassSoundDef.octaveOffset,
      });
      try {
        await preloadSampleDirForMidis(getAudioContext(), bassSoundDef.samplePath, bassMidis);
      } catch { /* play() awaits it too */ }
    }
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

  const updatePlaybackOptions = useCallback((updates: Partial<PlayOptions>) => {
    if (optionsRef.current) {
      optionsRef.current = { ...optionsRef.current, ...updates };
      if (appRef.current.active) {
        // Only the mixer moved: send the levels and nothing else, so no note is cut short.
        const keys = Object.keys(updates);
        if (keys.every(k => k === 'instruments' || k === 'vocalMuted' || k === 'vocalVolume')) {
          void appRef.current.updateMix(appSong());
        } else {
          void appRef.current.update(appSong());
        }
        return;
      }
      // Faders, mute and solo live on the mixer buses now, so push them straight through
      // instead of waiting for the scheduler to re-read them at the next chord. Everything
      // else in `updates` is still picked up per segment by the dynamic getters.
      if (updates.instruments || updates.styleId || updates.liveEditedStyle) {
        applyMixerLevels(optionsRef.current.instruments, resolveCurrentStyle());
      }
    }
  }, [resolveCurrentStyle, appSong]);

  // Cleanup on unmount
  useEffect(() => {
    const app = appRef.current;
    return () => {
      if (cancelRef.current) {
        cancelRef.current();
      }
      if (app.active) app.stop();
      stopAudioPlayback();
    };
  }, []);

  // rAF-based chord index + 16th-note playhead sync — reads directly from the Web Audio
  // clock, no setTimeout drift. Both channels share this one frame: the engine publishes
  // schedules (getChordSchedule / getStepSchedule) and never fires a per-slot timer.
  useEffect(() => {
    if (!state.isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPlaybackPosition(-1);
      setStep(-1);
      return;
    }
    // Both schedules are append-ordered by audioTime, so the newest entry at or before
    // `now` is the current one — scan backwards and stop at the first hit.
    const latestAtOrBefore = <T extends { audioTime: number }>(schedule: T[], now: number): T | null => {
      for (let i = schedule.length - 1; i >= 0; i--) {
        if (schedule[i].audioTime <= now) return schedule[i];
      }
      return null;
    };
    const loop = () => {
      if (appRef.current.active) {
        const at = appRef.current.position();
        if (at) {
          setStep(at.step);
          setState(prev => prev.currentChordIndex === at.chordIndex ? prev : { ...prev, currentChordIndex: at.chordIndex });
          setPlaybackPosition(at.position);
        }
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        const step = latestAtOrBefore(getStepSchedule(), now);
        if (step) setStep(step.patternSlot);

        const schedule = getChordSchedule();
        let foundIdx = -1;
        for (let i = schedule.length - 1; i >= 0; i--) {
          if (schedule[i].audioTime <= now) {
            foundIdx = i;
            break;
          }
        }
        if (foundIdx >= 0) {
          const entry = schedule[foundIdx];
          setState(prev => prev.currentChordIndex === entry.chordIndex ? prev : { ...prev, currentChordIndex: entry.chordIndex });

          // Fraction of the way through this chord, using its own known duration (not the
          // gap to the next schedule entry — that only appears once the bar-by-bar scheduler
          // gets around to the next chord, which lags well behind the chord's actual start
          // and would leave this stuck near 0 for most of its length).
          const fraction = entry.durationSec > 0
            ? Math.min(1, Math.max(0, (now - entry.audioTime) / entry.durationSec))
            : 0;
          // Combined into one number (not separate index/fraction channels) so a consumer
          // never reads one half updated and the other stale — see PlaybackContextValue note.
          setPlaybackPosition(entry.chordIndex + fraction);
        }
      } catch {
        // Audio context not yet initialized
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
