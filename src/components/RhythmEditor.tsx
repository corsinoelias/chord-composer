import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  RotateCw, X, Zap } from 'lucide-react';
// The chord player's tokens and primitives (the dialog renders in a portal).
import '@/styles/chord-player.css';
import { type StylePattern, MUSICAL_STYLES, getSlotsPerBar, getStyleTotalSlots, getPulseInterval } from '@/lib/styles';
import { previewDrumHit } from '@/lib/appEngine/preview';
import { AppPlayback, fillNow, subscribeEngineState, type AppSong } from '@/lib/appEngine/player';
import { createSection } from '@/lib/sections';
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
import {
  emptyMelodicData, createVariation, scalePatternIsEmpty, degreeKeysOf,
  type InstrumentMelodic, type DegreePattern, type MelodicFillTrack,
} from '@/lib/bassScale';
import { useIsMobile } from '@/hooks/use-mobile';

// Drum-part glyphs — shared with the Drum Tab Player, which uses the same set.
import {
  KickIcon, SnareIcon, SnareStickIcon, HiHatIcon, HiHatOpenIcon, HiHatFootIcon,
  TomIcon, FloorTomIcon, RideIcon, CrashIcon,
} from '@/components/DrumTabPlayer/partIcons';

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
  /**
   * Section mode: Save hands the edited rhythm back for one section of the song instead of
   * storing it as a style (see Index.tsx and sectionPlayback.ts's sectionPatternsFromStyle).
   */
  onSaveSection?: (style: StylePattern) => void;
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
  onSoundTypeChange,
}: {
  instType: InstrumentType;
  editedStyle: StylePattern;
  onChange: (updater: (prev: StylePattern) => StylePattern) => void;
  onSoundTypeChange?: () => void;
}) {
  const config = INSTRUMENTS.find(i => i.id === instType);
  if (!config) return null;

  const currentSoundId = editedStyle.instrumentSounds?.[instType] || config.defaultSoundType;
  // Only `guitar` is optional on StylePattern.volumes — falls back to piano's
  // volume, matching the default this style would apply if unset.
  const currentVolume = editedStyle.volumes[instType] ?? editedStyle.volumes.piano;

  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-6">
      <div className="flex items-center gap-3">
        <Volume2 className="hidden h-[18px] w-[18px] sm:block" style={{ color: 'var(--cp-mu)' }} />
        <span className="cp-lbl">{config.name}</span>
        <input
          className="cp-rg w-20 sm:w-[130px]"
          type="range"
          min={0}
          max={100}
          value={Math.round(currentVolume * 100)}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            onChange(prev => ({ ...prev, volumes: { ...prev.volumes, [instType]: v / 100 } }));
          }}
          aria-label={`${config.name} volume`}
          style={{ ['--cp-p' as string]: `${Math.round(currentVolume * 100)}%` }}
        />
      </div>
      <Select
        value={currentSoundId}
        onValueChange={(soundId) => {
          onChange(prev => ({
            ...prev,
            instrumentSounds: { ...prev.instrumentSounds, [instType]: soundId },
          }));
          onSoundTypeChange?.();
        }}
      >
        <SelectTrigger
          className="h-10 w-36 rounded-[10px] text-[13px] font-semibold sm:w-[170px]"
          style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)' }}
        >
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
  onSaveSection,
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
  
  // The editor's own loop, on the app's engine. Only one of it and the song plays at once.
  const playbackRef = useRef<AppPlayback | null>(null);
  const editedStyleRef = useRef<StylePattern>(editedStyle);
  const showFillRef = useRef(showFill);
  const initializedStyleIdRef = useRef<string>('');
  const stepAnimationRef = useRef<number | null>(null);
  // Long-press bookkeeping: a tap toggles the cell, holding (>420ms) opens the
  // velocity control instead. longFiredRef guards the trailing click after a hold.
  const pressTimerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);
  
  const isSyncedWithMain = isMainPlaying && !isLocalPlaying;
  const isPlaying = isLocalPlaying || isMainPlaying;

  // The Fill-in button's light: where a fill asked for by hand is (0 none, 1 waiting for the
  // next bar, 2 sounding), read from the one engine whichever player is using it.
  const [fillByHand, setFillByHand] = useState(0);
  // And whether the bar sounding is a fill bar at all (by hand, at the end of a part or on a
  // phrase): the grid's playhead follows the fill's cells then, not the groove's.
  const [fillBarSounding, setFillBarSounding] = useState(false);
  useEffect(() => {
    if (!isPlaying) {
      setFillByHand(0);
      setFillBarSounding(false);
      return;
    }
    return subscribeEngineState(state => {
      setFillByHand(prev => (prev === state.fillByHand ? prev : state.fillByHand));
      setFillBarSounding(prev => (prev === state.fillBar ? prev : state.fillBar));
    });
  }, [isPlaying]);
  // Off in the fill preview, which already plays the fill on every bar.
  const canFillNow = isPlaying && !showFill;
  const fillNowStyle: React.CSSProperties | undefined = fillByHand === 2
    ? { background: 'var(--cp-ac)', borderColor: 'var(--cp-ac)', color: '#fff' }
    : fillByHand === 1
      ? { borderColor: 'var(--cp-ac)', color: 'var(--cp-act)' }
      : undefined;
  const fillNowTitle = !isPlaying
    ? 'Press play to throw in the fill'
    : showFill
      ? 'The fill preview already plays the fill on every bar'
      : fillByHand === 1
        ? 'The fill comes in on the next bar'
        : 'Throw in the fill now (like a keyboard\'s Fill-in button)';

  /**
   * What the editor's loop plays: one chord of C major spanning the style's whole loop (its
   * own meter and loopBars, so the loop point is the pattern's), in the style being edited,
   * with its own sounds, the variation each tab is showing — even one switched off, so what
   * you are editing is what you hear — and, with Fill on, the fill on every bar.
   */
  const loopInput = (): AppSong => {
    const edited = editedStyleRef.current;
    const beatsPerLoop = (getSlotsPerBar(edited) / 4) * (edited.loopBars ?? 1);
    const melodic = edited.melodic ? { ...edited.melodic } : undefined;
    if (melodic) {
      for (const t of ['bass', 'piano', 'guitar'] as const) {
        if (melodic[t]?.variations.length) melodic[t] = { ...melodic[t], enabled: true };
      }
    }
    const ids = activeVarIdRef.current;
    const section = {
      ...createSection('Test'),
      chords: [{ id: '1', root: 'C' as const, accidental: '' as const, quality: 'maj' as const, duration: beatsPerLoop }],
      bassVariationId: ids.bass, pianoVariationId: ids.piano, guitarVariationId: ids.guitar,
    };
    return {
      song: {
        sections: [section],
        bpm: edited.bpm,
        instrumentSettings: getEffectiveInstruments(getDefaultInstrumentStates(), edited),
        fillEveryBar: showFillRef.current,
        // A groove to listen to, not a song that ends every bar: the fill comes every eighth
        // bar or when the Fill button asks for it.
        holdOpen: true,
      },
      style: { ...edited, melodic },
      lookup: () => undefined,
    };
  };
  
  // Keep playhead visible: use main if synced, local if local playing, or -1 if nothing
  const displayStep = isLocalPlaying 
    ? currentStep 
    : (isSyncedWithMain && mainPlayheadStep !== undefined ? mainPlayheadStep : currentStep);
  
  // The playhead on the grid shown: the groove's while the groove plays, the fill's while the
  // fill does. The fill preview plays the fill on every bar (fillEveryBar), so there it
  // always follows.
  const followsGrid = showFill ? (isLocalPlaying || fillBarSounding) : !fillBarSounding;
  const gridStep = followsGrid ? displayStep : -1;

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
    // The loop hears every edit on its next step, as it did bar by bar before.
    if (playbackRef.current?.active) void playbackRef.current.update(loopInput());
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
      stopLocalPlayback();
      stopPreview();
    }
  }, [open, stopPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the loop is, read from the engine each frame. Absolute across the whole loop, not
  // bar-relative — otherwise bar 1 and bar 2's matching cell would light at the same time.
  const updatePlayhead = useCallback(() => {
    const state = playbackRef.current?.state;
    if (state && state.playing) {
      const barSlots = getSlotsPerBar(editedStyleRef.current);
      const loopBarCount = editedStyleRef.current.loopBars ?? 1;
      const step = ((state.bar % loopBarCount) * barSlots + state.step) % (barSlots * loopBarCount);
      setCurrentStep(prev => prev !== step ? step : prev);
    }
    stepAnimationRef.current = requestAnimationFrame(updatePlayhead);
  }, []);

  // Unmounting while the loop runs (Index remounts this editor per section, so saving a
  // section's rhythm unmounts it before the !open effect ever runs) must stop it too: left
  // alone it kept sounding, and pressing the main Play then played two at once.
  useEffect(() => {
    return () => {
      if (stepAnimationRef.current) cancelAnimationFrame(stepAnimationRef.current);
      playbackRef.current?.stop();
      playbackRef.current = null;
    };
  }, []);

  const stopLocalPlayback = useCallback(() => {
    if (stepAnimationRef.current) {
      cancelAnimationFrame(stepAnimationRef.current);
      stepAnimationRef.current = null;
    }
    // Only this editor's own loop: stopping while the song plays behind it would silence the app.
    if (playbackRef.current) {
      playbackRef.current.stop();
      playbackRef.current = null;
    }
    setIsLocalPlaying(false);
    setCurrentStep(-1);
  }, []);

  const startLocalPlayback = useCallback(async () => {
    if (isMainPlaying) stopMainPlayback();
    stopLocalPlayback();

    setIsLocalPlaying(true);
    setCurrentStep(0);
    // Imperative (re)start — a reactive effect watching isLocalPlaying can be coalesced by
    // React batching into a no-op that never reschedules the frame.
    if (stepAnimationRef.current) cancelAnimationFrame(stepAnimationRef.current);
    stepAnimationRef.current = requestAnimationFrame(updatePlayhead);

    const playback = new AppPlayback();
    playbackRef.current = playback;
    await playback.play(loopInput());
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
    const soundId = editedStyleRef.current.instrumentSounds?.drums ?? 'acoustic2';
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

  /** Where the fill starts: the same control on every tab, since it is one fill. */
  const renderFillPosition = () => (
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
  );

  /**
   * A melodic track's groove, first bar, as its fill: somewhere to start editing from
   * rather than a blank bar that silences the track the moment the fill begins.
   */
  const copyMelodicMainToFill = (track: MelodicFillTrack) => {
    const melodic = migratedMelodic[track];
    const variation = melodic.variations.find(v => v.id === activeVarIdRef.current[track]) ?? melodic.variations[0];
    const bar = (lane?: number[]) => (lane ? lane.slice(0, slotsPerBar) : undefined);
    const pattern: DegreePattern = {};
    for (const key of degreeKeysOf(variation?.pattern ?? {})) pattern[key] = bar(variation!.pattern[key]);
    setEditedStyle(prev => ({
      ...prev,
      fill: {
        ...prev.fill,
        melodic: {
          ...(prev.fill.melodic ?? {}),
          [track]: { pattern, chordHit: bar(variation?.chordHit), octaveOffsets: variation?.octaveOffsets },
        },
      },
    }));
    toast.success('Pattern copied to fill');
  };

  // Handle save - always show dialog for built-in styles
  const handleSaveClick = () => {
    if (onSaveSection) {
      stopLocalPlayback();
      stopPreview();
      onSaveSection(editedStyle);
      setHasUnsavedChanges(false);
      originalStyleRef.current = JSON.stringify(editedStyle);
      onClose();
      return;
    }
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
          // Don't auto-focus the Name field on open (pops the mobile keyboard and pulls
          // attention off the grid). Let the user land on the sequencer instead.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="cp-dlg flex flex-col w-screen h-[100dvh] max-w-none rounded-none p-0 gap-0 overflow-hidden select-none sm:w-[95vw] sm:max-w-[1120px] sm:h-auto sm:max-h-[90vh] sm:rounded-[20px]"
        >
          {/* Header band, as drawn: what you are editing on the left, its tempo and
              category in the middle, the actions on the right. On a phone the actions
              move to the sticky bar at the bottom. */}
          <div
            className="flex shrink-0 flex-wrap items-center gap-x-[22px] gap-y-2 px-3 py-3 sm:min-h-[76px] sm:flex-nowrap sm:py-0 sm:pl-7 sm:pr-5"
            style={{ borderBottom: '1px solid var(--cp-ln)' }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--cp-ac) 18%, transparent)', color: 'var(--cp-act)' }}
                aria-hidden="true"
              >
                <Drum className="h-[18px] w-[18px]" />
              </span>
              <div className="flex min-w-0 flex-col gap-[3px]">
                <DialogTitle className="cp-lbl m-0 flex items-center gap-1.5 text-[10.5px] font-bold leading-normal tracking-[0.09em]">
                  Edit rhythm
                  {hasOverride && <span style={{ color: 'var(--cp-act)' }} title="Customised built-in rhythm">★</span>}
                  {(isPlaying || isMainPlaying) && (
                    <span className="animate-pulse normal-case tracking-normal" style={{ color: 'var(--cp-act)' }}>
                      ● {showFill ? 'fill preview' : isSyncedWithMain ? 'synced' : 'live'}
                    </span>
                  )}
                  {previewingStyleId && (
                    <span className="animate-pulse normal-case tracking-normal" style={{ color: 'var(--cp-act)' }}>
                      previewing…
                    </span>
                  )}
                </DialogTitle>
                {/* Renaming happens here; to edit a different rhythm, close and reopen
                    (unsaved changes are still guarded). */}
                <input
                  value={editedStyle.name}
                  onChange={e => setEditedStyle(prev => ({ ...prev, name: e.target.value }))}
                  aria-label="Rhythm name"
                  placeholder={originalStyleName || 'Name'}
                  className="h-[30px] w-[190px] max-w-full select-text rounded-lg border border-transparent bg-transparent px-2 -ml-2 text-[15px] font-bold outline-none hover:border-[var(--cp-ln2)] focus:border-[var(--cp-ln2)]"
                  style={{ color: 'var(--cp-tx)' }}
                />
              </div>
            </div>

            <div className="cp-dv hidden sm:block" />

            <div className="flex items-center gap-3">
              <span className="cp-lbl">BPM</span>
              <span className="cp-mono w-[30px] text-lg font-bold">{editedStyle.bpm}</span>
              <input
                className="cp-rg w-28 sm:w-[140px]"
                type="range"
                min={40}
                max={200}
                value={editedStyle.bpm}
                onChange={e => handleBpmChange(parseInt(e.target.value))}
                aria-label="Rhythm tempo"
                style={{ ['--cp-p' as string]: `${((editedStyle.bpm - 40) / 160) * 100}%` }}
              />
            </div>

            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="cp-lbl">Category</span>
              <Select
                value={editedStyle.category}
                onValueChange={(value: StylePattern['category']) => setEditedStyle(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger
                  className="h-10 w-[130px] rounded-[10px] text-[13px] font-semibold"
                  style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)' }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Rock', 'Funk', 'Pop', 'Reggae', 'HipHop', 'Disco', 'Blues', 'Latin', 'Metal', 'Folk', 'Country', 'Jazz', 'Soul', 'Indie', 'LoFi', 'Gospel'].map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="hidden flex-grow sm:block" />

            {/* Playback & save — desktop only; on mobile they live in the sticky bottom bar */}
            <div className="hidden items-center gap-2 sm:flex">
              {/* Reset to default (only for built-in styles with a saved override) */}
              {hasOverride && !hasUnsavedChanges && (
                <button
                  className="cp-btn"
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
                  title="Remove customizations and restore the original built-in style"
                >
                  <RotateCw className="h-4 w-4" />
                  Reset
                </button>
              )}

              {/* Discard Changes (only when there are unsaved changes) */}
              {hasUnsavedChanges && (
                <button className="cp-btn" onClick={() => setResetDialogOpen(true)}>
                  <RotateCcw className="h-4 w-4" />
                  Discard
                </button>
              )}

              <button
                className="cp-btn"
                onClick={fillNow}
                disabled={!canFillNow}
                title={fillNowTitle}
                aria-label="Throw in the fill now"
                style={{ ...fillNowStyle, ...(canFillNow ? {} : { opacity: 0.45 }) }}
              >
                <Zap className="h-4 w-4" />
                Fill
              </button>

              <button className="cp-btn" onClick={togglePlayback}>
                {(isLocalPlaying || isMainPlaying) ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {(isLocalPlaying || isMainPlaying) ? 'Stop' : (showFill ? 'Preview Fill' : 'Play')}
              </button>

              {/* Delete — only for custom styles */}
              {isCustomStyle(editedStyle.id) && (
                <button
                  className="cp-btn cp-ib"
                  style={{ color: 'var(--cp-dg)', borderColor: 'color-mix(in srgb, var(--cp-dg) 40%, transparent)' }}
                  onClick={() => handleDeleteStyle(editedStyle)}
                  aria-label="Delete rhythm"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              <button className="cp-btn cp-pri" onClick={handleSaveClick}>
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>

            <button
              className="cp-btn cp-ib cp-gh ml-auto sm:ml-0"
              onClick={handleCloseAttempt}
              aria-label="Close"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>

          <div className="flex flex-col flex-1 min-h-0">
          {/* Tab Navigation — labels always visible; full-width even split on mobile */}
          <div className="flex h-12 shrink-0 items-end gap-0 px-3 sm:gap-[22px] sm:px-7" style={{ borderBottom: '1px solid var(--cp-ln)' }} role="tablist">
            {([
              { key: 'drums', label: 'Drums', Icon: Drum },
              { key: 'piano', label: 'Piano', Icon: Piano },
              { key: 'guitar', label: 'Guitar', Icon: Guitar },
              { key: 'bass', label: 'Bass', Icon: Music },
            ] as const).map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex h-12 flex-1 items-center justify-center gap-2 border-0 border-b-2 bg-transparent px-1 text-sm font-semibold sm:flex-none"
                style={{
                  borderBottomColor: activeTab === tab.key ? 'var(--cp-ac)' : 'transparent',
                  color: activeTab === tab.key ? 'var(--cp-tx)' : 'var(--cp-mu)',
                }}
              >
                <tab.Icon className="h-[18px] w-[18px]" style={activeTab === tab.key ? { color: 'var(--cp-act)' } : undefined} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {activeTab === 'drums' ? (
          <>
          {/* Main/Fill Toggle */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-[22px] gap-y-2 px-3 py-2.5 sm:min-h-16 sm:px-7">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold">
              <button
                type="button"
                role="switch"
                aria-checked={showFill}
                aria-label="Edit the fill instead of the main groove"
                className={`cp-sw ${showFill ? 'cp-on' : ''}`}
                onClick={() => handleFillToggle(!showFill)}
              />
              {showFill ? 'Fill' : 'Main'}
                {!showFill && fillBarSounding && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--cp-act)' }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cp-ac)' }} />
                    fill playing
                  </span>
                )}
            </label>

            {/* Loop bars — lets bar 2 (and beyond) differ from bar 1 instead of
                just repeating a single bar forever. Growing copies bar 1 into
                the new bars so there's something to start editing from. */}
            <div className="flex items-center gap-2">
              <span className="cp-lbl hidden sm:inline">Loop</span>
              <Select
                value={loopBars.toString()}
                onValueChange={v => handleLoopBarsChange(Number(v) as 1 | 2)}
              >
                <SelectTrigger
                  className="h-10 w-24 rounded-[10px] text-[13px] font-semibold sm:w-[120px]"
                  style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)' }}
                >
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
                {renderFillPosition()}
                
                <Button variant="ghost" size="sm" onClick={copyMainToFill} className="px-2 sm:px-3">
                  <Copy className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Copy Main</span>
                </Button>
              </>
            )}
            
            {/* Drums' own volume + kit selector — scoped to this tab only */}
            <div className="ml-auto">
              <InstrumentMixControl instType="drums" editedStyle={editedStyle} onChange={setEditedStyle} onSoundTypeChange={() => { if (isLocalPlaying) startLocalPlayback(); }} />
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
                      {/* Icon rail — a tile with the instrument's icon + name inside; tap for row options */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            title={instrument.label}
                            className="flex h-11 w-14 shrink-0 items-center justify-center gap-2.5 rounded-[10px] border px-2 text-[13px] font-semibold transition-transform active:scale-95 sm:w-[132px] sm:justify-start sm:px-3"
                            style={{ color: 'var(--cp-tx)', backgroundColor: `color-mix(in srgb, ${instColor} 12%, var(--cp-s1))`, borderColor: hexToRgba(instColor, 0.4) }}
                          >
                            <i className="hidden h-2.5 w-2.5 shrink-0 rounded-[3px] sm:block" style={{ background: instColor }} />
                            <Icon className="h-4 w-4 shrink-0 sm:hidden" style={{ color: instColor }} />
                            <span className="hidden truncate sm:inline">{instrument.label}</span>
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
                              // bar-relative (the engine's step resets every bar), so
                              // it only ever matches bar 1's cells — a known, minor gap for
                              // that mode, not a wrong/duplicate highlight.
                              const isCurrentStep = gridStep === step && (isLocalPlaying || isMainPlaying);

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
                                      } : isInactiveInFill || isActiveInFill ? undefined : {
                                        backgroundColor: 'var(--cp-s2)',
                                        borderColor: isDownbeat ? 'var(--cp-ln2)' : 'var(--cp-ln)',
                                      }}
                                      className={cn(
                                        "h-11 rounded-lg border transition-all relative select-none cursor-pointer",
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
                  <button
                    title="Add instrument"
                    onClick={() => setAddSheetOpen(true)}
                    className="grid h-11 w-14 shrink-0 place-items-center rounded-[10px] transition-colors sm:w-[132px]"
                    style={{ border: '1.5px dashed var(--cp-ln2)', color: 'var(--cp-tx2)' }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${drumPageSize}, minmax(0, 1fr))` }}>
                    {drumVisibleSteps.map(step => {
                      const slotInBar = step % slotsPerBar;
                      const isDb = slotInBar % slotsPerBeatGroup === 0;
                      return (
                        <div
                          key={step}
                          className={cn(
                            "cp-mono h-5 flex items-center justify-center tabular-nums",
                            isDb ? "text-[13px] font-bold" : "text-[11px]",
                          )}
                          style={{ color: isDb ? 'var(--cp-tx)' : 'var(--cp-mu)' }}
                        >
                          {isDb
                            ? slotInBar / slotsPerBeatGroup + 1
                            : slotsPerBeatGroup === 4 ? ['', 'e', '&', 'a'][slotInBar % 4] : '·'}
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
          <div
            className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1.5 px-3 py-2.5 text-xs sm:min-h-14 sm:px-7"
            style={{ borderTop: '1px solid var(--cp-ln)', color: 'var(--cp-mu)' }}
          >
            <span><strong className="font-semibold" style={{ color: 'var(--cp-tx2)' }}>Tap</strong> to add or remove</span>
            <span><strong className="font-semibold" style={{ color: 'var(--cp-tx2)' }}>Hold</strong> a pad for velocity</span>
            <div className="flex items-center gap-2">
              <span>Soft</span>
              <div className="flex gap-1">
                {[25, 50, 75, 100].map(v => (
                  <i
                    key={v}
                    className="h-[18px] w-[18px] rounded-[5px]"
                    style={{ background: `color-mix(in srgb, var(--cp-act) ${v}%, var(--cp-s2))` }}
                  />
                ))}
              </div>
              <span>Hard</span>
            </div>
          </div>
          </>
          ) : (
          <div className="flex-1 overflow-auto">
            {/* Main/Fill, as on the Drums tab — the fill is the band's, not only the drummer's
                — then this instrument's own volume + sound selector, scoped to this tab only */}
            <div className="flex min-h-16 flex-wrap items-center gap-x-[22px] gap-y-2 px-3 py-2.5 sm:px-7">
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold">
                <button
                  type="button"
                  role="switch"
                  aria-checked={showFill}
                  aria-label="Edit the fill instead of the main groove"
                  className={`cp-sw ${showFill ? 'cp-on' : ''}`}
                  onClick={() => handleFillToggle(!showFill)}
                />
                {showFill ? 'Fill' : 'Main'}
                {!showFill && fillBarSounding && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--cp-act)' }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--cp-ac)' }} />
                    fill playing
                  </span>
                )}
              </label>
              {showFill && (
                <>
                  {renderFillPosition()}
                  <Button
                    variant="ghost" size="sm" className="px-2 sm:px-3"
                    onClick={() => copyMelodicMainToFill(activeTab as MelodicFillTrack)}
                  >
                    <Copy className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">Copy Main</span>
                  </Button>
                </>
              )}
              <div className="ml-auto">
                <InstrumentMixControl
                  instType={activeTab as InstrumentType}
                  editedStyle={editedStyle}
                  onChange={setEditedStyle}
                  onSoundTypeChange={() => { if (isLocalPlaying) startLocalPlayback(); }}
                />
              </div>
            </div>
            <div className="p-4">
            {showFill ? (
              // The fill's bar for this track, as a one-variation melodic grid. From the
              // fill's position on it replaces the track's groove; empty, the groove plays on.
              (() => {
                const track = activeTab as MelodicFillTrack;
                const bar = editedStyle.fill.melodic?.[track];
                return (
                  <MelodicPatternGrid
                    key={`fill-${track}`}
                    melodic={{
                      enabled: true,
                      variations: [{
                        id: 'fill', name: 'Fill', loopBars: 1,
                        pattern: bar?.pattern ?? {}, chordHit: bar?.chordHit, octaveOffsets: bar?.octaveOffsets,
                      }],
                    }}
                    accentColor={INSTRUMENT_COLORS[activeTab] ?? DEFAULT_INSTRUMENT_COLOR}
                    referenceRootMidi={referenceRootMidi}
                    referenceQuality={referenceQuality}
                    slotsPerBar={slotsPerBar}
                    slotsPerBeatGroup={slotsPerBeatGroup}
                    naturalOctave={track === 'bass' ? -1 : 0}
                    currentStep={gridStep}
                    isPlaying={isPlaying}
                    fillPosition={editedStyle.fill.position}
                    onChange={updated => {
                      const v = updated.variations[0];
                      setEditedStyle(prev => ({
                        ...prev,
                        fill: {
                          ...prev.fill,
                          melodic: {
                            ...(prev.fill.melodic ?? {}),
                            [track]: { pattern: v?.pattern ?? {}, chordHit: v?.chordHit, octaveOffsets: v?.octaveOffsets },
                          },
                        },
                      }));
                    }}
                  />
                );
              })()
            ) : (
            <MelodicPatternGrid
              melodic={migratedMelodic[activeTab as 'bass' | 'piano' | 'guitar']}
              accentColor={INSTRUMENT_COLORS[activeTab] ?? DEFAULT_INSTRUMENT_COLOR}
              referenceRootMidi={referenceRootMidi}
              referenceQuality={referenceQuality}
              slotsPerBar={slotsPerBar}
              slotsPerBeatGroup={slotsPerBeatGroup}
              naturalOctave={activeTab === 'bass' ? -1 : 0}
              currentStep={gridStep}
              isPlaying={isPlaying}
              onActiveVarChange={id => {
                activeVarIdRef.current[activeTab as 'bass' | 'piano' | 'guitar'] = id;
                if (playbackRef.current?.active) void playbackRef.current.update(loopInput());
                if (!isLocalPlaying && !isMainPlaying) startLocalPlayback();
              }}
              onChange={updated => {
                // A real edit is unambiguous intent to have this variation play — mark it
                // enabled here (not on mere tab navigation) so saving actually applies it.
                setEditedStyle(prev => {
                  // The melodic grid is now the source of truth for this instrument, so
                  // retire the legacy rhythm.* fallback (which the engine plays when the
                  // melodic variation is empty). Otherwise clearing the grid leaves nothing
                  // marked yet the old rhythm pattern keeps sounding — incoherent.
                  const rhythm = { ...prev.rhythm };
                  const key = activeTab as 'bass' | 'piano' | 'guitar';
                  if (rhythm[key]?.some(v => v > 0)) {
                    rhythm[key] = createEmptyPattern(getStyleTotalSlots(prev));
                  }
                  return {
                    ...prev,
                    rhythm,
                    melodic: { ...(prev.melodic ?? emptyMelodicData()), [activeTab]: { ...updated, enabled: true } },
                  };
                });
              }}
            />
            )}
            </div>
          </div>
          )}

          {/* Mobile sticky action bar — the primary actions (moved out of the cramped top
              toolbar) always visible & finger-sized. Desktop keeps them in the toolbar. */}
          <div className="sm:hidden shrink-0 p-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--cp-ln)', background: 'var(--cp-bar)' }}>
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
              variant="outline"
              onClick={fillNow}
              disabled={!canFillNow}
              title={fillNowTitle}
              aria-label="Throw in the fill now"
              className="shrink-0 gap-1.5"
              style={fillNowStyle}
            >
              <Zap className="w-4 h-4" /> Fill
            </Button>
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

            <button className="cp-btn cp-pri shrink-0" onClick={handleSaveClick}>
              <Save className="w-4 h-4" /> Save
            </button>
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
