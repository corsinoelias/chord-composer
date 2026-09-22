/**
 * The mixer, as the Android app draws it (lib/features/mixer/mixer_screen.dart and the
 * "Mezclador" artboard): a strip per instrument — pan, meter and fader, level, mute and solo,
 * name — then the master at the end on a ground of its own, the EQ as a curve you drag, the
 * compressor behind a tab, and the reverb on two knobs.
 *
 * Every part of it is the engine's: the meters are the held peaks it reports (bus 0-3 and the
 * master, read while it plays), the pan and the master fader its own `pan` and `mixer`
 * commands (mix.ts), the tone and compression one `strip` per channel and the reverb one send
 * (effects.ts). The tone panel shows the channel whose name was tapped in the console, as the
 * app's follows the instrument tab.
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { analytics } from '@/lib/analytics';
import { ChevronLeft, Volume2 } from 'lucide-react';
import { engineLevels, engineReductions } from '@/lib/appEngine/player';
import { getMix, type MixSettings } from '@/lib/appEngine/mix';
import { type InstrumentState, type InstrumentType } from '@/lib/instruments';
import {
  type ChannelStrip,
  type EffectsState,
  DEFAULT_EFFECTS_STATE,
  EQ_BANDS,
  isStripFlat,
  updateStrip,
  resetStrip,
  updateReverb,
  updateMaster,
  updatePan,
  resetEffects,
  getCurrentEffectsState,
  isConsoleDefault,
} from '@/lib/appEngine/effects';

interface MixingConsoleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The song's instruments; the strips read and change volume, mute and solo. */
  instruments?: InstrumentState[];
  onInstrumentsChange?: (next: InstrumentState[]) => void;
  /**
   * Something in the console moved (pan, master, tone, reverb). The console itself holds that
   * state — it belongs to the engine, not to React — so this only tells the editor to save it
   * with the song; the snapshot is read with currentSongMixer().
   */
  onMixerChange?: () => void;
}

/** The app's identity colour per instrument (AppTheme chart colours). */
const CHANNELS: { id: InstrumentType; name: string; color: string }[] = [
  { id: 'drums', name: 'Drums', color: '#FF3849' },
  { id: 'piano', name: 'Piano', color: '#E8B93E' },
  { id: 'guitar', name: 'Guitar', color: '#34C3B0' },
  { id: 'bass', name: 'Bass', color: '#8C7AE6' },
];

const dbOf = (volume: number) =>
  volume <= 0.001 ? '−∞' : `${volume >= 1 ? '' : '−'}${Math.abs(20 * Math.log10(volume)).toFixed(1)}`;

/** A room by its name: a number would say nothing about how long the tail runs (the app's). */
const roomOf = (size: number) => (size < 0.35 ? 'Small room' : size < 0.75 ? 'Medium hall' : 'Cathedral');

/** How tall the meter-and-fader row runs; the cap's own height insets the meter to match. */
const CAP = 14;

/**
 * A peak meter: green, yellow near the top, red at the very top, over the last 48 dB. The
 * scale and the colours are the app's (_Meter), and the gradient belongs to the track rather
 * than to the fill, so a colour never moves as the level changes — the top of the bar is red
 * whether the sound is reaching it or not.
 */
function Meter({ level, label }: { level: number; label: string }) {
  const db = level <= 0 ? -60 : 20 * Math.log10(level);
  const lit = Math.max(0, Math.min(1, (db + 48) / 48));
  return (
    <div
      className="relative h-full w-1 overflow-hidden rounded-full"
      style={{ background: 'linear-gradient(0deg, #2DD29B 0%, #2DD29B 70%, #F4B925 88%, #FF3849 100%)' }}
      role="meter"
      aria-label={`${label} level`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(lit * 100)}
    >
      <div
        className="absolute inset-x-0 top-0 transition-[height] duration-75 ease-out"
        style={{ height: `${(1 - lit) * 100}%`, background: 'var(--cp-s3)' }}
      />
    </div>
  );
}

/** The level meter and the fader, side by side, running the same length. */
function MeterAndFader({
  label,
  value,
  color,
  level,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  level: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-[170px] justify-center gap-[3px] sm:h-[200px]">
      <div className="h-full" style={{ paddingTop: CAP / 2, paddingBottom: CAP / 2 }}>
        <Meter level={level} label={label} />
      </div>
      <Fader value={value} color={color} label={label} onChange={onChange} />
    </div>
  );
}

/** A vertical fader: coloured fill from the bottom, a white cap you drag. */
function Fader({ value, color, label, onChange }: { value: number; color: string; label: string; onChange: (v: number) => void }) {
  return (
    <SliderPrimitive.Root
      orientation="vertical"
      min={0}
      max={1}
      step={0.01}
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      aria-label={`${label} volume`}
      className="relative flex h-full w-[22px] touch-none select-none flex-col items-center"
    >
      <SliderPrimitive.Track className="relative h-full w-1.5 overflow-hidden rounded-full" style={{ background: 'var(--cp-s3)' }}>
        <SliderPrimitive.Range className="absolute w-full" style={{ background: color }} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-3.5 w-[22px] cursor-grab rounded-[4px] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ background: '#FFFFFF', boxShadow: '0 0 0 1px var(--cp-ln2), 0 2px 6px rgba(20,24,31,.3)' }}
      />
    </SliderPrimitive.Root>
  );
}

/**
 * A knob, the app's (_Knob): dragged up or right to turn it clockwise, down or left the other
 * way, a double click puts it back where it rests, and the arrow keys nudge it. The mark
 * sweeps −135°…135°.
 */
function Knob({
  value,
  min,
  max,
  label,
  valueText,
  mark,
  ring,
  children,
  onChange,
  onCommit,
  onReset,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  valueText: string;
  /** The mark's colour; the channel's, for a pan knob. */
  mark?: string;
  /** The rim's colour, the accent on the reverb's. */
  ring?: string;
  /** What is drawn under it — the label and value, or a pan's own readout. */
  children?: ReactNode;
  onChange: (v: number) => void;
  onCommit: () => void;
  onReset?: () => void;
}) {
  const drag = useRef<{ x: number; y: number; v: number } | null>(null);
  const t = (value - min) / (max - min);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  return (
    <div className="flex flex-col items-center gap-[3px]">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        title={onReset ? `${label} · drag to turn, double-click to reset` : label}
        className="relative h-[34px] w-[34px] shrink-0 cursor-ns-resize touch-none rounded-full"
        style={{ background: 'var(--cp-s2)', border: `1.5px solid ${ring ?? 'var(--cp-ln2)'}` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          const from = drag.current;
          if (!from) return;
          // 120px of travel covers the whole range, right or up to turn it clockwise.
          const moved = (e.clientX - from.x) - (e.clientY - from.y);
          onChange(clamp(from.v + (moved / 120) * (max - min)));
        }}
        onPointerUp={() => {
          if (drag.current) onCommit();
          drag.current = null;
        }}
        onDoubleClick={onReset}
        onKeyDown={(e) => {
          const step = (max - min) / 20;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step));
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step));
          else return;
          e.preventDefault();
          onCommit();
        }}
      >
        <span
          className="absolute left-[15px] top-[3px] h-[10px] w-[2px] rounded-[1px]"
          style={{ background: mark ?? 'var(--cp-act)', transform: `rotate(${-135 + t * 270}deg)`, transformOrigin: '1px 13px' }}
        />
      </div>
      {children ?? (
        <span className="text-[10px]" style={{ color: 'var(--cp-mu)' }}>{label} {valueText}</span>
      )}
    </div>
  );
}

/** Where a track sits, as a console writes it: C in the middle, L25 a quarter to the left. */
const panText = (pan: number) =>
  Math.abs(pan) < 0.02 ? 'C' : `${pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(pan) * 100)}`;

/** The curve's box, in its own units. ±14 dB of room for a band that stops at ±12. */
const EQ_W = 342;
const EQ_H = 120;
const EQ_SPAN = 14;
/** The axis runs 40 Hz to 16 kHz, by octaves, as the app's _EqCurve draws it. */
const OCT_LO = Math.log2(40);
const OCT_HI = Math.log2(16000);
const octX = (hz: number) => ((Math.log2(hz) - OCT_LO) / (OCT_HI - OCT_LO)) * EQ_W;
const eqY = (db: number) => EQ_H / 2 - (db / EQ_SPAN) * (EQ_H / 2 - 12);

/**
 * The three bands as the curve they make: a shelf at 160 Hz, a bell at 1 kHz and a shelf at
 * 4.5 kHz, summed — a picture of the settings rather than a measurement, which is all a curve
 * this size needs to be. Drag a handle up or down; a double click flattens that band.
 */
function EqCurve({
  strip,
  color,
  onChange,
  onCommit,
}: {
  strip: ChannelStrip;
  color: string;
  onChange: (band: 'low' | 'mid' | 'high', db: number) => void;
  onCommit: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ band: 'low' | 'mid' | 'high'; y: number; db: number } | null>(null);

  const gainAt = (octave: number) => {
    const shelf = (centre: number, sign: number) => 1 / (1 + Math.exp(sign * (octave - Math.log2(centre)) * 2.2));
    const bell = Math.exp(-((octave - Math.log2(1000)) ** 2) / (2 * 0.9 * 0.9));
    return strip.low * shelf(160, 1) + strip.mid * bell + strip.high * shelf(4500, -1);
  };

  let line = '';
  for (let x = 0; x <= EQ_W; x += 2) {
    const octave = OCT_LO + (x / EQ_W) * (OCT_HI - OCT_LO);
    line += `${x === 0 ? 'M' : 'L'}${x} ${eqY(gainAt(octave)).toFixed(2)} `;
  }

  /** A drag moves the band from where it was, so the handle never jumps to the finger. */
  const dbFrom = (start: { db: number; y: number }, clientY: number) => {
    const box = svgRef.current!.getBoundingClientRect();
    const perDb = ((EQ_H / 2 - 12) / EQ_SPAN) * (box.height / EQ_H);
    const db = Math.max(-12, Math.min(12, start.db - (clientY - start.y) / perDb));
    return Math.abs(db) < 0.4 ? 0 : Math.round(db * 2) / 2;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${EQ_W} ${EQ_H}`}
      className="block w-full touch-none select-none"
      role="group"
      aria-label="Equaliser curve"
      onPointerMove={(e) => {
        if (drag.current) onChange(drag.current.band, dbFrom(drag.current, e.clientY));
      }}
      onPointerUp={() => {
        if (drag.current) onCommit();
        drag.current = null;
      }}
    >
      <rect x="0" y="0" width={EQ_W} height={EQ_H} rx="10" fill="var(--cp-s2)" />
      <g stroke="var(--cp-s3)" strokeWidth="1">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={`h${f}`} x1="0" y1={EQ_H * f} x2={EQ_W} y2={EQ_H * f} />
        ))}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={`v${f}`} x1={EQ_W * f} y1="0" x2={EQ_W * f} y2={EQ_H} />
        ))}
      </g>
      <path d={`${line} L ${EQ_W} ${EQ_H} L 0 ${EQ_H} Z`} fill={color} fillOpacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {EQ_BANDS.map(({ band, hz, label }) => {
        const x = octX(hz);
        const db = strip[band];
        return (
          <g key={band}>
            <circle
              cx={x}
              cy={eqY(gainAt(Math.log2(hz)))}
              r="9"
              fill="var(--cp-s1)"
              stroke={color}
              strokeWidth="2.5"
              className="cursor-ns-resize"
              role="slider"
              tabIndex={0}
              aria-label={`${band} EQ gain`}
              aria-valuemin={-12}
              aria-valuemax={12}
              aria-valuenow={db}
              aria-valuetext={`${db > 0 ? '+' : ''}${db.toFixed(1)} dB at ${label}`}
              onPointerDown={(e) => {
                svgRef.current?.setPointerCapture(e.pointerId);
                drag.current = { band, y: e.clientY, db };
              }}
              onDoubleClick={() => {
                drag.current = null;
                onChange(band, 0);
                onCommit();
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') onChange(band, Math.min(12, db + 0.5));
                else if (e.key === 'ArrowDown') onChange(band, Math.max(-12, db - 0.5));
                else return;
                e.preventDefault();
                onCommit();
              }}
            />
            <text
              x={Math.max(6, Math.min(EQ_W - 46, x - 20))}
              y={EQ_H - 6}
              fill="var(--cp-fa)"
              fontSize="9"
              fontFamily="Space Mono, monospace"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** A band's value, in a tile under the curve. Clicking it puts the band back at 0. */
function BandTile({ label, db, onReset }: { label: string; db: number; onReset: () => void }) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-0.5 rounded-[10px] py-2"
      style={{ background: 'var(--cp-s2)' }}
      title={`${label} · click to go back to 0`}
      onClick={onReset}
    >
      <span className="cp-lbl">{label}</span>
      <span className="cp-mono text-sm font-bold">
        {Math.abs(db) < 0.05 ? '0.0' : `${db > 0 ? '+' : '−'}${Math.abs(db).toFixed(1)}`}
      </span>
    </button>
  );
}

/**
 * A compressor setting: a label, a line, and the number it is on. A double click puts it back
 * where it does nothing — [rest], which is the bottom for a ratio and the *top* for a
 * threshold.
 */
function StripSlider({
  label,
  value,
  min,
  max,
  step,
  rest,
  color,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  rest: number;
  color: string;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  // At rest the line is grey: a threshold sitting at the top is a compressor doing nothing, and
  // a full bar in the channel's colour would read as one turned all the way up.
  const moved = Math.abs(value - rest) > 0.01;
  return (
    <div className="flex items-center gap-3" onDoubleClick={() => { onChange(rest); onCommit(); }}>
      <span className="w-[62px] shrink-0 text-xs" style={{ color: 'var(--cp-tx2)' }}>{label}</span>
      <SliderPrimitive.Root
        className="relative flex flex-1 touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={onCommit}
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full" style={{ background: 'var(--cp-s2)' }}>
          <SliderPrimitive.Range className="absolute h-full" style={{ background: moved ? color : 'var(--cp-s3)' }} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="block h-4 w-4 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ background: moved ? color : 'var(--cp-fa)', boxShadow: '0 1px 3px rgba(20,24,31,.3)' }}
        />
      </SliderPrimitive.Root>
      <span
        className="cp-mono w-[70px] shrink-0 text-right text-[11px] tabular-nums"
        style={{ color: moved ? 'var(--cp-tx2)' : 'var(--cp-fa)' }}
      >
        {format(value)}
      </span>
    </div>
  );
}

/** How much the compressor is actually pulling this channel down: twelve decibels of travel. */
function Reduction({ db, active, color }: { db: number; active: boolean; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[62px] shrink-0 text-xs" style={{ color: 'var(--cp-tx2)' }}>Reduction</span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--cp-s2)' }}
        role="meter"
        aria-label="Gain reduction"
        aria-valuemin={0}
        aria-valuemax={12}
        aria-valuenow={active ? Math.round(db * 10) / 10 : 0}
      >
        <div
          className="h-full transition-[width] duration-150 ease-out"
          style={{ width: `${active ? Math.min(100, (db / 12) * 100) : 0}%`, background: color }}
        />
      </div>
      <span className="cp-mono w-[70px] shrink-0 text-right text-[11px]" style={{ color: 'var(--cp-fa)' }}>
        {active ? (db < 0.05 ? '0 dB' : `−${db.toFixed(1)} dB`) : 'off'}
      </span>
    </div>
  );
}

const SILENT = [0, 0, 0, 0, 0];

/**
 * What the engine reports per bus — the peaks each is reaching, or what each compressor is
 * pulling down — while the mixer is open, read every 60 ms as the app's console reads it.
 * Nothing playing means empty meters rather than the last peaks of the last song.
 */
function useLevels(active: boolean, read: () => number[] | null = engineLevels): number[] {
  const [levels, setLevels] = useState<number[]>(SILENT);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const next = read();
      setLevels((prev) => (next ?? (prev === SILENT ? prev : SILENT)));
    }, 60);
    return () => window.clearInterval(timer);
  }, [active, read]);
  return active ? levels : SILENT;
}

const cardStyle = { background: 'var(--cp-s1)', border: '1px solid var(--cp-ln)', borderRadius: 18 } as const;

export function MixingConsole({ open, onOpenChange, instruments = [], onInstrumentsChange, onMixerChange }: MixingConsoleProps) {
  const [effects, setEffects] = useState<EffectsState>(() => getCurrentEffectsState());
  const [mix, setMix] = useState<MixSettings>(() => getMix());
  const [tab, setTab] = useState<'eq' | 'comp'>('eq');
  /** The channel the tone panel is on: picked by its name in the console, as in the app. */
  const [selected, setSelected] = useState<InstrumentType>('piano');
  const levels = useLevels(open);
  const reductions = useLevels(open, engineReductions);

  // Re-hydrate from the engine each time the panel opens, so values stay
  // consistent across sessions / context recreations.
  useEffect(() => {
    if (open) {
      setEffects(getCurrentEffectsState());
      setMix(getMix());
    }
  }, [open]);

  // The console's own state lives in the engine's modules, so every change tells the editor to
  // save it with the song. Through a ref: these handlers are stable and run on every pointer
  // move, and a changed callback must not rebuild them.
  const notifyRef = useRef(onMixerChange);
  notifyRef.current = onMixerChange;
  const notify = useCallback(() => notifyRef.current?.(), []);

  const handleMaster = useCallback((volume: number) => {
    setMix((prev) => ({ ...prev, master: volume }));
    updateMaster(volume);
    notify();
  }, [notify]);

  const handlePan = useCallback((track: InstrumentType, pan: number) => {
    updatePan(track, pan);
    setMix(getMix());
    notify();
  }, [notify]);

  const handleStrip = useCallback((track: InstrumentType, settings: Partial<ChannelStrip>) => {
    updateStrip(track, settings);
    setEffects(getCurrentEffectsState());
    notify();
  }, [notify]);

  const handleStripReset = useCallback((track: InstrumentType) => {
    resetStrip(track);
    setEffects(getCurrentEffectsState());
    notify();
  }, [notify]);

  const handleReverbChange = useCallback((settings: Partial<EffectsState['reverb']>) => {
    updateReverb(settings);
    setEffects(getCurrentEffectsState());
    notify();
  }, [notify]);

  // Analytics fires on commit — the fader released, or the switch toggled — never from the
  // handlers above, which run on every pointer move so the sound follows the finger. See
  // trackCoalesced in analytics.ts, which also folds a burst of commits into one event.
  const trackEq = useCallback(() => analytics.effectChanged('eq'), []);
  const trackReverb = useCallback(() => analytics.effectChanged('reverb'), []);
  const trackCompressor = useCallback(() => analytics.effectChanged('compressor'), []);
  const trackPan = useCallback(() => analytics.effectChanged('pan'), []);

  const handleReset = useCallback(() => {
    resetEffects();
    setEffects(getCurrentEffectsState());
    setMix(getMix());
    notify();
  }, [notify]);

  const isModified = !isConsoleDefault();
  const selectedChannel = CHANNELS.find((c) => c.id === selected) ?? CHANNELS[1];
  const strip = effects.strips[selected];

  const updateInstrument = (id: InstrumentType, updates: Partial<InstrumentState>) =>
    onInstrumentsChange?.(instruments.map((inst) => (inst.id === id ? { ...inst, ...updates } : inst)));

  const anySolo = instruments.some((i) => i.solo);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="cp-sheet flex w-full flex-col p-0 sm:max-w-[440px]">
        <div className="flex shrink-0 items-center gap-1.5 py-2.5 pl-1 pr-3" style={{ background: 'var(--cp-s1)', borderBottom: '1px solid var(--cp-ln)' }}>
          <button className="cp-icb" onClick={() => onOpenChange(false)} aria-label="Back">
            <ChevronLeft size={20} />
          </button>
          <SheetTitle className="m-0 flex-1 text-[17px] font-bold" style={{ color: 'var(--cp-tx)' }}>Mixer</SheetTitle>
          <SheetDescription className="sr-only">Pan, volume, mute and solo for each instrument, the master fader, the selected channel&apos;s EQ and compressor, and the reverb for the whole mix</SheetDescription>
          <button
            className="cp-cap"
            style={{ height: 34, fontSize: 12 }}
            onClick={handleReset}
            disabled={!isModified}
          >
            Reset
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {/* The console: a strip per instrument, then the master */}
          <div className="grid grid-cols-5 gap-1 px-2 pb-3 pt-3.5" style={cardStyle}>
            {CHANNELS.map((ch, bus) => {
              const inst = instruments.find((i) => i.id === ch.id);
              if (!inst) return <div key={ch.id} />;
              // A channel silenced because another one is soloed is not muted, and must not be
              // drawn as though someone had muted it — but it is not being heard either.
              const silent = inst.muted || (anySolo && !inst.solo);
              const pan = mix.pan[ch.id];
              const current = selected === ch.id;
              return (
                <div
                  key={ch.id}
                  className="flex flex-col items-center gap-1.5 rounded-xl border py-1.5 transition-colors"
                  style={{
                    background: current ? `color-mix(in srgb, ${ch.color} 8%, transparent)` : 'transparent',
                    borderColor: current ? `color-mix(in srgb, ${ch.color} 45%, transparent)` : 'transparent',
                  }}
                >
                  <Knob
                    value={pan}
                    min={-1}
                    max={1}
                    label={`${ch.name} pan`}
                    valueText={panText(pan)}
                    mark={ch.color}
                    onChange={(v) => handlePan(ch.id, v)}
                    onCommit={trackPan}
                    onReset={() => handlePan(ch.id, 0)}
                  >
                    {Math.abs(pan) < 0.02 ? (
                      <span className="cp-mono text-[9px]" style={{ color: 'var(--cp-fa)' }}>C</span>
                    ) : (
                      <button
                        type="button"
                        className="cp-mono text-[9px] underline-offset-2 hover:underline"
                        style={{ color: 'var(--cp-fa)' }}
                        title="Centre"
                        onClick={() => handlePan(ch.id, 0)}
                      >
                        {panText(pan)}
                      </button>
                    )}
                  </Knob>
                  <MeterAndFader
                    label={ch.name}
                    value={inst.volume}
                    color={silent ? 'var(--cp-fa)' : ch.color}
                    level={levels[bus] ?? 0}
                    onChange={(v) => updateInstrument(ch.id, { volume: v })}
                  />
                  <span className="cp-mono text-[11px] font-bold" style={{ color: silent ? 'var(--cp-fa)' : 'var(--cp-tx)' }}>
                    {silent ? '—' : dbOf(inst.volume)}
                  </span>
                  <div className="flex gap-[3px]">
                    <button
                      type="button"
                      className="h-[26px] w-[26px] rounded-[7px] text-[11px] font-extrabold"
                      style={inst.muted
                        ? { background: 'var(--cp-maj)', color: 'var(--cp-majo)', border: '1px solid var(--cp-maj)' }
                        : { background: 'var(--cp-s2)', color: 'var(--cp-mu)', border: '1px solid var(--cp-ln)' }}
                      onClick={() => updateInstrument(ch.id, { muted: !inst.muted })}
                      aria-pressed={inst.muted}
                      aria-label={`Mute ${ch.name}`}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      className="h-[26px] w-[26px] rounded-[7px] text-[11px] font-extrabold"
                      style={inst.solo
                        ? { background: 'var(--cp-ac)', color: '#FFFFFF', border: '1px solid var(--cp-ac)' }
                        : { background: 'var(--cp-s2)', color: 'var(--cp-mu)', border: '1px solid var(--cp-ln)' }}
                      onClick={() => updateInstrument(ch.id, { solo: !inst.solo })}
                      aria-pressed={inst.solo}
                      aria-label={`Solo ${ch.name}`}
                    >
                      S
                    </button>
                  </div>
                  {/* The name is how you move the tone panel below to this channel. */}
                  <button
                    type="button"
                    className="rounded-md px-0.5 text-[11px] font-bold"
                    style={{ color: silent ? 'var(--cp-fa)' : 'var(--cp-tx)' }}
                    aria-pressed={current}
                    title={`Show ${ch.name}'s tone`}
                    onClick={() => setSelected(ch.id)}
                  >
                    {ch.name}
                  </button>
                </div>
              );
            })}

            {/*
              The master, on a ground of its own so it is not taken for a fifth instrument. It
              has no pan, mute or solo: it is not a place in the mix, it is the whole of it.
            */}
            <div className="flex flex-col items-center gap-1.5 rounded-xl py-1.5" style={{ background: 'var(--cp-s2)' }}>
              <div className="flex h-[34px] items-center" style={{ color: 'var(--cp-mu)' }}>
                <Volume2 size={20} />
              </div>
              <span className="text-[9px]" style={{ color: 'var(--cp-fa)' }}>Output</span>
              <MeterAndFader
                label="Master"
                value={mix.master}
                color="var(--cp-tx)"
                level={levels[4] ?? 0}
                onChange={handleMaster}
              />
              <span className="cp-mono text-[11px] font-bold">{dbOf(mix.master)}</span>
              {/* Where the other strips have mute and solo. */}
              <div className="h-[26px]" />
              <span className="text-[11px] font-bold">Master</span>
            </div>
          </div>

          {/* The tone panel: the channel the console has selected, its EQ or its compressor */}
          <div className="flex flex-col gap-2.5 p-3" style={cardStyle}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: selectedChannel.color }} />
              <span className="flex-1 text-sm font-bold">{selectedChannel.name}</span>
              {!isStripFlat(strip) && (
                <button
                  type="button"
                  className="px-1 text-xs font-semibold"
                  style={{ color: 'var(--cp-act)' }}
                  onClick={() => { handleStripReset(selected); trackEq(); }}
                >
                  Flat
                </button>
              )}
              <div className="cp-seg cp-seg-sm">
                <button type="button" className={tab === 'eq' ? 'cp-on' : ''} onClick={() => setTab('eq')}>EQ</button>
                <button type="button" className={tab === 'comp' ? 'cp-on' : ''} onClick={() => setTab('comp')}>Compressor</button>
              </div>
            </div>

            {tab === 'eq' ? (
              <>
                <EqCurve
                  strip={strip}
                  color={selectedChannel.color}
                  onChange={(band, db) => handleStrip(selected, { [band]: db })}
                  onCommit={trackEq}
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {EQ_BANDS.map(({ band }) => (
                    <BandTile
                      key={band}
                      label={band === 'low' ? 'Low' : band === 'mid' ? 'Mid' : 'High'}
                      db={strip[band]}
                      onReset={() => { handleStrip(selected, { [band]: 0 }); trackEq(); }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <StripSlider
                  label="Threshold"
                  value={strip.threshold}
                  min={-40}
                  max={0}
                  step={1}
                  rest={0}
                  color={selectedChannel.color}
                  format={(v) => (v >= 0 ? '—' : `${Math.round(v)} dB`)}
                  onChange={(v) => handleStrip(selected, { threshold: v })}
                  onCommit={trackCompressor}
                />
                <StripSlider
                  label="Ratio"
                  value={strip.ratio}
                  min={1}
                  max={12}
                  step={0.5}
                  rest={1}
                  color={selectedChannel.color}
                  // 1:1 is a compressor doing nothing, and saying so is clearer than printing a
                  // ratio that reads like a setting.
                  format={(v) => (v <= 1.02 ? 'off' : `${v.toFixed(1)}:1`)}
                  onChange={(v) => handleStrip(selected, { ratio: v })}
                  onCommit={trackCompressor}
                />
                <Reduction
                  db={reductions[CHANNELS.findIndex((c) => c.id === selected)] ?? 0}
                  active={strip.ratio > 1 && strip.threshold < 0}
                  color={selectedChannel.color}
                />
                <p className="text-[11px]" style={{ color: 'var(--cp-fa)' }}>
                  Lower the threshold for the compressor to start working; the ratio says how hard it
                  squeezes. Its attack, release and knee are the engine's own.
                </p>
              </div>
            )}
          </div>

          {/*
            One reverb, fed from the whole mix rather than from a send per channel: the three
            melodic tracks come out of the SoundFont already mixed together, so a send per
            channel would be a control that only half worked. A mix of 0 is off — there is no
            switch, as there is none in the app.
          */}
          <div className="flex items-center gap-3.5 px-3.5 py-3" style={cardStyle}>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="cp-lbl">Reverb</span>
              <span className="text-[13px] font-semibold">
                {effects.reverb.mix < 0.01 ? 'Off' : roomOf(effects.reverb.size)}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--cp-fa)' }}>for the whole mix</span>
            </div>
            <Knob
              value={effects.reverb.mix}
              min={0}
              max={1}
              label="Mix"
              valueText={`${Math.round(effects.reverb.mix * 100)}%`}
              ring="var(--cp-ac)"
              onChange={(v) => handleReverbChange({ mix: Math.round(v * 100) / 100 })}
              onCommit={trackReverb}
              onReset={() => { handleReverbChange({ mix: DEFAULT_EFFECTS_STATE.reverb.mix }); trackReverb(); }}
            />
            <Knob
              value={effects.reverb.size}
              min={0}
              max={1}
              label="Size"
              valueText={`${Math.round(effects.reverb.size * 100)}%`}
              ring="var(--cp-ac)"
              onChange={(v) => handleReverbChange({ size: Math.round(v * 100) / 100 })}
              onCommit={trackReverb}
              onReset={() => { handleReverbChange({ size: DEFAULT_EFFECTS_STATE.reverb.size }); trackReverb(); }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MixingConsole;
