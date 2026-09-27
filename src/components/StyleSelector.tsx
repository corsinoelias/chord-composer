import { useState, memo, useMemo, useCallback, useEffect } from 'react';
import { ChevronDown, Music } from 'lucide-react';
import { toast } from 'sonner';
import { MUSICAL_STYLES, getStyleById, type StylePattern } from '@/lib/styles';
import { deleteCustomStyle, getStyleOverride } from '@/lib/customStyles';
import { ensureAppStyles, isAppStyleId } from '@/lib/appStyles';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RhythmBrowser, styleDotColor, type AppStyleApply } from './RhythmBrowser';

export type { AppStyleApply };

interface StyleSelectorProps {
  selectedStyleId: string;
  /** [apply] comes with a rhythm of the app's: what its sheet was answered with. */
  onStyleChange: (styleId: string, apply?: AppStyleApply) => void;
  onCreateNew?: () => void;
  onEditStyle?: (styleId: string) => void;
  customStyles?: StylePattern[];
  /** Hide the "My Rhythms" (private, per-user) category — for contexts that should only
   * offer the built-in rhythms everyone can hear/use, e.g. the public song creator. */
  showCustom?: boolean;
  /** Offer the app's rhythms and the rhythm library as well (the chord player does). */
  showAppStyles?: boolean;
  /** The song's tempo, for the question "use the rhythm's own?". */
  songBpm?: number;
  triggerClassName?: string;
  /**
   * `card` is the chord player's Sound card trigger: a 56px slab with the rhythm's icon,
   * its name and its category · tempo. `default` is the plain labelled button.
   * `pill`: the Android app's style capsule — a colour dot, the name, a chevron.
   */
  variant?: 'default' | 'card' | 'pill';
}

export const StyleSelector = memo(function StyleSelector({
  selectedStyleId,
  onStyleChange,
  customStyles = [],
  showCustom = true,
  showAppStyles = false,
  songBpm,
  triggerClassName = 'w-[180px] h-9 bg-secondary border-border',
  variant = 'default',
}: StyleSelectorProps) {
  const [open, setOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState<string | null>(null);
  // A song on one of the app's rhythms names it before the list is loaded: the trigger
  // shows its name once it is.
  const [, setAppStylesLoaded] = useState(0);
  useEffect(() => {
    if (isAppStyleId(selectedStyleId)) ensureAppStyles().then(() => setAppStylesLoaded((n) => n + 1)).catch(() => {});
  }, [selectedStyleId]);

  // Built-in styles with your retouches applied.
  const builtIn = useMemo(() => MUSICAL_STYLES.map((s) => getStyleOverride(s.id) || s), []);
  const selectedStyle = customStyles.find((s) => s.id === selectedStyleId)
    ?? builtIn.find((s) => s.id === selectedStyleId)
    ?? getStyleById(selectedStyleId);
  const meta = selectedStyle ? `${selectedStyle.category} · ${selectedStyle.bpm} BPM` : 'Rhythm style';

  const confirmDelete = useCallback(() => {
    if (styleToDelete) {
      deleteCustomStyle(styleToDelete);
      toast.success('Rhythm deleted');
      if (selectedStyleId === styleToDelete) onStyleChange(MUSICAL_STYLES[0].id);
      window.dispatchEvent(new Event('customStylesChanged'));
    }
    setStyleToDelete(null);
  }, [styleToDelete, selectedStyleId, onStyleChange]);

  const trigger = variant === 'pill' ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Rhythm style"
      className="cp-cap h-9 w-full justify-between gap-2 rounded-full px-3 text-left"
      style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
    >
      <span className="flex min-w-0 items-center gap-[7px]">
        <span className="cp-dt" style={{ background: styleDotColor(selectedStyleId) }} aria-hidden="true" />
        <span className="truncate">{selectedStyle?.name ?? 'Pick a rhythm'}</span>
      </span>
      <ChevronDown size={16} style={{ opacity: 0.6 }} aria-hidden="true" />
    </button>
  ) : variant === 'card' ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Rhythm style and tempo"
      className="flex h-14 w-full items-center gap-3 rounded-xl border px-3.5 pl-2.5 text-left"
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
        <span className="truncate text-xs" style={{ color: 'var(--cp-mu)' }}>{meta}</span>
      </span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
  ) : (
    <div className="flex items-center gap-2">
      <Music className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Rhythm style and tempo"
        className={`flex items-center justify-between gap-2 rounded-md border px-3 text-left text-sm ${triggerClassName}`}
      >
        <span className="truncate">{selectedStyle?.name ?? 'Seleccionar estilo'}</span>
        <ChevronDown size={15} style={{ opacity: 0.5 }} aria-hidden="true" />
      </button>
    </div>
  );

  return <>
      {trigger}
      <RhythmBrowser
        open={open}
        onOpenChange={setOpen}
        selectedStyleId={selectedStyleId}
        builtIn={builtIn}
        customStyles={customStyles}
        showCustom={showCustom}
        showAppStyles={showAppStyles}
        songBpm={songBpm}
        onStyleChange={onStyleChange}
        onDeleteCustom={showCustom ? setStyleToDelete : undefined}
      />

      <AlertDialog open={!!styleToDelete} onOpenChange={(v) => { if (!v) setStyleToDelete(null); }}>
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
