import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  ChevronDown,
  RotateCw
} from 'lucide-react';
import { StylePattern, MUSICAL_STYLES } from '@/lib/styles';
import { getAudioContext, ensureSamplesLoaded, scheduleProgression, stopPlayback } from '@/lib/audioEngine';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { saveCustomStyle, deleteCustomStyle, isCustomStyle, generateCustomStyleId, saveStyleOverride, deleteStyleOverride, hasStyleOverride, getStyleOverride } from '@/lib/customStyles';
import { useStylePreview } from '@/hooks/useStylePreview';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

// All possible instruments in the editor
const ALL_INSTRUMENTS = [
  { key: 'kick', label: 'Kick', category: 'drums', icon: Drum },
  { key: 'snare', label: 'Snare', category: 'drums', icon: Drum },
  { key: 'snareStick', label: 'Snare Stick', category: 'drums', icon: Drum },
  { key: 'hihat', label: 'Hi-Hat', category: 'drums', icon: Drum },
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
  isMainPlaying?: boolean;
  mainPlayheadStep?: number;
  onSave?: (style: StylePattern) => void;
  onStyleChange?: (style: StylePattern) => void;
  onStyleSelect?: (styleId: string) => void;
  onDelete?: (styleId: string) => void;
  onToggleMainPlayback?: () => void;
}

const VELOCITY_LEVELS = [0, 0.3, 0.5, 0.7, 1];
const VELOCITY_COLORS = [
  'bg-secondary',
  'bg-chart-4/40',
  'bg-chart-4/60',
  'bg-chart-4/80',
  'bg-chart-4',
];

function createEmptyPattern(): number[] {
  return new Array(16).fill(0);
}

function cloneStyle(style: StylePattern): StylePattern {
  return JSON.parse(JSON.stringify(style));
}

export function RhythmEditor({ 
  open, 
  onClose, 
  style, 
  allStyles,
  isNewStyle, 
  isMainPlaying,
  mainPlayheadStep,
  onSave, 
  onStyleChange,
  onStyleSelect,
  onDelete,
  onToggleMainPlayback,
}: RhythmEditorProps) {
  const [editedStyle, setEditedStyle] = useState<StylePattern>(cloneStyle(style));
  const [originalStyleName, setOriginalStyleName] = useState(style.name); // For dropdown display
  const [isLocalPlaying, setIsLocalPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showFill, setShowFill] = useState(false);
  const [activeInstruments, setActiveInstruments] = useState<Set<InstrumentKey>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState<StylePattern | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  
  const { previewStyle, stopPreview, previewingStyleId } = useStylePreview();
  
  const playbackRef = useRef<{ cancel: () => void } | null>(null);
  const editedStyleRef = useRef<StylePattern>(editedStyle);
  const showFillRef = useRef(showFill);
  const isInitializedRef = useRef(false);
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
    onStyleChange?.(editedStyle);
  }, [editedStyle, onStyleChange]);

  useEffect(() => {
    showFillRef.current = showFill;
  }, [showFill]);

  // Initialize from style prop
  useEffect(() => {
    if (!open) {
      isInitializedRef.current = false;
      return;
    }
    
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    
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
    setActiveInstruments(active);
    
    setShowFill(false);
    setCurrentStep(-1);
  }, [style, open, isNewStyle]);

  // Re-initialize when style changes via dropdown
  useEffect(() => {
    if (open && isInitializedRef.current) {
      // For built-in styles, check if there's an override
      let styleToLoad = style;
      if (!isCustomStyle(style.id)) {
        const override = getStyleOverride(style.id);
        if (override) {
          styleToLoad = override;
        }
      }
      
      const cloned = cloneStyle(styleToLoad);
      setEditedStyle(cloned);
      setOriginalStyleName(style.name);
      editedStyleRef.current = cloned;
      
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
      setActiveInstruments(active);
    }
  }, [style.id]);

  useEffect(() => {
    if (!open) {
      stopLocalPlayback();
      stopPreview();
    }
  }, [open, stopPreview]);

  const updatePlayhead = useCallback(() => {
    if (!isLocalPlaying) return;
    
    const ctx = getAudioContext();
    const bpm = editedStyleRef.current.bpm;
    const slotDuration = (60 / bpm / 4);
    const barDuration = slotDuration * 16;
    
    const elapsed = ctx.currentTime - loopStartTimeRef.current;
    const loopPosition = elapsed % barDuration;
    const step = Math.floor(loopPosition / slotDuration) % 16;
    
    setCurrentStep(step);
    
    stepAnimationRef.current = requestAnimationFrame(updatePlayhead);
  }, [isLocalPlaying]);

  useEffect(() => {
    if (isLocalPlaying) {
      stepAnimationRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      if (stepAnimationRef.current) {
        cancelAnimationFrame(stepAnimationRef.current);
        stepAnimationRef.current = null;
      }
    }
    
    return () => {
      if (stepAnimationRef.current) {
        cancelAnimationFrame(stepAnimationRef.current);
      }
    };
  }, [isLocalPlaying, updatePlayhead]);

  const stopLocalPlayback = useCallback(() => {
    if (playbackRef.current) {
      playbackRef.current.cancel();
      playbackRef.current = null;
    }
    if (stepAnimationRef.current) {
      cancelAnimationFrame(stepAnimationRef.current);
      stepAnimationRef.current = null;
    }
    stopPlayback();
    setIsLocalPlaying(false);
    setCurrentStep(-1);
  }, []);

  const startLocalPlayback = useCallback(async () => {
    if (isMainPlaying && onToggleMainPlayback) {
      onToggleMainPlayback();
    }
    
    stopLocalPlayback();
    
    // Ensure samples are loaded before starting playback
    await ensureSamplesLoaded();
    
    setIsLocalPlaying(true);
    
    const testSection = {
      id: 'test',
      name: 'Test',
      chords: [{ id: '1', root: 'C' as const, accidental: '' as const, quality: 'maj' as const, duration: 4 }],
      repeatCount: 1
    };
    
    const instruments = getDefaultInstrumentStates();
    
    const { cancel } = scheduleProgression([testSection], editedStyleRef.current.bpm, {
      loop: true,
      metronome: false,
      instruments,
      style: editedStyleRef.current,
      transposition: 0,
      onChordChange: () => {},
      onLoopEnd: () => {},
      getStyle: () => editedStyleRef.current,
      forceFill: showFillRef.current,
    });
    
    playbackRef.current = { cancel };
  }, [stopLocalPlayback, isMainPlaying, onToggleMainPlayback]);

  useEffect(() => {
    if (isLocalPlaying) {
      startLocalPlayback();
    }
  }, [showFill]);

  const togglePlayback = useCallback(() => {
    if (isLocalPlaying) {
      stopLocalPlayback();
    } else {
      if (isMainPlaying && onToggleMainPlayback) {
        onToggleMainPlayback();
      }
      startLocalPlayback();
    }
  }, [isLocalPlaying, isMainPlaying, startLocalPlayback, stopLocalPlayback, onToggleMainPlayback]);

  const handleCellClick = (instrument: InstrumentKey, step: number, isFill: boolean) => {
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);
      
      if (isFill) {
        if (!newStyle.fill.pattern[instrument]) {
          newStyle.fill.pattern[instrument] = createEmptyPattern();
        }
        const currentValue = newStyle.fill.pattern[instrument]![step];
        const currentIdx = VELOCITY_LEVELS.indexOf(currentValue);
        const nextIdx = (currentIdx + 1) % VELOCITY_LEVELS.length;
        newStyle.fill.pattern[instrument]![step] = VELOCITY_LEVELS[nextIdx];
      } else {
        if (!newStyle.rhythm[instrument]) {
          newStyle.rhythm[instrument] = createEmptyPattern();
        }
        const currentValue = newStyle.rhythm[instrument]![step];
        const currentIdx = VELOCITY_LEVELS.findIndex(v => Math.abs(v - currentValue) < 0.1);
        const nextIdx = ((currentIdx === -1 ? 0 : currentIdx) + 1) % VELOCITY_LEVELS.length;
        newStyle.rhythm[instrument]![step] = VELOCITY_LEVELS[nextIdx];
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
        newStyle.rhythm[key] = createEmptyPattern();
      }
      return newStyle;
    });
  };

  const removeInstrument = (key: InstrumentKey) => {
    if (['kick', 'snare', 'hihat', 'bass', 'piano'].includes(key)) {
      toast.error('Cannot remove core instruments');
      return;
    }
    
    setActiveInstruments(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const clearPattern = (instrument: InstrumentKey, isFill: boolean) => {
    setEditedStyle(prev => {
      const newStyle = cloneStyle(prev);
      if (isFill && newStyle.fill.pattern[instrument]) {
        newStyle.fill.pattern[instrument] = createEmptyPattern();
      } else if (!isFill && newStyle.rhythm[instrument]) {
        newStyle.rhythm[instrument] = createEmptyPattern();
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

  // Handle save - show dialog for built-in styles
  const handleSaveClick = () => {
    if (isEditingBuiltIn && !hasOverride) {
      // First time editing a built-in - show options
      setSaveDialogOpen(true);
    } else {
      // Custom style or already has override - save directly
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
    onClose();
  };

  const handleResetToOriginal = () => {
    if (isEditingBuiltIn && hasOverride) {
      deleteStyleOverride(style.id);
      // Reload original style
      const original = MUSICAL_STYLES.find(s => s.id === style.id);
      if (original) {
        const cloned = cloneStyle(original);
        setEditedStyle(cloned);
        editedStyleRef.current = cloned;
        toast.success('Reset to original rhythm');
        window.dispatchEvent(new Event('customStylesChanged'));
      }
    }
  };

  const handleBpmChange = (newBpm: number) => {
    const clampedBpm = Math.max(40, Math.min(200, newBpm));
    setEditedStyle(prev => ({ ...prev, bpm: clampedBpm }));
  };

  const handleFillToggle = (checked: boolean) => {
    setShowFill(checked);
  };

  const getVelocityColor = (value: number): string => {
    const idx = VELOCITY_LEVELS.findIndex(v => Math.abs(v - value) < 0.1);
    return VELOCITY_COLORS[idx === -1 ? 0 : idx];
  };

  const availableInstruments = ALL_INSTRUMENTS.filter(i => !activeInstruments.has(i.key));
  const sortedActiveInstruments = ALL_INSTRUMENTS.filter(i => activeInstruments.has(i.key));

  // Group styles for dropdown - use original names for display
  // Filter out duplicates by using a Map keyed by style ID
  const seenIds = new Set<string>();
  const uniqueStyles = allStyles.filter(s => {
    if (seenIds.has(s.id)) return false;
    seenIds.add(s.id);
    return true;
  });
  
  const customStylesList = uniqueStyles.filter(s => isCustomStyle(s.id));
  const builtInStyles = uniqueStyles.filter(s => !isCustomStyle(s.id));
  const stylesByCategory = builtInStyles.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, StylePattern[]>);

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

  const handlePreviewStyle = (e: React.MouseEvent, s: StylePattern) => {
    e.stopPropagation();
    if (previewingStyleId === s.id) {
      stopPreview();
    } else {
      stopLocalPlayback();
      previewStyle(s);
    }
  };

  const handleSelectStyle = (styleId: string) => {
    stopPreview();
    stopLocalPlayback();
    onStyleSelect?.(styleId);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => { stopLocalPlayback(); stopPreview(); onClose(); }}>
        <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b border-border">
            <DialogTitle className="flex items-center gap-3">
              <Drum className="w-5 h-5" />
              
              {/* Rhythm Selector Dropdown - shows ORIGINAL name */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
                    <span className="truncate flex items-center gap-1">
                      {hasOverride && <span className="text-primary">★</span>}
                      {originalStyleName}
                    </span>
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72 max-h-[400px] overflow-y-auto">
                  {/* Custom Styles */}
                  {customStylesList.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-primary">⭐ My Rhythms</DropdownMenuLabel>
                      {customStylesList.map(s => (
                        <DropdownMenuItem
                          key={s.id}
                          className={cn(
                            "cursor-pointer",
                            s.id === style.id && "bg-accent"
                          )}
                          onClick={() => handleSelectStyle(s.id)}
                        >
                          <span className="truncate">{s.name}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  
                  {/* Built-in Styles by Category */}
                  {Object.entries(stylesByCategory).map(([category, styles]) => (
                    <div key={category}>
                      <DropdownMenuLabel>{category}</DropdownMenuLabel>
                      {styles.map(s => {
                        const hasOvr = hasStyleOverride(s.id);
                        return (
                          <DropdownMenuItem
                            key={s.id}
                            className={cn(
                              "cursor-pointer",
                              s.id === style.id && "bg-accent"
                            )}
                            onClick={() => handleSelectStyle(s.id)}
                          >
                            <span className="truncate flex items-center gap-1">
                              {hasOvr && <span className="text-primary text-xs">★</span>}
                              {s.name}
                            </span>
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
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
              
              {/* BPM */}
              <div className="flex items-center gap-2">
                <Label className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">BPM:</Label>
                <Input
                  type="number"
                  value={editedStyle.bpm}
                  onChange={e => handleBpmChange(parseInt(e.target.value) || 120)}
                  className="w-16 sm:w-20 h-8 text-sm"
                  min={40}
                  max={200}
                  placeholder="BPM"
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
                    {['Rock', 'Funk', 'Pop', 'Reggae', 'HipHop', 'Disco', 'Blues', 'Latin', 'Metal', 'Folk', 'Country', 'Jazz', 'Soul', 'Indie', 'LoFi'].map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Playback & Save Controls */}
              <div className="flex items-center gap-1 sm:gap-2 ml-auto">
                {/* Reset to Original button (only for overridden built-ins) */}
                {isEditingBuiltIn && hasOverride && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetToOriginal}
                    className="gap-1 px-2 sm:px-3"
                  >
                    <RotateCw className="w-4 h-4" />
                    <span className="hidden sm:inline">Reset</span>
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
            
            {/* Volume Controls - stacked on mobile */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 ml-auto">
              <div className="flex items-center gap-1 sm:gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground hidden sm:block" />
                <span className="text-[10px] sm:text-xs text-muted-foreground">Dr:</span>
                <Slider
                  value={[editedStyle.volumes.drums * 100]}
                  onValueChange={([v]) => setEditedStyle(prev => ({ ...prev, volumes: { ...prev.volumes, drums: v / 100 } }))}
                  className="w-12 sm:w-16"
                  max={100}
                />
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-[10px] sm:text-xs text-muted-foreground">Ba:</span>
                <Slider
                  value={[editedStyle.volumes.bass * 100]}
                  onValueChange={([v]) => setEditedStyle(prev => ({ ...prev, volumes: { ...prev.volumes, bass: v / 100 } }))}
                  className="w-12 sm:w-16"
                  max={100}
                />
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-[10px] sm:text-xs text-muted-foreground">Pi:</span>
                <Slider
                  value={[editedStyle.volumes.piano * 100]}
                  onValueChange={([v]) => setEditedStyle(prev => ({ ...prev, volumes: { ...prev.volumes, piano: v / 100 } }))}
                  className="w-12 sm:w-16"
                  max={100}
                />
              </div>
            </div>
          </div>
          
          {/* Grid Area */}
          <div className="flex-1 max-h-[50vh] sm:max-h-[400px] overflow-auto">
            <div className="p-2 sm:p-4 min-w-[340px]">
              {/* Beat Markers */}
              <div className="flex mb-2">
                <div className="w-12 sm:w-28 shrink-0" />
                <div className="flex-1 flex">
                  {[1, 2, 3, 4].map(beat => (
                    <div key={beat} className="flex-1 flex">
                      <div className="flex-1 text-center">
                        <span className="text-xs sm:text-sm font-bold text-foreground">{beat}</span>
                      </div>
                      <div className="flex-1" />
                      <div className="flex-1" />
                      <div className="flex-1" />
                    </div>
                  ))}
                </div>
                <div className="w-6 sm:w-16 shrink-0" />
              </div>
              
              {/* Grid Rows */}
              <div className="space-y-0.5 sm:space-y-1">
                {sortedActiveInstruments.map(instrument => {
                  const pattern = showFill 
                    ? editedStyle.fill.pattern[instrument.key] || createEmptyPattern()
                    : editedStyle.rhythm[instrument.key] || createEmptyPattern();
                  const Icon = instrument.icon;
                  
                  return (
                    <div key={instrument.key} className="flex items-center gap-0.5 sm:gap-2">
                      <div className="w-12 sm:w-24 flex items-center gap-0.5 shrink-0 overflow-hidden">
                        <Icon className="w-3 h-3 text-muted-foreground hidden sm:block shrink-0" />
                        <span className="text-[8px] sm:text-xs font-medium truncate">{instrument.label}</span>
                      </div>
                      
                      <div className="flex-1 flex">
                        {[0, 1, 2, 3].map(beatIdx => (
                          <div key={beatIdx} className="flex-1 flex gap-px sm:gap-0.5 px-px sm:px-0.5">
                            {[0, 1, 2, 3].map(subIdx => {
                              const step = beatIdx * 4 + subIdx;
                              const value = pattern[step];
                              const isDownbeat = subIdx === 0;
                              const isCurrentStep = displayStep === step && (isLocalPlaying || isMainPlaying);
                              
                              return (
                                <button
                                  key={step}
                                  onClick={() => handleCellClick(instrument.key, step, showFill)}
                                  onContextMenu={e => handleCellRightClick(e, instrument.key, step, showFill)}
                                  className={cn(
                                    "flex-1 aspect-square rounded-[2px] sm:rounded-sm border transition-all relative flex items-center justify-center min-w-[14px] sm:min-w-[24px] max-w-[32px]",
                                    isDownbeat ? "border-border" : "border-border/40",
                                    isCurrentStep && "ring-1 sm:ring-2 ring-primary ring-offset-0 sm:ring-offset-1 ring-offset-background",
                                    getVelocityColor(value),
                                    value > 0 ? "border-chart-4/50" : ""
                                  )}
                                >
                                  {value > 0 && (
                                    <span className="text-[7px] sm:text-[9px] font-medium text-foreground/80">
                                      {Math.round(value * 100)}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ))}
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
              <span className="text-[10px] sm:text-xs text-muted-foreground">Click: cycle | Right-click: clear</span>
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
            
            <div className="flex items-center gap-2">
              <Switch
                checked={editedStyle.bassSustain || false}
                onCheckedChange={v => setEditedStyle(prev => ({ ...prev, bassSustain: v }))}
                id="bass-sustain"
                className="scale-90 sm:scale-100"
              />
              <Label htmlFor="bass-sustain" className="text-[10px] sm:text-xs cursor-pointer">Bass Sustain</Label>
            </div>
          </div>
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
    </>
  );
}
