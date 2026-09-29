import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Check, Loader2, MousePointerClick, Search, Star, Undo2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { soundFontPresets } from '@/lib/appEngine/host';
import { useFavorites } from '@/lib/favorites';
import { gmProgramOf, getSoundType, rememberPresetNames, type InstrumentType } from '@/lib/instruments';
import {
  SOUND_FAMILY_LABEL, familiesInOrder, isKitProgram, isRecommended, recommendedOrder, soundFamilyOf,
  type SoundFamily,
} from '@/lib/soundFamilies';

/** A line of the list: a family's heading, or a sound under it — twice, when it is starred. */
type Row = { heading: string } | { program: number; name: string; starred: boolean };

/**
 * Every instrument the SoundFont has, by the names it gives them, sorted into families — your
 * starred ones first, then the families of the track (the basses for the bass), each with the
 * sounds the app recommends at its head — with a chip for each and a search box. The app's
 * all_sounds_sheet.dart.
 *
 * A pick is heard and kept, and the list stays open to try the next: in the song if it is
 * playing, on the bar's chord if it is not (the caller's onPick). The sound the part had is a
 * tap away until it closes. A pick plays from the whole SoundFont, which the page downloads
 * the first time a song needs it.
 */
export function AllSoundsDialog({ open, onOpenChange, track, trackName, currentSoundId, playing, onPick, onRestore }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: InstrumentType;
  trackName: string;
  currentSoundId: string;
  /** Whether the song is playing: what a pick is heard in. */
  playing?: boolean;
  /** The program picked: the General MIDI number plus 128 × the bank. */
  onPick: (program: number) => void;
  /** Back to the sound the part had when the list opened, by its id. */
  onRestore?: (soundId: string) => void;
}) {
  const [presets, setPresets] = useState<[number, string][] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  /** The family shown, 'favorites', or null for all. */
  const [filter, setFilter] = useState<SoundFamily | 'favorites' | null>(null);
  const [favorites, toggleFavorite] = useFavorites('sounds');
  /** The sound the part had when the list opened. */
  const [before, setBefore] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Whether the list has been brought to the part's sound since it opened. */
  const placed = useRef(false);

  useEffect(() => {
    if (!open) {
      setBefore(null);
      placed.current = false;
      return;
    }
    setBefore((b) => b ?? currentSoundId);
    if (presets) return;
    soundFontPresets()
      .then((list) => {
        rememberPresetNames(list);
        setPresets(list);
      })
      .catch(() => setFailed(true));
  }, [open, presets, currentSoundId]);

  const current = gmProgramOf(currentSoundId) ?? getSoundType(track, currentSoundId)?.program;
  const starredPrograms = useMemo(() => new Set([...favorites].map(Number)), [favorites]);

  const rows = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = (presets ?? []).filter(([program]) => !isKitProgram(program));
    const matches = ([program, name]: [number, string]) => {
      const text = `${name} ${SOUND_FAMILY_LABEL[soundFamilyOf(program)]}`.toLowerCase();
      return words.every((w) => text.includes(w));
    };
    const out: Row[] = [];
    const section = (heading: string, sounds: [number, string][], starred = false) => {
      const list = sounds.filter(matches);
      if (!list.length) return;
      out.push({ heading });
      for (const [program, name] of list) out.push({ program, name, starred });
    };
    const starred = all.filter(([program]) => starredPrograms.has(program));
    if (filter === 'favorites') {
      section('Favourites', starred, true);
      return out;
    }
    // In "All", your starred sounds head the list; they stay in their families too.
    if (filter === null) section('Favourites', starred, true);
    for (const family of filter === null ? familiesInOrder(track) : [filter]) {
      const sounds = all.filter(([program]) => soundFamilyOf(program) === family);
      // The recommended ones first, in their order, with nothing to say so; the rest follow.
      section(SOUND_FAMILY_LABEL[family], [
        ...sounds.filter(([p]) => isRecommended(p)).sort((a, b) => recommendedOrder(a[0]) - recommendedOrder(b[0])),
        ...sounds.filter(([p]) => !isRecommended(p)),
      ]);
    }
    return out;
  }, [presets, query, filter, starredPrograms, track]);

  // Opened, the list starts on the part's sound — where it first appears.
  useEffect(() => {
    if (!open || !presets || placed.current || current === undefined) return;
    placed.current = true;
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-program="${current}"]`)?.scrollIntoView({ block: 'center' });
    });
  }, [open, presets, current]);

  // Searched or filtered, it starts from the top of what it finds.
  const toTop = () => {
    placed.current = true;
    listRef.current?.scrollTo({ top: 0 });
  };

  const changed = before !== null && before !== currentSoundId;
  const beforeName = before ? (getSoundType(track, before)?.name ?? before) : '';
  const chip = (key: string, label: React.ReactNode, on: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={() => { toTop(); onClick(); }}
      aria-pressed={on}
      className="flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold"
      style={on
        ? { background: 'var(--cp-tx)', color: 'var(--cp-s1)', border: '1px solid var(--cp-tx)' }
        : { background: 'transparent', color: 'var(--cp-tx2)', border: '1px solid var(--cp-ln)' }}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="cp flex h-[80vh] max-h-[680px] w-[calc(100vw-24px)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0 [&>button:last-child]:hidden"
        style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
      >
        <div className="flex items-center gap-2 px-4 pb-1 pt-4">
          <DialogTitle className="m-0 flex-1 text-base font-bold">All sounds · {trackName}</DialogTitle>
          {presets && <span className="text-xs" style={{ color: 'var(--cp-fa)' }}>{presets.filter(([p]) => !isKitProgram(p)).length}</span>}
          <button type="button" className="rounded-lg border-0 bg-transparent px-2 py-1 text-sm font-semibold" style={{ color: 'var(--cp-act)' }} onClick={() => onOpenChange(false)}>
            Done
          </button>
        </div>
        <DialogDescription className="sr-only">Every instrument of the SoundFont, to play on this track.</DialogDescription>
        {/* How a sound is heard here, and the way back to the one the part had. */}
        <div className="flex min-h-[30px] items-center gap-1.5 px-4 pb-1.5 text-xs" style={{ color: 'var(--cp-fa)' }}>
          {playing ? <AudioLines size={14} /> : <MousePointerClick size={14} />}
          <span className="min-w-0 flex-1">{playing ? 'Tap a sound: you hear it in the song.' : "Tap a sound to hear it on the bar's chord."}</span>
          {changed && onRestore && (
            <button type="button" className="flex min-w-0 max-w-[48%] items-center gap-1 rounded-lg border-0 bg-transparent px-1.5 py-1 font-semibold"
              style={{ color: 'var(--cp-act)' }} onClick={() => onRestore(before!)}>
              <Undo2 size={13} className="shrink-0" /><span className="truncate">Back to {beforeName}</span>
            </button>
          )}
        </div>
        <div className="px-4 pb-2">
          <label
            className="flex items-center gap-2 rounded-xl border px-3 py-2"
            style={{ background: 'var(--cp-s2)', borderColor: 'var(--cp-ln)', color: 'var(--cp-mu)' }}
          >
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => { toTop(); setQuery(e.target.value); }}
              placeholder="Search: piano, strings, sax…"
              aria-label="Search sounds"
              className="flex-1 border-0 bg-transparent text-sm outline-none"
              style={{ color: 'var(--cp-tx)' }}
            />
            {query && (
              <button type="button" onClick={() => { toTop(); setQuery(''); }} aria-label="Clear search" className="border-0 bg-transparent p-0" style={{ color: 'var(--cp-mu)' }}>
                <X size={15} />
              </button>
            )}
          </label>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
          {chip('all', 'All', filter === null, () => setFilter(null))}
          {chip('favorites', <><Star size={13} fill="currentColor" strokeWidth={0} style={{ color: 'var(--cp-maj)' }} />Favourites</>, filter === 'favorites', () => setFilter('favorites'))}
          {familiesInOrder(track).map((f) => chip(`family-${f}`, SOUND_FAMILY_LABEL[f], filter === f, () => setFilter(f)))}
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {failed ? (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--cp-dg)' }}>Could not load the list of sounds.</p>
          ) : !presets ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={20} style={{ color: 'var(--cp-mu)' }} /></div>
          ) : rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm" style={{ color: 'var(--cp-fa)' }}>
              {filter === 'favorites' && favorites.size === 0 ? "Tap a sound's star and it will be here, and first on its track's list." : 'No sound matches'}
            </p>
          ) : rows.map((row, i) => {
            if ('heading' in row) return <div key={`h-${row.heading}-${i}`} className="cp-lbl px-3 pb-1 pt-3">{row.heading}</div>;
            const { program, name } = row;
            const on = program === current;
            const starred = starredPrograms.has(program);
            return (
              <div key={`${row.starred ? 'f' : 's'}-${program}`} data-program={program}
                className="flex items-center gap-1 rounded-xl pl-3" style={on ? { background: 'var(--cp-acs)' } : undefined}>
                {/* Heard, not closed on: the next one is a tap away. */}
                <button type="button" onClick={() => onPick(program)}
                  className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent py-2 text-left" style={{ color: 'inherit' }}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] font-semibold">{name}</span>
                    {/* The bank, where it is a variation rather than the General MIDI sound itself. */}
                    {program >= 128 && <span className="text-[11px]" style={{ color: 'var(--cp-fa)' }}>Variation</span>}
                  </span>
                </button>
                {on && <Check size={17} style={{ color: 'var(--cp-act)' }} aria-label="Playing" />}
                <button type="button" className="cp-icb" style={{ width: 36, height: 36, color: starred ? 'var(--cp-maj)' : 'var(--cp-fa)' }}
                  onClick={() => toggleFavorite(String(program))} aria-pressed={starred}
                  aria-label={starred ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
                  title={starred ? 'Remove from favourites' : 'Add to favourites'}>
                  <Star size={18} fill={starred ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
