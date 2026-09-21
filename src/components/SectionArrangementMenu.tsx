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

import { useMemo, useState } from 'react';
import { ChevronDown, Guitar, Music, Piano, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

/** Each track keeps the colour it has in the canvas's arrangement view. */
const TRACK_COLORS: Record<TrackId, string> = {
  drums: 'var(--cp-sus)',
  bass: 'var(--cp-sev)',
  piano: 'var(--cp-min)',
  guitar: 'var(--cp-ac)',
};

function DrumIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <ellipse cx="12" cy="8" rx="8" ry="3" />
      <path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8M9 4 6 1M15 4l3-3" />
    </svg>
  );
}

function TrackIcon({ track, size = 16 }: { track: TrackId; size?: number }) {
  if (track === 'drums') return <DrumIcon size={size} />;
  if (track === 'bass') return <Music size={size} aria-hidden="true" />;
  if (track === 'piano') return <Piano size={size} aria-hidden="true" />;
  return <Guitar size={size} aria-hidden="true" />;
}

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
  /**
   * The chord player supplies its own "Options" button and, beside it, a chip that has to
   * open the same panel — hence the controlled `open` as well: one Popover, two ways in.
   * Left out, the built-in chip trigger is used and the panel manages its own state.
   */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Melodic variations for this section, one entry per track whose style offers more
   * than one. They used to be three icon buttons in the section header; the redesign
   * moves them in here, next to the track they belong to.
   */
  variationPickers?: Array<{
    key: 'bass' | 'piano' | 'guitar';
    label: string;
    variations: Array<{ id: string; name: string }>;
    activeId: string;
  }>;
  onVariationChange?: (instrument: 'bass' | 'piano' | 'guitar', variationId: string) => void;
  /** What the song plays on each track, so an inherited row can name it. */
  songSounds?: Partial<Record<TrackId, string>>;
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

export function SectionArrangementMenu({
  arrangement,
  onChange,
  songStyle,
  styles,
  sectionName,
  onEditRhythm,
  trigger,
  open,
  onOpenChange,
  variationPickers,
  onVariationChange,
  songSounds,
}: Props) {
  const slotsPerBar = getSlotsPerBar(songStyle);
  // One meter per song: only styles whose bar has the same length can play a section.
  const compatible = useMemo(
    () => styles.filter((s) => getSlotsPerBar(s) === slotsPerBar),
    [styles, slotsPerBar],
  );
  const summary = arrangementSummary(arrangement, styles);
  const set = (patch: Partial<SectionArrangement>) => onChange(clean({ ...arrangement, ...patch }));

  // Only one track's detail is open at a time — the panel is tall enough as it is.
  const [expanded, setExpanded] = useState<TrackId | null>(null);

  const sectionStyle = arrangement.styleId
    ? styles.find((s) => s.id === arrangement.styleId)
    : undefined;
  const rhythm = sectionStyle ?? songStyle;

  const selectClass =
    'h-9 w-full rounded-lg border px-2.5 text-[13px] font-semibold focus:outline-none focus:ring-1 focus:ring-ring';
  const selectStyle = {
    background: 'var(--cp-s1)',
    borderColor: 'var(--cp-ln2)',
    color: 'var(--cp-tx)',
  } as const;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {trigger ?? (
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
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="cp-pop flex w-[470px] max-w-[calc(100vw-1.5rem)] flex-col gap-[18px] p-[18px] text-left"
        style={{ color: 'var(--cp-tx)' }}
      >
        <div className="flex items-center gap-2.5">
          <span
            style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--cp-ac)' }}
            aria-hidden="true"
          />
          <span className="flex-grow text-sm font-bold">{sectionName} options</span>
          <button
            className="cp-btn cp-ib cp-gh"
            style={{ width: 32, height: 32 }}
            onClick={() => onOpenChange?.(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Rhythm ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5">
          <span className="cp-lbl">Rhythm for this section</span>

          {/* The real <select> sits invisible over the slab, so the whole card is the
              control — keyboard and screen readers get a plain native select. */}
          <label
            className="relative flex h-14 cursor-pointer items-center gap-3 rounded-xl px-3.5 pl-2.5"
            style={{
              background: 'var(--cp-s2)',
              border: `1px solid ${arrangement.styleId ? 'color-mix(in srgb, var(--cp-ac) 55%, transparent)' : 'var(--cp-ln2)'}`,
            }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: 'color-mix(in srgb, var(--cp-ac) 16%, transparent)', color: 'var(--cp-act)' }}
              aria-hidden="true"
            >
              <Music size={18} />
            </span>
            <span className="flex min-w-0 flex-grow flex-col gap-0.5">
              <span className="truncate text-sm font-bold">{rhythm.name}</span>
              <span className="truncate text-xs" style={{ color: 'var(--cp-mu)' }}>
                {arrangement.styleId ? `${rhythm.category} · own rhythm` : `${rhythm.category} · same as the song`}
              </span>
            </span>
            <ChevronDown size={18} style={{ color: 'var(--cp-mu)' }} aria-hidden="true" />
            <select
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={arrangement.styleId ?? ''}
              onChange={(e) => set({ styleId: e.target.value || undefined })}
              aria-label="Rhythm for this section"
            >
              <option value="">Same as the song ({songStyle.name})</option>
              {compatible.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            {onEditRhythm && (
              <button
                className="cp-btn flex-1"
                style={{ height: 36, fontSize: 12.5 }}
                onClick={onEditRhythm}
              >
                <SlidersHorizontal size={16} style={{ color: 'var(--cp-act)' }} />
                Edit this rhythm
              </button>
            )}
            <button
              className="cp-btn cp-gh flex-1"
              style={{ height: 36, fontSize: 12.5, borderColor: 'var(--cp-ln)' }}
              onClick={() => set({ styleId: undefined, trackStyles: undefined, patterns: undefined })}
              disabled={!arrangement.styleId && !arrangement.trackStyles && !arrangement.patterns}
            >
              Use song's · {songStyle.name}
            </button>
          </div>

          <span className="text-[11.5px] leading-[1.45]" style={{ color: 'var(--cp-mu)' }}>
            Only rhythms in the same meter as the song are listed.
          </span>
        </div>

        {/* ── Tracks ──────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span className="cp-lbl">Tracks that play</span>

          {TRACK_IDS.map((track) => {
            const config = INSTRUMENTS.find((i) => i.id === track);
            const off = !!arrangement.silenced?.[track];
            const ownSound = arrangement.sounds?.[track];
            const variation = variationPickers?.find((v) => v.key === track);
            const isOpen = expanded === track;
            const differs = !!ownSound || !!arrangement.trackStyles?.[track] || !!arrangement.patterns?.[track];
            const soundName = (id: string | undefined) =>
              config?.soundTypes.find((s) => s.id === id)?.name;
            const canExpand = !off && (!!config?.soundTypes.length || !!variation);

            return (
              <div
                key={track}
                className="rounded-xl"
                style={{
                  background: 'var(--cp-s2)',
                  border: `1px solid ${differs ? 'color-mix(in srgb, var(--cp-ac) 40%, transparent)' : 'var(--cp-ln)'}`,
                }}
              >
                <div className="flex h-[52px] items-center gap-3 px-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                    style={{
                      background: `color-mix(in srgb, ${TRACK_COLORS[track]} 16%, transparent)`,
                      color: TRACK_COLORS[track],
                      opacity: off ? 0.55 : 1,
                    }}
                  >
                    <TrackIcon track={track} />
                  </span>

                  <span
                    className="flex min-w-0 flex-grow flex-col gap-[3px]"
                    style={{ opacity: off ? 0.55 : 1 }}
                  >
                    <span className="text-[13.5px] font-semibold">{TRACK_LABELS[track]}</span>
                    <span
                      className="flex items-center gap-1.5 truncate text-[11.5px]"
                      style={{ color: 'var(--cp-mu)' }}
                    >
                      {differs && (
                        <i
                          className="shrink-0"
                          style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--cp-ac)', transform: 'rotate(45deg)' }}
                          aria-hidden="true"
                        />
                      )}
                      {off
                        ? 'Muted in this section'
                        : [soundName(ownSound ?? songSounds?.[track] ?? config?.defaultSoundType), variation && variation.variations.find(v => v.id === variation.activeId)?.name]
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                  </span>

                  {canExpand && (
                    <button
                      className="cp-btn cp-ib cp-gh"
                      style={{ width: 28, height: 28 }}
                      onClick={() => setExpanded(isOpen ? null : track)}
                      aria-expanded={isOpen}
                      aria-label={`${TRACK_LABELS[track]} sound and variation`}
                    >
                      <ChevronDown
                        size={16}
                        style={{ color: 'var(--cp-mu)', transform: isOpen ? 'rotate(180deg)' : undefined }}
                      />
                    </button>
                  )}

                  <button
                    type="button"
                    role="switch"
                    aria-checked={!off}
                    aria-label={`${TRACK_LABELS[track]} plays in ${sectionName}`}
                    onClick={() => set({ silenced: { ...arrangement.silenced, [track]: off ? undefined : true } })}
                    className={`cp-sw ${off ? '' : 'cp-on'}`}
                  />
                </div>

                {isOpen && canExpand && (
                  <div className="flex flex-col gap-3 px-3 pb-3.5 pt-0.5">
                    <div className="flex gap-2.5">
                      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex items-baseline justify-between gap-1.5">
                          <span className="cp-lbl" style={{ fontSize: 10 }}>Sound</span>
                          {songSounds?.[track] && (
                            <span className="truncate text-[11px]" style={{ color: 'var(--cp-mu)' }}>
                              Song: {soundName(songSounds[track])}
                            </span>
                          )}
                        </span>
                        <select
                          className={selectClass}
                          style={selectStyle}
                          value={ownSound ?? ''}
                          onChange={(e) => set({ sounds: { ...arrangement.sounds, [track]: e.target.value || undefined } })}
                        >
                          <option value="">Same as the song</option>
                          {config?.soundTypes.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </label>

                      {variation && onVariationChange && (
                        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="cp-lbl" style={{ fontSize: 10 }}>Variation</span>
                          <select
                            className={selectClass}
                            style={selectStyle}
                            value={variation.activeId}
                            onChange={(e) => onVariationChange(variation.key, e.target.value)}
                          >
                            {variation.variations.map((v) => (
                              <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>

                    <label className="flex flex-col gap-1.5">
                      <span className="cp-lbl" style={{ fontSize: 10 }}>Rhythm for this track</span>
                      <select
                        className={selectClass}
                        style={selectStyle}
                        value={arrangement.trackStyles?.[track] ?? ''}
                        onChange={(e) => set({ trackStyles: { ...arrangement.trackStyles, [track]: e.target.value || undefined } })}
                      >
                        <option value="">Section rhythm ({rhythm.name})</option>
                        {compatible.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </label>

                    {arrangement.patterns?.[track] && (
                      <div className="flex items-center justify-between gap-2 text-[11.5px]" style={{ color: 'var(--cp-mu)' }}>
                        <span>This track's groove was edited by hand.</span>
                        <button
                          className="cp-btn cp-gh"
                          style={{ height: 26, padding: '0 8px', fontSize: 11.5, color: 'var(--cp-act)' }}
                          onClick={() => set({ patterns: { ...arrangement.patterns, [track]: undefined } })}
                        >
                          Back to the rhythm
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--cp-ln)', margin: '0 -18px' }} />

        <button
          className="cp-btn cp-gh self-start"
          style={{ height: 36, margin: '-6px 0 -4px -8px', color: 'var(--cp-tx2)', fontSize: 12.5 }}
          onClick={() => onChange({})}
          disabled={!summary}
        >
          Reset section to song defaults
        </button>
      </PopoverContent>
    </Popover>
  );
}
