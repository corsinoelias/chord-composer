import { useState, memo, useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { MUSICAL_STYLES, type StylePattern } from '@/lib/styles';
import { getCustomStyles, deleteCustomStyle, getStyleOverride } from '@/lib/customStyles';
import { Music, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface StyleSelectorProps {
  selectedStyleId: string;
  onStyleChange: (styleId: string) => void;
  onCreateNew?: () => void;
  onEditStyle?: (styleId: string) => void;
  customStyles?: StylePattern[];
}

// Group styles by category for the dropdown
const STYLE_CATEGORIES = [{
  id: 'Custom',
  label: '⭐ My Rhythms'
}, {
  id: 'Rock',
  label: 'Rock'
}, {
  id: 'Funk',
  label: 'Funk'
}, {
  id: 'Pop',
  label: 'Pop'
}, {
  id: 'Folk',
  label: 'Folk / Acústico'
}, {
  id: 'Country',
  label: 'Country'
}, {
  id: 'Reggae',
  label: 'Reggae'
}, {
  id: 'HipHop',
  label: 'Hip Hop'
}, {
  id: 'LoFi',
  label: 'Lo-Fi'
}, {
  id: 'Disco',
  label: 'Disco'
}, {
  id: 'Soul',
  label: 'Soul / R&B'
}, {
  id: 'Blues',
  label: 'Blues'
}, {
  id: 'Jazz',
  label: 'Jazz'
}, {
  id: 'Latin',
  label: 'Latino'
}, {
  id: 'Indie',
  label: 'Indie / Dream Pop'
}, {
  id: 'Metal',
  label: 'Metal'
}, {
  id: 'Gospel',
  label: 'Gospel'
}] as const;

export const StyleSelector = memo(function StyleSelector({
  selectedStyleId,
  onStyleChange,
  onCreateNew,
  onEditStyle,
  customStyles = []
}: StyleSelectorProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState<string | null>(null);

  // Memoize built-in styles with overrides to prevent recalculation
  const builtInWithOverrides = useMemo(() => {
    return MUSICAL_STYLES.map(s => {
      const override = getStyleOverride(s.id);
      return override || s;
    });
  }, []);

  const allStyles = useMemo(() => [...builtInWithOverrides, ...customStyles], [builtInWithOverrides, customStyles]);
  const selectedStyle = useMemo(() => allStyles.find(s => s.id === selectedStyleId), [allStyles, selectedStyleId]);

  const handleDeleteClick = useCallback((e: React.MouseEvent, styleId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setStyleToDelete(styleId);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (styleToDelete) {
      deleteCustomStyle(styleToDelete);
      toast.success('Rhythm deleted');
      // If the deleted style was selected, switch to first available
      if (selectedStyleId === styleToDelete) {
        onStyleChange(MUSICAL_STYLES[0].id);
      }
      // Force re-render by triggering state change
      window.dispatchEvent(new Event('customStylesChanged'));
    }
    setDeleteDialogOpen(false);
    setStyleToDelete(null);
  }, [styleToDelete, selectedStyleId, onStyleChange]);
  return <>
      <div className="flex items-center gap-2">
        <Music className="w-4 h-4 text-muted-foreground" />
        <Select value={selectedStyleId} onValueChange={onStyleChange}>
          <SelectTrigger className="w-[180px] h-9 bg-secondary border-border">
            <SelectValue placeholder="Seleccionar estilo" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50 max-h-[400px]">
            {STYLE_CATEGORIES.map(category => {
            // For custom category, use customStyles prop; for built-in, apply overrides
            const stylesInCategory = category.id === 'Custom' 
              ? customStyles 
              : builtInWithOverrides.filter(s => s.category === category.id);
            if (stylesInCategory.length === 0 && category.id !== 'Custom') return null;
            return <div key={category.id}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                    <span>{category.label}</span>
                    {category.id === 'Custom' && onCreateNew && <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                  onCreateNew();
                }}>
                        <Plus className="w-3 h-3" />
                      </Button>}
                  </div>
                  {stylesInCategory.length === 0 && category.id === 'Custom' && <div className="px-4 py-2 text-xs text-muted-foreground italic">
                      No custom rhythms yet
                    </div>}
                  {stylesInCategory.map(style => <SelectItem key={style.id} value={style.id} className="pl-4">
                      <div className="flex flex-col">
                        <span>{style.name}</span>
                        <span className="text-[10px] text-muted-foreground">{style.bpm} BPM</span>
                      </div>
                    </SelectItem>)}
                </div>;
          })}
          </SelectContent>
        </Select>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rhythm?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The custom rhythm will be permanently deleted.
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
    </>;
});