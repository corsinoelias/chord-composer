import { lazy, Suspense, useState } from 'react';
import { Play, Library } from 'lucide-react';
import { AccountMenu, AccountAvatarButton } from '@/components/AccountMenu';
import { useAccountState } from '@/hooks/useAccountState';

// Lazy: AuthModal pulls in Radix Dialog/Tabs plus supabase.ts (~230KB combined) for a
// form the vast majority of pageviews never open. Not imported until "Sign in" is
// clicked for the first time — see `modalLoaded` below, which keeps it mounted after
// that so Radix's close animation still works on subsequent opens.
const AuthModal = lazy(() => import('@/components/AuthModal').then((m) => ({ default: m.AuthModal })));

interface AccountSlotProps {
  variant: 'desktop' | 'mobile';
}

/**
 * The account-aware half of the navbar's right side. Deliberately does NOT replace
 * the "Try Chord Player" CTA for signed-out visitors (still the strongest internal
 * link on the site, rendered on every page) — it only swaps that same CTA slot to
 * "My library" once there's a session, so the button always points at the action
 * that matters for whoever is looking at it. Mounted twice by Navbar.astro (desktop
 * + mobile), each a separate client:load island — see the two variants below.
 */
export function AccountSlot({ variant }: AccountSlotProps) {
  const { isLoggedIn, displayName, refresh } = useAccountState();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  // Tracks whether AuthModal has ever been requested, so it (and its lazy chunk) only
  // mounts once — separate from `authModalOpen` because closing it shouldn't unmount it.
  const [modalLoaded, setModalLoaded] = useState(false);
  const openAuthModal = () => {
    setModalLoaded(true);
    setAuthModalOpen(true);
  };

  const ctaHref = isLoggedIn ? '/app/' : '/chord-player/';
  const ctaLabel = isLoggedIn ? 'My library' : 'Try Chord Player';
  const CtaIcon = isLoggedIn ? Library : Play;

  if (variant === 'mobile') {
    const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();
    return (
      <div className="pt-3 pb-2 border-t border-border space-y-2">
        {isLoggedIn ? (
          <AccountMenu
            displayName={displayName}
            trigger={
              <button
                type="button"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {initial}
                </span>
                {displayName ?? 'Account'}
              </button>
            }
          />
        ) : (
          <button
            type="button"
            onClick={openAuthModal}
            className="flex items-center justify-center w-full px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            Sign in
          </button>
        )}
        {modalLoaded && (
          <Suspense fallback={null}>
            <AuthModal
              open={authModalOpen}
              onOpenChange={setAuthModalOpen}
              entryPoint="navbar"
              onSuccess={() => {
                setAuthModalOpen(false);
                refresh();
              }}
            />
          </Suspense>
        )}
      </div>
    );
  }

  // The header's CTA at every width: full from 640px, a compact "Player" / "Library" beside
  // the menu button on a phone, where the account itself lives in the menu sheet.
  return (
    <div className="flex items-center gap-3">
      <a
        href={ctaHref}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13.5px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:h-auto sm:px-5 sm:py-3 sm:text-sm"
      >
        <CtaIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill={isLoggedIn ? 'none' : 'currentColor'} />
        <span className="sm:hidden">{isLoggedIn ? 'Library' : 'Player'}</span>
        <span className="hidden sm:inline">{ctaLabel}</span>
      </a>
      {isLoggedIn ? (
        <span className="hidden sm:inline-flex">
          <AccountMenu displayName={displayName} trigger={<AccountAvatarButton displayName={displayName} />} />
        </span>
      ) : (
        <button
          type="button"
          onClick={openAuthModal}
          className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
        >
          Sign in
        </button>
      )}
      {modalLoaded && (
        <Suspense fallback={null}>
          <AuthModal
            open={authModalOpen}
            onOpenChange={setAuthModalOpen}
            entryPoint="navbar"
            onSuccess={() => {
              setAuthModalOpen(false);
              refresh();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
