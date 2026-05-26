/**
 * Hook to synchronize instrument settings with the selected rhythm style.
 * 
 * Each style can define its own instrumentSounds (piano, bass, drums, guitar sound types),
 * and this hook automatically applies them when the style changes.
 */

import { useEffect, useCallback, useRef } from 'react';
import { type InstrumentState, type InstrumentType, getDefaultInstrumentStates, INSTRUMENTS } from '@/lib/instruments';
import { type StylePattern, type InstrumentSounds } from '@/lib/styles';

interface UseStyleInstrumentsOptions {
  style: StylePattern | null;
  instruments: InstrumentState[];
  onInstrumentsChange: (instruments: InstrumentState[]) => void;
  enabled?: boolean;
}

/**
 * Create instrument states based on a style's instrumentSounds configuration.
 * Preserves mute/solo state and volume from current instruments if provided.
 */
export function createInstrumentStatesFromStyle(
  style: StylePattern | null,
  currentInstruments?: InstrumentState[]
): InstrumentState[] {
  const defaultStates = getDefaultInstrumentStates();
  
  if (!style?.instrumentSounds) {
    // No style-specific sounds, return defaults (preserving current mute/volume if available)
    if (!currentInstruments) return defaultStates;
    
    return defaultStates.map(defaultInst => {
      const current = currentInstruments.find(i => i.id === defaultInst.id);
      return current ? {
        ...defaultInst,
        muted: current.muted,
        solo: current.solo,
        volume: current.volume,
      } : defaultInst;
    });
  }

  const sounds = style.instrumentSounds;
  
  return INSTRUMENTS.map(inst => {
    const currentInst = currentInstruments?.find(i => i.id === inst.id);
    const styleSoundId = sounds[inst.id as keyof InstrumentSounds];
    
    // Validate that the sound type exists for this instrument
    const validSoundId = styleSoundId && inst.soundTypes.some(s => s.id === styleSoundId)
      ? styleSoundId
      : inst.defaultSoundType;
    
    return {
      id: inst.id,
      muted: currentInst?.muted ?? false,
      solo: currentInst?.solo ?? false,
      volume: style.volumes?.[inst.id as keyof typeof style.volumes] ?? currentInst?.volume ?? 0.7,
      soundTypeId: validSoundId,
    };
  });
}

/**
 * Hook that automatically syncs instrument settings when style changes.
 * Only updates sound types and volumes from the style, preserves mute/solo state.
 */
export function useStyleInstruments({
  style,
  instruments,
  onInstrumentsChange,
  enabled = true,
}: UseStyleInstrumentsOptions): void {
  const lastStyleIdRef = useRef<string | null>(null);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (!enabled || !style) return;
    
    // Skip on first render to avoid resetting user customizations
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      lastStyleIdRef.current = style.id;
      return;
    }
    
    // Only sync when style ID actually changes
    if (lastStyleIdRef.current === style.id) return;
    lastStyleIdRef.current = style.id;
    
    // Create new instrument states from the style, preserving mute/solo
    const newInstruments = createInstrumentStatesFromStyle(style, instruments);
    onInstrumentsChange(newInstruments);
  }, [style?.id, enabled]);
}

/**
 * Get effective instrument settings for playback/export.
 * Combines current instrument settings with style overrides.
 */
export function getEffectiveInstruments(
  instruments: InstrumentState[],
  style: StylePattern | null
): InstrumentState[] {
  if (!style?.instrumentSounds) return instruments;
  
  const sounds = style.instrumentSounds;
  
  return instruments.map(inst => {
    const styleSoundId = sounds[inst.id as keyof InstrumentSounds];
    const config = INSTRUMENTS.find(i => i.id === inst.id);
    
    // Only override if the style specifies a valid sound type
    if (styleSoundId && config?.soundTypes.some(s => s.id === styleSoundId)) {
      return { ...inst, soundTypeId: styleSoundId };
    }
    
    return inst;
  });
}
