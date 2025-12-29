/**
 * Centralized Playback State Context
 * Single source of truth for all playback-related state
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { Section } from '@/lib/sections';
import { InstrumentState, getDefaultInstrumentStates } from '@/lib/instruments';
import { StylePattern, MUSICAL_STYLES, getStyleByIdWithOverrides } from '@/lib/styles';
import { getStyleOverride, getCustomStyles } from '@/lib/customStyles';
import { ensureSamplesLoaded, scheduleProgression, stopPlayback as stopAudioPlayback, preloadAudio } from '@/lib/audioEngine';

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

  const play = useCallback(async (sections: Section[], options: PlayOptions) => {
    // Stop any existing playback first
    stop();
    
    sectionsRef.current = sections;
    optionsRef.current = options;

    const loopIdx = options.loopingSectionIndex;
    const loopSection = (loopIdx !== null && loopIdx !== undefined) ? sections[loopIdx] : undefined;
    const sectionsToPlay = loopSection ? [loopSection] : sections;

    const hasChords = sectionsToPlay.some(s => (s?.chords?.length ?? 0) > 0);
    if (!hasChords) return;

    await ensureSamplesLoaded();

    setState(prev => ({
      ...prev,
      isPlaying: true,
      currentChordIndex: 0,
      bpm: options.bpm,
      metronomeEnabled: options.metronome,
    }));

    const getStyle = () => {
      const opts = optionsRef.current;
      if (!opts) return MUSICAL_STYLES[0];
      if (opts.liveEditedStyle) return opts.liveEditedStyle;
      return getStyleByIdWithOverrides(opts.styleId, opts.customStyles || getCustomStyles(), getStyleOverride) || MUSICAL_STYLES[0];
    };

    const style = getStyle();

    const { cancel } = scheduleProgression(sectionsToPlay, options.bpm, {
      loop: true,
      metronome: options.metronome,
      instruments: options.instruments,
      style,
      transposition: options.transposition,
      onChordChange: (index) => setState(prev => ({ ...prev, currentChordIndex: index })),
      onLoopEnd: () => setState(prev => ({ ...prev, currentChordIndex: 0 })),
      onStepChange: (step) => setState(prev => ({ ...prev, currentStep: step })),
      getStyle,
      // Dynamic getters for real-time updates without restart
      getMetronome: () => optionsRef.current?.metronome ?? true,
      getInstruments: () => optionsRef.current?.instruments ?? options.instruments,
      getTransposition: () => optionsRef.current?.transposition ?? 0,
    });

    cancelRef.current = cancel;
  }, [stop]);

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
