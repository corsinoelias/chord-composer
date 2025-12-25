import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InstrumentState, INSTRUMENTS, getInstrumentConfig } from '@/lib/instruments';
import { Piano, Guitar, Drum } from 'lucide-react';

interface InstrumentsPanelProps {
  open: boolean;
  onClose: () => void;
  instruments: InstrumentState[];
  onInstrumentChange: (instruments: InstrumentState[]) => void;
}

const instrumentIcons = {
  piano: Piano,
  bass: Guitar,
  drums: Drum,
};

export function InstrumentsPanel({ open, onClose, instruments, onInstrumentChange }: InstrumentsPanelProps) {
  const updateInstrument = (id: string, updates: Partial<InstrumentState>) => {
    const newInstruments = instruments.map(inst =>
      inst.id === id ? { ...inst, ...updates } : inst
    );
    onInstrumentChange(newInstruments);
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-80 bg-card border-border">
        <SheetHeader>
          <SheetTitle className="text-foreground">Instruments</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {instruments.map(inst => {
            const config = getInstrumentConfig(inst.id);
            if (!config) return null;
            
            const Icon = instrumentIcons[inst.id];

            return (
              <div key={inst.id} className="p-4 rounded-lg bg-secondary/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-primary" />
                    <span className="font-medium text-foreground">{config.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`mute-${inst.id}`} className="text-xs text-muted-foreground">
                      Mute
                    </Label>
                    <Switch
                      id={`mute-${inst.id}`}
                      checked={inst.muted}
                      onCheckedChange={(muted) => updateInstrument(inst.id, { muted })}
                    />
                  </div>
                </div>

                {/* Volume */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground">Volume</Label>
                    <span className="text-xs text-muted-foreground">{Math.round(inst.volume * 100)}%</span>
                  </div>
                  <Slider
                    value={[inst.volume * 100]}
                    onValueChange={([value]) => updateInstrument(inst.id, { volume: value / 100 })}
                    max={100}
                    step={1}
                    disabled={inst.muted}
                    className="w-full"
                  />
                </div>

                {/* Sound Type */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Sound Type</Label>
                  <Select
                    value={inst.soundTypeId}
                    onValueChange={(soundTypeId) => updateInstrument(inst.id, { soundTypeId })}
                    disabled={inst.muted}
                  >
                    <SelectTrigger className="w-full bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border z-50">
                      {config.soundTypes.map(sound => (
                        <SelectItem key={sound.id} value={sound.id}>
                          {sound.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
