import { useState } from 'react';
import { Play, Library } from 'lucide-react';
import { AccountMenu, AccountAvatarButton } from '@/components/AccountMenu';
import { AuthModal } from '@/components/AuthModal';
import { useAccountState } from '@/hooks/useAccountState';

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

  const ctaHref = isLoggedIn ? '/app/' : '/chord-player/';
  const ctaLabel = isLoggedIn ? 'My library' : 'Try Chord Player';
  const CtaIcon = isLoggedIn ? Library : Play;

  if (variant === 'mobile') {
    const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();
    return (
      <div className="pt-3 pb-2 border-t border-border mt-3 space-y-2">
        <a
          href={ctaHref}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
        >
          <CtaIcon className="w-4 h-4" fill={isLoggedIn ? 'none' : 'currentColor'} />
          {ctaLabel}
        </a>
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
            onClick={() => setAuthModalOpen(true)}
            className="flex items-center justify-center w-full px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            Sign in
          </button>
        )}
        <AuthModal
          open={authModalOpen}
          onOpenChange={setAuthModalOpen}
          entryPoint="navbar"
          onSuccess={() => {
            setAuthModalOpen(false);
            refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="hidden sm:flex items-center gap-3">
      <a
        href={ctaHref}
        className="inline-flex items-center gap-1.5 px-5 py-3 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
      >
        <CtaIcon className="w-3.5 h-3.5" fill={isLoggedIn ? 'none' : 'currentColor'} />
        {ctaLabel}
      </a>
      {isLoggedIn ? (
        <AccountMenu displayName={displayName} trigger={<AccountAvatarButton displayName={displayName} />} />
      ) : (
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign in
        </button>
      )}
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        entryPoint="navbar"
        onSuccess={() => {
          setAuthModalOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
