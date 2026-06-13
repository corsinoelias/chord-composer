import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  DEGREES,
  CHORD_TONES,
  BASS_SCALE_PRESETS,
  getScaleNoteNames,
  scalePatternIsEmpty,
  type Degree,
  type DegreePattern,
} from '@/lib/bassScale';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface BassScaleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pattern: DegreePattern;
  loopBars: 1 | 2 | 4;
  enabled: boolean;
  referenceRootMidi: number;
  referenceQuality: string;
  onPatternChange: (pattern: DegreePattern) => void;
  onLoopBarsChange: (bars: 1 | 2 | 4) => void;
  onEnabledChange: (enabled: boolean) => void;
}

export function BassScaleEditor({
  open,
  onOpenChange,
  pattern,
  loopBars,
  enabled,
  referenceRootMidi,
  referenceQuality,
  onPatternChange,
  onLoopBarsChange,
  onEnabledChange,
}: BassScaleEditorProps) {
  const totalSlots = loopBars * 16;

  const noteNames = useMemo(
    () => getScaleNoteNames(referenceRootMidi, referenceQuality),
    [referenceRootMidi, referenceQuality],
  );

  const handleCellClick = (degree: Degree, slot: number) => {
    const degSlots = pattern[degree] ?? Array(totalSlots).fill(0);
    const padded = degSlots.length < totalSlots
      ? [...degSlots, ...Array(totalSlots - degSlots.length).fill(0)]
      : degSlots;
    const next = [...padded];
    next[slot] = next[slot] > 0 ? 0 : 1;
    onPatternChange({ ...pattern, [degree]: next });
  };

  const handlePreset = (presetName: string) => {
    const preset = BASS_SCALE_PRESETS.find(p => p.name === presetName);
    if (!preset) return;
    // Pad each degree array to totalSlots
    const padded: DegreePattern = {};
    for (const [degStr, slots] of Object.entries(preset.pattern)) {
      const deg = Number(degStr) as Degree;
      if (!slots) continue;
      padded[deg] = slots.length >= totalSlots
        ? slots.slice(0, totalSlots)
        : [...slots, ...Array(totalSlots - slots.length).fill(0)];
    }
    onPatternChange(padded);
  };

  const handleLoopBarsChange = (bars: 1 | 2 | 4) => {
    // Trim or extend each degree array
    const adjusted: DegreePattern = {};
    const newSlots = bars * 16;
    for (const [degStr, slots] of Object.entries(pattern)) {
      const deg = Number(degStr) as Degree;
      if (!slots) continue;
      adjusted[deg] = slots.length >= newSlots
        ? slots.slice(0, newSlots)
        : [...slots, ...Array(newSlots - slots.length).fill(0)];
    }
    onPatternChange(adjusted);
    onLoopBarsChange(bars);
  };

  const handleClear = () => onPatternChange({});

  // Beat dividers every 4 slots
  const beatAt = (slot: number) => slot % 4 === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] flex flex-col overflow-hidden p-0">
        <SheetHeader className="px-4 pt-4 pb-2 border-b flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SheetTitle className="text-base">Línea de bajo</SheetTitle>
            <div className="flex items-center gap-2">
              <Switch id="bass-scale-enable" checked={enabled} onCheckedChange={onEnabledChange} />
              <Label htmlFor="bass-scale-enable" className="text-sm">
                {enabled ? 'Activa' : 'Inactiva'}
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-1">
            {/* Preset */}
            <Select onValueChange={handlePreset}>
              <SelectTrigger className="w-36 h-7 text-sm">
                <SelectValue placeholder="Preset…" />
              </SelectTrigger>
              <SelectContent>
                {BASS_SCALE_PRESETS.map(p => (
                  <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Loop length */}
            <Select
              value={String(loopBars)}
              onValueChange={v => handleLoopBarsChange(Number(v) as 1 | 2 | 4)}
            >
              <SelectTrigger className="w-28 h-7 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 compás</SelectItem>
                <SelectItem value="2">2 compases</SelectItem>
                <SelectItem value="4">4 compases</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear */}
            {!scalePatternIsEmpty(pattern) && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={handleClear}>
                <Trash2 className="h-3 w-3" />
                Limpiar
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4">
          <p className="text-xs text-muted-foreground mb-3">
            Las notas se adaptan automáticamente a cada acorde.
            Los grados <span className="font-semibold">1 3 5 7</span> son notas del acorde (más estables).
          </p>

          <div className="flex flex-col gap-1 min-w-max">
            {/* Column beat markers */}
            <div className="flex items-center">
              <div className="w-16 flex-shrink-0" />
              {Array.from({ length: totalSlots }, (_, slot) => (
                <div
                  key={slot}
                  className={cn(
                    'w-7 text-center',
                    beatAt(slot) ? 'text-[10px] text-muted-foreground font-mono' : 'text-transparent',
                  )}
                >
                  {beatAt(slot) ? Math.floor(slot / 4) + 1 : '·'}
                </div>
              ))}
            </div>

            {/* Degree rows */}
            {DEGREES.map(degree => {
              const isChordTone = CHORD_TONES.has(degree);
              const degSlots = pattern[degree] ?? [];
              return (
                <div key={degree} className="flex items-center gap-0">
                  {/* Label */}
                  <div className={cn(
                    'w-16 flex-shrink-0 flex items-center gap-1 pr-2',
                    isChordTone ? 'font-semibold' : 'text-muted-foreground',
                  )}>
                    <span className="text-sm font-mono w-3">{degree}</span>
                    <span className={cn(
                      'text-xs rounded px-1',
                      isChordTone
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      {noteNames[degree]}
                    </span>
                  </div>

                  {/* Cells */}
                  {Array.from({ length: totalSlots }, (_, slot) => {
                    const active = (degSlots[slot] ?? 0) > 0;
                    return (
                      <button
                        key={slot}
                        onClick={() => handleCellClick(degree, slot)}
                        className={cn(
                          'w-7 h-8 border transition-colors rounded-sm',
                          slot % 4 === 0 && slot > 0 && 'ml-px border-l-2',
                          active
                            ? isChordTone
                              ? 'bg-primary border-primary'
                              : 'bg-blue-400 border-blue-400 dark:bg-blue-600 dark:border-blue-600'
                            : isChordTone
                              ? 'border-primary/25 hover:bg-primary/10'
                              : 'border-muted-foreground/15 hover:bg-muted',
                        )}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {!enabled && (
            <p className="text-xs text-muted-foreground mt-3">
              Activa el interruptor para usar este patrón en lugar del bajo del estilo.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
