import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MUSICAL_STYLES, StylePattern } from '@/lib/styles';
import { Music } from 'lucide-react';

interface StyleSelectorProps {
  selectedStyleId: string;
  onStyleChange: (styleId: string) => void;
}

export function StyleSelector({ selectedStyleId, onStyleChange }: StyleSelectorProps) {
  const selectedStyle = MUSICAL_STYLES.find(s => s.id === selectedStyleId);

  // Group styles by category
  const categories = ['Pop', 'Rock', 'Jazz', 'Blues', 'Ballad'] as const;

  return (
    <div className="flex items-center gap-2">
      <Music className="w-4 h-4 text-muted-foreground" />
      <Select value={selectedStyleId} onValueChange={onStyleChange}>
        <SelectTrigger className="w-[140px] h-9 bg-secondary border-border">
          <SelectValue placeholder="Select style" />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border z-50">
          {categories.map(category => (
            <div key={category}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {category}
              </div>
              {MUSICAL_STYLES.filter(s => s.category === category).map(style => (
                <SelectItem key={style.id} value={style.id}>
                  {style.name}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
      {selectedStyle && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {selectedStyle.description}
        </span>
      )}
    </div>
  );
}
