import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Music, Plus } from 'lucide-react';

interface EmptyStateProps {
  onCreateSong: () => void;
}

export const EmptyState = memo(function EmptyState({ onCreateSong }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <Music className="w-10 h-10 text-primary" />
      </div>
      
      <h2 className="text-xl font-semibold text-foreground mb-2">
        No songs yet
      </h2>
      
      <p className="text-muted-foreground mb-6 max-w-sm">
        Start creating your first chord progression. You can save multiple songs and come back to them anytime.
      </p>
      
      <Button onClick={onCreateSong} size="lg">
        <Plus className="h-5 w-5 mr-2" />
        Create Your First Song
      </Button>
    </div>
  );
});
