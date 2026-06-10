import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { PlaybackProvider } from '@/contexts/PlaybackContext';
import Songs from '@/react-pages/Songs';

const queryClient = new QueryClient();

export default function SongsApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PlaybackProvider>
          <Toaster />
          <Sonner />
          <Songs />
        </PlaybackProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
