import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { ClickSettings } from '@/lib/clickSettings';
import { SettingsGroup, SettingsRow, SwitchControl } from './primitives';
import { MetronomeSettings, SettingsPanel } from './SettingsPanel';

interface ClickProps {
  click: ClickSettings;
  onClickChange: (click: ClickSettings) => void;
  /** This song's own click switch (the transport's), not a setting for every song. */
  metronomeEnabled: boolean;
}

/**
 * Settings, as the app shows them: a page of their own on a phone (full screen, a back arrow),
 * a dialog on a wider screen.
 */
export function SettingsDialog({ open, onOpenChange, ...click }: ClickProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const mobile = useIsMobile();
  const body = <div className="pb-8 pt-3"><SettingsPanel {...click} /></div>;
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          side="bottom"
          className="cp-set h-[100dvh] max-h-[100dvh] gap-0 overflow-y-auto rounded-none border-0 bg-[var(--cp-bg)] p-0 pb-[env(safe-area-inset-bottom)] [&>button.absolute]:hidden"
        >
          <div className="flex h-16 items-center gap-5 px-3">
            <SheetClose className="cp-set-icon-btn" style={{ color: 'var(--cp-tx)' }} aria-label="Back"><ArrowLeft size={22} /></SheetClose>
            <SheetTitle className="text-[22px] font-bold text-[var(--cp-tx)]">Settings</SheetTitle>
          </div>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="cp-set max-h-[88vh] max-w-[640px] gap-0 overflow-y-auto border-0 bg-[var(--cp-bg)] p-0 sm:rounded-2xl">
        <DialogTitle className="px-5 pb-1 pt-5 text-[22px] font-bold text-[var(--cp-tx)]">Settings</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The metronome on its own, from the Click capsule's caret or a long press on it: the click is
 * what you want to adjust while you are listening to it, not three screens away. This song's
 * switch heads it, and "All settings" goes on to the page.
 */
export function MetronomeSheet({ open, onOpenChange, onToggleSong, onAllSettings, ...click }: ClickProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSong: (enabled: boolean) => void;
  onAllSettings: () => void;
}) {
  const mobile = useIsMobile();
  const body: ReactNode = (
    <div className="flex flex-col gap-4 pb-5">
      <SettingsGroup>
        <SettingsRow title="In this song">
          <SwitchControl label="Metronome in this song" on={click.metronomeEnabled} onChange={onToggleSong} />
        </SettingsRow>
      </SettingsGroup>
      <MetronomeSettings {...click} />
      <SettingsGroup>
        <SettingsRow title="All settings" onClick={onAllSettings}>
          <span aria-hidden style={{ color: 'var(--cp-fa)' }}>›</span>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          side="bottom"
          className="cp-set max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl border-0 bg-[var(--cp-bg)] p-0 pb-[env(safe-area-inset-bottom)] [&>button.absolute]:hidden"
        >
          <div className="mx-auto mb-3 mt-2 h-1 w-9 rounded-sm bg-[var(--cp-ln)]" aria-hidden />
          <SheetTitle className="px-5 pb-3.5 text-lg font-bold text-[var(--cp-tx)]">Metronome</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="cp-set max-h-[88vh] max-w-[440px] gap-0 overflow-y-auto border-0 bg-[var(--cp-bg)] p-0 sm:rounded-2xl">
        <DialogTitle className="px-5 pb-3.5 pt-5 text-lg font-bold text-[var(--cp-tx)]">Metronome</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}
