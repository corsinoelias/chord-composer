import { Check } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/** The click's sounds, one to a row; the chosen one in the accent with a tick. */
export function SoundSheet({ open, onOpenChange, sounds, chosen, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sounds: { id: number; label: string }[];
  chosen: number;
  onPick: (id: number) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
          onOpenAutoFocus={(e) => e.preventDefault()}
        side="bottom"
        className="cp-set mx-auto max-w-md gap-0 rounded-t-3xl border-0 bg-[var(--cp-s1)] p-0 pb-[env(safe-area-inset-bottom)] [&>button.absolute]:hidden"
      >
        <div className="mx-auto mb-3.5 mt-2 h-1 w-9 rounded-sm bg-[var(--cp-ln)]" aria-hidden />
        <SheetTitle className="px-5 pb-2 text-lg font-bold text-[var(--cp-tx)]">Sound</SheetTitle>
        <div className="pb-4">
          {sounds.map((sound) => (
            <button
              key={sound.id}
              type="button"
              className="cp-set-row"
              style={{ minHeight: 56, padding: '0 20px', background: 'var(--cp-s1)' }}
              aria-pressed={sound.id === chosen}
              onClick={() => onPick(sound.id)}
            >
              <span className="cp-set-title" style={{ fontSize: 17, color: sound.id === chosen ? 'var(--cp-ac)' : undefined }}>{sound.label}</span>
              {sound.id === chosen && <Check size={22} style={{ color: 'var(--cp-ac)' }} aria-hidden />}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
