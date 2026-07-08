import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut } from 'lucide-react';
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
    window.location.href = '/app';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {displayName && <DropdownMenuLabel className="font-normal text-muted-foreground">{displayName}</DropdownMenuLabel>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="gap-2">
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
