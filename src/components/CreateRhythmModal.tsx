import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Music, Volume2, Square } from 'lucide-react';
import { type StylePattern, MUSICAL_STYLES } from '@/lib/styles';
import { generateCustomStyleId } from '@/lib/customStyles';
import { useStylePreview } from '@/hooks/useStylePreview';
import { cn } from '@/lib/utils';

interface CreateRhythmModalProps {
  open: boolean;
  onClose: () => void;
  onCreateEmpty: (style: StylePattern) => void;
  onCreateFromTemplate: (style: StylePattern) => void;
  customStyles?: StylePattern[];
}

const CATEGORIES = ['Rock', 'Funk', 'Pop', 'Reggae', 'HipHop', 'Disco', 'Blues', 'Latin', 'Metal', 'Folk', 'Country', 'Jazz', 'Soul', 'Indie', 'LoFi'] as const;

function createEmptyPattern(): number[] {
  return new Array(16).fill(0);
}

function createEmptyStyle(name: string, category: string, bpm: number): StylePattern {
  return {
    id: generateCustomStyleId(),
    name,
    category: category as StylePattern['category'],
    bpm,
    bpmRange: [Math.max(40, bpm - 40), Math.min(200, bpm + 40)],
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
    instrumentSounds: {
      piano: 'sampled',
      bass: 'fender',
      drums: 'standard',
      guitar: 'electric',
    },
  };
}

export function CreateRhythmModal({ open, onClose, onCreateEmpty, onCreateFromTemplate, customStyles = [] }: CreateRhythmModalProps) {
  const [name, setName] = useState('New Rhythm');
  const [category, setCategory] = useState<string>('Pop');
  const [bpm, setBpm] = useState(120);
  const [templateId, setTemplateId] = useState<string>('');
  const [mode, setMode] = useState<'empty' | 'template'>('empty');
  
  const { previewStyle, stopPreview, previewingStyleId } = useStylePreview();

  // Combine built-in and custom styles for templates
  const allTemplates = [...customStyles, ...MUSICAL_STYLES];
  
  // Group templates by category
  const customTemplates = customStyles;
  const builtInByCategory = MUSICAL_STYLES.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, StylePattern[]>);

  const handleCreate = () => {
    stopPreview();
    if (mode === 'empty') {
      const newStyle = createEmptyStyle(name, category, bpm);
      onCreateEmpty(newStyle);
    } else if (templateId) {
      const template = allTemplates.find(s => s.id === templateId);
      if (template) {
        const newStyle: StylePattern = {
          ...JSON.parse(JSON.stringify(template)),
          id: generateCustomStyleId(),
          name,
          category: category as StylePattern['category'],
          bpm,
        };
        onCreateFromTemplate(newStyle);
      }
    }
    // Reset form
    setName('New Rhythm');
    setCategory('Pop');
    setBpm(120);
    setTemplateId('');
    setMode('empty');
  };

  const handleClose = () => {
    stopPreview();
    onClose();
  };

  const handlePreview = (e: React.MouseEvent, style: StylePattern) => {
    e.stopPropagation();
    e.preventDefault();
    if (previewingStyleId === style.id) {
      stopPreview();
    } else {
      previewStyle(style);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Rhythm
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="rhythm-name">Name</Label>
            <Input
              id="rhythm-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Custom Rhythm"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* BPM */}
          <div className="space-y-2">
            <Label htmlFor="rhythm-bpm">BPM</Label>
            <Input
              id="rhythm-bpm"
              type="number"
              value={bpm}
              onChange={e => setBpm(parseInt(e.target.value) || 120)}
              min={40}
              max={200}
            />
          </div>

          {/* Mode Selection */}
          <div className="space-y-3 pt-2">
            <Label>Start from</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'empty' ? 'default' : 'outline'}
                onClick={() => setMode('empty')}
                className="flex-1"
              >
                Empty Pattern
              </Button>
              <Button
                type="button"
                variant={mode === 'template' ? 'default' : 'outline'}
                onClick={() => setMode('template')}
                className="flex-1"
              >
                From Template
              </Button>
            </div>
          </div>

          {/* Template Selection */}
          {mode === 'template' && (
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {/* Custom styles first */}
                  {customTemplates.length > 0 && (
                    <div className="mb-2">
                      <div className="px-2 py-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
                        ⭐ My Rhythms
                      </div>
                      {customTemplates.map(style => (
                        <SelectItem key={style.id} value={style.id} className="relative group">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span>{style.name}</span>
                              <span className="text-xs text-muted-foreground">{style.category} - {style.bpm} BPM</span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  )}
                  
                  {/* Built-in styles by category */}
                  {Object.entries(builtInByCategory).map(([cat, styles]) => (
                    <div key={cat} className="mb-2">
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {cat}
                      </div>
                      {styles.map(style => (
                        <SelectItem key={style.id} value={style.id}>
                          <div className="flex flex-col">
                            <span>{style.name}</span>
                            <span className="text-xs text-muted-foreground">{style.bpm} BPM</span>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Preview button for selected template */}
              {templateId && (
                <div className="flex items-center gap-2 mt-2">
                  {(() => {
                    const selectedTemplate = allTemplates.find(s => s.id === templateId);
                    if (!selectedTemplate) return null;
                    const isPreviewing = previewingStyleId === templateId;
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handlePreview(e, selectedTemplate)}
                        className={cn("gap-2", isPreviewing && "bg-primary/10")}
                      >
                        {isPreviewing ? (
                          <>
                            <Square className="w-3 h-3" />
                            Stop Preview
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            Preview "{selectedTemplate.name}"
                          </>
                        )}
                      </Button>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={!name.trim() || (mode === 'template' && !templateId)}
          >
            <Music className="w-4 h-4 mr-2" />
            Create & Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
