import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, sendPasswordReset, signInWithGoogleIdToken } from '@/lib/supabase';
import { waitForGoogleIdentity, generateNonce } from '@/lib/googleIdentity';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Which entry point opened this modal (e.g. 'save_cta', 'export_nudge') — tags the resulting analytics events so conversion can be compared per entry point. Required, not optional: an omitted entryPoint used to land two mount sites' sign_up/login events in GA4's '(not set)' bucket, which by Aug 2026 was 51% of all sign_ups — silently unattributable. Not named `source`: that is a reserved GA4 param, see src/lib/analytics.ts. */
  entryPoint: string;
}

// Every field in this form is required — the native `required` attribute
// already tells assistive tech that; the asterisk is purely a visual cue for
// sighted users, so it's aria-hidden to avoid a redundant "star" announcement.
// Neutral color (not destructive/red) — "required" isn't an error state, so it
// shouldn't read as one.
function RequiredMark() {
  return <span aria-hidden="true" className="text-muted-foreground"> *</span>;
}

export function AuthModal({ open, onOpenChange, onSuccess, entryPoint }: AuthModalProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // A callback ref, not useRef: Radix mounts DialogContent's children a tick after
  // `open` flips true (Presence/animation), so a plain useRef read inside the effect
  // below would see .current as still null on that first render. A callback ref fires
  // exactly when the node actually attaches, via the state update, which re-triggers
  // the effect at the right time instead of racing it.
  const [googleButtonEl, setGoogleButtonEl] = useState<HTMLDivElement | null>(null);
  // GIS's callback is registered once (in the effect below) and closes over whatever
  // was in scope at that point — this ref keeps it reading the CURRENT entryPoint /
  // onSuccess / onOpenChange instead of whatever they were when initialize() ran, so
  // the effect below doesn't need to re-run (and flicker the rendered button) every
  // time a parent re-renders with a new callback identity.
  const latestRef = useRef({ entryPoint, onSuccess, onOpenChange });
  latestRef.current = { entryPoint, onSuccess, onOpenChange };

  const passwordsMismatch = mode === 'sign-up' && confirmPassword.length > 0 && password !== confirmPassword;
  const showMismatchError = passwordsMismatch && confirmTouched;

  const reset = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setConfirmTouched(false);
    setDisplayName('');
    setCheckEmail(false);
    setResetMode(false);
    setResetSent(false);
  };

  const handleOpenChange = (next: boolean) => {
    // Only reachable via user-initiated dismissal (X / outside click / Escape)
    // — the success path in handleSubmit closes the modal directly via the
    // onOpenChange prop, bypassing this handler, so this never double-counts.
    // Dismissing a "check your inbox" notice (signup confirmation or password
    // reset) isn't a cancel — they already completed the form — so both are
    // excluded here.
    if (!next && !checkEmail && !resetSent) {
      analytics.authModalCancelled(entryPoint);
    }
    if (!next) reset();
    onOpenChange(next);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await sendPasswordReset(email);
    setIsLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    analytics.passwordResetRequested();
    setResetSent(true);
  };

  // Renders Google's own "Sign in with Google" button into googleButtonEl once the
  // form (not the checkEmail/resetMode notices) is showing. Re-runs on open/checkEmail/
  // resetMode/googleButtonEl changes because the container div only exists in the DOM
  // in that branch — Radix unmounts DialogContent's children when the dialog is
  // closed, so a plain mount-once effect would miss every reopen after the first.
  useEffect(() => {
    if (!open || checkEmail || resetMode || !googleButtonEl) return;
    const clientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return;

    let cancelled = false;

    Promise.all([waitForGoogleIdentity(), generateNonce()])
      .then(([google, nonce]) => {
        if (cancelled) return;
        google.accounts.id.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          callback: async (response) => {
            const { userId, isNewUser, error } = await signInWithGoogleIdToken(response.credential, nonce.raw);
            if (error || !userId) {
              toast.error(error ?? 'Google sign-in failed');
              return;
            }
            const { entryPoint: ep, onSuccess: onOk, onOpenChange: close } = latestRef.current;
            if (isNewUser) analytics.signUp('google', ep);
            else analytics.login('google', ep);
            reset();
            close(false);
            onOk();
          },
        });
        google.accounts.id.renderButton(googleButtonEl, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 328,
        });
      })
      .catch(() => {
        // GIS failed to load (blocked, offline, script host unreachable) — the button
        // area just stays empty; email/password sign-in below is unaffected.
      });

    return () => {
      cancelled = true;
    };
  }, [open, checkEmail, resetMode, googleButtonEl]);

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
      analytics.signUp('email', entryPoint);
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
      analytics.login('email', entryPoint);
      reset();
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Lock className="w-4 h-4 text-primary shrink-0" />
          <DialogTitle asChild>
            <span className="font-semibold text-foreground">Save your progress</span>
          </DialogTitle>
        </div>

        <div className="p-5">
          {!resetMode && (
            <p className="text-sm text-muted-foreground mb-4">
              Sign in or create an account to save your work and access it from any device.
            </p>
          )}

          {checkEmail ? (
            <p className="text-sm text-muted-foreground">
              Check <span className="text-foreground font-medium">{email}</span> for a confirmation link, then sign in.
            </p>
          ) : resetMode ? (
            resetSent ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  If <span className="text-foreground font-medium">{email}</span> has an account, we sent a link to reset the password. It expires in an hour.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setResetMode(false);
                    setResetSent(false);
                  }}
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="auth-reset-email">Email<RequiredMark /></Label>
                  <Input
                    id="auth-reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full mt-1" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send reset link'}
                </Button>
                <button
                  type="button"
                  onClick={() => setResetMode(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors self-center"
                >
                  Back to sign in
                </button>
              </form>
            )
          ) : (
            <>
              <div ref={setGoogleButtonEl} className="flex justify-center [&>div]:w-full mb-3" />
              <div className="relative mb-3">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'sign-in' | 'sign-up')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="sign-up">Sign up</TabsTrigger>
                  <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                </TabsList>
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="auth-password">Password<RequiredMark /></Label>
                      {mode === 'sign-in' && (
                        <button
                          type="button"
                          onClick={() => setResetMode(true)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
