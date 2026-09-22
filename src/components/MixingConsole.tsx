/**
 * The mixer, as the Android app draws it (lib/features/mixer/mixer_screen.dart and the
 * "Mezclador" artboard): a strip per instrument — pan, meter and fader, level, mute and solo,
 * name — then the master at the end on a ground of its own, the EQ as a curve you drag, the
 * compressor behind a tab, and the reverb on two knobs.
 *
 * Every part of it is the engine's: the meters are the held peaks it reports (bus 0-3 and the
 * master, read while it plays), the pan and the master fader its own `pan` and `mixer`
 * commands (mix.ts). The EQ and compressor still belong to the whole mix rather than to the
 * selected channel, which is the one thing the app does and this does not.
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { analytics } from '@/lib/analytics';
import { ChevronLeft, Volume2 } from 'lucide-react';
import { engineLevels } from '@/lib/appEngine/player';
import { getMix, type MixSettings } from '@/lib/appEngine/mix';
import { type InstrumentState, type InstrumentType } from '@/lib/instruments';
import {
  type EffectsState,
  DEFAULT_EFFECTS_STATE,
  updateEQ,
  updateReverb,
  updateCompressor,
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

/** Frequencies the three EQ handles sit at, across a 342-wide curve. */
const EQ_X = { low: 50, mid: 171, high: 292 } as const;
const gainToY = (g: number) => 60 - g * (50 / 12);

/** The EQ as a curve: three handles you drag up and down, the shape drawn between them. */
function EqCurve({
  eq,
  onChange,
  onCommit,
}: {
  eq: EffectsState['eq'];
  onChange: (band: 'low' | 'mid' | 'high', gain: number) => void;
  onCommit: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<'low' | 'mid' | 'high' | null>(null);
  const yL = gainToY(eq.low.gain);
  const yM = gainToY(eq.mid.gain);
  const yH = gainToY(eq.high.gain);
  const line = `M0 ${yL} C 30 ${yL}, 20 ${yL}, 50 ${yL} C 100 ${yL}, 120 ${yM}, 171 ${yM} C 222 ${yM}, 242 ${yH}, 292 ${yH} C 322 ${yH}, 312 ${yH}, 342 ${yH}`;

  const gainAt = (clientY: number) => {
    const box = svgRef.current!.getBoundingClientRect();
    const y = ((clientY - box.top) / box.height) * 120;
    return Math.round(Math.min(12, Math.max(-12, (60 - y) / (50 / 12))) * 2) / 2;
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 342 120"
      className="block w-full touch-none select-none"
      role="group"
      aria-label="Equaliser curve"
      onPointerMove={(e) => {
        if (dragging.current) onChange(dragging.current, gainAt(e.clientY));
      }}
      onPointerUp={() => {
        if (dragging.current) onCommit();
        dragging.current = null;
      }}
    >
      <rect x="0" y="0" width="342" height="120" rx="10" fill="var(--cp-s2)" />
      <g stroke="var(--cp-s3)" strokeWidth="1">
        <line x1="0" y1="30" x2="342" y2="30" />
        <line x1="0" y1="60" x2="342" y2="60" />
        <line x1="0" y1="90" x2="342" y2="90" />
        <line x1="85" y1="0" x2="85" y2="120" />
        <line x1="171" y1="0" x2="171" y2="120" />
        <line x1="256" y1="0" x2="256" y2="120" />
      </g>
      <path d={`${line} L 342 120 L 0 120 Z`} fill="color-mix(in srgb, var(--cp-ac) 12%, transparent)" />
      <path d={line} fill="none" stroke="var(--cp-ac)" strokeWidth="2.5" strokeLinecap="round" />
      {(['low', 'mid', 'high'] as const).map((band) => (
        <circle
          key={band}
          cx={EQ_X[band]}
          cy={gainToY(eq[band].gain)}
          r="9"
          fill="var(--cp-s1)"
          stroke="var(--cp-ac)"
          strokeWidth="2.5"
          className="cursor-ns-resize"
          role="slider"
          tabIndex={0}
          aria-label={`${band} EQ gain`}
          aria-valuemin={-12}
          aria-valuemax={12}
          aria-valuenow={eq[band].gain}
          onPointerDown={(e) => {
            svgRef.current?.setPointerCapture(e.pointerId);
            dragging.current = band;
          }}
          onKeyDown={(e) => {
            const g = eq[band].gain;
            if (e.key === 'ArrowUp') onChange(band, Math.min(12, g + 0.5));
            else if (e.key === 'ArrowDown') onChange(band, Math.max(-12, g - 0.5));
            else return;
            e.preventDefault();
            onCommit();
          }}
        />
      ))}
      <text x="8" y="112" fill="var(--cp-fa)" fontSize="9" fontFamily="Space Mono, monospace">100 Hz</text>
      <text x="155" y="112" fill="var(--cp-fa)" fontSize="9" fontFamily="Space Mono, monospace">1 kHz</text>
      <text x="295" y="112" fill="var(--cp-fa)" fontSize="9" fontFamily="Space Mono, monospace">8 kHz</text>
    </svg>
  );
}

/** Labelled horizontal slider, for the compressor. */
function EffectSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs font-medium" style={{ color: 'var(--cp-tx2)' }}>
        <span>{label}</span>
        <b className="cp-mono font-bold tabular-nums" style={{ color: 'var(--cp-tx)' }}>{format(value)}</b>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} onValueCommit={onCommit} />
    </div>
  );
}

const SILENT = [0, 0, 0, 0, 0];

/**
 * What the engine reports each bus is reaching — drums, piano, guitar, bass, master — while
 * the mixer is open, read every 60 ms as the app's console reads it. Nothing playing means
 * empty meters rather than the last peaks of the last song.
 */
function useLevels(active: boolean): number[] {
  const [levels, setLevels] = useState<number[]>(SILENT);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const next = engineLevels();
      setLevels((prev) => (next ?? (prev === SILENT ? prev : SILENT)));
    }, 60);
    return () => window.clearInterval(timer);
  }, [active]);
  return active ? levels : SILENT;
}

const cardStyle = { background: 'var(--cp-s1)', border: '1px solid var(--cp-ln)', borderRadius: 18 } as const;

export function MixingConsole({ open, onOpenChange, instruments = [], onInstrumentsChange }: MixingConsoleProps) {
  const [effects, setEffects] = useState<EffectsState>(() => getCurrentEffectsState());
  const [mix, setMix] = useState<MixSettings>(() => getMix());
  const [tab, setTab] = useState<'eq' | 'comp'>('eq');
  const levels = useLevels(open);

  // Re-hydrate from the engine each time the panel opens, so values stay
  // consistent across sessions / context recreations.
  useEffect(() => {
    if (open) {
      setEffects(getCurrentEffectsState());
      setMix(getMix());
    }
  }, [open]);

  const handleMaster = useCallback((volume: number) => {
    setMix((prev) => ({ ...prev, master: volume }));
    updateMaster(volume);
  }, []);

  const handlePan = useCallback((track: InstrumentType, pan: number) => {
    updatePan(track, pan);
    setMix(getMix());
  }, []);

  const handleEQChange = useCallback((band: 'low' | 'mid' | 'high', gain: number) => {
    setEffects(prev => ({ ...prev, eq: { ...prev.eq, [band]: { ...prev.eq[band], gain } } }));
    updateEQ(band, { gain });
  }, []);

  const handleReverbChange = useCallback((key: keyof EffectsState['reverb'], value: number | boolean) => {
    setEffects(prev => ({ ...prev, reverb: { ...prev.reverb, [key]: value } }));
    updateReverb({ [key]: value });
  }, []);

  const handleCompressorChange = useCallback((key: keyof EffectsState['compressor'], value: number | boolean) => {
    setEffects(prev => ({ ...prev, compressor: { ...prev.compressor, [key]: value } }));
    updateCompressor({ [key]: value });
  }, []);

  // Analytics fires on commit — the fader released, or the switch toggled — never from the
  // handlers above, which run on every pointer move so the sound follows the finger. See
  // trackCoalesced in analytics.ts, which also folds a burst of commits into one event.
  const trackEq = useCallback(() => analytics.effectChanged('eq'), []);
  const trackReverb = useCallback(() => analytics.effectChanged('reverb'), []);
  const trackCompressor = useCallback(() => analytics.effectChanged('compressor'), []);
  const trackPan = useCallback(() => analytics.effectChanged('pan'), []);

  const handleReset = useCallback(() => {
    setEffects(DEFAULT_EFFECTS_STATE);
    resetEffects();
    setMix(getMix());
  }, []);

  const isModified = !isConsoleDefault();

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
          <SheetDescription className="sr-only">Pan, volume, mute and solo for each instrument, the master fader, and the master EQ, compressor and reverb</SheetDescription>
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
              return (
                <div key={ch.id} className="flex flex-col items-center gap-1.5 py-1.5">
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
                  <span className="text-[11px] font-bold" style={{ color: silent ? 'var(--cp-fa)' : 'var(--cp-tx)' }}>{ch.name}</span>
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

          {/* EQ and compressor, on the master */}
          <div className="flex flex-col gap-2.5 p-3" style={cardStyle}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--cp-ac)' }} />
              <span className="flex-1 text-sm font-bold">Master</span>
              <div className="cp-seg cp-seg-sm">
                <button type="button" className={tab === 'eq' ? 'cp-on' : ''} onClick={() => setTab('eq')}>EQ</button>
                <button type="button" className={tab === 'comp' ? 'cp-on' : ''} onClick={() => setTab('comp')}>Compressor</button>
              </div>
            </div>

            {tab === 'eq' ? (
              <>
                <EqCurve eq={effects.eq} onChange={handleEQChange} onCommit={trackEq} />
                <div className="grid grid-cols-3 gap-1.5">
                  {(['low', 'mid', 'high'] as const).map((band) => (
                    <div key={band} className="flex flex-col items-center gap-0.5 rounded-[10px] py-2" style={{ background: 'var(--cp-s2)' }}>
                      <span className="cp-lbl">{band === 'low' ? 'Low' : band === 'mid' ? 'Mid' : 'High'}</span>
                      <span className="cp-mono text-sm font-bold">
                        {effects.eq[band].gain > 0 ? '+' : effects.eq[band].gain < 0 ? '−' : ''}
                        {Math.abs(effects.eq[band].gain).toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3.5">
                <label className="flex items-center justify-between text-[13px] font-semibold">
                  Compressor
                  <button
                    type="button"
                    role="switch"
                    aria-checked={effects.compressor.enabled}
                    aria-label="Compressor"
                    className={`cp-sw ${effects.compressor.enabled ? 'cp-on' : ''}`}
                    onClick={() => {
                      handleCompressorChange('enabled', !effects.compressor.enabled);
                      trackCompressor();
                    }}
                  />
                </label>
                <div className={`flex flex-col gap-3.5 ${effects.compressor.enabled ? '' : 'pointer-events-none opacity-45'}`}>
                  <EffectSlider label="Threshold" value={effects.compressor.threshold} min={-60} max={0} step={1} format={(v) => `${v} dB`} onChange={(v) => handleCompressorChange('threshold', v)} onCommit={trackCompressor} />
                  <EffectSlider label="Ratio" value={effects.compressor.ratio} min={1} max={20} step={0.5} format={(v) => `${v}:1`} onChange={(v) => handleCompressorChange('ratio', v)} onCommit={trackCompressor} />
                  <EffectSlider label="Attack" value={effects.compressor.attack} min={0.001} max={1} step={0.001} format={(v) => `${(v * 1000).toFixed(0)} ms`} onChange={(v) => handleCompressorChange('attack', v)} onCommit={trackCompressor} />
                  <EffectSlider label="Release" value={effects.compressor.release} min={0.01} max={1} step={0.01} format={(v) => `${(v * 1000).toFixed(0)} ms`} onChange={(v) => handleCompressorChange('release', v)} onCommit={trackCompressor} />
                </div>
              </div>
            )}
          </div>

          {/* Reverb on two knobs */}
          <div className="flex items-center gap-3.5 px-3.5 py-3" style={cardStyle}>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="cp-lbl">Reverb</span>
              <span className="text-[13px] font-semibold">
                {effects.reverb.enabled ? `Room · ${effects.reverb.decay.toFixed(1)} s` : 'Off'}
              </span>
            </div>
            <div className={`flex gap-3.5 ${effects.reverb.enabled ? '' : 'pointer-events-none opacity-45'}`}>
              <Knob
                value={effects.reverb.wetDry}
                min={0}
                max={1}
                label="Mix"
                valueText={`${Math.round(effects.reverb.wetDry * 100)}%`}
                ring="var(--cp-ac)"
                onChange={(v) => handleReverbChange('wetDry', Math.round(v * 100) / 100)}
                onCommit={trackReverb}
                onReset={() => { handleReverbChange('wetDry', DEFAULT_EFFECTS_STATE.reverb.wetDry); trackReverb(); }}
              />
              <Knob
                value={effects.reverb.decay}
                min={0.1}
                max={5}
                label="Size"
                valueText={`${effects.reverb.decay.toFixed(1)} s`}
                ring="var(--cp-ac)"
                onChange={(v) => handleReverbChange('decay', Math.round(v * 10) / 10)}
                onCommit={trackReverb}
                onReset={() => { handleReverbChange('decay', DEFAULT_EFFECTS_STATE.reverb.decay); trackReverb(); }}
              />
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={effects.reverb.enabled}
              aria-label="Reverb"
              className={`cp-sw ${effects.reverb.enabled ? 'cp-on' : ''}`}
              onClick={() => {
                handleReverbChange('enabled', !effects.reverb.enabled);
                trackReverb();
              }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MixingConsole;
