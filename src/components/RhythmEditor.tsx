import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Play, 
  Square, 
  Plus, 
  Trash2, 
  Save, 
  Copy, 
  RotateCcw,
  Volume2,
  Drum,
  Piano,
  Guitar,
  Music,
  RotateCw
} from 'lucide-react';
import { type StylePattern, MUSICAL_STYLES, getSlotsPerBar, getStyleTotalSlots, getPulseInterval } from '@/lib/styles';
import { getAudioContext, ensureSamplesLoaded, scheduleProgression, stopPlayback } from '@/lib/audioEngine';
import { getDefaultInstrumentStates, INSTRUMENTS, type InstrumentType } from '@/lib/instruments';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';
import { saveCustomStyle, deleteCustomStyle, isCustomStyle, generateCustomStyleId, saveStyleOverride, deleteStyleOverride, hasStyleOverride, getStyleOverride } from '@/lib/customStyles';
import { useStylePreview } from '@/hooks/useStylePreview';
import { usePlayback } from '@/contexts/PlaybackContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MelodicPatternGrid } from '@/components/MelodicPatternGrid';
import { emptyMelodicData, createVariation, scalePatternIsEmpty, type InstrumentMelodic } from '@/lib/bassScale';

// All possible instruments in the editor
const ALL_INSTRUMENTS = [
  { key: 'kick', label: 'Kick', category: 'drums', icon: Drum },
  { key: 'snare', label: 'Snare', category: 'drums', icon: Drum },
  { key: 'snareStick', label: 'Snare Stick', category: 'drums', icon: Drum },
  { key: 'hihat', label: 'Hi-Hat', category: 'drums', icon: Drum },
  { key: 'hihatOpen', label: 'Hi-Hat Open', category: 'drums', icon: Drum },
  { key: 'hihatFoot', label: 'Hi-Hat Foot', category: 'drums', icon: Drum },
  { key: 'tom1', label: 'Tom 1', category: 'drums', icon: Drum },
  { key: 'tom2', label: 'Tom 2', category: 'drums', icon: Drum },
  { key: 'floorTom', label: 'Floor Tom', category: 'drums', icon: Drum },
  { key: 'ride', label: 'Ride', category: 'drums', icon: Drum },
  { key: 'crash', label: 'Crash', category: 'drums', icon: Drum },
  { key: 'bass', label: 'Bass', category: 'bass', icon: Music },
  { key: 'piano', label: 'Piano', category: 'piano', icon: Piano },
  { key: 'guitar', label: 'Guitar', category: 'guitar', icon: Guitar },
] as const;

type InstrumentKey = typeof ALL_INSTRUMENTS[number]['key'];

interface RhythmEditorProps {
  open: boolean;
  onClose: () => void;
  style: StylePattern;
  allStyles: StylePattern[]; // All available styles (built-in + custom)
  isNewStyle?: boolean;
  onSave?: (style: StylePattern) => void;
  onStyleChange?: (style: StylePattern) => void;
  onStyleSelect?: (styleId: string) => void;
  onDelete?: (styleId: string) => void;
  referenceRootMidi?: number;
  referenceQuality?: string;
}

// Migrate rhythm.bass/piano/guitar into melodic variations so they appear in their own tabs
function migrateRhythmToMelodic(style: StylePattern): StylePattern {
  const melodic = {
    bass:   { ...(style.melodic?.bass   ?? { variations: [], enabled: false }) },
    piano:  { ...(style.melodic?.piano  ?? { variations: [], enabled: false }) },
    guitar: { ...(style.melodic?.guitar ?? { variations: [], enabled: false }) },
  };
  let changed = false;

  if (style.rhythm.bass?.some(v => v > 0) && melodic.bass.variations.length === 0) {
    const v = createVariation('Default');
    v.pattern[1] = [...style.rhythm.bass];
    melodic.bass = { variations: [v], enabled: true };
    changed = true;
  }
  if (style.rhythm.piano?.some(v => v > 0) && melodic.piano.variations.length === 0) {
    const v = createVariation('Default');
    v.chordHit = [...style.rhythm.piano];
    melodic.piano = { variations: [v], enabled: true };
    changed = true;
  }
  if (style.rhythm.guitar?.some(v => v > 0) && melodic.guitar.variations.length === 0) {
    const v = createVariation('Default');
    v.chordHit = [...style.rhythm.guitar];
    melodic.guitar = { variations: [v], enabled: true };
    changed = true;
  }

  return changed ? { ...style, melodic } : style;
}

const VELOCITY_LEVELS = [0, 0.3, 0.5, 0.7, 1];
const VELOCITY_COLORS = [
  'bg-secondary',
  'bg-chart-4/40',
  'bg-chart-4/60',
  'bg-chart-4/80',
  'bg-chart-4',
];

// All drum instrument keys for Fill mode
const DRUM_INSTRUMENT_KEYS: InstrumentKey[] = [
  'kick', 'snare', 'snareStick', 'hihat', 'hihatOpen', 'hihatFoot', 
  'tom1', 'tom2', 'floorTom', 'ride', 'crash'
];

function createEmptyPattern(slotsPerBar: number = 16): number[] {
  return new Array(slotsPerBar).fill(0);
}

function cloneStyle(style: StylePattern): StylePattern {
  return JSON.parse(JSON.stringify(style));
}

// One instrument's default volume + sound-type picker. Rendered inside whichever
// tab owns that instrument (Drums tab shows only drums, Piano tab shows only
// piano, etc.) instead of dumping all four into a single tab's toolbar.
function InstrumentMixControl({
  instType,
  editedStyle,
  onChange,
}: {
  instType: InstrumentType;
  editedStyle: StylePattern;
  onChange: (updater: (prev: StylePattern) => StylePattern) => void;
}) {
  const config = INSTRUMENTS.find(i => i.id === instType);
  if (!config) return null;

  const currentSoundId = editedStyle.instrumentSounds?.[instType] || config.defaultSoundType;
  // Only `guitar` is optional on StylePattern.volumes — falls back to piano's
  // volume, matching the default this style would apply if unset.
  const currentVolume = editedStyle.volumes[instType] ?? editedStyle.volumes.piano;

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-1 sm:gap-2">
        <Volume2 className="w-4 h-4 text-muted-foreground hidden sm:block" />
        <span className="text-xs text-muted-foreground">{config.name}</span>
        <Slider
          value={[currentVolume * 100]}
          onValueChange={([v]) => onChange(prev => ({ ...prev, volumes: { ...prev.volumes, [instType]: v / 100 } }))}
          className="w-16 sm:w-20"
          max={100}
        />
      </div>
      <Select
        value={currentSoundId}
        onValueChange={(soundId) => onChange(prev => ({
          ...prev,
          instrumentSounds: { ...prev.instrumentSounds, [instType]: soundId },
        }))}
      >
        <SelectTrigger className="h-7 w-28 sm:w-32 text-[10px] sm:text-xs px-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {config.soundTypes.map(sound => (
            <SelectItem key={sound.id} value={sound.id} className="text-xs">
              {sound.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RhythmEditor({
  open,
  onClose,
  style,
  allStyles,
  isNewStyle,
  onSave,
  onStyleChange,
  onStyleSelect,
  onDelete,
  referenceRootMidi = 60,
  referenceQuality = 'maj',
}: RhythmEditorProps) {
  // Use centralized playback state
  const { state: playbackState, stop: stopMainPlayback } = usePlayback();
  const { isPlaying: isMainPlaying, currentStep: mainPlayheadStep } = playbackState;
  
  const [editedStyle, setEditedStyle] = useState<StylePattern>(cloneStyle(style));
  const [originalStyleName, setOriginalStyleName] = useState(style.name); // For dropdown display
  const [isLocalPlaying, setIsLocalPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showFill, setShowFill] = useState(false);
  const [activeInstruments, setActiveInstruments] = useState<Set<InstrumentKey>>(new Set());
  const [savedNonFillInstruments, setSavedNonFillInstruments] = useState<Set<InstrumentKey> | null>(null); // Save state before Fill mode
  const [activeTab, setActiveTab] = useState<'drums' | 'bass' | 'piano' | 'guitar'>('drums');
  // Tracks which variation is currently viewed in the editor per instrument (for live preview)
  const activeVarIdRef = useRef<Partial<Record<'bass' | 'piano' | 'guitar', string>>>({});

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState<StylePattern | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [velocityPopover, setVelocityPopover] = useState<{
    instrument: InstrumentKey;
    step: number;
    isFill: boolean;
  } | null>(null);
  
  // Track the original style state to compare for changes
  const originalStyleRef = useRef<string>('');
  
  const { stopPreview, previewingStyleId } = useStylePreview();
  
  const playbackRef = useRef<{ cancel: () => void } | null>(null);
  const editedStyleRef = useRef<StylePattern>(editedStyle);
  const showFillRef = useRef(showFill);
  const initializedStyleIdRef = useRef<string>('');
  const stepAnimationRef = useRef<number | null>(null);
  const loopStartTimeRef = useRef<number>(0);
  
  const isSyncedWithMain = isMainPlaying && !isLocalPlaying;
  const isPlaying = isLocalPlaying || isMainPlaying;
  
  // Keep playhead visible: use main if synced, local if local playing, or -1 if nothing
  const displayStep = isLocalPlaying 
    ? currentStep 
    : (isSyncedWithMain && mainPlayheadStep !== undefined ? mainPlayheadStep : currentStep);
  
  // Check if editing a built-in style
  const isEditingBuiltIn = !isCustomStyle(style.id) && !isNewStyle;
  const hasOverride = isEditingBuiltIn && hasStyleOverride(style.id);
  
  useEffect(() => {
    editedStyleRef.current = editedStyle;
    // Check if there are unsaved changes by comparing with original
    if (originalStyleRef.current) {
      const currentJson = JSON.stringify(editedStyle);
      setHasUnsavedChanges(currentJson !== originalStyleRef.current);
    }
    // Only propagate after the editor has been initialized (initializedStyleIdRef is set
    // by the init effect, which only runs when open=true). This prevents emitting
    // on page load (when closed) and prevents the cascade caused by adding `open` to deps.
    if (initializedStyleIdRef.current) {
      onStyleChange?.(editedStyle);
    }
  }, [editedStyle, onStyleChange]);

  useEffect(() => {
    showFillRef.current = showFill;
  }, [showFill]);

  // Initialize from style prop
  useEffect(() => {
    if (!open) {
      initializedStyleIdRef.current = '';
      return;
    }

    // Re-initialize whenever the active style ID changes (e.g. user switches style in the list)
    if (initializedStyleIdRef.current === style.id && !isNewStyle) return;
    initializedStyleIdRef.current = style.id;
    
    // For built-in styles, check if there's an override
    let styleToLoad = style;
    if (!isCustomStyle(style.id) && !isNewStyle) {
      const override = getStyleOverride(style.id);
      if (override) {
        styleToLoad = override;
      }
    }
    
    const cloned = cloneStyle(styleToLoad);
    setEditedStyle(cloned);
    setOriginalStyleName(style.name); // Keep original name for dropdown
    editedStyleRef.current = cloned;
    originalStyleRef.current = JSON.stringify(cloned); // Store original for change detection
    setHasUnsavedChanges(false);
    
    const active = new Set<InstrumentKey>();
    Object.entries(cloned.rhythm).forEach(([key, pattern]) => {
      if (pattern && pattern.some((v: number) => v > 0)) {
        active.add(key as InstrumentKey);
      }
    });
    active.add('kick');
    active.add('snare');
    active.add('hihat');
    active.add('bass');
    active.add('piano');
    active.add('guitar');
    setActiveInstruments(active);
    
    setShowFill(false);
    setCurrentStep(-1);
  }, [style, open, isNewStyle]);


  useEffect(() => {
    if (!open) {
      // Only stop local playback resources, don't call stopPlayback() if main is playing
      if (playbackRef.current) {
        playbackRef.current.cancel();
        playbackRef.current = null;
      }
      if (stepAnimationRef.current) {
        cancelAnimationFrame(stepAnimationRef.current);
        stepAnimationRef.current = null;
      }
      // Only stop global audio if we were doing local playback, not if main was playing
      if (isLocalPlaying) {
        stopPlayback();
      }
      setIsLocalPlaying(false);
      setCurrentStep(-1);
      stopPreview();
    }
  }, [open, stopPreview, isLocalPlaying]);

  // Stable identity (no deps) and no isLocalPlaying self-check: this loop is
  // started/stopped purely imperatively (see startLocalPlayback/stopLocalPlayback)
  // by cancelling stepAnimationRef.current — not by a reactive effect, which is
  // vulnerable to React batching coalescing a false→true isLocalPlaying round-trip
  // (e.g. on Fill-toggle restart) into a no-op that never reschedules the frame.
  const updatePlayhead = useCallback(() => {
    const ctx = getAudioContext();
    const bpm = editedStyleRef.current.bpm;
    const barSlots = getSlotsPerBar(editedStyleRef.current);
    const loopBarCount = editedStyleRef.current.loopBars ?? 1;
    const slotDuration = (60 / bpm / 4); // Duration of 1 sixteenth note
    // The actual audio loop (and onLoopEnd reset) spans the *full* loopBars
    // cycle, not just one bar — match that here so the wrap doesn't happen
    // early mid-way through bar 2 of a multi-bar style.
    const loopDuration = slotDuration * barSlots * loopBarCount;

    // Calculate precise position within the loop
    const elapsed = ctx.currentTime - loopStartTimeRef.current;
    const loopPosition = elapsed % loopDuration;

    // Absolute step across the *whole* loop (0..barSlots*loopBarCount-1), not
    // bar-relative — otherwise bar 1 and bar 2's matching cell would highlight
    // at the same time since they'd both read as e.g. "step 2".
    const step = Math.floor(loopPosition / slotDuration) % (barSlots * loopBarCount);
    
    // Only update if step changed to reduce re-renders
    setCurrentStep(prev => prev !== step ? step : prev);
    
    stepAnimationRef.current = requestAnimationFrame(updatePlayhead);
  }, []);

  // Only handles unmount — start/stop happen imperatively in startLocalPlayback/stopLocalPlayback.
  useEffect(() => {
    return () => {
      if (stepAnimationRef.current) {
        cancelAnimationFrame(stepAnimationRef.current);
      }
    };
  }, []);

  const stopLocalPlayback = useCallback(() => {
    const hadLocalPlayback = isLocalPlaying || !!playbackRef.current;

    if (playbackRef.current) {
      playbackRef.current.cancel();
      playbackRef.current = null;
    }
    if (stepAnimationRef.current) {
      cancelAnimationFrame(stepAnimationRef.current);
      stepAnimationRef.current = null;
    }

    // IMPORTANT: Only stop the global audio engine if we were actually running LOCAL playback.
    // Otherwise (e.g. main playback is running), calling stopPlayback() would silence the whole app.
    if (hadLocalPlayback) {
      stopPlayback();
      setIsLocalPlaying(false);
      setCurrentStep(-1);
    }
  }, [isLocalPlaying]);

  // Resolves a specific variation by ID for local preview, bypassing the enabled flag
  const resolveActiveVar = (inst: InstrumentMelodic | undefined, varId: string | undefined) => {
    if (!inst || !inst.variations.length) return null;
    const v = varId
      ? (inst.variations.find(x => x.id === varId) ?? inst.variations[0])
      : inst.variations[0];
    const hasContent = !scalePatternIsEmpty(v?.pattern ?? {}) || (v?.chordHit ?? []).some(x => x > 0);
    if (!v || !hasContent) return null;
    return { pattern: v.pattern, chordHit: v.chordHit, loopBars: v.loopBars, octaveOffsets: v.octaveOffsets };
  };

  const startLocalPlayback = useCallback(async () => {
    // Stop main playback if it's running
    if (isMainPlaying) {
      stopMainPlayback();
    }
    
    stopLocalPlayback();
    
    // Ensure samples are loaded before starting playback
    await ensureSamplesLoaded();
    
    // Initialize loop start time for accurate playhead sync
    const ctx = getAudioContext();
    loopStartTimeRef.current = ctx.currentTime;
    
    setIsLocalPlaying(true);
    setCurrentStep(0); // Start at step 0

    // Imperative (re)start — see the note on updatePlayhead for why this can't
    // be left to a reactive effect watching isLocalPlaying.
    if (stepAnimationRef.current) cancelAnimationFrame(stepAnimationRef.current);
    stepAnimationRef.current = requestAnimationFrame(updatePlayhead);


    // Match the chord's duration to exactly one full loop of the style's actual
    // meter AND loopBars (3 beats for one 6/8 bar, 6 for a 2-bar 6/8 loop, not
    // always 4) — otherwise the loop point drifts out of sync with the
    // pattern's own cycle length, e.g. showing 12 real slots of a 6/8 bar plus
    // 4 extra (the start of a second bar) before restarting.
    const beatsPerLoop = (getSlotsPerBar(editedStyleRef.current) / 4) * (editedStyleRef.current.loopBars ?? 1);
    const testSection = {
      id: 'test',
      name: 'Test',
      chords: [{ id: '1', root: 'C' as const, accidental: '' as const, quality: 'maj' as const, duration: beatsPerLoop }],
      repeatCount: 1
    };
    
    // Apply the edited style's own instrument sound types (e.g. 'electric' guitar) — without
    // this, every instrument falls back to its generic default sound (guitar defaults to a
    // soundfont patch that loads over the network and can miss playback entirely).
    const instruments = getEffectiveInstruments(getDefaultInstrumentStates(), editedStyleRef.current);

    const { cancel } = scheduleProgression([testSection], editedStyleRef.current.bpm, {
      loop: true,
      metronome: false,
      instruments,
      style: editedStyleRef.current,
      transposition: 0,
      onChordChange: () => {},
      onLoopEnd: () => {
        loopStartTimeRef.current = ctx.currentTime;
      },
      getStyle: () => editedStyleRef.current,
      getBpm: () => editedStyleRef.current.bpm,
      // Re-derive instrument sound types from the live style every bar — without this,
      // picking a new sound in a tab has no audible effect until Stop/Play recomputes it.
      getInstruments: () => getEffectiveInstruments(getDefaultInstrumentStates(), editedStyleRef.current),
      forceFill: showFillRef.current,
      getBassScale: () => resolveActiveVar(editedStyleRef.current.melodic?.bass, activeVarIdRef.current['bass']),
      getPianoScale: () => resolveActiveVar(editedStyleRef.current.melodic?.piano, activeVarIdRef.current['piano']),
      getGuitarScale: () => resolveActiveVar(editedStyleRef.current.melodic?.guitar, activeVarIdRef.current['guitar']),
    });
    
    playbackRef.current = { cancel };
  }, [stopLocalPlayback, isMainPlaying, stopMainPlayback, updatePlayhead]);

  useEffect(() => {
    if (isLocalPlaying) {
      startLocalPlayback();
    }
  }, [showFill]);

  const togglePlayback = useCallback(() => {
    // If local is playing, stop it
    if (isLocalPlaying) {
      stopLocalPlayback();
      return;
    }
    
    // If main is playing (synced mode), stop main playback
    if (isMainPlaying) {
      stopMainPlayback();
      return;
    }
    
    // Nothing is playing, start local playback
    startLocalPlayback();
  }, [isLocalPlaying, isMainPlaying, startLocalPlayback, stopLocalPlayback, stopMainPlayback]);

  const handleCellClick = (instrument: InstrumentKey, step: number, isFill: boolean) => {
    // Open velocity popover for this cell
    setVelocityPopover({ instrument, step, isFill });
  };

  const handleVelocityChange = (value: number) => {
    if (!velocityPopover) return;
    const { instrument, step, isFill } = velocityPopover;
    
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);

      if (isFill) {
        if (!newStyle.fill.pattern[instrument]) {
          newStyle.fill.pattern[instrument] = createEmptyPattern(getStyleTotalSlots(newStyle));
        }
        newStyle.fill.pattern[instrument]![step] = value;
      } else {
        if (!newStyle.rhythm[instrument]) {
          newStyle.rhythm[instrument] = createEmptyPattern(getStyleTotalSlots(newStyle));
        }
        newStyle.rhythm[instrument]![step] = value;
      }

      return newStyle;
    });
  };

  const handleCellRightClick = (e: React.MouseEvent, instrument: InstrumentKey, step: number, isFill: boolean) => {
    e.preventDefault();
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);
      
      if (isFill) {
        if (newStyle.fill.pattern[instrument]) {
          newStyle.fill.pattern[instrument]![step] = 0;
        }
      } else {
        if (newStyle.rhythm[instrument]) {
          newStyle.rhythm[instrument]![step] = 0;
        }
      }
      
      return newStyle;
    });
  };

  const addInstrument = (key: InstrumentKey) => {
    setActiveInstruments(prev => new Set([...prev, key]));
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);
      if (!newStyle.rhythm[key]) {
        newStyle.rhythm[key] = createEmptyPattern(getStyleTotalSlots(newStyle));
      }
      return newStyle;
    });
  };

  const removeInstrument = (key: InstrumentKey) => {
    if (['kick', 'snare', 'hihat', 'bass', 'piano', 'guitar'].includes(key)) {
      toast.error('Cannot remove core instruments');
      return;
    }

    setActiveInstruments(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  // Changes how many bars the drum grid (kick/snare/hi-hat/etc.) cycles over
  // before repeating. Growing the loop repeats the existing bar(s) into the
  // new slots (so bar 2 starts as a copy of bar 1, ready to tweak) instead of
  // silence; shrinking just truncates.
  const handleLoopBarsChange = (bars: 1 | 2) => {
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);
      const slots = getSlotsPerBar(newStyle);
      const newTotal = slots * bars;
      const resize = (arr?: number[]): number[] | undefined => {
        if (!arr || arr.length === 0) return arr;
        if (arr.length >= newTotal) return arr.slice(0, newTotal);
        const out = [...arr];
        while (out.length < newTotal) out.push(arr[out.length % arr.length]);
        return out;
      };
      newStyle.loopBars = bars;
      (Object.keys(newStyle.rhythm) as (keyof typeof newStyle.rhythm)[]).forEach(key => {
        newStyle.rhythm[key] = resize(newStyle.rhythm[key]);
      });
      // Fill patterns follow the same loopBars shape as the main rhythm now
      // (see generateBarPattern's sliceBar), so resize them the same way.
      (Object.keys(newStyle.fill.pattern) as (keyof typeof newStyle.fill.pattern)[]).forEach(key => {
        newStyle.fill.pattern[key] = resize(newStyle.fill.pattern[key]);
      });
      return newStyle;
    });
  };

  const clearPattern = (instrument: InstrumentKey, isFill: boolean) => {
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);
      if (isFill && newStyle.fill.pattern[instrument]) {
        newStyle.fill.pattern[instrument] = createEmptyPattern(getStyleTotalSlots(newStyle));
      } else if (!isFill && newStyle.rhythm[instrument]) {
        newStyle.rhythm[instrument] = createEmptyPattern(getStyleTotalSlots(newStyle));
      }
      return newStyle;
    });
  };

  const copyMainToFill = () => {
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);
      Object.keys(newStyle.rhythm).forEach(key => {
        const k = key as InstrumentKey;
        if (newStyle.rhythm[k]) {
          newStyle.fill.pattern[k] = [...newStyle.rhythm[k]!];
        }
      });
      return newStyle;
    });
    toast.success('Pattern copied to fill');
  };

  // Handle save - always show dialog for built-in styles
  const handleSaveClick = () => {
    if (isEditingBuiltIn) {
      // Always show options for built-in styles
      setSaveDialogOpen(true);
    } else {
      // Custom style - save directly
      handleSave('direct');
    }
  };

  const handleSave = (mode: 'override' | 'new' | 'direct') => {
    let styleToSave = editedStyle;
    
    if (mode === 'override') {
      // Save as override (keeps original ID reference)
      saveStyleOverride(style.id, editedStyle);
      toast.success(`Saved changes to "${editedStyle.name}"`);
      onSave?.(editedStyle);
    } else if (mode === 'new') {
      // Save as new custom style
      styleToSave = {
        ...editedStyle,
        id: generateCustomStyleId(),
        name: editedStyle.name === style.name ? `${editedStyle.name} (Custom)` : editedStyle.name,
      };
      saveCustomStyle(styleToSave);
      toast.success(`Created new rhythm "${styleToSave.name}"`);
      onSave?.(styleToSave);
    } else {
      // Direct save (for custom styles or existing overrides)
      if (isCustomStyle(editedStyle.id)) {
        saveCustomStyle(editedStyle);
        toast.success(`Saved "${editedStyle.name}"`);
      } else if (hasOverride) {
        saveStyleOverride(style.id, editedStyle);
        toast.success(`Saved changes to "${editedStyle.name}"`);
      } else {
        // New style
        saveCustomStyle(editedStyle);
        toast.success(`Saved "${editedStyle.name}"`);
      }
      onSave?.(editedStyle);
    }
    
    setSaveDialogOpen(false);
    setHasUnsavedChanges(false); // Mark as saved so close doesn't show confirmation
    originalStyleRef.current = JSON.stringify(styleToSave); // Update original reference
    onClose();
  };

  // Reset to last saved state (not original built-in)
  const handleResetToSaved = () => {
    if (!originalStyleRef.current) return;
    
    const savedState = JSON.parse(originalStyleRef.current) as StylePattern;
    setEditedStyle(savedState);
    editedStyleRef.current = savedState;
    setHasUnsavedChanges(false);
    setResetDialogOpen(false);
    toast.success('Changes discarded');
  };

  const handleBpmChange = (newBpm: number) => {
    const clampedBpm = Math.max(40, Math.min(200, newBpm));
    setEditedStyle(prev => {
      const updated = { ...prev, bpm: clampedBpm };
      editedStyleRef.current = updated;
      return updated;
    });
    // No restart — editedStyleRef is updated immediately and the scheduler
    // reads getBpm() dynamically at each chord segment boundary.
  };

  const handleFillToggle = (checked: boolean) => {
    if (checked) {
      // Entering Fill mode: save current instruments and switch to all drums only
      setSavedNonFillInstruments(new Set(activeInstruments));
      setActiveInstruments(new Set(DRUM_INSTRUMENT_KEYS));
    } else {
      // Exiting Fill mode: restore previous instruments
      if (savedNonFillInstruments) {
        setActiveInstruments(savedNonFillInstruments);
        setSavedNonFillInstruments(null);
      }
    }
    setShowFill(checked);
  };

  const getVelocityColor = (value: number): string => {
    const idx = VELOCITY_LEVELS.findIndex(v => Math.abs(v - value) < 0.1);
    return VELOCITY_COLORS[idx === -1 ? 0 : idx];
  };

  const availableInstruments = ALL_INSTRUMENTS.filter(i => !activeInstruments.has(i.key));
  const sortedActiveInstruments = ALL_INSTRUMENTS.filter(i => activeInstruments.has(i.key));
  // Slots per bar for the style being edited (16 for 4/4, 12 for 6/8, etc.)
  const slotsPerBar = getSlotsPerBar(editedStyle);
  // How many bars the rhythm grid cycles over before repeating (1 by default —
  // set this >1 to let bar 2 differ from bar 1, e.g. a snare variation).
  const loopBars = editedStyle.loopBars ?? 1;
  // Total editable slots in the drum grid: one bar's worth times loopBars.
  const totalSlots = getStyleTotalSlots(editedStyle);
  // Pulse markers in the grid follow the meter's raw pulse — one eighth note
  // in 6/8 (2 slots), one quarter note in 4/4 (4 slots) — so cells are numbered
  // 1..6 continuously in 6/8 instead of the old fixed "4 quarter-note groups".
  const slotsPerBeatGroup = getPulseInterval(editedStyle);

  const handleDeleteStyle = (styleToDelete: StylePattern) => {
    setStyleToDelete(styleToDelete);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (styleToDelete) {
      deleteCustomStyle(styleToDelete.id);
      onDelete?.(styleToDelete.id);
      toast.success(`Rhythm "${styleToDelete.name}" deleted`);
      if (editedStyle.id === styleToDelete.id) {
        const firstStyle = allStyles.find(s => s.id !== styleToDelete.id) || MUSICAL_STYLES[0];
        onStyleSelect?.(firstStyle.id);
      }
    }
    setDeleteDialogOpen(false);
    setStyleToDelete(null);
  };


  // Handle close attempt - show confirmation if there are unsaved changes
  const handleCloseAttempt = useCallback(() => {
    if (hasUnsavedChanges) {
      setDiscardDialogOpen(true);
    } else {
      if (isLocalPlaying) stopLocalPlayback();
      stopPreview();
      onClose();
    }
  }, [hasUnsavedChanges, isLocalPlaying, stopLocalPlayback, stopPreview, onClose]);

  // Confirm discard changes
  const handleDiscardChanges = useCallback(() => {
    setDiscardDialogOpen(false);
    if (isLocalPlaying) stopLocalPlayback();
    stopPreview();
    setHasUnsavedChanges(false);
    onClose();
  }, [isLocalPlaying, stopLocalPlayback, stopPreview, onClose]);

  // Migration as computed view: shows rhythm.bass/piano/guitar as degree-1/chordHit rows
  // without modifying editedStyle — so liveEditedStyle stays clean until the user makes a real edit
  const migratedMelodic = useMemo(
    () => migrateRhythmToMelodic(editedStyle).melodic ?? emptyMelodicData(),
    [editedStyle]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) handleCloseAttempt(); }}>
        <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b border-border">
            <DialogTitle className="flex items-center gap-3">
              <Drum className="w-5 h-5" />
              
              {/* Rhythm name — fixed for the lifetime of this modal session. Rename via
                  the "Name" field in the toolbar below; to edit a different rhythm,
                  close this modal (unsaved changes are still guarded) and reopen it. */}
              <span className="gap-1 min-w-[200px] truncate flex items-center font-semibold">
                {hasOverride && <span className="text-primary">★</span>}
                {originalStyleName}
              </span>

              {(isPlaying || isMainPlaying) && (
                <span className="text-xs font-normal text-primary animate-pulse">
                  ● {showFill ? 'FILL PREVIEW' : isSyncedWithMain ? 'SYNCED' : 'LIVE'}
                </span>
              )}
              
              {previewingStyleId && (
                <span className="text-xs font-normal text-chart-4 animate-pulse">
                  🔊 Previewing...
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col h-full">
            {/* Top Controls */}
            <div className="p-2 sm:p-4 border-b border-border bg-card/50 flex flex-wrap items-center gap-2 sm:gap-4">
              {/* Style Name (editable) */}
              <div className="flex items-center gap-2">
                <Label className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">Name:</Label>
                <Input
                  value={editedStyle.name}
                  onChange={e => setEditedStyle(prev => ({ ...prev, name: e.target.value }))}
                  className="w-28 sm:w-40 h-8 text-sm"
                  placeholder="Name"
                />
              </div>
              
              {/* BPM Slider */}
              <div className="flex items-center gap-2 min-w-[140px] sm:min-w-[180px]">
                <Label className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                  <span className="hidden sm:inline">BPM: </span>{editedStyle.bpm}
                </Label>
                <input
                  type="range"
                  min={40}
                  max={200}
                  value={editedStyle.bpm}
                  onChange={e => handleBpmChange(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              
              {/* Category - hidden on mobile */}
              <div className="hidden sm:flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Category:</Label>
                <Select 
                  value={editedStyle.category} 
                  onValueChange={(value: StylePattern['category']) => setEditedStyle(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger className="w-28 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Rock', 'Funk', 'Pop', 'Reggae', 'HipHop', 'Disco', 'Blues', 'Latin', 'Metal', 'Folk', 'Country', 'Jazz', 'Soul', 'Indie', 'LoFi', 'Gospel'].map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Playback & Save Controls */}
              <div className="flex items-center gap-1 sm:gap-2 ml-auto">
                {/* Reset to default (only for built-in styles with a saved override) */}
                {hasOverride && !hasUnsavedChanges && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      deleteStyleOverride(style.id);
                      const original = MUSICAL_STYLES.find(s => s.id === style.id);
                      if (original) {
                        const cloned = cloneStyle(original);
                        setEditedStyle(cloned);
                        editedStyleRef.current = cloned;
                        originalStyleRef.current = JSON.stringify(cloned);
                        setHasUnsavedChanges(false);
                        onStyleChange?.(cloned);
                      }
                      toast.success('Reset to default');
                    }}
                    className="gap-1 px-2 sm:px-3"
                    title="Remove customizations and restore the original built-in style"
                  >
                    <RotateCw className="w-4 h-4" />
                    <span className="hidden sm:inline">Reset</span>
                  </Button>
                )}

                {/* Discard Changes button (only when there are unsaved changes) */}
                {hasUnsavedChanges && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResetDialogOpen(true)}
                    className="gap-1 px-2 sm:px-3"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="hidden sm:inline">Discard</span>
                  </Button>
                )}
                
                <Button
                  variant={(isLocalPlaying || isMainPlaying) ? 'destructive' : 'default'}
                  size="sm"
                  onClick={togglePlayback}
                  className="px-2 sm:px-3"
                >
                  {(isLocalPlaying || isMainPlaying) ? <Square className="w-4 h-4 sm:mr-1" /> : <Play className="w-4 h-4 sm:mr-1" />}
                  <span className="hidden sm:inline">{(isLocalPlaying || isMainPlaying) ? 'Stop' : (showFill ? 'Preview Fill' : 'Play')}</span>
                </Button>
                
                {/* Delete button - only for custom styles */}
                {isCustomStyle(editedStyle.id) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteStyle(editedStyle)}
                    className="px-2 sm:px-3"
                  >
                    <Trash2 className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                )}
                
                <Button variant="outline" size="sm" onClick={handleSaveClick} className="px-2 sm:px-3">
                  <Save className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Save</span>
                </Button>
              </div>
            </div>

          {/* Tab Navigation */}
          <div className="px-4 border-b border-border flex gap-0">
            {([
              { key: 'drums', label: 'Drums', Icon: Drum },
              { key: 'piano', label: 'Piano', Icon: Piano },
              { key: 'guitar', label: 'Guitar', Icon: Guitar },
              { key: 'bass', label: 'Bass', Icon: Music },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <tab.Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {activeTab === 'drums' ? (
          <>
          {/* Main/Fill Toggle */}
          <div className="p-2 sm:p-3 border-b border-border bg-muted/30 flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={showFill}
                onCheckedChange={handleFillToggle}
                id="fill-toggle"
              />
              <Label htmlFor="fill-toggle" className="text-xs sm:text-sm cursor-pointer">
                {showFill ? 'Fill' : 'Main'}
              </Label>
            </div>

            {/* Loop bars — lets bar 2 (and beyond) differ from bar 1 instead of
                just repeating a single bar forever. Growing copies bar 1 into
                the new bars so there's something to start editing from. */}
            <div className="flex items-center gap-2">
              <Label className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">Loop:</Label>
              <Select
                value={loopBars.toString()}
                onValueChange={v => handleLoopBarsChange(Number(v) as 1 | 2)}
              >
                <SelectTrigger className="w-24 sm:w-28 h-8 text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 bar</SelectItem>
                  <SelectItem value="2">2 bars</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {showFill && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">Fill Position:</Label>
                  <Select 
                    value={editedStyle.fill.position.toString()} 
                    onValueChange={v => setEditedStyle(prev => ({ ...prev, fill: { ...prev.fill, position: parseInt(v) } }))}
                  >
                    <SelectTrigger className="w-20 sm:w-24 h-8 text-xs sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Beat 1</SelectItem>
                      <SelectItem value="4">Beat 2</SelectItem>
                      <SelectItem value="8">Beat 3</SelectItem>
                      <SelectItem value="12">Beat 4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button variant="ghost" size="sm" onClick={copyMainToFill} className="px-2 sm:px-3">
                  <Copy className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Copy Main</span>
                </Button>
              </>
            )}
            
            {/* Drums' own volume + kit selector — scoped to this tab only */}
            <div className="ml-auto">
              <InstrumentMixControl instType="drums" editedStyle={editedStyle} onChange={setEditedStyle} />
            </div>
          </div>

          {/* Grid Area */}
          <div className="flex-1 max-h-[50vh] sm:max-h-[400px] overflow-auto">
            <div className="p-2 sm:p-4 min-w-[340px]">
              {/* Grid Rows — a single flat row of slotsPerBar steps per instrument.
                  Pulse numbers (1, 2, 3…) are printed inside the empty cell at each
                  pulse start instead of a separate header row above the grid. */}
              <div className="space-y-0.5 sm:space-y-1">
                {sortedActiveInstruments.filter(i => i.category === 'drums').map(instrument => {
                  const basePattern = editedStyle.rhythm[instrument.key] || createEmptyPattern(totalSlots);
                  const fillPattern = editedStyle.fill.pattern[instrument.key];
                  const Icon = instrument.icon;

                  return (
                    <div key={instrument.key} className="flex items-center gap-0.5 sm:gap-2">
                      <div className="w-12 sm:w-24 flex items-center gap-0.5 shrink-0 overflow-hidden">
                        <Icon className="w-3 h-3 text-muted-foreground hidden sm:block shrink-0" />
                        <span className="text-[8px] sm:text-xs font-medium truncate">{instrument.label}</span>
                      </div>

                      <div className="flex-1 flex gap-px sm:gap-0.5 px-px sm:px-0.5">
                        {Array.from({ length: totalSlots }, (_, i) => i).map(step => {
                              // slotInBar restarts every bar (0..slotsPerBar-1) — used for
                              // pulse numbering, the fill zone, and reading/writing the
                              // (still single-bar) fill pattern. `step` (raw, spans all
                              // loopBars) indexes the main rhythm array, which is
                              // loopBars*slotsPerBar long when editing >1 bar.
                              const slotInBar = step % slotsPerBar;
                              const isBarStart = slotInBar === 0 && step > 0;
                              const isDownbeat = slotInBar % slotsPerBeatGroup === 0;
                              const pulseNumber = slotInBar / slotsPerBeatGroup + 1;
                              // Local preview tracks the absolute step across the whole loop
                              // (see updatePlayhead), so this correctly highlights only the
                              // one cell actually playing even with loopBars>1. When synced
                              // with the main song transport instead, mainPlayheadStep is
                              // bar-relative (audioEngine's patternSlot resets every bar), so
                              // it only ever matches bar 1's cells — a known, minor gap for
                              // that mode, not a wrong/duplicate highlight.
                              const isCurrentStep = displayStep === step && (isLocalPlaying || isMainPlaying);

                              // fill.position is bar-relative (where in *each* bar the fill
                              // zone starts), but the fill pattern data itself is now the
                              // same loopBars-long shape as the main rhythm — so once we're
                              // in the zone, index it with the absolute `step` too.
                              const isInFillZone = slotInBar >= editedStyle.fill.position;
                              const value = showFill
                                ? (isInFillZone ? (fillPattern?.[step] ?? 0) : basePattern[step])
                                : basePattern[step];

                              // In Fill mode: lock steps before the fill start (they come from the Main pattern)
                              const isLockedInFill = showFill && !isInFillZone;
                              const isActiveInFill = showFill && isInFillZone;
                              const isInactiveInFill = showFill && !isInFillZone;
                              
                              const isPopoverOpen = velocityPopover?.instrument === instrument.key &&
                                                  velocityPopover?.step === step &&
                                                  velocityPopover?.isFill === showFill;

                              return (
                                <Popover
                                  key={step}
                                  open={isPopoverOpen}
                                  onOpenChange={(open) => {
                                    if (!open) setVelocityPopover(null);
                                  }}
                                >
                                  <PopoverTrigger asChild>
                                    <button
                                      disabled={isLockedInFill}
                                      onClick={() => handleCellClick(instrument.key, step, showFill)}
                                      onContextMenu={e => handleCellRightClick(e, instrument.key, step, showFill)}
                                      className={cn(
                                        "flex-1 aspect-square rounded-[2px] sm:rounded-sm border transition-all relative flex items-center justify-center min-w-[14px] sm:min-w-[24px] max-w-[32px]",
                                        isBarStart && "ml-1.5 sm:ml-2.5",
                                        isDownbeat ? "border-border" : "border-border/40",
                                        // Fill mode: locked zone gets muted background
                                        isInactiveInFill && "opacity-40 cursor-not-allowed bg-muted/50",
                                        // Fill mode: active zone gets highlighted background
                                        isActiveInFill && value === 0 && "bg-chart-4/10",
                                        isActiveInFill && "border-chart-4/60",
                                        // Normal velocity colors (override fill bg when has value)
                                        getVelocityColor(value),
                                        value > 0 ? "border-chart-4/50" : "",
                                        // Popover open indicator
                                        isPopoverOpen && "ring-2 ring-primary",
                                        // Playhead indicator - ALWAYS on top with higher priority
                                        isCurrentStep && "ring-2 ring-primary ring-offset-1 ring-offset-background z-10"
                                      )}
                                    >
                                      {value > 0 ? (
                                        <span className="text-[7px] sm:text-[9px] font-medium text-foreground/80">
                                          {Math.round(value * 100)}
                                        </span>
                                      ) : isDownbeat && (
                                        <span className="text-[9px] sm:text-xs font-medium text-muted-foreground/50">
                                          {pulseNumber}
                                        </span>
                                      )}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent 
                                    className="w-52 p-3" 
                                    side="top"
                                    onInteractOutside={() => setVelocityPopover(null)}
                                  >
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <Label className="text-xs font-medium">Velocity</Label>
                                        <span className="text-xs text-muted-foreground font-mono">
                                          {Math.round(value * 100)}%
                                        </span>
                                      </div>
                                      <Slider
                                        value={[value * 100]}
                                        onValueChange={([v]) => handleVelocityChange(v / 100)}
                                        min={0}
                                        max={100}
                                        step={5}
                                        className="w-full"
                                      />
                                      <div className="flex gap-1">
                                        {[0, 30, 50, 70, 100].map(preset => (
                                          <Button
                                            key={preset}
                                            variant={Math.round(value * 100) === preset ? "default" : "outline"}
                                            size="sm"
                                            className="flex-1 h-6 text-[10px] px-1"
                                            onClick={() => handleVelocityChange(preset / 100)}
                                          >
                                            {preset}
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              );
                            })}
                      </div>

                      <div className="flex items-center shrink-0 w-6 sm:w-16">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 sm:h-6 sm:w-6"
                          onClick={() => clearPattern(instrument.key, showFill)}
                          title="Clear pattern"
                        >
                          <RotateCcw className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        </Button>
                        {!['kick', 'snare', 'hihat', 'bass', 'piano'].includes(instrument.key) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 sm:h-6 sm:w-6 text-destructive hover:text-destructive hidden sm:flex"
                            onClick={() => removeInstrument(instrument.key)}
                            title="Remove instrument"
                          >
                            <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Add Instrument */}
              {availableInstruments.length > 0 && (
                <div className="mt-2 sm:mt-4 pt-2 sm:pt-4 border-t border-border">
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    <span className="text-[10px] sm:text-xs text-muted-foreground">Add:</span>
                    {availableInstruments.map(instrument => (
                      <Button
                        key={instrument.key}
                        variant="outline"
                        size="sm"
                        onClick={() => addInstrument(instrument.key)}
                        className="h-5 sm:h-7 text-[9px] sm:text-xs px-1 sm:px-2"
                      >
                        <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 sm:mr-1" />
                        <span className="hidden sm:inline">{instrument.label}</span>
                        <span className="sm:hidden">{instrument.label.length > 5 ? instrument.label.slice(0, 3) : instrument.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Footer / Legend */}
          <div className="p-2 sm:p-3 border-t border-border bg-muted/30 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Click: velocity</span>
              <Separator orientation="vertical" className="h-4 hidden sm:block" />
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-[10px] sm:text-xs text-muted-foreground">Vel:</span>
                {VELOCITY_LEVELS.slice(1).map((v, i) => (
                  <div key={i} className="flex items-center gap-0.5 sm:gap-1">
                    <div className={cn("w-3 h-3 sm:w-4 sm:h-4 rounded", VELOCITY_COLORS[i + 1])} />
                    <span className="text-[8px] sm:text-[10px] text-muted-foreground">{Math.round(v * 100)}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
          </>
          ) : (
          <div className="flex-1 overflow-auto">
            {/* This instrument's own volume + sound selector — scoped to this tab only */}
            <div className="p-2 sm:p-3 border-b border-border bg-muted/30">
              <InstrumentMixControl
                instType={activeTab as InstrumentType}
                editedStyle={editedStyle}
                onChange={setEditedStyle}
              />
            </div>
            <div className="p-4">
            <MelodicPatternGrid
              melodic={migratedMelodic[activeTab as 'bass' | 'piano' | 'guitar']}
              referenceRootMidi={referenceRootMidi}
              referenceQuality={referenceQuality}
              slotsPerBar={slotsPerBar}
              slotsPerBeatGroup={slotsPerBeatGroup}
              naturalOctave={activeTab === 'bass' ? -1 : 0}
              currentStep={displayStep}
              isPlaying={isPlaying}
              onActiveVarChange={id => {
                activeVarIdRef.current[activeTab as 'bass' | 'piano' | 'guitar'] = id;
                if (!isLocalPlaying && !isMainPlaying) startLocalPlayback();
              }}
              onChange={updated => {
                // A real edit is unambiguous intent to have this variation play — mark it
                // enabled here (not on mere tab navigation) so saving actually applies it.
                setEditedStyle(prev => ({ ...prev, melodic: { ...(prev.melodic ?? emptyMelodicData()), [activeTab]: { ...updated, enabled: true } } }));
              }}
            />
            </div>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Delete Confirmation Dialog */}
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Rhythm</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{styleToDelete?.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    {/* Save Options Dialog (for built-in styles) */}
    <AlertDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You're editing a built-in rhythm. How would you like to save your changes?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button 
            variant="outline"
            onClick={() => handleSave('new')}
          >
            <Plus className="w-4 h-4 mr-1" />
            Save as New
          </Button>
          <AlertDialogAction onClick={() => handleSave('override')}>
            <Save className="w-4 h-4 mr-1" />
            Save Override
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    {/* Reset/Discard Changes Confirmation Dialog */}
    <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
          <AlertDialogDescription>
            This will revert all unsaved changes. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Editing</AlertDialogCancel>
          <AlertDialogAction onClick={handleResetToSaved} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    {/* Discard Changes Confirmation Dialog (for closing) */}
    <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to close and discard them?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Editing</AlertDialogCancel>
          <AlertDialogAction onClick={handleDiscardChanges} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
