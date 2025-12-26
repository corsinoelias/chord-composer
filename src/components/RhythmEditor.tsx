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
  ChevronDown
} from 'lucide-react';
import { StylePattern, MUSICAL_STYLES } from '@/lib/styles';
import { getAudioContext, scheduleProgression, stopPlayback, isCurrentlyPlaying } from '@/lib/audioEngine';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { saveCustomStyle, deleteCustomStyle, getCustomStyles } from '@/lib/customStyles';
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
  isMainPlaying?: boolean; // Is the main player currently playing?
  mainPlayheadStep?: number; // Current step from main player
  onSave?: (style: StylePattern) => void;
  onStyleChange?: (style: StylePattern) => void;
  onStyleSelect?: (styleId: string) => void; // Called when user selects a different style
  onDelete?: (styleId: string) => void; // Called when user deletes a custom style
  onToggleMainPlayback?: () => void; // Toggle main playback from editor
}

const VELOCITY_LEVELS = [0, 0.3, 0.5, 0.7, 1];
const VELOCITY_COLORS = [
  'bg-secondary',
  'bg-chart-4/40',
  'bg-chart-4/60',
  'bg-chart-4/80',
  'bg-chart-4',
];

// Create empty pattern
function createEmptyPattern(): number[] {
  return new Array(16).fill(0);
}

// Deep clone a style
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
  const [isLocalPlaying, setIsLocalPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showFill, setShowFill] = useState(false);
  const [activeInstruments, setActiveInstruments] = useState<Set<InstrumentKey>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState<StylePattern | null>(null);
  
  const playbackRef = useRef<{ cancel: () => void } | null>(null);
  const editedStyleRef = useRef<StylePattern>(editedStyle);
  const showFillRef = useRef(showFill);
  const isInitializedRef = useRef(false);
  const stepAnimationRef = useRef<number | null>(null);
  const loopStartTimeRef = useRef<number>(0);
  
  // Determine if we're synced with main playback
  const isSyncedWithMain = isMainPlaying && !isLocalPlaying;
  const isPlaying = isLocalPlaying || (isMainPlaying && !showFill);
  
  // Get display step - from main when synced, from local when local playing
  const displayStep = isSyncedWithMain && mainPlayheadStep !== undefined 
    ? mainPlayheadStep 
    : currentStep;
  
  // Keep refs in sync for live audio reading
  useEffect(() => {
    editedStyleRef.current = editedStyle;
    onStyleChange?.(editedStyle);
  }, [editedStyle, onStyleChange]);

  useEffect(() => {
    showFillRef.current = showFill;
  }, [showFill]);

  // Initialize from style prop - only when first opening or style changes
  useEffect(() => {
    if (!open) {
      isInitializedRef.current = false;
      return;
    }
    
    // Only initialize once when opening
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    
    const cloned = cloneStyle(style);
    setEditedStyle(cloned);
    editedStyleRef.current = cloned;
    
    // Determine active instruments
    const active = new Set<InstrumentKey>();
    Object.entries(cloned.rhythm).forEach(([key, pattern]) => {
      if (pattern && pattern.some((v: number) => v > 0)) {
        active.add(key as InstrumentKey);
      }
    });
    // Always show basic instruments
    active.add('kick');
    active.add('snare');
    active.add('hihat');
    active.add('bass');
    active.add('piano');
    setActiveInstruments(active);
    
    setShowFill(false);
    setCurrentStep(-1);
  }, [style, open]);

  // Re-initialize when style changes (via dropdown selection)
  useEffect(() => {
    if (open && isInitializedRef.current) {
      const cloned = cloneStyle(style);
      setEditedStyle(cloned);
      editedStyleRef.current = cloned;
      
      // Update active instruments
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

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopLocalPlayback();
    }
  }, [open]);

  // Animate playhead using requestAnimationFrame for smooth movement (only for local playback)
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

  // Start/stop playhead animation for local playback
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

  const startLocalPlayback = useCallback(() => {
    // Stop main playback if running
    if (isMainPlaying && onToggleMainPlayback) {
      onToggleMainPlayback();
    }
    
    stopLocalPlayback();
    
    const ctx = getAudioContext();
    loopStartTimeRef.current = ctx.currentTime + 0.1;
    setIsLocalPlaying(true);
    
    // Create a test section with a single chord using this pattern
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
      onLoopEnd: () => {
        const ctx = getAudioContext();
        loopStartTimeRef.current = ctx.currentTime + 0.05;
      },
      getStyle: () => editedStyleRef.current,
      forceFill: showFillRef.current,
    });
    
    playbackRef.current = { cancel };
  }, [stopLocalPlayback, isMainPlaying, onToggleMainPlayback]);

  // Restart local playback when showFill changes while locally playing
  useEffect(() => {
    if (isLocalPlaying) {
      startLocalPlayback();
    }
  }, [showFill]);

  const togglePlayback = useCallback(() => {
    if (showFill) {
      // In fill mode, always use local playback to preview the fill
      if (isLocalPlaying) {
        stopLocalPlayback();
      } else {
        startLocalPlayback();
      }
    } else {
      // In main pattern mode, toggle main playback for sync
      if (isLocalPlaying) {
        stopLocalPlayback();
      } else if (isMainPlaying) {
        // Stop main playback
        onToggleMainPlayback?.();
      } else {
        // Start main playback to sync
        onToggleMainPlayback?.();
      }
    }
  }, [isLocalPlaying, isMainPlaying, showFill, startLocalPlayback, stopLocalPlayback, onToggleMainPlayback]);

  // Handle cell click - cycle through velocities
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

  // Handle cell right-click - clear
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
    // Don't remove core instruments
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

  const handleSave = () => {
    let styleToSave = editedStyle;
    
    // If editing a built-in style, create a custom copy
    if (!editedStyle.id.startsWith('custom_')) {
      styleToSave = {
        ...editedStyle,
        id: `custom_${Date.now()}`,
        name: editedStyle.name === style.name ? `${editedStyle.name} (Custom)` : editedStyle.name,
      };
    }
    
    // Save to localStorage
    saveCustomStyle(styleToSave);
    
    if (onSave) {
      onSave(styleToSave);
    }
    toast.success(`Rhythm "${styleToSave.name}" saved!`);
    onClose();
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

  // Group styles by category
  const customStylesList = allStyles.filter(s => s.id.startsWith('custom_'));
  const builtInStyles = allStyles.filter(s => !s.id.startsWith('custom_'));
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
      // If we deleted the current style, switch to first available
      if (editedStyle.id === styleToDelete.id) {
        const firstStyle = allStyles.find(s => s.id !== styleToDelete.id) || MUSICAL_STYLES[0];
        onStyleSelect?.(firstStyle.id);
      }
    }
    setDeleteDialogOpen(false);
    setStyleToDelete(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => { stopLocalPlayback(); onClose(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 gap-0">
          <DialogHeader className="p-4 pb-2 border-b border-border">
            <DialogTitle className="flex items-center gap-3">
              <Drum className="w-5 h-5" />
              
              {/* Rhythm Selector Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
                    <span className="truncate">{editedStyle.name}</span>
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64 max-h-[400px] overflow-y-auto">
                  {/* Custom Styles */}
                  {customStylesList.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-primary">⭐ My Rhythms</DropdownMenuLabel>
                      {customStylesList.map(s => (
                        <DropdownMenuItem
                          key={s.id}
                          className={cn(
                            "flex items-center justify-between cursor-pointer",
                            s.id === editedStyle.id && "bg-accent"
                          )}
                          onClick={() => onStyleSelect?.(s.id)}
                        >
                          <span className="truncate">{s.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 ml-2 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteStyle(s);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  
                  {/* Built-in Styles by Category */}
                  {Object.entries(stylesByCategory).map(([category, styles]) => (
                    <div key={category}>
                      <DropdownMenuLabel>{category}</DropdownMenuLabel>
                      {styles.map(s => (
                        <DropdownMenuItem
                          key={s.id}
                          className={cn(
                            "cursor-pointer",
                            s.id === editedStyle.id && "bg-accent"
                          )}
                          onClick={() => onStyleSelect?.(s.id)}
                        >
                          {s.name}
                        </DropdownMenuItem>
                      ))}
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
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col h-full">
            {/* Top Controls */}
            <div className="p-4 border-b border-border bg-card/50 flex flex-wrap items-center gap-4">
              {/* Style Name (editable) */}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Name:</Label>
                <Input
                  value={editedStyle.name}
                  onChange={e => setEditedStyle(prev => ({ ...prev, name: e.target.value }))}
                  className="w-40 h-8"
                />
              </div>
              
              {/* BPM */}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">BPM:</Label>
                <Input
                  type="number"
                  value={editedStyle.bpm}
                  onChange={e => handleBpmChange(parseInt(e.target.value) || 120)}
                  className="w-20 h-8"
                  min={40}
                  max={200}
                />
              </div>
              
              {/* Category */}
              <div className="flex items-center gap-2">
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
              
              {/* Playback Controls */}
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant={(isLocalPlaying || isMainPlaying) ? 'destructive' : 'default'}
                  size="sm"
                  onClick={togglePlayback}
                >
                  {(isLocalPlaying || isMainPlaying) ? <Square className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                  {(isLocalPlaying || isMainPlaying) ? 'Stop' : (showFill ? 'Preview Fill' : 'Play')}
                </Button>
                
                <Button variant="outline" size="sm" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          
          {/* Main/Fill Toggle */}
          <div className="p-3 border-b border-border bg-muted/30 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={showFill}
                onCheckedChange={handleFillToggle}
                id="fill-toggle"
              />
              <Label htmlFor="fill-toggle" className="text-sm cursor-pointer">
                {showFill ? 'Editing Fill Pattern' : 'Editing Main Pattern'}
              </Label>
            </div>
            
            {showFill && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">Fill Position:</Label>
                  <Select 
                    value={editedStyle.fill.position.toString()} 
                    onValueChange={v => setEditedStyle(prev => ({ ...prev, fill: { ...prev.fill, position: parseInt(v) } }))}
                  >
                    <SelectTrigger className="w-24 h-8">
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
                
                <Button variant="ghost" size="sm" onClick={copyMainToFill}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy Main Pattern
                </Button>
              </>
            )}
            
            {/* Volume Controls */}
            <div className="flex items-center gap-4 ml-auto">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Drums:</span>
                <Slider
                  value={[editedStyle.volumes.drums * 100]}
                  onValueChange={([v]) => setEditedStyle(prev => ({ ...prev, volumes: { ...prev.volumes, drums: v / 100 } }))}
                  className="w-16"
                  max={100}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Bass:</span>
                <Slider
                  value={[editedStyle.volumes.bass * 100]}
                  onValueChange={([v]) => setEditedStyle(prev => ({ ...prev, volumes: { ...prev.volumes, bass: v / 100 } }))}
                  className="w-16"
                  max={100}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Piano:</span>
                <Slider
                  value={[editedStyle.volumes.piano * 100]}
                  onValueChange={([v]) => setEditedStyle(prev => ({ ...prev, volumes: { ...prev.volumes, piano: v / 100 } }))}
                  className="w-16"
                  max={100}
                />
              </div>
            </div>
          </div>
          
          {/* Grid Area */}
          <ScrollArea className="flex-1 max-h-[400px]">
            <div className="p-4">
              {/* Beat Markers - Aligned with grid: 1, 2, 3, 4 */}
              <div className="flex mb-2">
                {/* Spacer for instrument labels */}
                <div className="w-28 shrink-0" />
                
                {/* Beat columns - showing 1, 2, 3, 4 aligned above each beat's first cell */}
                <div className="flex-1 flex">
                  {[1, 2, 3, 4].map(beat => (
                    <div key={beat} className="flex-1 flex">
                      <div className="flex-1 text-center">
                        <span className={cn(
                          "text-sm font-bold",
                          "text-foreground"
                        )}>
                          {beat}
                        </span>
                      </div>
                      {/* Empty space for the other 3 subdivisions */}
                      <div className="flex-1" />
                      <div className="flex-1" />
                      <div className="flex-1" />
                    </div>
                  ))}
                </div>
                
                {/* Spacer for row actions */}
                <div className="w-16 shrink-0" />
              </div>
              
              {/* Grid Rows */}
              <div className="space-y-1">
                {sortedActiveInstruments.map(instrument => {
                  const pattern = showFill 
                    ? editedStyle.fill.pattern[instrument.key] || createEmptyPattern()
                    : editedStyle.rhythm[instrument.key] || createEmptyPattern();
                  const Icon = instrument.icon;
                  
                  return (
                    <div key={instrument.key} className="flex items-center gap-2">
                      {/* Instrument Label */}
                      <div className="w-24 flex items-center gap-1 shrink-0">
                        <Icon className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium truncate">{instrument.label}</span>
                      </div>
                      
                      {/* Grid Cells - 16 columns aligned with beats */}
                      <div className="flex-1 flex">
                        {[0, 1, 2, 3].map(beatIdx => (
                          <div key={beatIdx} className="flex-1 flex gap-0.5 px-0.5">
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
                                    "flex-1 aspect-square rounded-sm border transition-all relative flex items-center justify-center min-w-[24px] max-w-[32px]",
                                    isDownbeat ? "border-border" : "border-border/40",
                                    isCurrentStep && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                                    getVelocityColor(value),
                                    value > 0 ? "border-chart-4/50" : ""
                                  )}
                                >
                                  {value > 0 && (
                                    <span className="text-[9px] font-medium text-foreground/80">
                                      {Math.round(value * 100)}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      
                      {/* Row Actions */}
                      <div className="flex items-center gap-1 shrink-0 w-16">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => clearPattern(instrument.key, showFill)}
                          title="Clear pattern"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                        {!['kick', 'snare', 'hihat', 'bass', 'piano'].includes(instrument.key) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => removeInstrument(instrument.key)}
                            title="Remove instrument"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Add Instrument */}
              {availableInstruments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">Add instrument:</span>
                    {availableInstruments.map(instrument => (
                      <Button
                        key={instrument.key}
                        variant="outline"
                        size="sm"
                        onClick={() => addInstrument(instrument.key)}
                        className="h-7 text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        {instrument.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          {/* Footer / Legend */}
          <div className="p-3 border-t border-border bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">Click: cycle velocity | Right-click: clear</span>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Velocity:</span>
                {VELOCITY_LEVELS.slice(1).map((v, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className={cn("w-4 h-4 rounded", VELOCITY_COLORS[i + 1])} />
                    <span className="text-[10px] text-muted-foreground">{Math.round(v * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editedStyle.bassSustain || false}
                  onCheckedChange={v => setEditedStyle(prev => ({ ...prev, bassSustain: v }))}
                  id="bass-sustain"
                />
                <Label htmlFor="bass-sustain" className="text-xs cursor-pointer">Bass Sustain</Label>
              </div>
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
  </>
  );
}
