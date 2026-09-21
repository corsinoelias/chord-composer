/**
 * Mixing Console Component
 * 
 * Professional-style master EQ, reverb, and compression controls
 * with visual feedback and intuitive layout.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { analytics } from '@/lib/analytics';
import { Sliders, RotateCcw, X } from 'lucide-react';
import {
  type EffectsState,
  DEFAULT_EFFECTS_STATE,
  updateEQ,
  updateReverb,
  updateCompressor,
  resetEffects,
  getCurrentEffectsState,
} from '@/lib/audioEffects';

interface MixingConsoleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Vertical EQ band with visual gain meter */
function EQBand({
  label,
  freq,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  freq: string;
  value: number;
  onChange: (v: number) => void;
  /** Fires once when the fader is released, for analytics — see the handlers below. */
  onCommit: () => void;
}) {
  const percentage = ((value + 12) / 24) * 100; // 0..100, 50 = center (0 dB)
  const isBoost = value > 0;
  const isCut = value < 0;

  return (
    <div className="flex flex-1 flex-col items-center gap-2.5">
      {/* Gain value */}
      <span
        className="cp-mono text-[13px] font-bold tabular-nums"
        style={{ color: isBoost ? 'var(--cp-sevt)' : isCut ? 'var(--cp-dg)' : 'var(--cp-tx)' }}
      >
        {value > 0 ? '+' : ''}{value.toFixed(1)}
      </span>

      {/* Vertical fader — Radix Slider handles touch/pointer natively (the previous
          rotated <input type="range"> was unusable on mobile: the browser maps touch
          to the un-rotated element, so dragging didn't track the finger). The root is
          intentionally wide (w-10) to give a comfortable touch target around the thin
          visible track. */}
      <SliderPrimitive.Root
        orientation="vertical"
        min={-12}
        max={12}
        step={0.5}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={onCommit}
        aria-label={`${label} EQ gain`}
        className="relative flex flex-col items-center justify-center w-10 h-32 touch-none select-none"
      >
        <SliderPrimitive.Track className="relative h-full w-1 overflow-hidden rounded-full" style={{ background: 'var(--cp-s3)' }}>
          {/* Bipolar fill from center: green up when boosting, red down when cutting */}
          <div
            className="absolute w-full transition-all duration-75"
            style={{
              backgroundColor: isBoost ? 'var(--cp-sev)' : isCut ? 'var(--cp-dg)' : 'var(--cp-ac)',
              top: isBoost ? `${100 - percentage}%` : '50%',
              bottom: isCut ? `${percentage}%` : '50%',
            }}
          />
          {/* Center (0 dB) line */}
          <div className="absolute top-1/2 h-px w-full" style={{ background: 'var(--cp-ln2)' }} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="block h-3.5 w-7 cursor-grab rounded-[5px] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ background: 'var(--cp-tx)', boxShadow: '0 0 0 2px var(--cp-ac), 0 3px 8px rgba(18,22,31,.25)' }}
        />
      </SliderPrimitive.Root>

      {/* Labels */}
      <div className="text-center">
        <div className="text-[13px] font-bold">{label}</div>
        <div className="text-[11px]" style={{ color: 'var(--cp-mu)' }}>{freq}</div>
      </div>
    </div>
  );
}

/** Effect section wrapper */
function EffectSection({ 
  title, 
  enabled, 
  onToggle, 
  children,
  badge,
  aside,
}: { 
  title: string; 
  enabled?: boolean; 
  onToggle?: (v: boolean) => void; 
  children: React.ReactNode;
  badge?: string;
  /** Right-hand note in the header, e.g. the EQ's dB range. */
  aside?: React.ReactNode;
}) {
  return (
    <section className="cp-ic" aria-label={title}>
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex items-center gap-2.5 text-[15px] font-bold">
          {title}
          {badge && <span className="cp-tag">{badge}</span>}
        </span>
        {aside}
        {onToggle !== undefined && enabled !== undefined && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={title}
            className={`cp-sw ${enabled ? 'cp-on' : ''}`}
            onClick={() => onToggle(!enabled)}
          />
        )}
      </div>
      <div className={onToggle !== undefined && !enabled ? 'pointer-events-none opacity-45' : ''}>
        {children}
      </div>
    </section>
  );
}

/** Labeled horizontal slider */
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
  /** Fires once when the slider is released, for analytics — see the handlers below. */
  onCommit: () => void;
}) {
  return (
    <div className="flex flex-col gap-[9px]">
      <div className="flex items-baseline justify-between text-xs font-medium" style={{ color: 'var(--cp-tx2)' }}>
        <span>{label}</span>
        <b className="cp-mono font-bold tabular-nums" style={{ color: 'var(--cp-tx)' }}>{format(value)}</b>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([val]) => onChange(val)}
        onValueCommit={onCommit}
      />
    </div>
  );
}

export function MixingConsole({ open, onOpenChange }: MixingConsoleProps) {
  const [effects, setEffects] = useState<EffectsState>(() => getCurrentEffectsState());

  // Re-hydrate from the engine each time the panel opens, so values stay
  // consistent across sessions / context recreations.
  useEffect(() => {
    if (open) setEffects(getCurrentEffectsState());
  }, [open]);

  const handleEQChange = useCallback((band: 'low' | 'mid' | 'high', gain: number) => {
    setEffects(prev => ({
      ...prev,
      eq: {
        ...prev.eq,
        [band]: { ...prev.eq[band], gain }
      }
    }));
    updateEQ(band, { gain });
  }, []);

  const handleReverbChange = useCallback((key: keyof EffectsState['reverb'], value: number | boolean) => {
    setEffects(prev => ({
      ...prev,
      reverb: { ...prev.reverb, [key]: value }
    }));
    updateReverb({ [key]: value });
  }, []);

  const handleCompressorChange = useCallback((key: keyof EffectsState['compressor'], value: number | boolean) => {
    setEffects(prev => ({
      ...prev,
      compressor: { ...prev.compressor, [key]: value }
    }));
    updateCompressor({ [key]: value });
  }, []);

  // Analytics fires on commit — the fader released, or the switch toggled — never from the
  // handlers above, which run on every pointer move so the sound follows the finger. Firing
  // from there sent ~100 `effect_changed` events per drag; see trackCoalesced in analytics.ts,
  // which additionally folds a burst of commits (three EQ bands in a row) into one event.
  const trackEq = useCallback(() => analytics.effectChanged('eq'), []);
  const trackReverb = useCallback(() => analytics.effectChanged('reverb'), []);
  const trackCompressor = useCallback(() => analytics.effectChanged('compressor'), []);

  const handleReset = useCallback(() => {
    setEffects(DEFAULT_EFFECTS_STATE);
    resetEffects();
  }, []);

  // Check if any effects are modified from defaults
  const isModified = useMemo(() => {
    return (
      effects.eq.low.gain !== 0 ||
      effects.eq.mid.gain !== 0 ||
      effects.eq.high.gain !== 0 ||
      effects.reverb.enabled ||
      effects.compressor.enabled
    );
  }, [effects]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="cp-sheet flex w-full flex-col p-0 sm:max-w-[480px]">
        <div className="cp-sheet-head">
          <div className="flex items-center gap-3.5">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'color-mix(in srgb, var(--cp-ac) 16%, transparent)', color: 'var(--cp-act)' }}
              aria-hidden="true"
            >
              <Sliders size={18} />
            </span>
            <div className="flex flex-col gap-[3px]">
              <SheetTitle className="m-0 flex items-center gap-2 text-xl font-extrabold tracking-tight" style={{ color: 'var(--cp-tx)' }}>
                Mixing Console
                {isModified && <span className="cp-tag">Modified</span>}
              </SheetTitle>
              <SheetDescription className="m-0 text-xs" style={{ color: 'var(--cp-mu)' }}>
                Master audio processing — EQ, reverb &amp; compression
              </SheetDescription>
            </div>
          </div>
          <button className="cp-btn cp-ib cp-gh" onClick={() => onOpenChange(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {/* ─── EQUALIZER ─── */}
          <EffectSection title="Equalizer" badge="3-Band" aside={<span className="cp-lbl">−12 / +12 dB</span>}>
            <div className="pb-0.5 pt-1">
              <div className="grid grid-cols-3">
                <EQBand
                  label="Low"
                  freq="100 Hz"
                  value={effects.eq.low.gain}
                  onChange={(gain) => handleEQChange('low', gain)}
                  onCommit={trackEq}
                />
                <EQBand
                  label="Mid"
                  freq="1 kHz"
                  value={effects.eq.mid.gain}
                  onChange={(gain) => handleEQChange('mid', gain)}
                  onCommit={trackEq}
                />
                <EQBand
                  label="High"
                  freq="8 kHz"
                  value={effects.eq.high.gain}
                  onChange={(gain) => handleEQChange('high', gain)}
                  onCommit={trackEq}
                />
              </div>
              
            </div>
          </EffectSection>

          {/* ─── REVERB ─── */}
          <EffectSection 
            title="Reverb" 
            enabled={effects.reverb.enabled}
            onToggle={(checked) => {
              handleReverbChange('enabled', checked);
              trackReverb();
            }}
          >
            <div className="flex flex-col gap-3.5">
              <EffectSlider
                label="Decay time"
                value={effects.reverb.decay}
                min={0.1}
                max={5}
                step={0.1}
                format={(v) => `${v.toFixed(1)}s`}
                onChange={(v) => handleReverbChange('decay', v)}
                onCommit={trackReverb}
              />
              <EffectSlider
                label="Wet / Dry"
                value={effects.reverb.wetDry}
                min={0}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => handleReverbChange('wetDry', v)}
                onCommit={trackReverb}
              />
            </div>
          </EffectSection>

          {/* ─── COMPRESSOR ─── */}
          <EffectSection 
            title="Compressor" 
            enabled={effects.compressor.enabled}
            onToggle={(checked) => {
              handleCompressorChange('enabled', checked);
              trackCompressor();
            }}
          >
            <div className="flex flex-col gap-3.5">
              <EffectSlider
                label="Threshold"
                value={effects.compressor.threshold}
                min={-60}
                max={0}
                step={1}
                format={(v) => `${v} dB`}
                onChange={(v) => handleCompressorChange('threshold', v)}
                onCommit={trackCompressor}
              />
              <EffectSlider
                label="Ratio"
                value={effects.compressor.ratio}
                min={1}
                max={20}
                step={0.5}
                format={(v) => `${v}:1`}
                onChange={(v) => handleCompressorChange('ratio', v)}
                onCommit={trackCompressor}
              />
              <EffectSlider
                label="Attack"
                value={effects.compressor.attack}
                min={0.001}
                max={1}
                step={0.001}
                format={(v) => `${(v * 1000).toFixed(0)} ms`}
                onChange={(v) => handleCompressorChange('attack', v)}
                onCommit={trackCompressor}
              />
              <EffectSlider
                label="Release"
                value={effects.compressor.release}
                min={0.01}
                max={1}
                step={0.01}
                format={(v) => `${(v * 1000).toFixed(0)} ms`}
                onChange={(v) => handleCompressorChange('release', v)}
                onCommit={trackCompressor}
              />
            </div>
          </EffectSection>

        </div>

        {/* Sticky footer — Reset stays reachable without scrolling to the bottom */}
        <div className="shrink-0 px-4 pb-4 pt-3.5" style={{ borderTop: '1px solid var(--cp-ln)', background: 'var(--cp-bar)' }}>
          <button
            className="cp-btn w-full justify-center"
            style={{ height: 44, color: 'var(--cp-tx2)' }}
            onClick={handleReset}
            disabled={!isModified}
          >
            <RotateCcw size={18} />
            Reset All Effects
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MixingConsole;