import { forwardRef, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Library, LogOut, Settings } from 'lucide-react';
import { signOut } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';

interface AccountMenuProps {
  displayName: string | null;
  trigger: ReactNode;
}

export function AccountMenu({ displayName, trigger }: AccountMenuProps) {
  const handleSignOut = async () => {
    analytics.logout();
    await signOut();
    window.location.href = '/app/';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {displayName && <DropdownMenuLabel className="font-normal text-muted-foreground">{displayName}</DropdownMenuLabel>}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2">
          <a href="/app/">
            <Library className="h-3.5 w-3.5" />
            My library
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <a href="/account/">
            <Settings className="h-3.5 w-3.5" />
            Account settings
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut} className="gap-2">
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AccountAvatarButtonProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
  displayName: string | null;
}

/**
 * Shared trigger look for AccountMenu — an initial in a circle. Used everywhere the
 * menu is mounted so a logged-in user recognizes the same affordance across the site,
 * the editor, and the library, instead of each surface inventing its own.
 *
 * Forwards its ref AND spreads `...props` onto the underlying <button>: AccountMenu
 * passes this to DropdownMenuTrigger's `asChild`, which uses Radix's Slot to clone
 * this element and merge its own props onto it — the ref for positioning the dropdown,
 * but critically also onClick and aria-expanded/aria-haspopup, which are what actually
 * open the menu. Missing the ref only broke positioning and logged a warning; missing
 * the prop spread meant onClick never reached the DOM button at all — the trigger
 * looked clickable but silently did nothing, which is a much worse bug than the
 * warning made it look like.
 */
export const AccountAvatarButton = forwardRef<HTMLButtonElement, AccountAvatarButtonProps>(
  ({ displayName, className, ...props }, ref) => {
    const initial = (displayName?.trim()?.[0] ?? '?').toUpperCase();
    return (
      <button
        ref={ref}
        type="button"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 ${className ?? ''}`}
        aria-label="Account"
        {...props}
      >
        {initial}
      </button>
    );
  },
);
AccountAvatarButton.displayName = 'AccountAvatarButton';
