import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound } from 'lucide-react';
import { updatePassword } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';

type Status = 'form' | 'invalid' | 'done';

/**
 * Landing page for a Supabase password-reset email link (see sendPasswordReset in
 * lib/supabase.ts). The link carries the recovery token in the URL fragment;
 * detectSessionInUrl (on by default) turns it into a short-lived session before this
 * component ever mounts, so there's nothing to parse here — submitting the form and
 * letting updateUser() either succeed or fail is the whole check. That sidesteps a
 * race against exactly when that async hash-parsing finishes relative to mount.
 */
export function AuthReset() {
  const [status, setStatus] = useState<Status>('form');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A used or expired link comes back as `#error=...&error_code=otp_expired` instead of
  // a token — that never produces a session, so it's worth telling apart from "you
  // haven't submitted yet" right away rather than waiting for a failed submit.
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (hashParams.get('error')) setStatus('invalid');
  }, []);

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const showMismatchError = passwordsMismatch && confirmTouched;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setConfirmTouched(true);
      return;
    }
    setIsSubmitting(true);
    const { error } = await updatePassword(password);
    setIsSubmitting(false);
    if (error) {
      setStatus('invalid');
      return;
    }
    analytics.passwordResetCompleted();
    setStatus('done');
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <KeyRound className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground">Reset your password</span>
        </div>

        <div className="p-5">
          {status === 'invalid' ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                This reset link is invalid or has expired. Password reset links only work once
                and expire after an hour — open <span className="text-foreground font-medium">Sign in</span> from
                the menu above and choose "Forgot password?" to get a new one.
              </p>
              <Button asChild className="w-full">
                <a href="/">Go home</a>
              </Button>
            </div>
          ) : status === 'done' ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Your password has been updated.</p>
              <Button asChild className="w-full">
                <a href="/app/">Go to my library</a>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground mb-1">Choose a new password for your account.</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-confirm-password">Confirm new password</Label>
                <Input
                  id="reset-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => setConfirmTouched(true)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  aria-invalid={showMismatchError}
                  aria-describedby={showMismatchError ? 'reset-confirm-password-error' : undefined}
                  className={showMismatchError ? 'border-destructive focus-visible:ring-destructive' : undefined}
                />
                {showMismatchError && (
                  <p id="reset-confirm-password-error" role="alert" aria-live="polite" className="text-xs text-destructive">
                    Passwords don&apos;t match
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full mt-1" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
