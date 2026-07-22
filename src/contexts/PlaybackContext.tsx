/**
 * Centralized Playback State Context
 * Single source of truth for all playback-related state
 * Includes Media Session API for background playback on mobile
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { type Section } from '@/lib/sections';
import { type InstrumentState, getDefaultInstrumentStates, getSoundType } from '@/lib/instruments';
import { type StylePattern, MUSICAL_STYLES, resolveActiveStyle } from '@/lib/styles';
import { getStyleOverride, getCustomStyles } from '@/lib/customStyles';
import { type MelodicData, resolveVariation } from '@/lib/bassScale';
import { preloadSampleDir } from '@/lib/bassTab/sampleEngine';
import {
  ensureSamplesLoaded,
  ensureGuitarSoundfontLoaded,
  scheduleProgression,
  stopPlayback as stopAudioPlayback,
  preloadAudio,
  acquirePlaybackMutex,
  releasePlaybackMutex,
  getAudioContext,
  getChordSchedule,
  clearChordSchedule,
} from '@/lib/audioEngine';

interface PlaybackState {
  isPlaying: boolean;
  currentChordIndex: number;
  currentStep: number;
  bpm: number;
  metronomeEnabled: boolean;
}

interface PlaybackContextValue {
  // State
  state: PlaybackState;
  
  // Actions
  play: (sections: Section[], options: PlayOptions) => Promise<void>;
  stop: () => void;
  setBpm: (bpm: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  
  // For live updates during playback
  updatePlaybackOptions: (options: Partial<PlayOptions>) => void;
}

interface PlayOptions {
  bpm: number;
  metronome: boolean;
  instruments: InstrumentState[];
  styleId: string;
  transposition: number;
  liveEditedStyle?: StylePattern | null;
  customStyles?: StylePattern[];
  loopingSectionIndex?: number | null;
  melodic?: MelodicData;
  sections?: Section[];
  // Vocal/reference audio — a single file, sliced per section (keyed by Section.id) or
  // as one continuous span for the whole song. Decoded once per URL (see
  // audioTrackBufferRef) and muted while transposition !== 0 (local-only prototype).
  audioTrack?: {
    url: string;
    wholeRange?: { startSec: number; endSec: number };
    sectionRanges?: Record<string, { startSec: number; endSec: number }>;
  };
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function usePlayback() {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
}

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    currentChordIndex: -1,
    currentStep: -1,
    bpm: 100,
    metronomeEnabled: true,
  });

  const cancelRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number>();
  const optionsRef = useRef<PlayOptions | null>(null);
  const sectionsRef = useRef<Section[]>([]);
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
      setState(prev => ({ ...prev, isPlaying: false, currentChordIndex: -1, currentStep: -1 }));
    };
    window.addEventListener('chordplayer:playback-started', handleOtherInstanceStarted);
    return () => window.removeEventListener('chordplayer:playback-started', handleOtherInstanceStarted);
  }, []);

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
        preloadAudio().catch(console.warn);
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

  const stop = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    stopAudioPlayback();
    setState(prev => ({
      ...prev,
      isPlaying: false,
      currentChordIndex: -1,
      currentStep: -1,
    }));
  }, []);

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

    try {
      await ensureSamplesLoaded();
    } catch (err) {
      console.warn('Sample loading issue, proceeding anyway:', err);
    }

    const getStyle = () => {
      const opts = optionsRef.current;
      if (!opts) return MUSICAL_STYLES[0];
      return resolveActiveStyle(
        opts.styleId,
        opts.liveEditedStyle,
        opts.customStyles ?? getCustomStyles(),
        getStyleOverride,
      );
    };

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
    const bassState = options.instruments.find(i => i.id === 'bass');
    const bassSoundId = bassState?.soundTypeId ?? style.instrumentSounds?.bass ?? 'fender';
    const bassSoundDef = getSoundType('bass', bassSoundId);
    if (bassSoundDef?.useSamples && bassSoundDef.samplePath) {
      await preloadSampleDir(getAudioContext(), bassSoundDef.samplePath);
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
      loop: true,
      metronome: options.metronome,
      audioTrack: decodedAudioTrackBuffer ? {
        buffer: decodedAudioTrackBuffer,
        wholeRange: options.audioTrack?.wholeRange,
        sectionRanges: options.audioTrack?.sectionRanges,
      } : undefined,
      instruments: options.instruments,
      style,
      transposition: options.transposition,
      onChordChange: undefined,
      onLoopEnd: undefined,
      onStepChange: (step) => setState(prev => ({ ...prev, currentStep: step })),
      getStyle,
      // Dynamic getters for real-time updates without restart
      getMetronome: () => optionsRef.current?.metronome ?? true,
      getInstruments: () => optionsRef.current?.instruments ?? options.instruments,
      getTransposition: () => optionsRef.current?.transposition ?? 0,
      getBpm: () => optionsRef.current?.bpm ?? options.bpm,
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
      getLoopingSectionId: () => {
        const opts = optionsRef.current;
        const loopIdx = opts?.loopingSectionIndex;
        if (loopIdx == null) return null;
        const all = opts?.sections ?? sectionsRef.current;
        return all[loopIdx]?.id ?? null;
      },
    });

    cancelRef.current = cancel;
  }, [stop, setupMediaSession]);

  const setBpm = useCallback((bpm: number) => {
    setState(prev => ({ ...prev, bpm }));
    if (optionsRef.current) {
      optionsRef.current.bpm = bpm;
    }
  }, []);

  const setMetronomeEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, metronomeEnabled: enabled }));
    if (optionsRef.current) {
      optionsRef.current.metronome = enabled;
    }
  }, []);

  const updatePlaybackOptions = useCallback((updates: Partial<PlayOptions>) => {
    if (optionsRef.current) {
      optionsRef.current = { ...optionsRef.current, ...updates };
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current();
      }
      stopAudioPlayback();
    };
  }, []);

  // rAF-based chord index sync — reads directly from the Web Audio clock, no setTimeout drift
  useEffect(() => {
    if (!state.isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const loop = () => {
      try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const schedule = getChordSchedule();
        let found = -1;
        for (let i = schedule.length - 1; i >= 0; i--) {
          if (schedule[i].audioTime <= now) {
            found = schedule[i].chordIndex;
            break;
          }
        }
        if (found >= 0) {
          setState(prev => prev.currentChordIndex === found ? prev : { ...prev, currentChordIndex: found });
        }
      } catch {
        // Audio context not yet initialized
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state.isPlaying]);

  const value: PlaybackContextValue = {
    state,
    play,
    stop,
    setBpm,
    setMetronomeEnabled,
    updatePlaybackOptions,
  };

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}
