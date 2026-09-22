/**
 * How the click sounds — the Android app's metronome settings (AppSettings in
 * lib/core/data/app_settings.dart, metronomeSounds in constants.dart), with the same sounds
 * and the same ids, since both send them to the same engine.
 *
 * They belong to the person, not to the song: a song does not get a different click because
 * someone else opens it. So they live in this browser (localStorage), like the app keeps them
 * in its own settings.
 */
import { CLICK_BEEP, sampledDrum } from './appEngine/commands';

export interface ClickSettings {
  /** A drum sound the engine knows, or CLICK_BEEP for its own sine pip. */
  sound: number;
  /** 0-1. The engine gives the top of the range twice unity gain, so it can sit over a song. */
  volume: number;
  /** The first beat of the bar clicks harder than the rest. */
  accent: boolean;
  /** Clicks per beat: 1, or 2 to hear the half beats too. */
  division: 1 | 2;
}

export const CLICK_SOUNDS: { id: number; label: string }[] = [
  { id: sampledDrum(2), label: 'Stick' },
  { id: sampledDrum(36), label: 'Cowbell' },
  { id: sampledDrum(9), label: 'Ride' },
  { id: CLICK_BEEP, label: 'Beep' },
];

/**
 * The cowbell, as the app (decided 2026-09-22), and quieter than the app's 0.7: at that level
 * the click sat over the whole song ("demasiado fuerte", 2026-09-22). The slider goes back up.
 */
export const DEFAULT_CLICK: ClickSettings = { sound: sampledDrum(36), volume: 0.35, accent: true, division: 1 };

const STORE = 'click-settings-v1';

export function loadClickSettings(): ClickSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_CLICK;
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<ClickSettings> | null;
    if (!raw) return DEFAULT_CLICK;
    return {
      sound: CLICK_SOUNDS.some((s) => s.id === raw.sound) ? raw.sound! : DEFAULT_CLICK.sound,
      volume: typeof raw.volume === 'number' ? Math.max(0, Math.min(1, raw.volume)) : DEFAULT_CLICK.volume,
      accent: typeof raw.accent === 'boolean' ? raw.accent : DEFAULT_CLICK.accent,
      division: raw.division === 2 ? 2 : 1,
    };
  } catch {
    return DEFAULT_CLICK; // private window: this visit's click is the default one
  }
}

export function saveClickSettings(settings: ClickSettings): void {
  try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* ignore */ }
}

export const clickSoundLabel = (id: number): string =>
  CLICK_SOUNDS.find((s) => s.id === id)?.label ?? 'Click';
