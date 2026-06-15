import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  DEGREES, CHORD_TONES, BASS_SCALE_PRESETS, getScaleNoteNames, scalePatternIsEmpty,
  createVariation, type Degree, type DegreePattern, type ScaleVariation, type InstrumentMelodic,
} from '@/lib/bassScale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Copy, Pencil, Check } from 'lucide-react';

interface MelodicPatternGridProps {
  melodic: InstrumentMelodic;
  referenceRootMidi: number;
  referenceQuality: string;
  onChange: (melodic: InstrumentMelodic) => void;
  naturalOctave?: number;
  currentStep?: number;
  isPlaying?: boolean;
  onActiveVarChange?: (id: string) => void;
}

export function MelodicPatternGrid({
  melodic,
  referenceRootMidi,
  referenceQuality,
  onChange,
  naturalOctave = 0,
  currentStep,
  isPlaying,
  onActiveVarChange,
}: MelodicPatternGridProps) {
  const { variations, enabled } = melodic;
  const [activeVarId, setActiveVarId] = useState<string>(() => variations[0]?.id ?? '');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Sync activeVarId when variations change (e.g. after external load)
  const resolvedActiveId = variations.find(v => v.id === activeVarId)
    ? activeVarId
    : (variations[0]?.id ?? '');

  useEffect(() => {
    if (resolvedActiveId) onActiveVarChange?.(resolvedActiveId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedActiveId]);

  const activeVariation = variations.find(v => v.id === resolvedActiveId);
  const totalSlots = (activeVariation?.loopBars ?? 1) * 16;

  const noteNames = useMemo(
    () => getScaleNoteNames(referenceRootMidi, referenceQuality, activeVariation?.octaveOffsets),
    [referenceRootMidi, referenceQuality, activeVariation?.octaveOffsets],
  );

  const update = (updatedVariations: ScaleVariation[], newEnabled = enabled) => {
    onChange({ variations: updatedVariations, enabled: newEnabled });
  };

  const updateActivePattern = (pattern: DegreePattern) => {
    update(variations.map(v => v.id === resolvedActiveId ? { ...v, pattern } : v));
  };

  const handleOctaveChange = (degree: Degree, delta: number) => {
    if (!activeVariation) return;
    const cur = activeVariation.octaveOffsets ?? {};
    const stored = cur[degree] ?? naturalOctave;
    const next = Math.max(naturalOctave - 2, Math.min(naturalOctave + 2, stored + delta));
    const updated = { ...cur, [degree]: next };
    update(variations.map(v => v.id === resolvedActiveId ? { ...v, octaveOffsets: updated } : v));
  };

  const handleCellClick = (degree: Degree, slot: number) => {
    if (!activeVariation) return;
    const cur = activeVariation.pattern[degree] ?? Array(totalSlots).fill(0);
    const padded = cur.length < totalSlots
      ? [...cur, ...Array(totalSlots - cur.length).fill(0)]
      : [...cur];
    padded[slot] = padded[slot] > 0 ? 0 : 1;
    updateActivePattern({ ...activeVariation.pattern, [degree]: padded });
  };

  const handleChordHitClick = (slot: number) => {
    if (!activeVariation) return;
    const cur = activeVariation.chordHit ?? Array(totalSlots).fill(0);
    const padded = cur.length < totalSlots
      ? [...cur, ...Array(totalSlots - cur.length).fill(0)]
      : [...cur];
    padded[slot] = padded[slot] > 0 ? 0 : 1;
    update(variations.map(v => v.id === resolvedActiveId ? { ...v, chordHit: padded } : v));
  };

  const handleLoopBarsChange = (bars: 1 | 2 | 4) => {
    if (!activeVariation) return;
    const newSlots = bars * 16;
    const adjusted: DegreePattern = {};
    for (const [d, slots] of Object.entries(activeVariation.pattern)) {
      if (!slots) continue;
      adjusted[Number(d) as Degree] = slots.length >= newSlots
        ? slots.slice(0, newSlots)
        : [...slots, ...Array(newSlots - slots.length).fill(0)];
    }
    const adjustedChordHit = activeVariation.chordHit
      ? activeVariation.chordHit.length >= newSlots
        ? activeVariation.chordHit.slice(0, newSlots)
        : [...activeVariation.chordHit, ...Array(newSlots - activeVariation.chordHit.length).fill(0)]
      : undefined;
    update(variations.map(v =>
      v.id === resolvedActiveId ? { ...v, loopBars: bars, pattern: adjusted, chordHit: adjustedChordHit } : v
    ));
  };

  const handlePreset = (name: string) => {
    const preset = BASS_SCALE_PRESETS.find(p => p.name === name);
    if (!preset || !activeVariation) return;
    const newSlots = totalSlots;
    const padded: DegreePattern = {};
    for (const [d, slots] of Object.entries(preset.pattern)) {
      if (!slots) continue;
      padded[Number(d) as Degree] = slots.length >= newSlots
        ? slots.slice(0, newSlots)
        : [...slots, ...Array(newSlots - slots.length).fill(0)];
    }
    updateActivePattern(padded);
  };

  const handleNewVariation = () => {
    const n = createVariation(`Var ${variations.length + 1}`);
    const updated = [...variations, n];
    update(updated);
    setActiveVarId(n.id);
  };

  const handleDuplicate = () => {
    if (!activeVariation) return;
    const n: ScaleVariation = {
      ...activeVariation,
      id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: `${activeVariation.name} (copy)`,
    };
    const updated = [...variations, n];
    update(updated);
    setActiveVarId(n.id);
  };

  const handleDelete = () => {
    if (variations.length <= 1) return;
    const updated = variations.filter(v => v.id !== resolvedActiveId);
    update(updated);
    setActiveVarId(updated[0]?.id ?? '');
  };

  const startRename = (v: ScaleVariation) => {
    setEditingNameId(v.id);
    setEditingName(v.name);
  };

  const commitRename = () => {
    if (!editingNameId) return;
    update(variations.map(v => v.id === editingNameId ? { ...v, name: editingName.trim() || v.name } : v));
    setEditingNameId(null);
  };

  if (variations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
        <p className="text-sm">No variations yet.</p>
        <Button size="sm" onClick={handleNewVariation}>
          <Plus className="h-4 w-4 mr-1" /> Create first variation
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Variation tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b pb-2">
        {variations.map(v => (
          <div
            key={v.id}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md border text-sm cursor-pointer transition-colors',
              v.id === resolvedActiveId
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:bg-muted border-transparent',
            )}
            onClick={() => setActiveVarId(v.id)}
          >
            {editingNameId === v.id ? (
              <form onSubmit={e => { e.preventDefault(); commitRename(); }} className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  className="h-5 w-24 text-xs px-1 bg-background text-foreground"
                />
                <button type="submit"><Check className="h-3 w-3" /></button>
              </form>
            ) : (
              <>
                <span>{v.name}</span>
                {v.id === resolvedActiveId && (
                  <button onClick={e => { e.stopPropagation(); startRename(v); }}>
                    <Pencil className="h-3 w-3 opacity-60 hover:opacity-100" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}

        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={handleNewVariation}>
          <Plus className="h-3 w-3" /> Nueva
        </Button>
      </div>

      {/* Controls for active variation */}
      {activeVariation && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset */}
          <Select onValueChange={handlePreset}>
            <SelectTrigger className="w-32 h-7 text-xs"><SelectValue placeholder="Preset…" /></SelectTrigger>
            <SelectContent>
              {BASS_SCALE_PRESETS.map(p => (
                <SelectItem key={p.name} value={p.name} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Loop bars */}
          <Select
            value={String(activeVariation.loopBars)}
            onValueChange={v => handleLoopBarsChange(Number(v) as 1 | 2 | 4)}
          >
            <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1" className="text-xs">1 bar</SelectItem>
              <SelectItem value="2" className="text-xs">2 bars</SelectItem>
              <SelectItem value="4" className="text-xs">4 bars</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-1 ml-auto">
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={handleDuplicate} title="Duplicate">
              <Copy className="h-3 w-3" />
            </Button>
            {variations.length > 1 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-destructive hover:text-destructive" onClick={handleDelete} title="Delete">
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {activeVariation && (
        <div className="overflow-x-auto">
          <div className="flex flex-col gap-1 min-w-max">
            {/* Beat markers */}
            <div className="flex items-center">
              <div className="w-28 flex-shrink-0" />
              {Array.from({ length: totalSlots }, (_, slot) => (
                <div key={slot} className={cn('w-7 text-center text-[10px] font-mono', slot % 4 === 0 ? 'text-muted-foreground' : 'text-transparent')}>
                  {slot % 4 === 0 ? Math.floor(slot / 4) + 1 : '.'}
                </div>
              ))}
            </div>

            {/* Chord hit row — plays all chord tones simultaneously */}
            {(() => {
              const chordHitSlots = activeVariation.chordHit ?? [];
              return (
                <div className="flex items-center mb-1">
                  <div className="w-28 flex-shrink-0 flex items-center gap-1 pr-2">
                    <span className="text-sm font-mono w-3">♩</span>
                    <span className="text-xs rounded px-1 min-w-[28px] text-center bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold">
                      Chord
                    </span>
                  </div>
                  {Array.from({ length: totalSlots }, (_, slot) => {
                    const active = (chordHitSlots[slot] ?? 0) > 0;
                    const isCurrent = isPlaying && currentStep !== undefined && currentStep >= 0 && (currentStep % totalSlots) === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => handleChordHitClick(slot)}
                        className={cn(
                          'w-7 h-8 border transition-colors rounded-sm',
                          slot % 4 === 0 && slot > 0 && 'border-l-2',
                          isCurrent && !active && 'bg-amber-500/20',
                          active
                            ? 'bg-amber-500 border-amber-500'
                            : 'border-amber-400/25 hover:bg-amber-500/10',
                        )}
                      />
                    );
                  })}
                </div>
              );
            })()}

            {DEGREES.map(degree => {
              const isChordTone = CHORD_TONES.has(degree);
              const degSlots = activeVariation.pattern[degree] ?? [];
              const storedOctave = activeVariation.octaveOffsets?.[degree] ?? naturalOctave;
              const displayOctave = storedOctave - naturalOctave;
              return (
                <div key={degree} className="flex items-center">
                  <div className={cn('w-28 flex-shrink-0 flex items-center gap-1 pr-2', isChordTone ? 'font-semibold' : 'text-muted-foreground')}>
                    <span className="text-sm font-mono w-3">{degree}</span>
                    <span className={cn('text-xs rounded px-1 min-w-[28px] text-center', isChordTone ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                      {noteNames[degree]}
                    </span>
                    <div className="flex items-center gap-px ml-auto">
                      <button
                        onClick={() => handleOctaveChange(degree, -1)}
                        disabled={displayOctave <= -2}
                        className="w-4 h-4 rounded text-[9px] leading-none flex items-center justify-center bg-muted hover:bg-muted-foreground/20 disabled:opacity-30"
                        title="Bajar octava"
                      >▾</button>
                      <span className={cn('text-[9px] w-5 text-center', displayOctave !== 0 ? 'text-primary font-bold' : 'text-muted-foreground')}>
                        {displayOctave > 0 ? `+${displayOctave}` : displayOctave}
                      </span>
                      <button
                        onClick={() => handleOctaveChange(degree, +1)}
                        disabled={displayOctave >= 2}
                        className="w-4 h-4 rounded text-[9px] leading-none flex items-center justify-center bg-muted hover:bg-muted-foreground/20 disabled:opacity-30"
                        title="Subir octava"
                      >▴</button>
                    </div>
                  </div>
                  {Array.from({ length: totalSlots }, (_, slot) => {
                    const active = (degSlots[slot] ?? 0) > 0;
                    const isCurrent = isPlaying && currentStep !== undefined && currentStep >= 0 && (currentStep % totalSlots) === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => handleCellClick(degree, slot)}
                        className={cn(
                          'w-7 h-8 border transition-colors rounded-sm',
                          slot % 4 === 0 && slot > 0 && 'border-l-2',
                          isCurrent && !active && 'bg-primary/20',
                          active
                            ? isChordTone ? 'bg-primary border-primary' : 'bg-blue-400 border-blue-400 dark:bg-blue-600 dark:border-blue-600'
                            : isChordTone ? 'border-primary/25 hover:bg-primary/10' : 'border-muted-foreground/15 hover:bg-muted',
                        )}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeVariation && !scalePatternIsEmpty(activeVariation.pattern) && (
        <Button
          variant="ghost" size="sm"
          className="self-start h-7 gap-1 text-destructive hover:text-destructive text-xs"
          onClick={() => updateActivePattern({})}
        >
          <Trash2 className="h-3 w-3" /> Clear pattern
        </Button>
      )}
    </div>
  );
}
