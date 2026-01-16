import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Music2, Plus, Sparkles, ArrowRight } from 'lucide-react';

interface EmptyStateProps {
  onCreateSong: () => void;
}

export const EmptyState = memo(function EmptyState({ onCreateSong }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      {/* Animated icon container */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center border border-primary/20">
          <Music2 className="w-12 h-12 text-primary" />
        </div>
        
        {/* Floating sparkles */}
        <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-primary/60 animate-pulse" />
        <Sparkles className="absolute -bottom-1 -left-3 w-5 h-5 text-primary/40 animate-pulse delay-300" />
      </div>
      
      <h2 className="text-2xl font-bold text-foreground mb-3">
        Welcome to Chord Player
      </h2>
      
      <p className="text-muted-foreground mb-8 max-w-md leading-relaxed">
        Create beautiful chord progressions, experiment with different rhythms, 
        and export your creations as audio files.
      </p>
      
      <Button onClick={onCreateSong} size="lg" className="gap-2 shadow-lg hover:shadow-xl transition-shadow">
        <Plus className="h-5 w-5" />
        Create Your First Song
        <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
      
      {/* Feature highlights */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl">
        {[
          { title: 'Easy Editing', desc: 'Drag and drop chords to rearrange' },
          { title: 'Multiple Styles', desc: 'Rock, pop, jazz, and more' },
          { title: 'Quick Export', desc: 'Download as audio file' },
        ].map((feature) => (
          <div 
            key={feature.title}
            className="p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors"
          >
            <h3 className="font-medium text-foreground mb-1">{feature.title}</h3>
            <p className="text-sm text-muted-foreground">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
});
