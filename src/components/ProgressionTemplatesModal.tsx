/**
 * Progression Templates Modal
 * 
 * Allows users to quickly load famous chord progressions:
 * - Pop: I-V-vi-IV (C-G-Am-F)
 * - Blues 12-bar
 * - Jazz ii-V-I
 * - And more...
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chord, generateChordId } from '@/lib/musicTheory';
import { Music2, Play } from 'lucide-react';

interface ProgressionTemplate {
  id: string;
  name: string;
  genre: string;
  description: string;
  chords: Omit<Chord, 'id'>[];
  examples: string[];
}

const TEMPLATES: ProgressionTemplate[] = [
  {
    id: 'pop-1564',
    name: 'Pop I-V-vi-IV',
    genre: 'Pop/Rock',
    description: 'The most popular progression in modern pop music',
    chords: [
      { root: 'C', accidental: '', quality: 'maj', duration: 4 },
      { root: 'G', accidental: '', quality: 'maj', duration: 4 },
      { root: 'A', accidental: '', quality: 'min', duration: 4 },
      { root: 'F', accidental: '', quality: 'maj', duration: 4 },
    ],
    examples: ['Let It Be', 'No Woman No Cry', 'With or Without You'],
  },
  {
    id: 'blues-12bar',
    name: 'Blues 12-Bar',
    genre: 'Blues/Rock',
    description: 'The classic 12-bar blues progression',
    chords: [
      { root: 'A', accidental: '', quality: '7', duration: 4 },
      { root: 'A', accidental: '', quality: '7', duration: 4 },
      { root: 'A', accidental: '', quality: '7', duration: 4 },
      { root: 'A', accidental: '', quality: '7', duration: 4 },
      { root: 'D', accidental: '', quality: '7', duration: 4 },
      { root: 'D', accidental: '', quality: '7', duration: 4 },
      { root: 'A', accidental: '', quality: '7', duration: 4 },
      { root: 'A', accidental: '', quality: '7', duration: 4 },
      { root: 'E', accidental: '', quality: '7', duration: 4 },
      { root: 'D', accidental: '', quality: '7', duration: 4 },
      { root: 'A', accidental: '', quality: '7', duration: 4 },
      { root: 'E', accidental: '', quality: '7', duration: 4 },
    ],
    examples: ['Sweet Home Chicago', 'Pride and Joy', 'Rock and Roll'],
  },
  {
    id: 'jazz-251',
    name: 'Jazz ii-V-I',
    genre: 'Jazz',
    description: 'The fundamental jazz cadence',
    chords: [
      { root: 'D', accidental: '', quality: 'min7', duration: 4 },
      { root: 'G', accidental: '', quality: '7', duration: 4 },
      { root: 'C', accidental: '', quality: 'maj7', duration: 8 },
    ],
    examples: ['Autumn Leaves', 'All The Things You Are', 'Fly Me To The Moon'],
  },
  {
    id: 'sad-6415',
    name: 'Emotional vi-IV-I-V',
    genre: 'Pop/Ballad',
    description: 'A melancholic, emotional progression',
    chords: [
      { root: 'A', accidental: '', quality: 'min', duration: 4 },
      { root: 'F', accidental: '', quality: 'maj', duration: 4 },
      { root: 'C', accidental: '', quality: 'maj', duration: 4 },
      { root: 'G', accidental: '', quality: 'maj', duration: 4 },
    ],
    examples: ['Numb', 'Someone Like You', 'Hello'],
  },
  {
    id: 'rock-1-b7-4',
    name: 'Rock I-♭VII-IV',
    genre: 'Rock',
    description: 'Classic rock progression with ♭VII',
    chords: [
      { root: 'A', accidental: '', quality: 'maj', duration: 4 },
      { root: 'G', accidental: '', quality: 'maj', duration: 4 },
      { root: 'D', accidental: '', quality: 'maj', duration: 4 },
      { root: 'A', accidental: '', quality: 'maj', duration: 4 },
    ],
    examples: ['Sweet Child O Mine', 'Free Fallin', 'Knockin on Heaven\'s Door'],
  },
  {
    id: 'andalusian',
    name: 'Andalusian Cadence',
    genre: 'Flamenco/Latin',
    description: 'Descending minor progression from Spain',
    chords: [
      { root: 'A', accidental: '', quality: 'min', duration: 4 },
      { root: 'G', accidental: '', quality: 'maj', duration: 4 },
      { root: 'F', accidental: '', quality: 'maj', duration: 4 },
      { root: 'E', accidental: '', quality: 'maj', duration: 4 },
    ],
    examples: ['Hit The Road Jack', 'Smooth', 'Stairway to Heaven (verse)'],
  },
  {
    id: 'canon-progression',
    name: 'Canon / Pachelbel',
    genre: 'Classical/Pop',
    description: 'The timeless Pachelbel Canon progression',
    chords: [
      { root: 'C', accidental: '', quality: 'maj', duration: 4 },
      { root: 'G', accidental: '', quality: 'maj', duration: 4 },
      { root: 'A', accidental: '', quality: 'min', duration: 4 },
      { root: 'E', accidental: '', quality: 'min', duration: 4 },
      { root: 'F', accidental: '', quality: 'maj', duration: 4 },
      { root: 'C', accidental: '', quality: 'maj', duration: 4 },
      { root: 'F', accidental: '', quality: 'maj', duration: 4 },
      { root: 'G', accidental: '', quality: 'maj', duration: 4 },
    ],
    examples: ['Basket Case', 'Graduation', 'Hook'],
  },
  {
    id: 'reggae',
    name: 'Reggae I-IV',
    genre: 'Reggae',
    description: 'Classic reggae two-chord progression',
    chords: [
      { root: 'G', accidental: '', quality: 'maj', duration: 4 },
      { root: 'C', accidental: '', quality: 'maj', duration: 4 },
      { root: 'G', accidental: '', quality: 'maj', duration: 4 },
      { root: 'C', accidental: '', quality: 'maj', duration: 4 },
    ],
    examples: ['Three Little Birds', 'Jamming', 'Is This Love'],
  },
];

interface ProgressionTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (chords: Chord[]) => void;
}

export function ProgressionTemplatesModal({
  open,
  onOpenChange,
  onSelect,
}: ProgressionTemplatesModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (template: ProgressionTemplate) => {
    const chords = template.chords.map(chord => ({
      ...chord,
      id: generateChordId(),
    }));
    onSelect(chords);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" />
            Chord Progression Templates
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 mt-4">
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              className={`
                p-4 rounded-lg border-2 cursor-pointer transition-all
                ${selectedId === template.id 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
                }
              `}
              onClick={() => setSelectedId(template.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">
                      {template.name}
                    </h3>
                    <Badge variant="secondary" className="text-xs">
                      {template.genre}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {template.description}
                  </p>
                  
                  {/* Chord preview */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {template.chords.slice(0, 8).map((chord, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-xs font-mono bg-secondary text-secondary-foreground"
                      >
                        {chord.root}{chord.accidental}{chord.quality === 'maj' ? '' : chord.quality}
                      </span>
                    ))}
                    {template.chords.length > 8 && (
                      <span className="text-xs text-muted-foreground">
                        +{template.chords.length - 8} more
                      </span>
                    )}
                  </div>
                  
                  {/* Examples */}
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Examples:</span> {template.examples.join(', ')}
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(template);
                  }}
                  className="shrink-0"
                >
                  <Play className="h-4 w-4 mr-1" />
                  Use
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
