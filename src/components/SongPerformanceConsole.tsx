import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SongSectionsTab } from '@/components/SongSectionsTab';
import { SongMixerTab } from '@/components/SongMixerTab';
import { SongTempoTab } from '@/components/SongTempoTab';
import type { InstrumentState } from '@/lib/instruments';

interface SectionMarker {
  sectionIndex: number;
  name: string;
  startPercent: number;
}

interface SongPerformanceConsoleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Sections tab
  sectionMarkers: SectionMarker[];
  activeSectionIndex: number | null;
  onSeekSection: (si: number) => void;
  isPlaying: boolean;
  isLoopingSection: boolean;
  onToggleLoop: () => void;

  // Mixer tab
  instruments: InstrumentState[];
  onInstrumentsChange: (next: InstrumentState[]) => void;
  hasVocalTrack: boolean;
  vocalMuted: boolean;
  vocalVolume: number;
  onVocalMutedChange: (muted: boolean) => void;
  onVocalVolumeChange: (volume: number) => void;
  vocalForcedMuted: boolean;

  // Tempo & Tono tab
  bpm: number;
  onBpmChange: (bpm: number) => void;
  transpose: number;
  onTransposeChange: (t: number) => void;
  displayKey: string;
}

// Mobile-only "performance console": a vaul Drawer (first real usage of
// src/components/ui/drawer.tsx in this app) opened from a trigger button in the fixed
// bottom bar, holding 3 tabs (Sections / Mixer / Tempo & Tono). Pure composition — no
// playback/engine logic of its own; everything below is threaded straight through from
// SongChordPlayer.tsx, which owns all of this as state already used by the desktop bar.
export function SongPerformanceConsole({
  open,
  onOpenChange,
  sectionMarkers,
  activeSectionIndex,
  onSeekSection,
  isPlaying,
  isLoopingSection,
  onToggleLoop,
  instruments,
  onInstrumentsChange,
  hasVocalTrack,
  vocalMuted,
  vocalVolume,
  onVocalMutedChange,
  onVocalVolumeChange,
  vocalForcedMuted,
  bpm,
  onBpmChange,
  transpose,
  onTransposeChange,
  displayKey,
}: SongPerformanceConsoleProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* z-[60] — the existing fixed bottom bar (SongPlayerBar) is already z-50; without an
          explicit override the Drawer only stacks above it by incidental DOM/paint order
          rather than a guaranteed one. */}
      <DrawerContent className="z-[60] max-h-[85dvh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-center text-base">Consola</DrawerTitle>
        </DrawerHeader>

        <Tabs defaultValue="sections" className="flex flex-col overflow-hidden px-4 pb-6">
          <TabsList className="grid grid-cols-3 w-full shrink-0">
            <TabsTrigger value="sections">Secciones</TabsTrigger>
            <TabsTrigger value="mixer">Mixer</TabsTrigger>
            <TabsTrigger value="tempo">Tempo &amp; Tono</TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto mt-4">
            <TabsContent value="sections" className="mt-0">
              <SongSectionsTab
                sectionMarkers={sectionMarkers}
                activeSectionIndex={activeSectionIndex}
                onSeekSection={(si) => { onSeekSection(si); }}
                isPlaying={isPlaying}
                isLoopingSection={isLoopingSection}
                onToggleLoop={onToggleLoop}
              />
            </TabsContent>

            <TabsContent value="mixer" className="mt-0">
              <SongMixerTab
                instruments={instruments}
                onInstrumentsChange={onInstrumentsChange}
                hasVocalTrack={hasVocalTrack}
                vocalMuted={vocalMuted}
                vocalVolume={vocalVolume}
                onVocalMutedChange={onVocalMutedChange}
                onVocalVolumeChange={onVocalVolumeChange}
                vocalForcedMuted={vocalForcedMuted}
              />
            </TabsContent>

            <TabsContent value="tempo" className="mt-0">
              <SongTempoTab
                bpm={bpm}
                onBpmChange={onBpmChange}
                transpose={transpose}
                onTransposeChange={onTransposeChange}
                displayKey={displayKey}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
