/**
 * Centralized Playback State Context
 * Single source of truth for all playback-related state
 * Includes Media Session API for background playback on mobile
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { type Section } from '@/lib/sections';
import { type InstrumentState, getDefaultInstrumentStates } from '@/lib/instruments';
import { type StylePattern, MUSICAL_STYLES, getStyleByIdWithOverrides } from '@/lib/styles';
import { getStyleOverride, getCustomStyles } from '@/lib/customStyles';
import { type MelodicData, resolveVariation } from '@/lib/bassScale';
import {
  ensureSamplesLoaded,
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
  const audioPreloaded = useRef(false);

  // Pre-load audio on first user interaction for faster first playback
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (!audioPreloaded.current) {
        audioPreloaded.current = true;
        preloadAudio().catch(console.warn);
        // Remove listeners after first interaction
        window.removeEventListener('click', handleFirstInteraction);
        window.removeEventListener('touchstart', handleFirstInteraction);
        window.removeEventListener('keydown', handleFirstInteraction);
      }
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
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

    try {
      await ensureSamplesLoaded();
    } catch (err) {
      console.warn('Sample loading issue, proceeding anyway:', err);
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

    const getStyle = () => {
      const opts = optionsRef.current;
      if (!opts) return MUSICAL_STYLES[0];
      if (opts.liveEditedStyle) return opts.liveEditedStyle;
      return getStyleByIdWithOverrides(opts.styleId, opts.customStyles || getCustomStyles(), getStyleOverride) || MUSICAL_STYLES[0];
    };

    const style = getStyle();

    const { cancel } = scheduleProgression(sections, options.bpm, {
      loop: true,
      metronome: options.metronome,
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
