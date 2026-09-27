import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { soundFontPresets } from '@/lib/appEngine/host';
import { gmProgramOf, getSoundType, rememberPresetNames, type InstrumentType } from '@/lib/instruments';

/**
 * Every instrument the SoundFont has, by the names it gives them, with a search box — for when
 * the short list under the sound button does not have the one you want. The app's
 * all_sounds_sheet.dart. A pick plays from the whole SoundFont, which the page downloads the
 * first time a song needs it.
 */
export function AllSoundsDialog({ open, onOpenChange, track, trackName, currentSoundId, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: InstrumentType;
  trackName: string;
  currentSoundId: string;
  /** The program picked: the General MIDI number plus 128 × the bank. */
  onPick: (program: number) => void;
}) {
  const [presets, setPresets] = useState<[number, string][] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open || presets) return;
    soundFontPresets()
      .then((list) => {
        rememberPresetNames(list);
        setPresets(list);
      })
      .catch(() => setFailed(true));
  }, [open, presets]);

  const current = gmProgramOf(currentSoundId) ?? getSoundType(track, currentSoundId)?.program;
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (presets ?? []).filter(([, name]) => words.every((w) => name.toLowerCase().includes(w)));
  }, [presets, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="cp flex h-[80vh] max-h-[680px] w-[calc(100vw-24px)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0 [&>button:last-child]:hidden"
        style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <DialogTitle className="m-0 flex-1 text-base font-bold">All sounds · {trackName}</DialogTitle>
          {presets && <span className="text-xs" style={{ color: 'var(--cp-fa)' }}>{presets.length}</span>}
          <button type="button" className="cp-icb" style={{ width: 32, height: 32 }} onClick={() => onOpenChange(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <DialogDescription className="sr-only">Every instrument of the SoundFont, to play on this track.</DialogDescription>
        <div className="px-4 pb-2">
          <label
            className="flex h-10 items-center gap-2 rounded-full px-3"
            style={{ background: 'var(--cp-s2)', border: '1px solid var(--cp-ln)', color: 'var(--cp-mu)' }}
          >
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: piano, strings, sax…"
              aria-label="Search sounds"
              className="flex-1 border-0 bg-transparent text-sm outline-none"
              style={{ color: 'var(--cp-tx)' }}
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {failed ? (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--cp-dg)' }}>Could not load the list of sounds.</p>
          ) : !presets ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--cp-mu)' }} /></div>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--cp-fa)' }}>No sound matches</p>
          ) : shown.map(([program, name]) => {
            const on = program === current;
            return (
              <button
                key={program}
                type="button"
                onClick={() => { onPick(program); onOpenChange(false); }}
                className="flex w-full items-center gap-2 rounded-xl border-0 px-3 py-2 text-left"
                style={{ background: on ? 'var(--cp-acs)' : 'transparent', color: 'inherit' }}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-semibold">{name}</span>
                  {/* The bank, where it is a variation rather than the General MIDI sound itself. */}
                  {program >= 128 && <span className="text-[11px]" style={{ color: 'var(--cp-fa)' }}>Variation</span>}
                </span>
                {on && <Check size={17} style={{ color: 'var(--cp-act)' }} aria-label="Playing" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
