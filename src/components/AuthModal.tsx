import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { signInWithEmail, signUpWithEmail } from '@/lib/supabase';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Which entry point opened this modal (e.g. 'save_cta', 'export_nudge') — tags the resulting analytics events so conversion can be compared per entry point. */
  source?: string;
}

// Every field in this form is required — the native `required` attribute
// already tells assistive tech that; the asterisk is purely a visual cue for
// sighted users, so it's aria-hidden to avoid a redundant "star" announcement.
function RequiredMark() {
  return <span aria-hidden="true" className="text-destructive"> *</span>;
}

export function AuthModal({ open, onOpenChange, onSuccess, source }: AuthModalProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const passwordsMismatch = mode === 'sign-up' && confirmPassword.length > 0 && password !== confirmPassword;
  const showMismatchError = passwordsMismatch && confirmTouched;

  const reset = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setConfirmTouched(false);
    setDisplayName('');
    setCheckEmail(false);
  };

  const handleOpenChange = (next: boolean) => {
    // Only reachable via user-initiated dismissal (X / outside click / Escape)
    // — the success path in handleSubmit closes the modal directly via the
    // onOpenChange prop, bypassing this handler, so this never double-counts.
    // Dismissing the post-signup "check your email" notice isn't a cancel —
    // they already completed the form — so it's excluded here.
    if (!next && !checkEmail) {
      analytics.authModalCancelled(source);
    }
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'sign-up' && password !== confirmPassword) {
      setConfirmTouched(true);
      return;
    }

    setIsLoading(true);

    if (mode === 'sign-up') {
      const { error, needsEmailConfirmation } = await signUpWithEmail(email, password, displayName);
      setIsLoading(false);
      if (error) {
        toast.error(error);
        return;
      }
      analytics.signUp(source);
      if (needsEmailConfirmation) {
        setCheckEmail(true);
        return;
      }
      reset();
      onOpenChange(false);
      onSuccess();
    } else {
      const { error } = await signInWithEmail(email, password);
      setIsLoading(false);
      if (error) {
        toast.error(error);
        return;
      }
      analytics.login(source);
      reset();
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save your progress</DialogTitle>
          <DialogDescription>
            Sign in or create an account to save your work and access it from any device.
          </DialogDescription>
        </DialogHeader>

        {checkEmail ? (
          <p className="text-sm text-muted-foreground">
            Check <span className="text-foreground font-medium">{email}</span> for a confirmation link, then sign in.
          </p>
        ) : (
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'sign-in' | 'sign-up')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sign-up">Sign up</TabsTrigger>
              <TabsTrigger value="sign-in">Sign in</TabsTrigger>
            </TabsList>
            <p className="text-xs text-muted-foreground text-right mt-2">
              <span aria-hidden="true" className="text-destructive">*</span> Required
            </p>
            <TabsContent value={mode} className="mt-2">
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                {mode === 'sign-up' && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-display-name">Display name<RequiredMark /></Label>
                    <Input
                      id="auth-display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      autoComplete="nickname"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="auth-email">Email<RequiredMark /></Label>
                  <Input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="auth-password">Password<RequiredMark /></Label>
                  <Input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  />
                </div>
                {mode === 'sign-up' && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-confirm-password">Confirm password<RequiredMark /></Label>
                    <Input
                      id="auth-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setConfirmTouched(true)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      aria-invalid={showMismatchError}
                      aria-describedby={showMismatchError ? 'auth-confirm-password-error' : undefined}
                      className={showMismatchError ? 'border-destructive focus-visible:ring-destructive' : undefined}
                    />
                    {showMismatchError && (
                      <p id="auth-confirm-password-error" role="alert" aria-live="polite" className="text-xs text-destructive">
                        Passwords don&apos;t match
                      </p>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full mt-1" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === 'sign-up' ? (
                    'Create account'
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
