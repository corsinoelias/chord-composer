/**
 * Shortcuts Help Component
 * 
 * Displays keyboard shortcuts in a tooltip or popover
 */

import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

export function ShortcutsHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Keyboard className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Keyboard Shortcuts</h4>
          <div className="space-y-1">
            {SHORTCUTS.map((shortcut) => (
              <div 
                key={shortcut.key}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{shortcut.description}</span>
                <kbd className="px-2 py-0.5 rounded bg-muted text-xs font-mono">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
