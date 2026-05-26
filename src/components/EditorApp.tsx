import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { PlaybackProvider } from '@/contexts/PlaybackContext';
import Index from '@/react-pages/Index';

const queryClient = new QueryClient();

export default function EditorApp() {
  const songId = (() => {
    if (typeof window === 'undefined') return undefined;
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[0] === 'editor' && parts[1] ? parts[1] : undefined;
  })();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PlaybackProvider>
          <Toaster />
          <Sonner />
          <Index songId={songId} />
        </PlaybackProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
