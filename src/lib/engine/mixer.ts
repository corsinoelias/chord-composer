/**
 * Per-instrument mixer buses.
 *
 *   piano ─┐
 *   bass  ─┤
 *   drums ─┼─→ masterGain → [EQ → Comp → Reverb] → analyser → destination
 *   guitar ┘
 *
 * Before this existed, every note baked its instrument's level into its own gain:
 * `state.volume * style.volumes.piano * velocity`, written out at 18 call sites across
 * the live scheduler and the offline renderer. Two consequences, both fixed here:
 *
 *   - Moving a fader did nothing until the next chord segment, because the level was only
 *     re-read once per segment when the notes were created.
 *   - The formula had to be kept in sync by hand in every one of those 18 places.
 *
 * Now the note carries only its velocity and the bus carries the instrument level, so a
 * fader move is a single AudioParam ramp that applies to everything already scheduled.
 *
 * Not routed through here (deliberately, see docs/audio-engine-refactor.md):
 *   - the metronome click, which is not a mixer channel;
 *   - chord/drum previews, which bypass instrument volume today and would otherwise fall
 *     silent when the user has that instrument muted;
 *   - the vocal reference track, which goes straight to destination to stay out of the
 *     master effects chain and already has its own ramped gain.
 */

import { type InstrumentType } from '../instruments';

export type BusId = InstrumentType;

const BUS_IDS: BusId[] = ['piano', 'bass', 'drums', 'guitar'];

/** Fader ramp. Long enough not to click, short enough to feel instant. */
const RAMP_SEC = 0.02;

interface MixerState {
  ctx: AudioContext;
  buses: Record<BusId, GainNode>;
}

let mixer: MixerState | null = null;

/**
 * Builds the buses and wires them into `destination` (the master gain). Safe to call
 * repeatedly for the same context; a different context replaces the mixer, since Web Audio
 * nodes cannot be shared across contexts.
 */
export function createMixer(ctx: AudioContext, destination: AudioNode): void {
  if (mixer && mixer.ctx === ctx) return;
  const buses = {} as Record<BusId, GainNode>;
  for (const id of BUS_IDS) {
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(destination);
    buses[id] = gain;
  }
  mixer = { ctx, buses };
}

/**
 * The bus to schedule an instrument's notes into. Returns null when the mixer belongs to a
 * stale context — callers must treat that the same way they treat a stale masterGain and
 * skip scheduling, rather than connecting nodes across contexts.
 */
export function getBus(ctx: AudioContext, id: BusId): GainNode | null {
  if (!mixer || mixer.ctx !== ctx) return null;
  return mixer.buses[id];
}

/**
 * Sets an instrument's level. Ramps rather than jumps so a fader drag doesn't zipper.
 * `level` is the instrument's own volume times the style's default for it — muting is just
 * level 0.
 */
export function setBusLevel(ctx: AudioContext, id: BusId, level: number): void {
  const bus = getBus(ctx, id);
  if (!bus) return;
  const now = ctx.currentTime;
  const target = Math.max(0, level);
  // Reading .value gives the ramp's current position, so an interrupted ramp continues
  // from where it actually is instead of snapping back to where the last one started.
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.linearRampToValueAtTime(target, now + RAMP_SEC);
}

