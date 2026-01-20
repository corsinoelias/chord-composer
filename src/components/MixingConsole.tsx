/**
 * Mixing Console Component
 * 
 * Master EQ, reverb, and compression controls
 */

import { useState, useCallback, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sliders, RotateCcw } from 'lucide-react';
import { 
  EffectsState, 
  DEFAULT_EFFECTS_STATE,
  updateEQ,
  updateReverb,
  updateCompressor,
  resetEffects,
  initializeEffects
} from '@/lib/audioEffects';

interface MixingConsoleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MixingConsole({ open, onOpenChange }: MixingConsoleProps) {
  const [effects, setEffects] = useState<EffectsState>(DEFAULT_EFFECTS_STATE);

  useEffect(() => {
    if (open) {
      initializeEffects();
    }
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

  const handleReset = useCallback(() => {
    setEffects(DEFAULT_EFFECTS_STATE);
    resetEffects();
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            Mixing Console
          </SheetTitle>
          <SheetDescription>
            Master EQ, reverb, and compression
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <Tabs defaultValue="eq" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="eq">EQ</TabsTrigger>
              <TabsTrigger value="reverb">Reverb</TabsTrigger>
              <TabsTrigger value="compressor">Compressor</TabsTrigger>
            </TabsList>

            <TabsContent value="eq" className="space-y-6 mt-4">
              <div className="space-y-4">
                <EQSlider
                  label="Low (100 Hz)"
                  value={effects.eq.low.gain}
                  onChange={(gain) => handleEQChange('low', gain)}
                />
                <EQSlider
                  label="Mid (1 kHz)"
                  value={effects.eq.mid.gain}
                  onChange={(gain) => handleEQChange('mid', gain)}
                />
                <EQSlider
                  label="High (8 kHz)"
                  value={effects.eq.high.gain}
                  onChange={(gain) => handleEQChange('high', gain)}
                />
              </div>
            </TabsContent>

            <TabsContent value="reverb" className="space-y-6 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="reverb-enabled">Enable Reverb</Label>
                <Switch
                  id="reverb-enabled"
                  checked={effects.reverb.enabled}
                  onCheckedChange={(checked) => handleReverbChange('enabled', checked)}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>Decay</Label>
                    <span className="text-muted-foreground">{effects.reverb.decay.toFixed(1)}s</span>
                  </div>
                  <Slider
                    value={[effects.reverb.decay]}
                    min={0.1}
                    max={5}
                    step={0.1}
                    onValueChange={([value]) => handleReverbChange('decay', value)}
                    disabled={!effects.reverb.enabled}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>Wet/Dry Mix</Label>
                    <span className="text-muted-foreground">{Math.round(effects.reverb.wetDry * 100)}%</span>
                  </div>
                  <Slider
                    value={[effects.reverb.wetDry]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={([value]) => handleReverbChange('wetDry', value)}
                    disabled={!effects.reverb.enabled}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="compressor" className="space-y-6 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="compressor-enabled">Enable Compressor</Label>
                <Switch
                  id="compressor-enabled"
                  checked={effects.compressor.enabled}
                  onCheckedChange={(checked) => handleCompressorChange('enabled', checked)}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>Threshold</Label>
                    <span className="text-muted-foreground">{effects.compressor.threshold} dB</span>
                  </div>
                  <Slider
                    value={[effects.compressor.threshold]}
                    min={-60}
                    max={0}
                    step={1}
                    onValueChange={([value]) => handleCompressorChange('threshold', value)}
                    disabled={!effects.compressor.enabled}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>Ratio</Label>
                    <span className="text-muted-foreground">{effects.compressor.ratio}:1</span>
                  </div>
                  <Slider
                    value={[effects.compressor.ratio]}
                    min={1}
                    max={20}
                    step={0.5}
                    onValueChange={([value]) => handleCompressorChange('ratio', value)}
                    disabled={!effects.compressor.enabled}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>Attack</Label>
                    <span className="text-muted-foreground">{(effects.compressor.attack * 1000).toFixed(0)} ms</span>
                  </div>
                  <Slider
                    value={[effects.compressor.attack]}
                    min={0.001}
                    max={1}
                    step={0.001}
                    onValueChange={([value]) => handleCompressorChange('attack', value)}
                    disabled={!effects.compressor.enabled}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <Label>Release</Label>
                    <span className="text-muted-foreground">{(effects.compressor.release * 1000).toFixed(0)} ms</span>
                  </div>
                  <Slider
                    value={[effects.compressor.release]}
                    min={0.01}
                    max={1}
                    step={0.01}
                    onValueChange={([value]) => handleCompressorChange('release', value)}
                    disabled={!effects.compressor.enabled}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="pt-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset All Effects
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface EQSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function EQSlider({ label, value, onChange }: EQSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <Label>{label}</Label>
        <span className={`text-muted-foreground ${value > 0 ? 'text-green-500' : value < 0 ? 'text-red-500' : ''}`}>
          {value > 0 ? '+' : ''}{value.toFixed(1)} dB
        </span>
      </div>
      <Slider
        value={[value]}
        min={-12}
        max={12}
        step={0.5}
        onValueChange={([val]) => onChange(val)}
      />
    </div>
  );
}

export default MixingConsole;
