import { ALL_KEYS, SONG_GENRES } from '@/lib/musicKeys';
import type { SongMeta } from './types';

interface Props {
  meta: SongMeta;
  onChange: (meta: SongMeta) => void;
  onNext: () => void;
}

const STYLES = [
  { id: 'pop_basic', label: 'Pop' },
  { id: 'pop_6_8', label: 'Pop 6/8' },
  { id: 'rock_basic', label: 'Rock' },
  { id: 'jazz_swing', label: 'Jazz' },
  { id: 'folk_strum', label: 'Folk' },
  { id: 'blues_shuffle', label: 'Blues' },
  { id: 'lofi_chill', label: 'Lo-fi' },
];

export default function MetaStep({ meta, onChange, onNext }: Props) {
  const set = (patch: Partial<SongMeta>) => onChange({ ...meta, ...patch });
  const valid = meta.title.trim() && meta.artist.trim() && meta.key;

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-foreground mb-1">Song details</h2>
      <p className="text-sm text-muted-foreground mb-8">Basic info about the song you're adding</p>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">Song title *</label>
            <input
              value={meta.title}
              onChange={e => set({ title: e.target.value })}
              placeholder="Yesterday"
              className="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">Artist *</label>
            <input
              value={meta.artist}
              onChange={e => set({ artist: e.target.value })}
              placeholder="The Beatles"
              className="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">Album (optional)</label>
            <input
              value={meta.album}
              onChange={e => set({ album: e.target.value })}
              placeholder="Help!"
              className="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Key */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Key *</label>
            <select
              value={meta.key}
              onChange={e => set({ key: e.target.value })}
              className="w-full border border-border rounded-xl px-3 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <optgroup label="Major">
                {ALL_KEYS.filter(k => !k.endsWith('m') || k.length === 2 && k === 'Bm').slice(0,12).map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </optgroup>
              <optgroup label="Minor">
                {ALL_KEYS.filter(k => k.endsWith('m') && k.length >= 2).map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Capo */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Capo</label>
            <select
              value={meta.capo}
              onChange={e => set({ capo: Number(e.target.value) })}
              className="w-full border border-border rounded-xl px-3 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value={0}>None</option>
              {[1,2,3,4,5,6,7].map(n => (
                <option key={n} value={n}>Capo {n}</option>
              ))}
            </select>
          </div>

          {/* BPM */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">BPM</label>
            <input
              type="number"
              min={40} max={240}
              value={meta.bpm}
              onChange={e => set({ bpm: Number(e.target.value) })}
              className="w-full border border-border rounded-xl px-3 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* Style */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Rhythm style</label>
          <div className="grid grid-cols-3 gap-2">
            {STYLES.map(s => (
              <button
                key={s.id}
                onClick={() => set({ style: s.id })}
                className={`text-sm py-2 rounded-xl border transition-colors
                  ${meta.style === s.id
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'bg-background text-foreground border-border hover:border-primary/50'
                  }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Genre */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Genre (optional)</label>
          <div className="flex flex-wrap gap-2">
            {SONG_GENRES.map(g => {
              const active = meta.genre.includes(g);
              return (
                <button
                  key={g}
                  onClick={() => set({ genre: active ? meta.genre.filter(x => x !== g) : [...meta.genre, g] })}
                  className={`text-xs capitalize px-3 py-1 rounded-full border transition-colors
                    ${active
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                    }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-end">
        <button
          onClick={onNext}
          disabled={!valid}
          className="px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next: Add lyrics →
        </button>
      </div>
    </div>
  );
}
