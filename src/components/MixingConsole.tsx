/**
 * Mixing Console Component
 * 
 * Professional-style master EQ, reverb, and compression controls
 * with visual feedback and intuitive layout.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { analytics } from '@/lib/analytics';
import { Sliders, RotateCcw, Volume2 } from 'lucide-react';
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
  onChange 
}: { 
  label: string; 
  freq: string; 
  value: number; 
  onChange: (v: number) => void; 
}) {
  const percentage = ((value + 12) / 24) * 100; // 0..100, 50 = center (0 dB)
  const isBoost = value > 0;
  const isCut = value < 0;

  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      {/* Gain value */}
      <span className={`text-xs font-mono tabular-nums ${
        isBoost ? 'text-[hsl(var(--success))]' : isCut ? 'text-destructive' : 'text-muted-foreground'
      }`}>
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
        aria-label={`${label} EQ gain`}
        className="relative flex flex-col items-center justify-center w-10 h-32 touch-none select-none"
      >
        <SliderPrimitive.Track className="relative w-1.5 h-full rounded-full bg-secondary overflow-hidden">
          {/* Bipolar fill from center: green up when boosting, red down when cutting */}
          <div
            className="absolute w-full transition-all duration-75"
            style={{
              backgroundColor: isBoost
                ? 'hsl(var(--success))'
                : isCut
                  ? 'hsl(var(--destructive))'
                  : 'hsl(var(--primary))',
              top: isBoost ? `${100 - percentage}%` : '50%',
              bottom: isCut ? `${percentage}%` : '50%',
            }}
          />
          {/* Center (0 dB) line */}
          <div className="absolute w-full h-px bg-muted-foreground/40 top-1/2" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="block w-6 h-3 rounded-sm bg-foreground/90 border border-border shadow-sm cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </SliderPrimitive.Root>

      {/* Labels */}
      <div className="text-center">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">{freq}</div>
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
}: { 
  title: string; 
  enabled?: boolean; 
  onToggle?: (v: boolean) => void; 
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {badge && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {badge}
            </Badge>
          )}
        </div>
        {onToggle !== undefined && enabled !== undefined && (
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
          />
        )}
      </div>
      <div className={onToggle !== undefined && !enabled ? 'opacity-40 pointer-events-none' : ''}>
        {children}
      </div>
    </div>
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-mono tabular-nums">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([val]) => onChange(val)}
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
    analytics.effectChanged('eq');
  }, []);

  const handleReverbChange = useCallback((key: keyof EffectsState['reverb'], value: number | boolean) => {
    setEffects(prev => ({
      ...prev,
      reverb: { ...prev.reverb, [key]: value }
    }));
    updateReverb({ [key]: value });
    analytics.effectChanged('reverb');
  }, []);

  const handleCompressorChange = useCallback((key: keyof EffectsState['compressor'], value: number | boolean) => {
    setEffects(prev => ({
      ...prev,
      compressor: { ...prev.compressor, [key]: value }
    }));
    updateCompressor({ [key]: value });
    analytics.effectChanged('compressor');
  }, []);

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
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <div className="p-4 border-b border-border shrink-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                <Sliders className="h-4 w-4 text-primary" />
              </div>
              Mixing Console
              {isModified && (
                <Badge variant="secondary" className="text-[10px] ml-auto">Modified</Badge>
              )}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Master audio processing — EQ, reverb & compression
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* ─── EQUALIZER ─── */}
          <EffectSection title="Equalizer" badge="3-Band">
            <div className="bg-secondary/30 rounded-lg p-4">
              <div className="flex items-end justify-center gap-4">
                <EQBand
                  label="Low"
                  freq="100 Hz"
                  value={effects.eq.low.gain}
                  onChange={(gain) => handleEQChange('low', gain)}
                />
                <EQBand
                  label="Mid"
                  freq="1 kHz"
                  value={effects.eq.mid.gain}
                  onChange={(gain) => handleEQChange('mid', gain)}
                />
                <EQBand
                  label="High"
                  freq="8 kHz"
                  value={effects.eq.high.gain}
                  onChange={(gain) => handleEQChange('high', gain)}
                />
              </div>
              
              {/* dB scale labels */}
              <div className="flex justify-between mt-2 px-2">
                <span className="text-[10px] text-muted-foreground">-12 dB</span>
                <span className="text-[10px] text-muted-foreground">0 dB</span>
                <span className="text-[10px] text-muted-foreground">+12 dB</span>
              </div>
            </div>
          </EffectSection>

          <Separator />

          {/* ─── REVERB ─── */}
          <EffectSection 
            title="Reverb" 
            enabled={effects.reverb.enabled}
            onToggle={(checked) => handleReverbChange('enabled', checked)}
          >
            <div className="space-y-4">
              <EffectSlider
                label="Decay Time"
                value={effects.reverb.decay}
                min={0.1}
                max={5}
                step={0.1}
                format={(v) => `${v.toFixed(1)}s`}
                onChange={(v) => handleReverbChange('decay', v)}
              />
              <EffectSlider
                label="Wet / Dry"
                value={effects.reverb.wetDry}
                min={0}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => handleReverbChange('wetDry', v)}
              />
            </div>
          </EffectSection>

          <Separator />

          {/* ─── COMPRESSOR ─── */}
          <EffectSection 
            title="Compressor" 
            enabled={effects.compressor.enabled}
            onToggle={(checked) => handleCompressorChange('enabled', checked)}
          >
            <div className="space-y-4">
              <EffectSlider
                label="Threshold"
                value={effects.compressor.threshold}
                min={-60}
                max={0}
                step={1}
                format={(v) => `${v} dB`}
                onChange={(v) => handleCompressorChange('threshold', v)}
              />
              <EffectSlider
                label="Ratio"
                value={effects.compressor.ratio}
                min={1}
                max={20}
                step={0.5}
                format={(v) => `${v}:1`}
                onChange={(v) => handleCompressorChange('ratio', v)}
              />
              <EffectSlider
                label="Attack"
                value={effects.compressor.attack}
                min={0.001}
                max={1}
                step={0.001}
                format={(v) => `${(v * 1000).toFixed(0)} ms`}
                onChange={(v) => handleCompressorChange('attack', v)}
              />
              <EffectSlider
                label="Release"
                value={effects.compressor.release}
                min={0.01}
                max={1}
                step={0.01}
                format={(v) => `${(v * 1000).toFixed(0)} ms`}
                onChange={(v) => handleCompressorChange('release', v)}
              />
            </div>
          </EffectSection>

        </div>

        {/* Sticky footer — Reset stays reachable without scrolling to the bottom */}
        <div className="shrink-0 border-t border-border bg-background p-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleReset}
            disabled={!isModified}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset All Effects
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MixingConsole;