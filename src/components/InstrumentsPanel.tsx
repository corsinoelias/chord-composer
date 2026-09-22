import { memo, useCallback, useMemo } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type InstrumentState, getInstrumentConfig } from '@/lib/instruments';
import { type StylePattern, type InstrumentSounds } from '@/lib/styles';
import { Piano, Guitar, Drum, Music, X } from 'lucide-react';
import { type NoteLengths } from '@/lib/noteLengths';

type MelodicId = keyof NoteLengths;

/**
 * How long each note rings, the Android app's choices (constants.dart noteLengths) plus the
 * web's own length, which is what every song had before and stays the default. In steps.
 */
const NOTE_LENGTHS: { steps: number | undefined; label: string; title: string }[] = [
  { steps: undefined, label: 'Normal', title: 'The style’s own length' },
  { steps: 0.5, label: 'Short', title: 'Half a sixteenth' },
  { steps: 1, label: '1/16', title: 'A sixteenth' },
  { steps: 2, label: '1/8', title: 'An eighth' },
  { steps: 4, label: '1/4', title: 'A quarter' },
  { steps: 0, label: 'Held', title: 'Until the next note or chord' },
];

interface InstrumentsPanelProps {
  open: boolean;
  onClose: () => void;
  instruments: InstrumentState[];
  onInstrumentChange: (instruments: InstrumentState[]) => void;
  currentStyle?: StylePattern | null;
  noteLengths?: NoteLengths;
  onNoteLengthsChange?: (lengths: NoteLengths) => void;
}

const instrumentIcons: Record<string, typeof Piano> = {
  piano: Piano,
  bass: Music,
  drums: Drum,
  guitar: Guitar,
};

// Memoized individual instrument card to prevent re-renders
const InstrumentCard = memo(function InstrumentCard({
  inst,
  styleSoundId,
  styleVolume,
  onUpdate,
  noteLength,
  onNoteLength,
}: {
  inst: InstrumentState;
  styleSoundId?: string;
  styleVolume?: number;
  onUpdate: (id: string, updates: Partial<InstrumentState>) => void;
  noteLength?: number;
  onNoteLength?: (id: MelodicId, steps: number | undefined) => void;
}) {
  const config = getInstrumentConfig(inst.id);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(inst.id, { volume: parseInt(e.target.value, 10) / 100 });
  }, [inst.id, onUpdate]);

  const handleSoundTypeChange = useCallback((soundTypeId: string) => {
    onUpdate(inst.id, { soundTypeId });
  }, [inst.id, onUpdate]);

  if (!config) return null;

  const Icon = instrumentIcons[inst.id] || Music;
  const isUsingStyleSound = styleSoundId && inst.soundTypeId === styleSoundId;
  const volumePct = Math.round(inst.volume * 100);
  const volumeDiffers = styleVolume !== undefined && Math.abs(inst.volume - styleVolume) > 0.01;

  return (
    <section className="cp-ic" aria-label={config.name} style={inst.muted ? { opacity: 0.7 } : undefined}>
      <div className="flex items-center gap-3">
        <span className="cp-it"><Icon size={18} aria-hidden="true" /></span>
        <span className="text-[15px] font-bold">{config.name}</span>
        {isUsingStyleSound && <span className="cp-tag">Style</span>}
        <div className="flex-grow" />
        <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--cp-tx2)' }}>
          Mute
          <button
            type="button"
            role="switch"
            aria-checked={inst.muted}
            aria-label={`Mute ${config.name.toLowerCase()}`}
            className={`cp-sw ${inst.muted ? 'cp-on' : ''}`}
            onClick={() => onUpdate(inst.id, { muted: !inst.muted })}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="cp-ft">
          <span>
            Volume
            {volumeDiffers && <span className="opacity-80"> (style: {Math.round(styleVolume! * 100)}%)</span>}
          </span>
          <b className="cp-mono">{volumePct}%</b>
        </div>
        <input
          className="cp-rg w-full"
          type="range"
          min={0}
          max={100}
          step={1}
          value={volumePct}
          onChange={handleVolumeChange}
          disabled={inst.muted}
          aria-label={`${config.name} volume`}
          style={{ ['--cp-p' as string]: `${volumePct}%` }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="cp-ft">
          <span>Sound type</span>
          {styleSoundId && styleSoundId !== inst.soundTypeId && (
            <span>style: {config.soundTypes.find(s => s.id === styleSoundId)?.name || styleSoundId}</span>
          )}
        </div>
        <Select value={inst.soundTypeId} onValueChange={handleSoundTypeChange} disabled={inst.muted}>
          <SelectTrigger
            className="h-10 w-full rounded-[10px] px-3 text-[13px] font-semibold [&>svg]:opacity-100"
            style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln2)', color: 'var(--cp-tx)' }}
            aria-label={`${config.name} sound`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-50">
            {config.soundTypes.map(sound => (
              <SelectItem key={sound.id} value={sound.id}>
                {sound.name}
                {sound.id === styleSoundId && ' ★'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {inst.id !== 'drums' && onNoteLength && (
        <div className="flex flex-col gap-2">
          <div className="cp-ft"><span>Each note rings for</span></div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${config.name} note length`}>
            {NOTE_LENGTHS.map(option => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={noteLength === option.steps}
                title={option.title}
                className={`cp-chip ${noteLength === option.steps ? 'cp-on' : ''}`}
                onClick={() => onNoteLength(inst.id as MelodicId, option.steps)}
                disabled={inst.muted}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
});

export const InstrumentsPanel = memo(function InstrumentsPanel({
  open,
  onClose,
  instruments,
  onInstrumentChange,
  currentStyle,
  noteLengths,
  onNoteLengthsChange,
}: InstrumentsPanelProps) {
  const setNoteLength = useCallback((id: MelodicId, steps: number | undefined) => {
    if (!onNoteLengthsChange) return;
    const next = { ...(noteLengths ?? {}) };
    if (steps === undefined) delete next[id];
    else next[id] = steps;
    onNoteLengthsChange(next);
  }, [noteLengths, onNoteLengthsChange]);

  // Memoize the update handler
  const updateInstrument = useCallback((id: string, updates: Partial<InstrumentState>) => {
    onInstrumentChange(
      instruments.map(inst =>
        inst.id === id ? { ...inst, ...updates } : inst
      )
    );
  }, [instruments, onInstrumentChange]);

  // Extract style-specific sounds for comparison
  const styleSounds = useMemo(() => {
    return currentStyle?.instrumentSounds || {};
  }, [currentStyle?.instrumentSounds]);

  const styleVolumes = useMemo(() => {
    return currentStyle?.volumes || {};
  }, [currentStyle?.volumes]);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) onClose();
  }, [onClose]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="cp-sheet flex w-full flex-col p-0 sm:max-w-[480px]">
        <div className="cp-sheet-head">
          <div className="flex flex-col gap-[3px]">
            <SheetTitle className="m-0 text-xl font-extrabold tracking-tight" style={{ color: 'var(--cp-tx)' }}>
              Instruments
            </SheetTitle>
            <SheetDescription className="m-0 text-xs" style={{ color: 'var(--cp-mu)' }}>
              {currentStyle ? `Style · ${currentStyle.name}` : 'Sound and level for each track'}
            </SheetDescription>
          </div>
          <button className="cp-btn cp-ib cp-gh" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {instruments.map(inst => (
            <InstrumentCard
              key={inst.id}
              inst={inst}
              styleSoundId={styleSounds[inst.id as keyof InstrumentSounds]}
              styleVolume={styleVolumes[inst.id as keyof typeof styleVolumes]}
              onUpdate={updateInstrument}
              noteLength={noteLengths?.[inst.id as MelodicId]}
              onNoteLength={onNoteLengthsChange ? setNoteLength : undefined}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
});
