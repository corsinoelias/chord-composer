import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MUSICAL_STYLES, StylePattern } from '@/lib/styles';
import { Music } from 'lucide-react';

interface StyleSelectorProps {
  selectedStyleId: string;
  onStyleChange: (styleId: string) => void;
}

// Group styles by category for the dropdown
const STYLE_CATEGORIES = [
  { id: 'Rock', label: 'Rock' },
  { id: 'Funk', label: 'Funk' },
  { id: 'Pop', label: 'Pop' },
  { id: 'Folk', label: 'Folk / Acústico' },
  { id: 'Country', label: 'Country' },
  { id: 'Reggae', label: 'Reggae' },
  { id: 'HipHop', label: 'Hip Hop' },
  { id: 'LoFi', label: 'Lo-Fi' },
  { id: 'Disco', label: 'Disco' },
  { id: 'Soul', label: 'Soul / R&B' },
  { id: 'Blues', label: 'Blues' },
  { id: 'Jazz', label: 'Jazz' },
  { id: 'Latin', label: 'Latino' },
  { id: 'Indie', label: 'Indie / Dream Pop' },
  { id: 'Metal', label: 'Metal' },
] as const;

export function StyleSelector({ selectedStyleId, onStyleChange }: StyleSelectorProps) {
  const selectedStyle = MUSICAL_STYLES.find(s => s.id === selectedStyleId);

  return (
    <div className="flex items-center gap-2">
      <Music className="w-4 h-4 text-muted-foreground" />
      <Select value={selectedStyleId} onValueChange={onStyleChange}>
        <SelectTrigger className="w-[160px] h-9 bg-secondary border-border">
          <SelectValue placeholder="Seleccionar estilo" />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border z-50 max-h-[400px]">
          {STYLE_CATEGORIES.map(category => {
            const stylesInCategory = MUSICAL_STYLES.filter(s => s.category === category.id);
            if (stylesInCategory.length === 0) return null;
            
            return (
              <div key={category.id}>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {category.label}
                </div>
                {stylesInCategory.map(style => (
                  <SelectItem key={style.id} value={style.id} className="pl-4">
                    <div className="flex flex-col">
                      <span>{style.name}</span>
                      <span className="text-[10px] text-muted-foreground">{style.bpm} BPM</span>
                    </div>
                  </SelectItem>
                ))}
              </div>
            );
          })}
        </SelectContent>
      </Select>
      {selectedStyle && (
        <span className="text-xs text-muted-foreground hidden md:inline max-w-[200px] truncate">
          {selectedStyle.description}
        </span>
      )}
    </div>
  );
}
