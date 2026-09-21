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
  /** Hide the "My Rhythms" (private, per-user) category — for contexts that should only
   * offer the built-in rhythms everyone can hear/use, e.g. the public song creator. */
  showCustom?: boolean;
  triggerClassName?: string;
  /**
   * `card` is the chord player's Sound card trigger: a 56px slab with the rhythm's icon,
   * its name and its category · tempo. `default` is the plain labelled select.
   */
  variant?: 'default' | 'card';
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
  customStyles = [],
  showCustom = true,
  triggerClassName = 'w-[180px] h-9 bg-secondary border-border',
  variant = 'default',
}: StyleSelectorProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState<string | null>(null);

  const categories = useMemo(
    () => showCustom ? STYLE_CATEGORIES : STYLE_CATEGORIES.filter(c => c.id !== 'Custom'),
    [showCustom],
  );

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
  const isCard = variant === 'card';

  return <>
      <div className={isCard ? '' : 'flex items-center gap-2'}>
        {!isCard && <Music className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
        <Select value={selectedStyleId} onValueChange={onStyleChange}>
          {isCard ? (
            <SelectTrigger
              aria-label="Rhythm style and tempo"
              // line-clamp-none undoes SelectTrigger's own `[&>span]:line-clamp-1`, which
              // would turn the name/meta stack into a -webkit-box and flatten it to one line.
              className="h-14 w-full justify-start gap-3 rounded-xl border px-3.5 pl-2.5 text-left [&>span]:line-clamp-none [&>svg]:opacity-100"
              style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)' }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: 'color-mix(in srgb, var(--cp-ac) 14%, transparent)', color: 'var(--cp-act)' }}
                aria-hidden="true"
              >
                <Music className="h-[18px] w-[18px]" />
              </span>
              <span className="flex min-w-0 flex-grow flex-col gap-0.5">
                <span className="truncate text-sm font-bold">{selectedStyle?.name ?? 'Pick a rhythm'}</span>
                <span className="truncate text-xs" style={{ color: 'var(--cp-mu)' }}>
                  {selectedStyle ? `${selectedStyle.category} · ${selectedStyle.bpm} BPM` : 'Rhythm style'}
                </span>
              </span>
            </SelectTrigger>
          ) : (
            <SelectTrigger aria-label="Rhythm style and tempo" className={triggerClassName}>
              <SelectValue placeholder="Seleccionar estilo" />
            </SelectTrigger>
          )}
          <SelectContent className="bg-popover border-border z-50 max-h-[400px]">
            {categories.map(category => {
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