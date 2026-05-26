import { memo, useCallback, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { type InstrumentState, INSTRUMENTS, getInstrumentConfig, type InstrumentType } from '@/lib/instruments';
import { type StylePattern, type InstrumentSounds } from '@/lib/styles';
import { Piano, Guitar, Drum, Music } from 'lucide-react';

interface InstrumentsPanelProps {
  open: boolean;
  onClose: () => void;
  instruments: InstrumentState[];
  onInstrumentChange: (instruments: InstrumentState[]) => void;
  currentStyle?: StylePattern | null;
}

const instrumentIcons: Record<string, typeof Piano> = {
  piano: Piano,
  bass: Music,
  drums: Drum,
  guitar: Guitar,
};

// Memoized individual instrument card to prevent re-renders
const InstrumentCard = memo(function InstrumentCard({
  inst,
  styleSoundId,
  styleVolume,
  onUpdate,
}: {
  inst: InstrumentState;
  styleSoundId?: string;
  styleVolume?: number;
  onUpdate: (id: string, updates: Partial<InstrumentState>) => void;
}) {
  const config = getInstrumentConfig(inst.id);
  if (!config) return null;

  const Icon = instrumentIcons[inst.id] || Music;
  const isUsingStyleSound = styleSoundId && inst.soundTypeId === styleSoundId;

  const handleMuteChange = useCallback((muted: boolean) => {
    onUpdate(inst.id, { muted });
  }, [inst.id, onUpdate]);

  const handleVolumeChange = useCallback(([value]: number[]) => {
    onUpdate(inst.id, { volume: value / 100 });
  }, [inst.id, onUpdate]);

  const handleSoundTypeChange = useCallback((soundTypeId: string) => {
    onUpdate(inst.id, { soundTypeId });
  }, [inst.id, onUpdate]);

  return (
    <div className="p-4 rounded-lg bg-secondary/50 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">{config.name}</span>
          {isUsingStyleSound && (
            <Badge variant="secondary" className="text-xs">
              Style
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`mute-${inst.id}`} className="text-xs text-muted-foreground">
            Mute
          </Label>
          <Switch
            id={`mute-${inst.id}`}
            checked={inst.muted}
            onCheckedChange={handleMuteChange}
          />
        </div>
      </div>

      {/* Volume */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">
            Volume
            {styleVolume !== undefined && Math.abs(inst.volume - styleVolume) > 0.01 && (
              <span className="ml-1 text-muted-foreground/60">
                (style: {Math.round(styleVolume * 100)}%)
              </span>
            )}
          </Label>
          <span className="text-xs text-muted-foreground">{Math.round(inst.volume * 100)}%</span>
        </div>
        <Slider
          value={[inst.volume * 100]}
          onValueChange={handleVolumeChange}
          max={100}
          step={1}
          disabled={inst.muted}
          className="w-full"
        />
      </div>

      {/* Sound Type */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Sound Type</Label>
          {styleSoundId && styleSoundId !== inst.soundTypeId && (
            <span className="text-xs text-muted-foreground/60">
              style: {config.soundTypes.find(s => s.id === styleSoundId)?.name || styleSoundId}
            </span>
          )}
        </div>
        <Select
          value={inst.soundTypeId}
          onValueChange={handleSoundTypeChange}
          disabled={inst.muted}
        >
          <SelectTrigger className="w-full bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50">
            {config.soundTypes.map(sound => (
              <SelectItem key={sound.id} value={sound.id}>
                {sound.name}
                {sound.id === styleSoundId && ' ★'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
});

export const InstrumentsPanel = memo(function InstrumentsPanel({ 
  open, 
  onClose, 
  instruments, 
  onInstrumentChange,
  currentStyle,
}: InstrumentsPanelProps) {
  // Memoize the update handler
  const updateInstrument = useCallback((id: string, updates: Partial<InstrumentState>) => {
    onInstrumentChange(
      instruments.map(inst =>
        inst.id === id ? { ...inst, ...updates } : inst
      )
    );
  }, [instruments, onInstrumentChange]);

  // Extract style-specific sounds for comparison
  const styleSounds = useMemo(() => {
    return currentStyle?.instrumentSounds || {};
  }, [currentStyle?.instrumentSounds]);

  const styleVolumes = useMemo(() => {
    return currentStyle?.volumes || {};
  }, [currentStyle?.volumes]);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) onClose();
  }, [onClose]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-80 bg-card border-border flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            Instruments
            {currentStyle && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {currentStyle.name}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-6 -mx-6 px-6">
          <div className="space-y-6 pb-6">
            {instruments.map(inst => (
              <InstrumentCard
                key={inst.id}
                inst={inst}
                styleSoundId={styleSounds[inst.id as keyof InstrumentSounds]}
                styleVolume={styleVolumes[inst.id as keyof typeof styleVolumes]}
                onUpdate={updateInstrument}
              />
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
});
