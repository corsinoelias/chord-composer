import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties, type ReactNode } from 'react';
import { analytics } from '@/lib/analytics';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
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
import { getAudioContext, ensureSamplesLoaded, scheduleProgression, stopPlayback, previewDrumHit } from '@/lib/audioEngine';
import { getDefaultInstrumentStates, INSTRUMENTS, type InstrumentType } from '@/lib/instruments';
import { getEffectiveInstruments } from '@/hooks/useStyleInstruments';
import { saveCustomStyle, deleteCustomStyle, isCustomStyle, generateCustomStyleId, saveStyleOverride, deleteStyleOverride, hasStyleOverride, getStyleOverride } from '@/lib/customStyles';
import { useStylePreview } from '@/hooks/useStylePreview';
import { usePlayback, useCurrentStep } from '@/contexts/PlaybackContext';
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
import { useIsMobile } from '@/hooks/use-mobile';

// Custom line-art glyphs per drum part — lucide only ships a generic `Drum`, so these
// let the player tell a kick from a hi-hat from a crash at a glance. Rendered like a
// lucide icon (24 viewBox, currentColor stroke; size/color come from className/style).
type PartIconProps = { className?: string; style?: CSSProperties };
const makePartIcon = (children: ReactNode) =>
  function PartIcon({ className, style }: PartIconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };

const KickIcon = makePartIcon(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.3" /></>);
const SnareIcon = makePartIcon(<><ellipse cx="12" cy="8" rx="7" ry="2.2" /><path d="M5 8v5a7 2.2 0 0 0 14 0V8" /><path d="M5 11h14" /></>);
const SnareStickIcon = makePartIcon(<><path d="M5 6.5l13 11" /><path d="M19 6.5l-13 11" /></>);
const HiHatIcon = makePartIcon(<><path d="M4 10.5h16" /><path d="M5.5 12.5h13" /><path d="M12 12.5v5.5" /><path d="M9 19.5h6" /></>);
const HiHatOpenIcon = makePartIcon(<><path d="M4 8.5h16" /><path d="M4 12.8h16" /><path d="M12 12.8v5" /><path d="M9 19.5h6" /></>);
const HiHatFootIcon = makePartIcon(<><path d="M5.5 10.5h13" /><path d="M6.5 12.5h11" /><path d="M12 12.5v4.5" /><path d="M7 20l5-2 5 2" /></>);
const TomIcon = makePartIcon(<><ellipse cx="12" cy="7.5" rx="6.5" ry="2" /><path d="M5.5 7.5v6a6.5 2 0 0 0 13 0v-6" /></>);
const FloorTomIcon = makePartIcon(<><ellipse cx="12" cy="7" rx="6" ry="1.8" /><path d="M6 7v7a6 1.8 0 0 0 12 0V7" /><path d="M7 15l-1.5 5M17 15l1.5 5" /></>);
const RideIcon = makePartIcon(<><ellipse cx="12" cy="10" rx="9" ry="2.2" /><circle cx="12" cy="10" r="1" /><path d="M12 12v7" /><path d="M9 20h6" /></>);
const CrashIcon = makePartIcon(<><ellipse cx="12" cy="11" rx="9" ry="2" transform="rotate(-14 12 11)" /><path d="M12 12.8V19" /><path d="M9 20h6" /></>);

// All possible instruments in the editor
const ALL_INSTRUMENTS = [
  { key: 'kick', label: 'Kick', category: 'drums', icon: KickIcon },
  { key: 'snare', label: 'Snare', category: 'drums', icon: SnareIcon },
  { key: 'snareStick', label: 'Snare Stick', category: 'drums', icon: SnareStickIcon },
  { key: 'hihat', label: 'Hi-Hat', category: 'drums', icon: HiHatIcon },
  { key: 'hihatOpen', label: 'Hi-Hat Open', category: 'drums', icon: HiHatOpenIcon },
  { key: 'hihatFoot', label: 'Hi-Hat Foot', category: 'drums', icon: HiHatFootIcon },
  { key: 'tom1', label: 'Tom 1', category: 'drums', icon: TomIcon },
  { key: 'tom2', label: 'Tom 2', category: 'drums', icon: TomIcon },
  { key: 'floorTom', label: 'Floor Tom', category: 'drums', icon: FloorTomIcon },
  { key: 'ride', label: 'Ride', category: 'drums', icon: RideIcon },
  { key: 'crash', label: 'Crash', category: 'drums', icon: CrashIcon },
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

// A signature color per instrument row — active cells are painted in this hue with
// intensity mapped to velocity (brighter = harder), so rows read at a glance instead
// of every hit sharing one amber. Non-drum keys get a sensible fallback.
const INSTRUMENT_COLORS: Record<string, string> = {
  kick: '#ff5a5f',
  snare: '#ffab1d',
  snareStick: '#f6c344',
  hihat: '#22bcd6',
  hihatOpen: '#17b8a6',
  hihatFoot: '#3b9ad1',
  tom1: '#ff8a3d',
  tom2: '#ff7a59',
  floorTom: '#e8623d',
  ride: '#46c26a',
  crash: '#9b7cff',
  bass: '#6d8bff',
  piano: '#a78bfa',
  guitar: '#f26fb0',
};
const DEFAULT_INSTRUMENT_COLOR = '#8b7cff';

// hex (#rrggbb) → rgba string at the given alpha, for velocity-scaled cell fills.
function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
  const { isPlaying: isMainPlaying } = playbackState;
  // 16th-note playhead comes through its own channel now (not the shared state object),
  // so subscribing here doesn't re-render on unrelated playback changes.
  const mainPlayheadStep = useCurrentStep();
  
  const isMobile = useIsMobile();
  const [editedStyle, setEditedStyle] = useState<StylePattern>(cloneStyle(style));
  const [originalStyleName, setOriginalStyleName] = useState(style.name); // For dropdown display
  // Which page of the drum grid is visible. Steps are shown a page at a time
  // (half a bar on phones, a full bar on wider screens) and navigated with dots —
  // no horizontal scrolling.
  const [drumPage, setDrumPage] = useState(0);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
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
  // Pending "clear pattern" awaiting confirmation (clearing wipes a whole instrument row).
  const [clearConfirm, setClearConfirm] = useState<{ instrument: InstrumentKey; isFill: boolean } | null>(null);
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
  // Long-press bookkeeping: a tap toggles the cell, holding (>420ms) opens the
  // velocity control instead. longFiredRef guards the trailing click after a hold.
  const pressTimerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);
  
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

  // Audible feedback: fire the instrument's own sound so the user hears what they placed.
  const previewInstrument = (instrument: InstrumentKey, velocity: number) => {
    if (velocity <= 0 || !DRUM_INSTRUMENT_KEYS.includes(instrument)) return;
    const soundId = editedStyleRef.current.instrumentSounds?.drums ?? 'standard';
    const drumsVol = editedStyleRef.current.volumes?.drums ?? 0.8;
    previewDrumHit(instrument, soundId, Math.min(1, velocity) * drumsVol);
  };

  // Tap = toggle the step on/off (default velocity = accent). Long-press or right-click
  // opens the velocity control. This replaces the old "every tap opens a menu" flow.
  const toggleCell = (instrument: InstrumentKey, step: number, isFill: boolean) => {
    const bucket = isFill ? editedStyleRef.current.fill.pattern : editedStyleRef.current.rhythm;
    const next = (bucket[instrument]?.[step] ?? 0) > 0 ? 0 : 1;
    if (next > 0) previewInstrument(instrument, next); // sound only when turning a hit on
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);
      const b = isFill ? newStyle.fill.pattern : newStyle.rhythm;
      if (!b[instrument]) {
        b[instrument] = createEmptyPattern(getStyleTotalSlots(newStyle));
      }
      b[instrument]![step] = next;
      return newStyle;
    });
  };

  const startCellPress = (instrument: InstrumentKey, step: number, isFill: boolean) => {
    longFiredRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      longFiredRef.current = true;
      setVelocityPopover({ instrument, step, isFill });
    }, 420);
  };

  const endCellPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleCellTap = (instrument: InstrumentKey, step: number, isFill: boolean) => {
    // Swallow the click that trails a long-press (which already opened the velocity control).
    if (longFiredRef.current) {
      longFiredRef.current = false;
      return;
    }
    toggleCell(instrument, step, isFill);
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
    analytics.customStyleSaved(mode);
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

  // Paging: half a bar per page on phones (keeps pads finger-sized without side-scroll),
  // a whole bar per page on wider screens (fills the dialog). Steps are grouped into
  // pages navigated by dots — never a horizontal scrollbar.
  const drumPageSize = isMobile ? Math.max(4, Math.ceil(slotsPerBar / 2)) : slotsPerBar;
  const drumTotalPages = Math.max(1, Math.ceil(totalSlots / drumPageSize));
  const drumViewPage = Math.min(drumPage, drumTotalPages - 1);
  const drumPageStart = drumViewPage * drumPageSize;
  const drumVisibleSteps = Array.from(
    { length: Math.min(drumPageSize, totalSlots - drumPageStart) },
    (_, i) => drumPageStart + i,
  );

  // Reset to the first page whenever the grid's shape changes (bars, meter, Fill mode,
  // switching phone/desktop page size).
  useEffect(() => {
    setDrumPage(0);
  }, [totalSlots, showFill, drumPageSize]);

  // While playing, follow the playhead across pages so the moving cell stays on screen.
  useEffect(() => {
    if (!(isLocalPlaying || isMainPlaying) || displayStep < 0) return;
    const p = Math.floor(displayStep / drumPageSize);
    setDrumPage(prev => (prev !== p ? p : prev));
  }, [displayStep, isLocalPlaying, isMainPlaying, drumPageSize]);

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
        {/* Mobile-first: full-screen on phones (the dense sequencer needs every pixel),
            restored to the centered desktop dialog at sm+. Base classes win below sm;
            sm: overrides win above — the centering translate math already makes a
            100vw/100dvh box fill the screen, so no translate override is needed. */}
        <DialogContent
          // Don't let a stray tap dismiss the editor — on the full-screen mobile dialog
          // a tap near the bottom edge (e.g. on the Play button) could land on the
          // overlay if 100dvh doesn't perfectly match it, closing the dialog and popping
          // the "Unsaved Changes" guard. Closing is only via the X button or Escape, both
          // of which still run through the guarded onOpenChange flow. Also prevents
          // accidental data loss from click-outside on desktop.
          onInteractOutside={(e) => e.preventDefault()}
          className="flex flex-col w-screen h-[100dvh] max-w-none rounded-none p-0 gap-0 overflow-hidden sm:w-[95vw] sm:max-w-5xl sm:h-auto sm:max-h-[90vh] sm:rounded-lg"
        >
          <DialogHeader className="p-4 pb-2 border-b border-border shrink-0">
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

          <div className="flex flex-col flex-1 min-h-0">
            {/* Top Controls */}
            <div className="p-2 sm:p-4 border-b border-border bg-card/50 flex flex-wrap items-center gap-2 sm:gap-4 shrink-0">
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
              
              {/* Playback & Save Controls — desktop only; on mobile these live in the
                  sticky bottom action bar so they're always reachable & finger-sized. */}
              <div className="hidden sm:flex items-center gap-1 sm:gap-2 ml-auto">
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

          {/* Tab Navigation — labels always visible; full-width even split on mobile */}
          <div className="px-2 sm:px-4 border-b border-border flex gap-0 shrink-0">
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
                  'flex-1 sm:flex-none justify-center px-3 py-3 sm:py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <tab.Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
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

          {/* Grid Area — a paged step sequencer: instrument rows (icon rail) × step pads */}
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="p-3 sm:p-4">
              <div className="space-y-1.5">
                {sortedActiveInstruments.filter(i => i.category === 'drums').map(instrument => {
                  const basePattern = editedStyle.rhythm[instrument.key] || createEmptyPattern(totalSlots);
                  const fillPattern = editedStyle.fill.pattern[instrument.key];
                  const Icon = instrument.icon;
                  const instColor = INSTRUMENT_COLORS[instrument.key] ?? DEFAULT_INSTRUMENT_COLOR;

                  return (
                    <div key={instrument.key} className="flex items-center gap-2">
                      {/* Icon rail — tap for row options; tiny name below like a mixer channel */}
                      <div className="shrink-0 w-11 flex flex-col items-center gap-0.5">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            title={instrument.label}
                            className="w-9 h-9 rounded-lg grid place-items-center border transition-transform active:scale-95"
                            style={{ color: instColor, backgroundColor: hexToRgba(instColor, 0.14), borderColor: hexToRgba(instColor, 0.32) }}
                          >
                            <Icon className="w-4 h-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="right" align="start" className="w-44 p-1">
                          <div className="px-2 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5" style={{ color: instColor }} />{instrument.label}
                          </div>
                          <button
                            onClick={() => setClearConfirm({ instrument: instrument.key, isFill: showFill })}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-muted text-left"
                          >
                            <RotateCcw className="w-4 h-4" /> Clear row
                          </button>
                          {!['kick', 'snare', 'hihat', 'bass', 'piano', 'guitar'].includes(instrument.key) && (
                            <button
                              onClick={() => removeInstrument(instrument.key)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-muted text-destructive text-left"
                            >
                              <Trash2 className="w-4 h-4" /> Remove
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                        <span className="text-[8px] leading-none text-muted-foreground text-center w-full truncate">{instrument.label}</span>
                      </div>

                      {/* Step pads for the current page */}
                      <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${drumPageSize}, minmax(0, 1fr))` }}>
                        {drumVisibleSteps.map(step => {
                              // slotInBar restarts every bar (0..slotsPerBar-1) — used for
                              // pulse numbering, the fill zone, and reading/writing the
                              // (still single-bar) fill pattern. `step` (raw, spans all
                              // loopBars) indexes the main rhythm array, which is
                              // loopBars*slotsPerBar long when editing >1 bar.
                              const slotInBar = step % slotsPerBar;
                              const isDownbeat = slotInBar % slotsPerBeatGroup === 0;
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
                                      onPointerDown={() => startCellPress(instrument.key, step, showFill)}
                                      onPointerUp={endCellPress}
                                      onPointerLeave={endCellPress}
                                      onPointerCancel={endCellPress}
                                      onClick={() => handleCellTap(instrument.key, step, showFill)}
                                      onContextMenu={e => { e.preventDefault(); setVelocityPopover({ instrument: instrument.key, step, isFill: showFill }); }}
                                      style={value > 0 ? {
                                        backgroundColor: hexToRgba(instColor, 0.25 + value * 0.6),
                                        borderColor: hexToRgba(instColor, 0.65),
                                      } : undefined}
                                      className={cn(
                                        "aspect-square rounded-md border transition-all relative select-none",
                                        // Off cells: neutral surface + downbeat-emphasized border
                                        value === 0 && !isInactiveInFill && "bg-secondary",
                                        value === 0 && (isDownbeat ? "border-border" : "border-border/40"),
                                        // Fill mode: locked zone gets muted background
                                        isInactiveInFill && "opacity-40 cursor-not-allowed bg-muted/50 border-border/40",
                                        // Fill mode: active but empty zone gets a faint tint
                                        isActiveInFill && value === 0 && "bg-chart-4/10 border-chart-4/40",
                                        // Popover open indicator
                                        isPopoverOpen && "ring-2 ring-primary",
                                        // Playhead indicator - ALWAYS on top with higher priority
                                        isCurrentStep && "ring-2 ring-primary ring-offset-1 ring-offset-background z-10"
                                      )}
                                    />
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

                    </div>
                  );
                })}

                {/* Ruler row — "+" to add an instrument, then the beat numbers for this page */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="shrink-0 w-11 flex justify-center">
                    <button
                      title="Add instrument"
                      onClick={() => setAddSheetOpen(true)}
                      className="w-9 h-9 rounded-lg grid place-items-center border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${drumPageSize}, minmax(0, 1fr))` }}>
                    {drumVisibleSteps.map(step => {
                      const slotInBar = step % slotsPerBar;
                      const isDb = slotInBar % slotsPerBeatGroup === 0;
                      return (
                        <div
                          key={step}
                          className={cn(
                            "h-5 flex items-center justify-center text-[10px] tabular-nums",
                            isDb ? "text-foreground font-semibold" : "text-muted-foreground/40",
                          )}
                        >
                          {isDb ? slotInBar / slotsPerBeatGroup + 1 : '·'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* Instruments are added from the "+" in the ruler row above */}
            </div>
          </div>

          {/* Page dots — navigate half-bar / bar pages without side-scrolling */}
          {drumTotalPages > 1 && (
            <div className="shrink-0 border-t border-border bg-muted/20 py-2 flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                {Array.from({ length: drumTotalPages }).map((_, p) => (
                  <button
                    key={p}
                    onClick={() => setDrumPage(p)}
                    aria-label={`Page ${p + 1}`}
                    className={cn(
                      "h-3 w-3 rounded-full border transition-all",
                      p === drumViewPage ? "bg-primary border-primary scale-110" : "border-muted-foreground/50 hover:border-primary",
                    )}
                  />
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                Bar {Math.floor(drumPageStart / slotsPerBar) + 1}{loopBars > 1 ? ` / ${loopBars}` : ''}
              </span>
            </div>
          )}
          
          {/* Footer / Legend — explains the new gesture model at a glance */}
          <div className="p-2 sm:p-3 border-t border-border bg-muted/30 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1.5 text-[10px] sm:text-xs text-muted-foreground">
            <span><span className="text-foreground font-medium">Tap</span> to add or remove</span>
            <Separator orientation="vertical" className="h-4 hidden sm:block" />
            <span><span className="text-foreground font-medium">Hold</span> a pad for velocity</span>
            <Separator orientation="vertical" className="h-4 hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <span>Soft</span>
              {[0.3, 0.5, 0.7, 1].map(v => (
                <div
                  key={v}
                  className="w-3.5 h-3.5 rounded-sm border border-border/40"
                  style={{ backgroundColor: hexToRgba(DEFAULT_INSTRUMENT_COLOR, 0.25 + v * 0.6) }}
                />
              ))}
              <span>Hard</span>
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
              accentColor={INSTRUMENT_COLORS[activeTab] ?? DEFAULT_INSTRUMENT_COLOR}
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

          {/* Mobile sticky action bar — the primary actions (moved out of the cramped top
              toolbar) always visible & finger-sized. Desktop keeps them in the toolbar. */}
          <div className="sm:hidden shrink-0 border-t border-border bg-background p-3 flex items-center gap-2">
            {hasUnsavedChanges ? (
              <Button variant="outline" onClick={() => setResetDialogOpen(true)} className="gap-1.5 shrink-0">
                <RotateCcw className="w-4 h-4" /> Discard
              </Button>
            ) : hasOverride ? (
              <Button
                variant="outline"
                className="gap-1.5 shrink-0"
                // Mirrors the desktop toolbar's Reset (immediate, no confirm): drop the
                // saved override and restore the original built-in style.
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
              >
                <RotateCw className="w-4 h-4" /> Reset
              </Button>
            ) : null}

            <Button
              variant={(isLocalPlaying || isMainPlaying) ? 'destructive' : 'default'}
              onClick={togglePlayback}
              className="flex-1 gap-1.5"
            >
              {(isLocalPlaying || isMainPlaying) ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {(isLocalPlaying || isMainPlaying) ? 'Stop' : (showFill ? 'Preview Fill' : 'Play')}
            </Button>

            {isCustomStyle(editedStyle.id) && (
              <Button variant="destructive" size="icon" onClick={() => handleDeleteStyle(editedStyle)} aria-label="Delete rhythm" className="shrink-0">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}

            <Button variant="outline" onClick={handleSaveClick} className="gap-1.5 shrink-0">
              <Save className="w-4 h-4" /> Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Add Instrument — bottom sheet of tappable instrument cards */}
    <Sheet open={addSheetOpen} onOpenChange={setAddSheetOpen}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Add instrument</SheetTitle>
          <SheetDescription>Drop another voice into the groove.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          {ALL_INSTRUMENTS.filter(i => i.category === 'drums').map(inst => {
            const added = activeInstruments.has(inst.key);
            const c = INSTRUMENT_COLORS[inst.key] ?? DEFAULT_INSTRUMENT_COLOR;
            const CardIcon = inst.icon;
            return (
              <button
                key={inst.key}
                disabled={added}
                onClick={() => { addInstrument(inst.key); setAddSheetOpen(false); }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-card text-left text-sm font-medium transition-colors hover:border-primary disabled:opacity-50 disabled:pointer-events-none"
              >
                <span
                  className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
                  style={{ color: c, backgroundColor: hexToRgba(c, 0.16), border: `1px solid ${hexToRgba(c, 0.3)}` }}
                >
                  <CardIcon className="w-4 h-4" />
                </span>
                <span className="truncate">
                  {inst.label}{added && <span className="text-muted-foreground"> · added</span>}
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>

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

    {/* Clear Pattern Confirmation */}
    <AlertDialog open={clearConfirm !== null} onOpenChange={(o) => { if (!o) setClearConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear pattern?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes every step for this instrument{clearConfirm?.isFill ? ' in the current fill' : ''}. You can undo by not saving.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (clearConfirm) clearPattern(clearConfirm.instrument, clearConfirm.isFill);
              setClearConfirm(null);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
