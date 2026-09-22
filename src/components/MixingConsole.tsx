/**
 * The mixer, as the Android app draws it (lib/features/mixer/mixer_screen.dart and the
 * "Mezclador" artboard): a console of channel strips — fader, level, mute and solo — then
 * the EQ as a curve you drag, the compressor behind a tab, and the reverb on two knobs.
 *
 * The web engine has one EQ, compressor and reverb for the whole mix and no pan, so those
 * belong to the Master here, and the strips carry what each instrument really has: its
 * volume, mute and solo. Nothing in here changes how the engine works.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { analytics } from '@/lib/analytics';
import { ChevronLeft } from 'lucide-react';
import { getAnalyserNode } from '@/lib/appEngine/preview';
import { type InstrumentState, type InstrumentType } from '@/lib/instruments';
import {
  type EffectsState,
  DEFAULT_EFFECTS_STATE,
  updateEQ,
  updateReverb,
  updateCompressor,
  resetEffects,
  getCurrentEffectsState,
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
      className="relative flex h-[170px] w-[22px] touch-none select-none flex-col items-center sm:h-[200px]"
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
 * A knob: drag up or down (or use the arrow keys) to turn it. The mark sweeps −135°…135°.
 */
function Knob({
  value,
  min,
  max,
  label,
  valueText,
  onChange,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  valueText: string;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  const drag = useRef<{ y: number; v: number } | null>(null);
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
        className="relative h-[34px] w-[34px] cursor-ns-resize touch-none rounded-full"
        style={{ background: 'var(--cp-s2)', border: '1.5px solid var(--cp-ac)' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          // 150px of travel covers the whole range.
          onChange(clamp(drag.current.v + ((drag.current.y - e.clientY) / 150) * (max - min)));
        }}
        onPointerUp={() => {
          if (drag.current) onCommit();
          drag.current = null;
        }}
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
          style={{ background: 'var(--cp-act)', transform: `rotate(${-135 + t * 270}deg)`, transformOrigin: '1px 13px' }}
        />
      </div>
      <span className="text-[10px]" style={{ color: 'var(--cp-mu)' }}>{label} {valueText}</span>
    </div>
  );
}

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

/** The master's level, read from the engine's analyser while the mixer is open. */
function useMasterLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let buf: Uint8Array<ArrayBuffer> | null = null;
    const tick = () => {
      const analyser = getAnalyserNode();
      if (analyser) {
        if (!buf || buf.length !== analyser.fftSize) buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
        setLevel((prev) => Math.max(peak, prev * 0.9));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return level;
}

const cardStyle = { background: 'var(--cp-s1)', border: '1px solid var(--cp-ln)', borderRadius: 18 } as const;

export function MixingConsole({ open, onOpenChange, instruments = [], onInstrumentsChange }: MixingConsoleProps) {
  const [effects, setEffects] = useState<EffectsState>(() => getCurrentEffectsState());
  const [tab, setTab] = useState<'eq' | 'comp'>('eq');
  const masterLevel = useMasterLevel(open);

  // Re-hydrate from the engine each time the panel opens, so values stay
  // consistent across sessions / context recreations.
  useEffect(() => {
    if (open) setEffects(getCurrentEffectsState());
  }, [open]);

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

  const handleReset = useCallback(() => {
    setEffects(DEFAULT_EFFECTS_STATE);
    resetEffects();
  }, []);

  const isModified = useMemo(
    () =>
      effects.eq.low.gain !== 0 ||
      effects.eq.mid.gain !== 0 ||
      effects.eq.high.gain !== 0 ||
      effects.reverb.enabled ||
      effects.compressor.enabled,
    [effects],
  );

  const updateInstrument = (id: InstrumentType, updates: Partial<InstrumentState>) =>
    onInstrumentsChange?.(instruments.map((inst) => (inst.id === id ? { ...inst, ...updates } : inst)));

  const anySolo = instruments.some((i) => i.solo);
  const masterPct = Math.min(100, Math.round(masterLevel * 100));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="cp-sheet flex w-full flex-col p-0 sm:max-w-[440px]">
        <div className="flex shrink-0 items-center gap-1.5 py-2.5 pl-1 pr-3" style={{ background: 'var(--cp-s1)', borderBottom: '1px solid var(--cp-ln)' }}>
          <button className="cp-icb" onClick={() => onOpenChange(false)} aria-label="Back">
            <ChevronLeft size={20} />
          </button>
          <SheetTitle className="m-0 flex-1 text-[17px] font-bold" style={{ color: 'var(--cp-tx)' }}>Mixer</SheetTitle>
          <SheetDescription className="sr-only">Volume, mute and solo for each instrument, and the master EQ, compressor and reverb</SheetDescription>
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
            {CHANNELS.map((ch) => {
              const inst = instruments.find((i) => i.id === ch.id);
              if (!inst) return <div key={ch.id} />;
              const silent = inst.muted || (anySolo && !inst.solo);
              return (
                <div key={ch.id} className="flex flex-col items-center gap-2 py-1.5">
                  <Fader value={inst.volume} color={ch.color} label={ch.name} onChange={(v) => updateInstrument(ch.id, { volume: v })} />
                  <span className="cp-mono text-[11px] font-bold">{dbOf(inst.volume)}</span>
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

            {/* Master: the level actually leaving the speakers */}
            <div className="flex flex-col items-center gap-2 rounded-xl py-1.5" style={{ background: 'var(--cp-s2)' }}>
              <div
                className="flex h-[170px] w-2 flex-col justify-end overflow-hidden rounded sm:h-[200px]"
                style={{ background: 'var(--cp-s3)' }}
                role="meter"
                aria-label="Master level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={masterPct}
              >
                <div style={{ height: `${masterPct}%`, background: 'linear-gradient(0deg, #2DD29B 0%, #2DD29B 70%, #F4B925 88%, #FF3849 100%)' }} />
              </div>
              <span className="cp-mono text-[11px] font-bold">{masterLevel > 0.001 ? dbOf(masterLevel) : '−∞'}</span>
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
                onChange={(v) => handleReverbChange('wetDry', Math.round(v * 100) / 100)}
                onCommit={trackReverb}
              />
              <Knob
                value={effects.reverb.decay}
                min={0.1}
                max={5}
                label="Size"
                valueText={`${effects.reverb.decay.toFixed(1)} s`}
                onChange={(v) => handleReverbChange('decay', Math.round(v * 10) / 10)}
                onCommit={trackReverb}
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
