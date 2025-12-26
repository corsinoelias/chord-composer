import { useEffect, useCallback } from 'react';
import { audioEvents, AudioEventMap } from '@/lib/audioEvents';

type EventCallback<T> = T extends void ? () => void : (data: T) => void;

/**
 * React hook to subscribe to audio events with automatic cleanup
 * 
 * @param event - The event name to subscribe to
 * @param callback - The callback function to call when the event is emitted
 * 
 * @example
 * useAudioEvent('playback:stopped', ({ source }) => {
 *   console.log(`Playback stopped from ${source}`);
 *   setIsPlaying(false);
 * });
 */
export function useAudioEvent<K extends keyof AudioEventMap>(
  event: K,
  callback: EventCallback<AudioEventMap[K]>
): void {
  // Wrap callback in useCallback to maintain stable reference
  const stableCallback = useCallback(callback, [callback]);

  useEffect(() => {
    const unsubscribe = audioEvents.on(event, stableCallback as EventCallback<AudioEventMap[K]>);
    return unsubscribe;
  }, [event, stableCallback]);
}

/**
 * Hook to get the emit function for triggering audio events
 * Useful for components that need to emit events but not subscribe
 * 
 * @returns The emit function from audioEvents
 * 
 * @example
 * const emit = useAudioEmit();
 * emit('playback:started', { source: 'local' });
 */
export function useAudioEmit() {
  return audioEvents.emit.bind(audioEvents);
}
