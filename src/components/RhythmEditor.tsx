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
  Music
} from 'lucide-react';
import { StylePattern, MUSICAL_STYLES } from '@/lib/styles';
import { getAudioContext, scheduleProgression, stopPlayback } from '@/lib/audioEngine';
import { getDefaultInstrumentStates } from '@/lib/instruments';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  style: StylePattern | null;
  onSave?: (style: StylePattern) => void;
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

// Create empty style template
function createEmptyStyle(): StylePattern {
  return {
    id: `custom_${Date.now()}`,
    name: 'New Rhythm',
    category: 'Pop',
    bpm: 120,
    bpmRange: [80, 160],
    description: 'Custom rhythm pattern',
    rhythm: {
      kick: createEmptyPattern(),
      snare: createEmptyPattern(),
      hihat: createEmptyPattern(),
      bass: createEmptyPattern(),
      piano: createEmptyPattern(),
    },
    fill: {
      position: 12,
      pattern: {},
    },
    volumes: { piano: 0.7, bass: 0.8, drums: 0.75 },
  };
}

// Deep clone a style
function cloneStyle(style: StylePattern): StylePattern {
  return JSON.parse(JSON.stringify(style));
}

export function RhythmEditor({ open, onClose, style, onSave }: RhythmEditorProps) {
  const [editedStyle, setEditedStyle] = useState<StylePattern>(createEmptyStyle());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showFill, setShowFill] = useState(false);
  const [activeInstruments, setActiveInstruments] = useState<Set<InstrumentKey>>(new Set());
  
  const playbackRef = useRef<{ cancel: () => void } | null>(null);
  const stepIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Initialize from style prop
  useEffect(() => {
    if (style) {
      const cloned = cloneStyle(style);
      setEditedStyle(cloned);
      
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
    } else {
      setEditedStyle(createEmptyStyle());
      setActiveInstruments(new Set(['kick', 'snare', 'hihat', 'bass', 'piano']));
    }
    setShowFill(false);
    setCurrentStep(-1);
  }, [style, open]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopPatternPlayback();
    }
  }, [open]);

  const stopPatternPlayback = useCallback(() => {
    if (playbackRef.current) {
      playbackRef.current.cancel();
      playbackRef.current = null;
    }
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
    stopPlayback();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  const startPatternPlayback = useCallback(() => {
    stopPatternPlayback();
    
    getAudioContext();
    setIsPlaying(true);
    startTimeRef.current = performance.now();
    
    // Calculate step duration in ms
    const stepDuration = (60 / editedStyle.bpm / 4) * 1000; // 16th note duration
    
    // Create a test section with a single chord using this pattern
    const testSection = {
      id: 'test',
      name: 'Test',
      chords: [{ id: '1', root: 'C' as const, accidental: '' as const, quality: 'maj' as const, duration: 4 }],
      repeatCount: 1
    };
    
    const instruments = getDefaultInstrumentStates();
    
    const { cancel } = scheduleProgression([testSection], editedStyle.bpm, {
      loop: true,
      metronome: false,
      instruments,
      style: editedStyle,
      transposition: 0,
      onChordChange: () => {},
      onLoopEnd: () => {
        startTimeRef.current = performance.now();
      },
    });
    
    playbackRef.current = { cancel };
    
    // Visual playhead update
    stepIntervalRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startTimeRef.current;
      const step = Math.floor(elapsed / stepDuration) % 16;
      setCurrentStep(step);
    }, stepDuration / 2);
  }, [editedStyle, stopPatternPlayback]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPatternPlayback();
    } else {
      startPatternPlayback();
    }
  }, [isPlaying, startPatternPlayback, stopPatternPlayback]);

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
    if (onSave) {
      onSave(editedStyle);
      toast.success('Rhythm saved!');
    }
    onClose();
  };

  const getVelocityColor = (value: number): string => {
    const idx = VELOCITY_LEVELS.findIndex(v => Math.abs(v - value) < 0.1);
    return VELOCITY_COLORS[idx === -1 ? 0 : idx];
  };

  const availableInstruments = ALL_INSTRUMENTS.filter(i => !activeInstruments.has(i.key));
  const sortedActiveInstruments = ALL_INSTRUMENTS.filter(i => activeInstruments.has(i.key));

  return (
    <Dialog open={open} onOpenChange={() => { stopPatternPlayback(); onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Drum className="w-5 h-5" />
            Rhythm Editor
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col h-full">
          {/* Top Controls */}
          <div className="p-4 border-b border-border bg-card/50 flex flex-wrap items-center gap-4">
            {/* Style Name */}
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
                onChange={e => {
                  const newBpm = Math.max(40, Math.min(200, parseInt(e.target.value) || 120));
                  setEditedStyle(prev => ({ ...prev, bpm: newBpm }));
                }}
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
                variant={isPlaying ? 'destructive' : 'default'}
                size="sm"
                onClick={togglePlayback}
              >
                {isPlaying ? <Square className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                {isPlaying ? 'Stop' : 'Play'}
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
                onCheckedChange={setShowFill}
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
              {/* Beat Markers */}
              <div className="flex mb-2 ml-28">
                {[1, 2, 3, 4].map(beat => (
                  <div key={beat} className="flex-1 text-center">
                    <span className="text-xs font-medium text-muted-foreground">Beat {beat}</span>
                    <div className="flex justify-between px-1">
                      {['1', 'e', '&', 'a'].map((sub, i) => (
                        <span key={i} className="text-[10px] text-muted-foreground/60 w-8 text-center">{sub}</span>
                      ))}
                    </div>
                  </div>
                ))}
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
                      
                      {/* Grid Cells */}
                      <div className="flex gap-0.5 flex-1">
                        {pattern.map((value, step) => {
                          const isDownbeat = step % 4 === 0;
                          const isCurrentStep = currentStep === step && isPlaying;
                          
                          return (
                            <button
                              key={step}
                              onClick={() => handleCellClick(instrument.key, step, showFill)}
                              onContextMenu={e => handleCellRightClick(e, instrument.key, step, showFill)}
                              className={cn(
                                "w-8 h-8 rounded-sm border transition-all relative",
                                isDownbeat ? "border-border" : "border-border/50",
                                isCurrentStep && "ring-2 ring-primary ring-offset-1",
                                getVelocityColor(value),
                                value > 0 ? "border-chart-4/50" : ""
                              )}
                            >
                              {value > 0 && (
                                <span className="text-[9px] font-medium text-foreground/70">
                                  {Math.round(value * 100)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* Row Actions */}
                      <div className="flex items-center gap-1 shrink-0">
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
  );
}
