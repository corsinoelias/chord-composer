import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';

interface AccountPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** User agreed — proceed to the real sign-up/sign-in form. */
  onContinue: () => void;
}

// Shown before AuthModal itself, the first time someone tries to save without an
// account — explains *why* an account is needed before dropping them into a form,
// rather than surprising them with a login screen out of nowhere. Same gradient-header
// visual language the first-time guided tour uses, so it feels like part of the app
// rather than a generic browser-style auth prompt.
export function AccountPromptModal({ open, onOpenChange, onContinue }: AccountPromptModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm p-0 gap-0 overflow-hidden">
        <div className="relative h-28 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30">
            <Save className="w-7 h-7 text-primary" />
          </div>
        </div>

        <div className="p-6 text-center">
          <DialogTitle asChild>
            <h2 className="text-xl font-semibold text-foreground mb-2">Save your song</h2>
          </DialogTitle>
          <p className="text-sm text-muted-foreground mb-6">
            Create a free account to save and share your songs.
          </p>

          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
              Not now
            </Button>
            <Button className="flex-1" onClick={onContinue}>
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
