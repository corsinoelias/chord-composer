import { memo } from 'react';
import { Song, getSongDuration, formatDuration, getChordsPreview } from '@/lib/songs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, Play, Copy, Trash2, Download, Clock, Music2, Layers } from 'lucide-react';

interface SongCardProps {
  song: Song;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
}

// Gradient colors for song cards based on song id hash
const CARD_GRADIENTS = [
  'from-violet-500/10 to-purple-500/5',
  'from-cyan-500/10 to-teal-500/5',
  'from-amber-500/10 to-orange-500/5',
  'from-pink-500/10 to-rose-500/5',
  'from-blue-500/10 to-indigo-500/5',
  'from-emerald-500/10 to-green-500/5',
];

function getGradientIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % CARD_GRADIENTS.length;
}

export const SongCard = memo(function SongCard({
  song,
  onOpen,
  onDuplicate,
  onDelete,
  onExport,
}: SongCardProps) {
  const duration = getSongDuration(song);
  const chordsPreview = getChordsPreview(song);
  const gradientClass = CARD_GRADIENTS[getGradientIndex(song.id)];
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <Card 
      className="group cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden border-border/50"
      onClick={onOpen}
    >
      {/* Gradient header */}
      <div className={`h-1.5 bg-gradient-to-r ${gradientClass}`} />
      
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradientClass} flex items-center justify-center flex-shrink-0 border border-border/30`}>
              <Music2 className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {song.title}
              </h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                {formatDate(song.updatedAt)}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onOpen}>
                <Play className="h-4 w-4 mr-2" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Stats row - minimal and clear */}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{song.bpm} bpm</span>
          <span className="text-border">·</span>
          <span>{formatDuration(duration)}</span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {song.sections.length}
          </span>
        </div>
        
        {/* Chord preview */}
        {chordsPreview && (
          <div className="mt-3 p-2 rounded-lg bg-secondary/30 border border-border/30">
            <p className="text-xs text-muted-foreground font-mono truncate">
              {chordsPreview}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});