/**
 * "Section options": how one section plays differently from the song — its rhythm, the
 * tracks it plays and the sound of each instrument. Shared by the chord editor's
 * SectionCard and the song creator's section card, so both write the same fields
 * (src/lib/sections.ts) that the engine and the Flutter app read.
 *
 * Everything here is optional and "Same as the song" removes the field instead of writing
 * the song's value into it: a section that inherits keeps following the song when the song
 * changes (docs/ritmo-por-seccion.md, rule 6).
 */

import { useMemo } from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { type Section, type TrackId, TRACK_IDS, sectionHasArrangement } from '@/lib/sections';
import { type StylePattern, getSlotsPerBar } from '@/lib/styles';
import { INSTRUMENTS } from '@/lib/instruments';

/** The part of a Section this menu edits. */
export type SectionArrangement = Pick<Section, 'styleId' | 'trackStyles' | 'patterns' | 'silenced' | 'sounds'>;

const TRACK_LABELS: Record<TrackId, string> = {
  drums: 'Drums',
  bass: 'Bass',
  piano: 'Piano',
  guitar: 'Guitar',
};

interface Props {
  arrangement: SectionArrangement;
  onChange: (next: SectionArrangement) => void;
  /** The song's style: the meter every section rhythm has to share, and the "inherit" label. */
  songStyle: StylePattern;
  /** Styles a section may pick (built-ins, plus "Mis ritmos" in the editor only). */
  styles: StylePattern[];
  sectionName: string;
  /** Edit the section's rhythm grid (opens the Rhythm Editor on its style). Editor only. */
  onEditRhythm?: () => void;
}

/** Drops empty maps and false/empty values, so "nothing different" is stored as nothing. */
function clean(a: SectionArrangement): SectionArrangement {
  const out: SectionArrangement = {};
  if (a.styleId) out.styleId = a.styleId;
  const keep = <T,>(m: Partial<Record<TrackId, T>> | undefined, ok: (v: T) => boolean) => {
    const entries = Object.entries(m ?? {}).filter(([, v]) => ok(v as T));
    return entries.length > 0 ? (Object.fromEntries(entries) as Partial<Record<TrackId, T>>) : undefined;
  };
  const trackStyles = keep(a.trackStyles, (v) => !!v);
  const patterns = keep(a.patterns, (v) => !!v);
  const silenced = keep(a.silenced, (v) => v === true);
  const sounds = keep(a.sounds, (v) => !!v);
  if (trackStyles) out.trackStyles = trackStyles;
  if (patterns) out.patterns = patterns;
  if (silenced) out.silenced = silenced;
  if (sounds) out.sounds = sounds;
  return out;
}

/** A short summary of what differs, for the chip on the section header. */
export function arrangementSummary(a: SectionArrangement, styles: StylePattern[]): string | null {
  if (!sectionHasArrangement(a as Section)) return null;
  const parts: string[] = [];
  const name = (id: string) => styles.find((s) => s.id === id)?.name ?? id;
  if (a.styleId) parts.push(name(a.styleId));
  if (a.trackStyles && Object.keys(a.trackStyles).length) parts.push('mixed rhythm');
  if (a.patterns && Object.keys(a.patterns).length) parts.push('edited groove');
  const off = TRACK_IDS.filter((t) => a.silenced?.[t]);
  if (off.length) parts.push(`no ${off.map((t) => TRACK_LABELS[t].toLowerCase()).join('/')}`);
  if (a.sounds && Object.keys(a.sounds).length) parts.push('own sounds');
  return parts.join(' · ');
}

export function SectionArrangementMenu({ arrangement, onChange, songStyle, styles, sectionName, onEditRhythm }: Props) {
  const slotsPerBar = getSlotsPerBar(songStyle);
  // One meter per song: only styles whose bar has the same length can play a section.
  const compatible = useMemo(
    () => styles.filter((s) => getSlotsPerBar(s) === slotsPerBar),
    [styles, slotsPerBar],
  );
  const summary = arrangementSummary(arrangement, styles);
  const set = (patch: Partial<SectionArrangement>) => onChange(clean({ ...arrangement, ...patch }));

  const selectClass =
    'h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={summary ? 'secondary' : 'ghost'}
          size="sm"
          className={`h-6 gap-1 px-1.5 text-[11px] max-w-[11rem] ${summary ? '' : 'opacity-60 hover:opacity-100'}`}
          aria-label={`Section options for ${sectionName}`}
          title={summary ?? 'Section options: rhythm, tracks and sounds'}
        >
          <SlidersHorizontal className="h-3 w-3 shrink-0" />
          {summary && <span className="truncate">{summary}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="text-xs font-semibold">{sectionName}: section options</div>

        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Rhythm</span>
          <select
            className={selectClass}
            value={arrangement.styleId ?? ''}
            onChange={(e) => set({ styleId: e.target.value || undefined })}
          >
            <option value="">Same as the song ({songStyle.name})</option>
            {compatible.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        <details className="text-xs" open={!!arrangement.trackStyles && Object.keys(arrangement.trackStyles).length > 0}>
          <summary className="cursor-pointer text-[11px] text-muted-foreground">Rhythm per instrument</summary>
          <div className="mt-2 space-y-1.5">
            {TRACK_IDS.map((t) => (
              <label key={t} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[11px]">{TRACK_LABELS[t]}</span>
                <select
                  className={selectClass}
                  value={arrangement.trackStyles?.[t] ?? ''}
                  onChange={(e) => set({ trackStyles: { ...arrangement.trackStyles, [t]: e.target.value || undefined } })}
                >
                  <option value="">Section rhythm</option>
                  {compatible.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>

        {arrangement.patterns && Object.keys(arrangement.patterns).length > 0 && (
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-[11px]">
            <span>Edited groove: {Object.keys(arrangement.patterns).map((t) => TRACK_LABELS[t as TrackId]).join(', ')}</span>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={() => set({ patterns: undefined })}>
              Back to style
            </Button>
          </div>
        )}

        {onEditRhythm && (
          <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={onEditRhythm}>
            Edit this section's rhythm…
          </Button>
        )}

        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">Tracks that play</span>
          {TRACK_IDS.map((t) => (
            <label key={t} className="flex items-center justify-between text-xs">
              {TRACK_LABELS[t]}
              <Switch
                checked={!arrangement.silenced?.[t]}
                onCheckedChange={(on) => set({ silenced: { ...arrangement.silenced, [t]: !on } })}
                aria-label={`${TRACK_LABELS[t]} plays in ${sectionName}`}
              />
            </label>
          ))}
        </div>

        <div className="space-y-1.5">
          <span className="text-[11px] text-muted-foreground">Sound in this section</span>
          {TRACK_IDS.map((t) => {
            const config = INSTRUMENTS.find((i) => i.id === t);
            return (
              <label key={t} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[11px]">{TRACK_LABELS[t]}</span>
                <select
                  className={selectClass}
                  value={arrangement.sounds?.[t] ?? ''}
                  onChange={(e) => set({ sounds: { ...arrangement.sounds, [t]: e.target.value || undefined } })}
                >
                  <option value="">Same as the song</option>
                  {config?.soundTypes.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>

        {summary && (
          <Button variant="ghost" size="sm" className="h-7 w-full gap-1 text-xs" onClick={() => onChange({})}>
            <RotateCcw className="h-3 w-3" /> Play like the rest of the song
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
