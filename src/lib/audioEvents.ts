/**
 * Audio Event System
 * 
 * Centralized event emitter for audio state changes.
 * Allows decoupled communication between audio engine and UI components.
 */

export type AudioEventMap = {
  'playback:started': { source: 'main' | 'local' };
  'playback:stopped': { source: 'main' | 'local' };
  'playback:step': { step: number; bar: number };
  'playback:chord-changed': { chordIndex: number };
  'playback:loop-end': void;
  'playback:bpm-changed': { bpm: number };
};

type EventCallback<T> = T extends void ? () => void : (data: T) => void;

class AudioEventEmitter {
  private listeners: Map<keyof AudioEventMap, Set<Function>> = new Map();

  /**
   * Subscribe to an audio event
   * @returns Unsubscribe function
   */
  on<K extends keyof AudioEventMap>(
    event: K,
    callback: EventCallback<AudioEventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an audio event
   */
  off<K extends keyof AudioEventMap>(
    event: K,
    callback: Function
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  /**
   * Emit an audio event to all subscribers
   */
  emit<K extends keyof AudioEventMap>(
    event: K,
    ...[data]: AudioEventMap[K] extends void ? [] : [AudioEventMap[K]]
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in audio event listener for "${event}":`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners (useful for cleanup)
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get count of listeners for debugging
   */
  getListenerCount(event?: keyof AudioEventMap): number {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    this.listeners.forEach(set => total += set.size);
    return total;
  }
}

// Singleton instance
export const audioEvents = new AudioEventEmitter();
