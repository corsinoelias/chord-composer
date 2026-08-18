import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, LogIn } from 'lucide-react';
import { getCurrentUserEmail, updateDisplayName, updatePassword, deleteAccount } from '@/lib/supabase';
import { useAccountState } from '@/hooks/useAccountState';
import { AuthModal } from '@/components/AuthModal';
import { toast } from 'sonner';

export function AccountPage() {
  const { isLoggedIn, displayName, isLoading, refresh } = useAccountState();
  const [email, setEmail] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    getCurrentUserEmail().then(setEmail);
  }, [isLoggedIn]);

  useEffect(() => {
    setNameInput(displayName ?? '');
  }, [displayName]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setNameSaving(true);
    const { error } = await updateDisplayName(trimmed);
    setNameSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    refresh();
    toast.success('Display name updated');
  };

  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const showMismatchError = passwordsMismatch && confirmTouched;

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setConfirmTouched(true);
      return;
    }
    setPasswordSaving(true);
    const { error } = await updatePassword(newPassword);
    setPasswordSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setConfirmTouched(false);
    toast.success('Password updated');
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await deleteAccount();
    setDeleting(false);
    if (error) {
      toast.error(error);
      return;
    }
    window.location.href = '/';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <h1 className="text-xl font-bold text-foreground mb-2">Sign in to manage your account</h1>
        <p className="text-muted-foreground text-sm max-w-sm mb-8">
          Create an account or sign in to see your account settings.
        </p>
        <Button onClick={() => setAuthModalOpen(true)} size="lg" className="gap-2 px-6">
          <LogIn className="h-4 w-4" />
          Sign in / Sign up
        </Button>
        <AuthModal
          open={authModalOpen}
          onOpenChange={setAuthModalOpen}
          entryPoint="account_page"
          onSuccess={() => {
            setAuthModalOpen(false);
            refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10 sm:py-14 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Account</h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage your profile and sign-in.</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <Label>Email</Label>
          <p className="text-sm text-foreground mt-1.5">{email ?? '—'}</p>
        </div>
        <form onSubmit={handleSaveName} className="flex flex-col gap-1.5">
          <Label htmlFor="account-display-name">Display name</Label>
          <div className="flex gap-2">
            <Input
              id="account-display-name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              required
            />
            <Button type="submit" disabled={nameSaving || !nameInput.trim() || nameInput.trim() === (displayName ?? '')}>
              {nameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Change password</h2>
        <form onSubmit={handleSavePassword} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-new-password">New password</Label>
            <Input
              id="account-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-confirm-password">Confirm new password</Label>
            <Input
              id="account-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              required
              minLength={6}
              autoComplete="new-password"
              aria-invalid={showMismatchError}
              aria-describedby={showMismatchError ? 'account-confirm-password-error' : undefined}
              className={showMismatchError ? 'border-destructive focus-visible:ring-destructive' : undefined}
            />
            {showMismatchError && (
              <p id="account-confirm-password-error" role="alert" aria-live="polite" className="text-xs text-destructive">
                Passwords don&apos;t match
              </p>
            )}
          </div>
          <Button type="submit" disabled={passwordSaving} className="self-start">
            {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Deleting your account permanently removes it and every progression you&apos;ve saved. This can&apos;t be undone.
        </p>
        <Button variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
          Delete account
        </Button>
      </section>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and every saved progression. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
