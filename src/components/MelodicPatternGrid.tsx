import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  DEGREES, CHORD_TONES, BASS_SCALE_PRESETS, getScaleNoteNames, scalePatternIsEmpty,
  createVariation, degreeToSemitone, type Degree, type DegreePattern, type ScaleVariation, type InstrumentMelodic,
} from '@/lib/bassScale';
import { previewNote } from '@/lib/audioEngine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, Copy, Pencil, Check, Layers } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

// hex (#rrggbb) → rgba, for accent-tinted cell fills.
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// "C4" / "C#4" → "C" / "C#" — drop the octave number to save space.
const pitchClass = (name: string) => name.replace(/-?\d+$/, '');

interface MelodicPatternGridProps {
  melodic: InstrumentMelodic;
  /** Signature color of the instrument this grid edits (piano/guitar/bass). */
  accentColor?: string;
  referenceRootMidi: number;
  referenceQuality: string;
  onChange: (melodic: InstrumentMelodic) => void;
  naturalOctave?: number;
  currentStep?: number;
  isPlaying?: boolean;
  onActiveVarChange?: (id: string) => void;
  // Slots in one bar for the style being edited (16 for 4/4, 12 for 6/8, etc.)
  slotsPerBar?: number;
  // Slots per visual beat-group divider — matches the meter's pulse (4 for 4/4's
  // quarter note, 2 for 6/8's eighth note), same interval the metronome clicks on.
  slotsPerBeatGroup?: number;
}

export function MelodicPatternGrid({
  melodic,
  accentColor = '#8b7cff',
  referenceRootMidi,
  referenceQuality,
  onChange,
  naturalOctave = 0,
  currentStep,
  isPlaying,
  onActiveVarChange,
  slotsPerBar = 16,
  slotsPerBeatGroup = 4,
}: MelodicPatternGridProps) {
  const isMobile = useIsMobile();
  const { variations, enabled } = melodic;
  const [activeVarId, setActiveVarId] = useState<string>(() => variations[0]?.id ?? '');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [melPage, setMelPage] = useState(0);

  // Sync activeVarId when variations change (e.g. after external load)
  const resolvedActiveId = variations.find(v => v.id === activeVarId)
    ? activeVarId
    : (variations[0]?.id ?? '');

  useEffect(() => {
    if (resolvedActiveId) onActiveVarChange?.(resolvedActiveId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedActiveId]);

  const activeVariation = variations.find(v => v.id === resolvedActiveId);
  const totalSlots = (activeVariation?.loopBars ?? 1) * slotsPerBar;

  // Paging: half a bar per page on phones, a whole bar on wider screens — navigated with
  // dots so the grid never scrolls sideways (matches the drum grid).
  const melPageSize = isMobile ? Math.max(4, Math.ceil(slotsPerBar / 2)) : slotsPerBar;
  const melTotalPages = Math.max(1, Math.ceil(totalSlots / melPageSize));
  const viewPage = Math.min(melPage, melTotalPages - 1);
  const pageStart = viewPage * melPageSize;
  const visibleSlots = Array.from(
    { length: Math.min(melPageSize, totalSlots - pageStart) },
    (_, i) => pageStart + i,
  );
  const gridCols = { gridTemplateColumns: `repeat(${melPageSize}, minmax(0, 1fr))` };

  // Reset to page 0 when the grid's shape changes (variation, bars, meter, page size).
  useEffect(() => {
    setMelPage(0);
  }, [resolvedActiveId, totalSlots, melPageSize]);

  // Follow the playhead across pages while playing.
  useEffect(() => {
    if (!isPlaying || currentStep === undefined || currentStep < 0 || totalSlots === 0) return;
    const p = Math.floor((currentStep % totalSlots) / melPageSize);
    setMelPage(prev => (prev !== p ? p : prev));
  }, [currentStep, isPlaying, melPageSize, totalSlots]);

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

  // Audible feedback: play the real pitch of a degree (root + scale semitone + octave).
  const previewDegree = (degree: Degree) => {
    const off = activeVariation?.octaveOffsets?.[degree] ?? 0;
    previewNote(referenceRootMidi + degreeToSemitone(degree, referenceQuality) + off * 12);
  };

  const handleCellClick = (degree: Degree, slot: number) => {
    if (!activeVariation) return;
    const cur = activeVariation.pattern[degree] ?? Array(totalSlots).fill(0);
    const padded = cur.length < totalSlots
      ? [...cur, ...Array(totalSlots - cur.length).fill(0)]
      : [...cur];
    const wasOn = padded[slot] > 0;
    padded[slot] = wasOn ? 0 : 1;
    if (!wasOn) previewDegree(degree); // hear the note you just placed
    updateActivePattern({ ...activeVariation.pattern, [degree]: padded });
  };

  const handleChordHitClick = (slot: number) => {
    if (!activeVariation) return;
    const cur = activeVariation.chordHit ?? Array(totalSlots).fill(0);
    const padded = cur.length < totalSlots
      ? [...cur, ...Array(totalSlots - cur.length).fill(0)]
      : [...cur];
    const wasOn = padded[slot] > 0;
    padded[slot] = wasOn ? 0 : 1;
    if (!wasOn) {
      // Chord hit = play the chord tones together (root, third, fifth)
      ([1, 3, 5] as Degree[]).forEach(d => previewNote(referenceRootMidi + degreeToSemitone(d, referenceQuality)));
    }
    update(variations.map(v => v.id === resolvedActiveId ? { ...v, chordHit: padded } : v));
  };

  const handleLoopBarsChange = (bars: 1 | 2 | 4) => {
    if (!activeVariation) return;
    const newSlots = bars * slotsPerBar;
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
          <Plus className="h-3 w-3" /> New variation
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

      {/* Grid — same look as the drum sequencer (chip rail + colored pads). The amber
          Chord row is the one intentional exception. Octave lives in the chip's popover. */}
      {activeVariation && (
        <div className="flex flex-col gap-1.5">
          {/* Chord row — all chord tones together (kept visually distinct in amber) */}
          {(() => {
            const chordHitSlots = activeVariation.chordHit ?? [];
            return (
              <div className="flex items-center gap-2">
                <div
                  title="Chord — all chord tones together"
                  className="w-14 h-10 shrink-0 rounded-lg border flex flex-col items-center justify-center gap-0.5 text-amber-600 dark:text-amber-400"
                  style={{ backgroundColor: 'rgba(245,158,11,0.14)', borderColor: 'rgba(245,158,11,0.34)' }}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="text-[8px] leading-none font-medium">Chord</span>
                </div>
                <div className="grid flex-1 gap-1.5" style={gridCols}>
                  {visibleSlots.map(slot => {
                    const active = (chordHitSlots[slot] ?? 0) > 0;
                    const isCurrent = isPlaying && currentStep !== undefined && currentStep >= 0 && (currentStep % totalSlots) === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => handleChordHitClick(slot)}
                        className={cn(
                          'aspect-square rounded-md border transition-colors',
                          slot % slotsPerBeatGroup === 0 && slot > 0 && 'border-l-2',
                          isCurrent && !active && 'bg-amber-500/20',
                          active ? 'bg-amber-500 border-amber-500' : 'border-amber-400/25 hover:bg-amber-500/10',
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Degree rows — chip (note) + colored pads, matching the drum rows */}
          {DEGREES.map(degree => {
            const isChordTone = CHORD_TONES.has(degree);
            const degSlots = activeVariation.pattern[degree] ?? [];
            const storedOctave = activeVariation.octaveOffsets?.[degree] ?? naturalOctave;
            const displayOctave = storedOctave - naturalOctave;
            return (
              <div key={degree} className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      title={`Degree ${degree} · ${pitchClass(noteNames[degree])} — tap for octave`}
                      className={cn(
                        'w-14 h-10 shrink-0 rounded-lg border relative flex flex-col items-center justify-center gap-0 transition-transform active:scale-95',
                        !isChordTone && 'bg-muted text-muted-foreground border-border',
                      )}
                      style={isChordTone
                        ? { color: accentColor, backgroundColor: hexToRgba(accentColor, 0.16), borderColor: hexToRgba(accentColor, 0.34) }
                        : undefined}
                    >
                      <span className="text-sm font-bold leading-none">{pitchClass(noteNames[degree])}</span>
                      <span className="text-[8px] leading-none opacity-70">{degree}</span>
                      {displayOctave !== 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-3.5 px-0.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold grid place-items-center">
                          {displayOctave > 0 ? `+${displayOctave}` : displayOctave}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="center" className="w-auto p-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold" style={isChordTone ? { color: accentColor } : undefined}>
                        {degree} · {pitchClass(noteNames[degree])}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">Octave</span>
                        <button onClick={() => handleOctaveChange(degree, -1)} disabled={displayOctave <= -2} className="w-7 h-7 rounded-md bg-muted hover:bg-muted-foreground/20 disabled:opacity-30 grid place-items-center" title="Down an octave">▾</button>
                        <span className={cn('text-sm w-7 text-center font-mono', displayOctave !== 0 ? 'text-primary font-bold' : 'text-muted-foreground')}>
                          {displayOctave > 0 ? `+${displayOctave}` : displayOctave}
                        </span>
                        <button onClick={() => handleOctaveChange(degree, +1)} disabled={displayOctave >= 2} className="w-7 h-7 rounded-md bg-muted hover:bg-muted-foreground/20 disabled:opacity-30 grid place-items-center" title="Up an octave">▴</button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="grid flex-1 gap-1.5" style={gridCols}>
                  {visibleSlots.map(slot => {
                    const active = (degSlots[slot] ?? 0) > 0;
                    const isCurrent = isPlaying && currentStep !== undefined && currentStep >= 0 && (currentStep % totalSlots) === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => handleCellClick(degree, slot)}
                        style={active
                          ? { backgroundColor: isChordTone ? accentColor : hexToRgba(accentColor, 0.5), borderColor: hexToRgba(accentColor, 0.75) }
                          : (isCurrent ? { backgroundColor: hexToRgba(accentColor, 0.18) } : undefined)}
                        className={cn(
                          'aspect-square rounded-md border transition-colors',
                          slot % slotsPerBeatGroup === 0 && slot > 0 && 'border-l-2',
                          !active && !isCurrent && (isChordTone ? 'border-primary/25 hover:bg-primary/10' : 'border-muted-foreground/15 hover:bg-muted'),
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Beat ruler at the bottom (like the drum grid) */}
          <div className="flex items-center gap-2 pt-0.5">
            <div className="w-14 shrink-0" />
            <div className="grid flex-1 gap-1.5" style={gridCols}>
              {visibleSlots.map(slot => {
                const isBeat = slot % slotsPerBeatGroup === 0;
                return (
                  <div key={slot} className={cn('h-5 flex items-center justify-center text-[10px] tabular-nums', isBeat ? 'text-foreground font-semibold' : 'text-muted-foreground/40')}>
                    {isBeat ? Math.floor(slot / slotsPerBeatGroup) + 1 : '·'}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Page dots — navigate half-bar / bar pages without side-scrolling */}
      {activeVariation && melTotalPages > 1 && (
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <div className="flex items-center gap-2">
            {Array.from({ length: melTotalPages }).map((_, p) => (
              <button
                key={p}
                onClick={() => setMelPage(p)}
                aria-label={`Page ${p + 1}`}
                className={cn(
                  'h-3 w-3 rounded-full border transition-all',
                  p === viewPage ? 'bg-primary border-primary scale-110' : 'border-muted-foreground/50 hover:border-primary',
                )}
              />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Bar {Math.floor(pageStart / slotsPerBar) + 1}{(activeVariation.loopBars ?? 1) > 1 ? ` / ${activeVariation.loopBars}` : ''}
          </span>
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
