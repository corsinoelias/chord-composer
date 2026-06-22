import { useMemo } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import {
  SCALES,
  SCALE_CATEGORIES,
  CHROMATIC_NOTES,
  getScaleNoteNames,
  type Scale,
} from '@/lib/scales';

export interface ScaleFilterState {
  rootPitchClass: number;
  scaleName: string;
  intervals: number[];
}

interface ScaleSelectorProps {
  value: ScaleFilterState | null;
  onChange: (value: ScaleFilterState | null) => void;
  compact?: boolean;
}

const NOTE_LABELS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_LABELS = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

function noteLabel(pc: number): string {
  return NOTE_LABELS[pc];
}

export function ScaleSelector({ value, onChange, compact = false }: ScaleSelectorProps) {
  const rootPc = value?.rootPitchClass ?? 0;
  const scaleName = value?.scaleName ?? '';

  const scalesByCategory = useMemo(() => {
    return SCALE_CATEGORIES.map(cat => ({
      category: cat,
      scales: SCALES.filter(s => s.category === cat),
    }));
  }, []);

  const noteNames = useMemo(() => {
    if (!value) return [];
    return getScaleNoteNames(value.rootPitchClass, value.intervals);
  }, [value]);

  const handleRootChange = (pc: string) => {
    const newPc = parseInt(pc, 10);
    if (scaleName) {
      const scale = SCALES.find(s => s.name === scaleName);
      if (scale) {
        onChange({ rootPitchClass: newPc, scaleName, intervals: scale.intervals });
        return;
      }
    }
    onChange(value ? { ...value, rootPitchClass: newPc } : null);
  };

  const handleScaleChange = (name: string) => {
    const scale = SCALES.find(s => s.name === name);
    if (!scale) return;
    onChange({ rootPitchClass: rootPc, scaleName: name, intervals: scale.intervals });
  };

  const handleClear = () => onChange(null);

  if (compact && value) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-sm">
        <span className="font-medium text-primary">
          {noteLabel(value.rootPitchClass)} {value.scaleName}
        </span>
        <span className="text-muted-foreground text-xs hidden sm:inline">
          — {noteNames.join(' · ')}
        </span>
        <button
          onClick={handleClear}
          className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear scale filter"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Root note */}
      <Select value={String(rootPc)} onValueChange={handleRootChange}>
        <SelectTrigger className="w-20 h-8 text-sm">
          <SelectValue placeholder="Root" />
        </SelectTrigger>
        <SelectContent>
          {NOTE_LABELS.map((name, i) => (
            <SelectItem key={i} value={String(i)}>
              {name}{FLAT_LABELS[i] !== name ? ` / ${FLAT_LABELS[i]}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Scale type */}
      <Select value={scaleName} onValueChange={handleScaleChange}>
        <SelectTrigger className="w-52 h-8 text-sm">
          <SelectValue placeholder="Select scale…" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {scalesByCategory.map(({ category, scales }) => (
            <SelectGroup key={category}>
              <SelectLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                {category}
              </SelectLabel>
              {scales.map((scale: Scale) => (
                <SelectItem key={scale.name} value={scale.name} className="text-sm">
                  {scale.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {/* Clear */}
      {value && (
        <Button variant="ghost" size="sm" onClick={handleClear} className="h-8 px-2 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
