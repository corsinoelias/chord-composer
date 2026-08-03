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
      className={`w-9 h-8 rounded-md text-xs font-bold transition-colors border
        ${active ? activeClass : 'border-border text-muted-foreground hover:bg-accent/50'}
      `}
    >
      {children}
    </button>
  );
}

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
    <div className="flex justify-center gap-4 overflow-x-auto pb-1 px-1 -mx-1">
      {CHANNEL_ORDER.map(id => {
        const inst = instruments.find(i => i.id === id);
        if (!inst) return null;
        const Icon = CHANNEL_ICON[id];
        return (
          <div key={id} className="flex flex-col items-center gap-3 w-16 shrink-0">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wide">{CHANNEL_LABEL[id]}</span>
            </div>
            <div data-vaul-no-drag>
              <VerticalFader
                value={inst.volume}
                onChange={(v) => updateInstrument(id, { volume: v })}
                disabled={inst.muted}
                label={`${CHANNEL_LABEL[id]} volume`}
              />
            </div>
            <div data-vaul-no-drag className="flex flex-col gap-1.5">
              <MuteSoloButton
                active={inst.muted}
                activeClass="border-destructive bg-destructive/15 text-destructive"
                onClick={() => updateInstrument(id, { muted: !inst.muted })}
                title={inst.muted ? `Quitar mute a ${CHANNEL_LABEL[id]}` : `Mute ${CHANNEL_LABEL[id]}`}
              >
                M
              </MuteSoloButton>
              <MuteSoloButton
                active={inst.solo}
                activeClass="border-primary bg-primary/15 text-primary"
                onClick={() => updateInstrument(id, { solo: !inst.solo })}
                title={inst.solo ? `Quitar solo a ${CHANNEL_LABEL[id]}` : `Solo ${CHANNEL_LABEL[id]}`}
              >
                S
              </MuteSoloButton>
            </div>
          </div>
        );
      })}

      {hasVocalTrack && (
        <div className="flex flex-col items-center gap-3 w-16 shrink-0">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Mic className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold uppercase tracking-wide">Voz</span>
          </div>
          <div data-vaul-no-drag>
            <VerticalFader
              value={vocalVolume}
              onChange={onVocalVolumeChange}
              disabled={vocalMuted || vocalForcedMuted}
              label="Voz volume"
            />
          </div>
          <div data-vaul-no-drag className="flex flex-col items-center gap-1.5">
            <MuteSoloButton
              active={vocalMuted || vocalForcedMuted}
              activeClass="border-destructive bg-destructive/15 text-destructive"
              onClick={() => onVocalMutedChange(!vocalMuted)}
              title={vocalMuted ? 'Quitar mute a Voz' : 'Mute Voz'}
            >
              M
            </MuteSoloButton>
            {vocalForcedMuted && (
              <span className="text-[9px] text-muted-foreground text-center leading-tight">
                Tono transpuesto
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
