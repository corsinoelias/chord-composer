import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Info, Loader2, Search, Star, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { type StylePattern } from '@/lib/styles';
import { type AppStyle, GENRES, appStyleFacts, categoryGenre, ensureAppStyles } from '@/lib/appStyles';
import { useFavorites } from '@/lib/favorites';
import { SECTION_COLORS } from '@/lib/sectionColors';

/** How a rhythm of the app's is put on the song: the two questions its sheet asks. */
export interface AppStyleApply {
  /** Its intro and ending, as sections at the start and the end of the song. */
  introAndEnding: boolean;
  /** Its own tempo, rather than the one the song has. */
  tempo: boolean;
}

const MY_RHYTHMS = 'My rhythms';

/** The same dot the selector shows for a rhythm: a section colour, by a hash of its id. */
export function styleDotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return SECTION_COLORS[Math.abs(hash) % SECTION_COLORS.length];
}

/** One line of the list: a style of the web's, one of yours, or one of the app's. */
interface Entry {
  id: string;
  name: string;
  genre: string;
  meter: string;
  bpm: number;
  custom: boolean;
  app?: AppStyle;
}

/** Lower case and without accents, so "cancion" finds "Canción". */
const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const meterOf = (style: StylePattern) =>
  style.timeSignature ? `${style.timeSignature.numerator}/${style.timeSignature.denominator}` : '4/4';

interface RhythmBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStyleId: string;
  /** The web's styles (overrides applied) and your own. */
  builtIn: StylePattern[];
  customStyles: StylePattern[];
  showCustom: boolean;
  /** Whether the app's rhythms and the library are offered here. */
  showAppStyles: boolean;
  /** The song's tempo, to say what "Use its tempo" changes. */
  songBpm?: number;
  onStyleChange: (styleId: string, apply?: AppStyleApply) => void;
  onDeleteCustom?: (styleId: string) => void;
}

/**
 * Every rhythm a song can take, in one list, as the app has it (rhythm_library_sheet.dart): the
 * web's, yours, the app's own and the rhythm library's, by genre — a search box, the genres and
 * the meters as chips, favourites a star away. The web's rhythms and yours go on the song at
 * once, as they always did; one of the app's first shows what it brings.
 */
/** A name cut into words and numbers, so "Salsa 2" comes before "Salsa 10" (the app's compareNatural). */
const naturalKey = (name: string): (string | number)[] =>
  (name.toLowerCase().match(/\d+|\D+/g) ?? []).map((part) => (/^\d/.test(part) ? Number(part) : part));
function compareKeys(x: (string | number)[], y: (string | number)[]): number {
  for (let i = 0; i < x.length && i < y.length; i++) {
    const a = x[i], b = y[i];
    const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
    if (c) return c;
  }
  return x.length - y.length;
}
/** The app's own styles as they come, then the library's rhythms by name. */
function byName(styles: AppStyle[]): AppStyle[] {
  const library = styles.filter((s) => s.id.startsWith('lib-')).map((s) => [s, naturalKey(s.name)] as const)
    .sort((a, b) => compareKeys(a[1], b[1])).map(([s]) => s);
  return [...styles.filter((s) => !s.id.startsWith('lib-')), ...library];
}

export function RhythmBrowser(props: RhythmBrowserProps) {
  const { open, onOpenChange, selectedStyleId, builtIn, customStyles, showCustom, showAppStyles, songBpm, onStyleChange, onDeleteCustom } = props;
  const [appStyles, setAppStyles] = useState<AppStyle[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [starredOnly, setStarredOnly] = useState(false);
  const [meter, setMeter] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppStyle | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Whether the list has been brought to the song's rhythm since it opened. */
  const placed = useRef(false);
  const [favorites, toggleFavorite] = useFavorites('styles');

  useEffect(() => {
    if (!open || !showAppStyles || appStyles) return;
    ensureAppStyles().then(setAppStyles).catch(() => setLoadError(true));
  }, [open, showAppStyles, appStyles]);
  // Each opening starts on the whole list, as the app's sheet does: not on the last rhythm
  // looked at, nor on the last search.
  useEffect(() => {
    placed.current = false;
    if (!open) return;
    setDetail(null);
    setQuery('');
    setGenre(null);
    setMeter(null);
    setStarredOnly(false);
  }, [open]);

  const entries = useMemo(() => {
    const all: Entry[] = [
      ...(showCustom ? customStyles : []).map((s) => ({ id: s.id, name: s.name, genre: MY_RHYTHMS, meter: meterOf(s), bpm: s.bpm, custom: true })),
      ...builtIn.map((s) => ({ id: s.id, name: s.name, genre: categoryGenre(s.category), meter: meterOf(s), bpm: s.bpm, custom: false })),
      ...(showAppStyles ? byName(appStyles ?? []) : []).map((s) => ({
        id: s.id, name: s.name, genre: s.genre, meter: `${s.meter.beats}/${s.meter.unit}`, bpm: s.bpm, custom: false, app: s,
      })),
    ];
    const order = [MY_RHYTHMS, ...GENRES];
    // By genre, and within one in the order they came: the web's, then the app's, then the
    // library's by name, as the app lists them.
    return all
      .map((e, i) => [e, i] as const)
      .sort(([a, i], [b, j]) => (order.indexOf(a.genre) - order.indexOf(b.genre)) || i - j)
      .map(([e]) => e);
  }, [builtIn, customStyles, appStyles, showCustom, showAppStyles]);

  const genres = useMemo(() => [
    ...(showCustom && customStyles.length ? [MY_RHYTHMS] : []),
    ...GENRES.filter((g) => entries.some((e) => e.genre === g)),
  ], [entries, showCustom, customStyles.length]);
  const meters = useMemo(() => [...new Set(entries.map((e) => e.meter))].sort((a, b) => {
    const [x, y] = [a, b].map((m) => m.split('/').map(Number));
    return x[1] - y[1] || x[0] - y[0];
  }), [entries]);

  const shown = useMemo(() => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    return entries.filter((e) =>
      (!starredOnly || favorites.has(e.id))
      && (genre === null || e.genre === genre)
      && (meter === null || e.meter === meter)
      && words.every((w) => plain(`${e.name} ${e.genre}`).includes(w)));
  }, [entries, query, genre, meter, starredOnly, favorites]);

  // Opened, the list starts on the song's rhythm — once it is in the list, which for one of
  // the library's is when the library has come.
  useEffect(() => {
    if (!open || detail || placed.current || !shown.some((e) => e.id === selectedStyleId)) return;
    placed.current = true;
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-style="${CSS.escape(selectedStyleId)}"]`)?.scrollIntoView({ block: 'center' });
    });
  }, [open, detail, shown, selectedStyleId]);

  const pick = (e: Entry) => {
    if (e.app) {
      setDetail(e.app);
      return;
    }
    onStyleChange(e.id);
    onOpenChange(false);
  };

  // Opened, the list starts on the song's rhythm; searched or filtered, from the top of what it finds.
  const toTop = () => {
    placed.current = true;
    listRef.current?.scrollTo({ top: 0 });
  };
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
        className="cp flex h-[85vh] max-h-[720px] w-[calc(100vw-24px)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl p-0 [&>button:last-child]:hidden"
        style={{ background: 'var(--cp-s1)', borderColor: 'var(--cp-ln)', color: 'var(--cp-tx)' }}
      >
        {detail ? (
          <AppStyleSheet
            style={detail}
            songBpm={songBpm}
            onBack={() => setDetail(null)}
            onApply={(apply) => {
              onStyleChange(detail.id, apply);
              onOpenChange(false);
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <DialogTitle className="m-0 flex-1 text-base font-bold">Rhythm</DialogTitle>
              <span className="text-xs" style={{ color: 'var(--cp-fa)' }}>{entries.length}</span>
              <button type="button" className="cp-icb" style={{ width: 32, height: 32 }} onClick={() => onOpenChange(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <DialogDescription className="sr-only">Pick the rhythm the song plays.</DialogDescription>
            <div className="px-4 pb-2">
              <label
                className="flex h-10 items-center gap-2 rounded-full px-3"
                style={{ background: 'var(--cp-s2)', border: '1px solid var(--cp-ln)', color: 'var(--cp-mu)' }}
              >
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => { toTop(); setQuery(e.target.value); }}
                  placeholder="Search: salsa, waltz, ballad…"
                  aria-label="Search rhythms"
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
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-1.5">
              {chip('all', 'All', !starredOnly && genre === null, () => { setStarredOnly(false); setGenre(null); })}
              {chip('favorites', <><Star size={13} fill="currentColor" strokeWidth={0} style={{ color: 'var(--cp-maj)' }} />Favourites</>, starredOnly, () => { setStarredOnly(true); setGenre(null); })}
              {genres.map((g) => chip(`genre-${g}`, g, !starredOnly && genre === g, () => { setStarredOnly(false); setGenre(g); }))}
            </div>
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
              {chip('meter-any', 'Any meter', meter === null, () => setMeter(null))}
              {meters.map((m) => chip(`meter-${m}`, m, meter === m, () => setMeter(m)))}
            </div>
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {shown.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm" style={{ color: 'var(--cp-fa)' }}>
                  {starredOnly && favorites.size === 0 ? "Tap a rhythm's star and it will be here." : 'No rhythm matches'}
                </p>
              ) : shown.map((e, i) => {
                const heading = i === 0 || shown[i - 1].genre !== e.genre;
                const on = e.id === selectedStyleId;
                const starred = favorites.has(e.id);
                return (
                  <div key={e.id} data-style={e.id}>
                    {heading && <div className="cp-lbl px-3 pb-1 pt-3">{e.genre}</div>}
                    <div
                      className="flex items-center gap-1 rounded-xl pl-3"
                      style={on ? { background: 'var(--cp-acs)' } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => pick(e)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent py-2 text-left"
                        style={{ color: 'inherit' }}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: styleDotColor(e.id) }} aria-hidden="true" />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13.5px] font-semibold">{e.name}</span>
                          <span className="text-[11px]" style={{ color: 'var(--cp-fa)' }}>{e.bpm} BPM · {e.meter}</span>
                        </span>
                      </button>
                      {on && <Check size={17} style={{ color: 'var(--cp-act)' }} aria-label="Playing" />}
                      {e.custom && onDeleteCustom && (
                        <button type="button" className="cp-icb" style={{ width: 34, height: 34 }} onClick={() => onDeleteCustom(e.id)} aria-label={`Delete ${e.name}`}>
                          <Trash2 size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="cp-icb"
                        style={{ width: 36, height: 36, color: starred ? 'var(--cp-maj)' : 'var(--cp-fa)' }}
                        onClick={() => toggleFavorite(e.id)}
                        aria-pressed={starred}
                        aria-label={starred ? `Remove ${e.name} from favourites` : `Add ${e.name} to favourites`}
                        title={starred ? 'Remove from favourites' : 'Add to favourites'}
                      >
                        <Star size={18} fill={starred ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {showAppStyles && !appStyles && !loadError && (
                <div className="flex items-center justify-center gap-2 py-4 text-xs" style={{ color: 'var(--cp-fa)' }}>
                  <Loader2 size={14} className="animate-spin" />Loading the rhythm library…
                </div>
              )}
              {loadError && (
                <p className="py-4 text-center text-xs" style={{ color: 'var(--cp-dg)' }}>Could not load the rhythm library.</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * What a rhythm of the app's brings, and the two things putting it on a song asks: whether the
 * song gets its intro and ending, and whether it takes its tempo — the app's user_style_sheet.dart.
 */
function AppStyleSheet({ style, songBpm, onBack, onApply }: {
  style: AppStyle;
  songBpm?: number;
  onBack: () => void;
  onApply: (apply: AppStyleApply) => void;
}) {
  const facts = appStyleFacts(style);
  const hasParts = facts.introBars > 0 || facts.endingBars > 0;
  const [introAndEnding, setIntroAndEnding] = useState(hasParts);
  const [tempo, setTempo] = useState(true);
  const askTempo = songBpm === undefined || songBpm !== style.bpm;
  const lines = [
    `${style.bpm} BPM · ${style.meter.beats}/${style.meter.unit}`,
    facts.hasB ? 'Variations A and B, with their fills' : 'Variation A with its fill',
    ...(facts.introBars ? [`Intro · ${facts.introBars} bars`] : []),
    ...(facts.endingBars ? [`Ending · ${facts.endingBars} bars`] : []),
  ];
  const row = (title: string, subtitle: string, checked: boolean, onChange: (v: boolean) => void, id: string) => (
    <label htmlFor={id} className="flex items-center gap-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs" style={{ color: 'var(--cp-fa)' }}>{subtitle}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5 pt-4">
      <button type="button" onClick={onBack} className="-ml-1 flex items-center gap-1 self-start border-0 bg-transparent p-1 text-xs font-semibold" style={{ color: 'var(--cp-mu)' }}>
        <ArrowLeft size={15} />All rhythms
      </button>
      <span className="cp-lbl mt-3">{style.id.startsWith('lib-') ? 'Rhythm library' : 'Chord Sequence app'} · {style.genre}</span>
      <DialogTitle className="m-0 mt-1 text-xl font-extrabold">{style.name}</DialogTitle>
      <DialogDescription className="sr-only">What this rhythm brings, before it is put on the song.</DialogDescription>
      <div className="mt-3 flex flex-col gap-1.5">
        {lines.map((line) => (
          <div key={line} className="flex items-center gap-2 text-[13.5px]">
            <CheckCircle2 size={16} style={{ color: 'var(--cp-act)' }} />{line}
          </div>
        ))}
        {facts.hasB && (
          <div className="flex items-start gap-2 text-[12.5px]" style={{ color: 'var(--cp-mu)' }}>
            <Info size={15} className="mt-px shrink-0" />Each section plays A; its card switches it to B.
          </div>
        )}
      </div>
      <div className="mt-3">
        {hasParts && row('Add the intro and ending', "As sections at the start and the end, in the song's key", introAndEnding, setIntroAndEnding, 'app-style-parts')}
        {askTempo && row(
          `Use its tempo: ${style.bpm} BPM`,
          songBpm !== undefined ? `Otherwise the song stays at ${songBpm} BPM` : 'Otherwise the song keeps its tempo',
          tempo, setTempo, 'app-style-tempo',
        )}
      </div>
      <button
        type="button"
        onClick={() => onApply({ introAndEnding: hasParts && introAndEnding, tempo: !askTempo || tempo })}
        className="mt-4 flex h-12 items-center justify-center rounded-xl border-0 font-bold text-white"
        style={{ background: 'var(--cp-ac)' }}
      >
        Apply to the song
      </button>
      <button type="button" onClick={onBack} className="mt-1 h-10 border-0 bg-transparent text-sm font-semibold" style={{ color: 'var(--cp-mu)' }}>
        Cancel
      </button>
    </div>
  );
}
