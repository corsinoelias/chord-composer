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
import { Music, MoreVertical, Play, Copy, Trash2, Download } from 'lucide-react';

interface SongCardProps {
  song: Song;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
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
  const totalChords = song.sections.reduce((sum, s) => sum + s.chords.length, 0);
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <Card 
      className="group cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onOpen}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Music className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-foreground truncate">{song.title}</h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(song.updatedAt)}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
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
                Export MP3
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {song.bpm} BPM
          </Badge>
          <Badge variant="outline" className="text-xs">
            {totalChords} chords
          </Badge>
          <Badge variant="outline" className="text-xs">
            {formatDuration(duration)}
          </Badge>
        </div>
        
        <p className="mt-2 text-sm text-muted-foreground truncate">
          {chordsPreview}
        </p>
      </CardContent>
    </Card>
  );
});
