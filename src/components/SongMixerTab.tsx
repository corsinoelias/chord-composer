import type { ReactNode } from 'react';
import { Guitar, Drum, Piano, Music, Mic } from 'lucide-react';
import { VerticalFader } from '@/components/VerticalFader';
import { type InstrumentState, type InstrumentType } from '@/lib/instruments';

interface SongMixerTabProps {
  instruments: InstrumentState[];
  onInstrumentsChange: (next: InstrumentState[]) => void;
  hasVocalTrack: boolean;
  vocalMuted: boolean;
  vocalVolume: number;
  onVocalMutedChange: (muted: boolean) => void;
  onVocalVolumeChange: (volume: number) => void;
  vocalForcedMuted: boolean;
}

// Short mixer-console labels — local to this component only. INSTRUMENTS[].name in
// src/lib/instruments.ts stays "Piano"/"Guitar" for the chord editor's own panel.
const CHANNEL_LABEL: Record<InstrumentType, string> = {
  bass: 'Bass',
  drums: 'Drums',
  guitar: 'Gtr',
  piano: 'Keys',
};

const CHANNEL_ICON: Record<InstrumentType, typeof Music> = {
  bass: Music,
  drums: Drum,
  guitar: Guitar,
  piano: Piano,
};

// Fixed left-to-right order matching the reference mixer screenshots (Bass, Drums, Gtr, Keys),
// independent of whatever order `instruments` happens to be in.
const CHANNEL_ORDER: InstrumentType[] = ['bass', 'drums', 'guitar', 'piano'];

function MuteSoloButton({ active, activeClass, onClick, title, children }: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded-full text-[11px] font-bold transition-colors border shadow-sm
        ${active ? activeClass : 'border-border bg-card text-muted-foreground hover:bg-accent/50'}
      `}
    >
      {children}
    </button>
  );
}

// All 5 channels (Bass/Drums/Gtr/Keys/Vocals) fit in one row without horizontal scroll — sized
// to the panel's real content width (justify-between spreads them evenly) rather than relying
// on overflow-x as a crutch.
export function SongMixerTab({
  instruments,
  onInstrumentsChange,
  hasVocalTrack,
  vocalMuted,
  vocalVolume,
  onVocalMutedChange,
  onVocalVolumeChange,
  vocalForcedMuted,
}: SongMixerTabProps) {
  const updateInstrument = (id: InstrumentType, updates: Partial<InstrumentState>) =>
    onInstrumentsChange(instruments.map(inst => (inst.id === id ? { ...inst, ...updates } : inst)));

  return (
    <div className="flex justify-between gap-2">
      {CHANNEL_ORDER.map(id => {
        const inst = instruments.find(i => i.id === id);
        if (!inst) return null;
        const Icon = CHANNEL_ICON[id];
        return (
          <div key={id} className="flex flex-col items-center gap-2.5 w-[54px] shrink-0">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Icon className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-wide">{CHANNEL_LABEL[id]}</span>
            </div>
            <VerticalFader
              value={inst.volume}
              onChange={(v) => updateInstrument(id, { volume: v })}
              disabled={inst.muted}
              label={`${CHANNEL_LABEL[id]} volume`}
            />
            <div className="flex flex-col gap-1.5">
              <MuteSoloButton
                active={inst.muted}
                activeClass="border-destructive bg-destructive/15 text-destructive"
                onClick={() => updateInstrument(id, { muted: !inst.muted })}
                title={inst.muted ? `Unmute ${CHANNEL_LABEL[id]}` : `Mute ${CHANNEL_LABEL[id]}`}
              >
                M
              </MuteSoloButton>
              <MuteSoloButton
                active={inst.solo}
                activeClass="border-primary bg-primary/15 text-primary"
                onClick={() => updateInstrument(id, { solo: !inst.solo })}
                title={inst.solo ? `Unsolo ${CHANNEL_LABEL[id]}` : `Solo ${CHANNEL_LABEL[id]}`}
              >
                S
              </MuteSoloButton>
            </div>
          </div>
        );
      })}

      {hasVocalTrack && (
        <div className="flex flex-col items-center gap-2.5 w-[54px] shrink-0">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Mic className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Vocals</span>
          </div>
          <VerticalFader
            value={vocalVolume}
            onChange={onVocalVolumeChange}
            disabled={vocalMuted || vocalForcedMuted}
            label="Vocals volume"
          />
          <div className="flex flex-col items-center gap-1.5">
            <MuteSoloButton
              active={vocalMuted || vocalForcedMuted}
              activeClass="border-destructive bg-destructive/15 text-destructive"
              onClick={() => onVocalMutedChange(!vocalMuted)}
              title={vocalMuted ? 'Unmute vocals' : 'Mute vocals'}
            >
              M
            </MuteSoloButton>
            {vocalForcedMuted && (
              <span className="text-[8.5px] text-muted-foreground text-center leading-tight">
                Key<br />transposed
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
