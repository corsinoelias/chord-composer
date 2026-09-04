import { useRef, useState } from 'react';
import {
  PRESETS, SWATCHES, PAGE_SIZES, FAMILIES, type StyleLayout, type PresetId, type FontRoleName, type FontFamily,
} from '@/lib/chordSheet/presets';
import { fileToDataUri } from '@/lib/chordSheet/imageAsset';

interface Props {
  layout: StyleLayout;
  onChange: (patch: Partial<StyleLayout>) => void;
}

const ALIGNMENTS: { value: StyleLayout['align']; label: string }[] = [
  { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' },
];
const DIAGRAM_SPOTS: { value: StyleLayout['diagramSpot']; label: string }[] = [
  { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'none', label: 'Hidden' },
];
const FONT_ROLES: { value: FontRoleName; label: string }[] = [
  { value: 'heading', label: 'Title' }, { value: 'section', label: 'Section' },
  { value: 'chords', label: 'Chords' }, { value: 'lyrics', label: 'Lyrics' },
];
const FAMILY_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'sans', label: 'Sans' }, { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' }, { value: 'hand', label: 'Handwritten' },
];

function segButton(active: boolean) {
  return `rounded-md px-2.5 py-1 text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`;
}

/** Toolbar controls for the printed chart's presentation — preset, per-role fonts, paper,
 *  columns, alignment, scale, diagram placement. All of it lives in `layout` (persisted
 *  as chord_sheets.layout jsonb), separate from the musical content in `doc.text`. */
export function StyleControls({ layout, onChange }: Props) {
  const [openPanel, setOpenPanel] = useState<'style' | 'font' | null>(null);
  const [fontRole, setFontRole] = useState<FontRoleName>('lyrics');
  const role = layout.fonts[fontRole];
  const logoInputRef = useRef<HTMLInputElement>(null);
  const wmInputRef = useRef<HTMLInputElement>(null);

  function patchFont(patch: Partial<typeof role>) {
    onChange({ fonts: { ...layout.fonts, [fontRole]: { ...role, ...patch } } });
  }

  function patchAssets(patch: Partial<StyleLayout['assets']>) {
    onChange({ assets: { ...layout.assets, ...patch } });
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    try { patchAssets({ logo: await fileToDataUri(file, 300) }); } catch { /* not a readable image — ignore */ }
  }

  async function pickWatermark(file: File | undefined) {
    if (!file) return;
    try { patchAssets({ watermark: await fileToDataUri(file, 900) }); } catch { /* not a readable image — ignore */ }
  }

  function applyPreset(id: PresetId) {
    const p = PRESETS[id];
    onChange({
      preset: id,
      fonts: JSON.parse(JSON.stringify(p.fonts)),
      columns: p.columns,
      scale: p.scale,
    });
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Alignment</span>
        <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {ALIGNMENTS.map((a) => (
            <button key={a.value} type="button" onClick={() => onChange({ align: a.value })} className={segButton(layout.align === a.value)}>{a.label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Paper</span>
        <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {PAGE_SIZES.map((p) => (
            <button key={p.value} type="button" onClick={() => onChange({ pageSize: p.value })} className={segButton(layout.pageSize === p.value)}>{p.label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Columns</span>
        <div className="flex gap-1">
          {[1, 2].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ columns: n as 1 | 2 })}
              title={n === 1 ? 'Single column' : 'Two columns'}
              className={`flex h-7 w-8 items-center justify-center gap-[3px] rounded-md border px-1.5 ${layout.columns === n ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
            >
              <span className="h-3.5 flex-1 rounded-[1px] bg-foreground/70" />
              {n === 2 && <span className="h-3.5 flex-1 rounded-[1px] bg-foreground/70" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1" style={{ minWidth: 130 }}>
        <span className="text-[10px] font-semibold text-muted-foreground">Scale · {layout.scale}%</span>
        <input
          type="range" min={70} max={180} step={5} value={layout.scale}
          onChange={(e) => onChange({ scale: Number(e.target.value) })}
          className="accent-primary"
        />
      </div>

      <div className="relative flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Design</span>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ maxWidth: 340 }}>
            {(Object.keys(PRESETS) as PresetId[]).map((id) => {
              const p = PRESETS[id];
              const on = layout.preset === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyPreset(id)}
                  title={p.label}
                  className={`relative flex h-[38px] w-[54px] shrink-0 flex-col items-start justify-between overflow-hidden rounded-md border p-1 ${on ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}
                  style={{ background: p.paper }}
                >
                  <span
                    className="leading-none"
                    style={{ fontFamily: FAMILIES[p.fonts.heading.family], color: p.fonts.heading.color, fontWeight: 700, fontSize: 13 }}
                  >
                    Aa
                  </span>
                  <span className="flex w-full gap-[2px]">
                    <span className="h-[3px] flex-1 rounded-full" style={{ background: p.fonts.section.color }} />
                    <span className="h-[3px] flex-1 rounded-full" style={{ background: p.fonts.chords.color }} />
                    <span className="h-[3px] flex-1 rounded-full" style={{ background: p.ink }} />
                  </span>
                  {on && (
                    <span className="absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-bl-md bg-primary text-[9px] font-bold text-primary-foreground">✓</span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setOpenPanel((p) => (p === 'style' ? null : 'style'))}
            title="More design options"
            className="h-7 w-6 shrink-0 rounded-md border border-border text-xs hover:border-primary/50"
          >
            ▾
          </button>
        </div>
        {openPanel === 'style' && (
          <div className="absolute top-[52px] left-0 z-50 w-[300px] rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold">Design options</span>
              <button type="button" onClick={() => setOpenPanel(null)} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Diagrams</div>
            <div className="mb-3 flex gap-1.5">
              {DIAGRAM_SPOTS.map((d) => (
                <button key={d.value} type="button" onClick={() => onChange({ diagramSpot: d.value })} className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${layout.diagramSpot === d.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  {d.label}
                </button>
              ))}
            </div>

            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Background</div>
            <div className="mb-2 flex gap-1.5">
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
              <button type="button" onClick={() => logoInputRef.current?.click()} className="flex-1 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary">
                {layout.assets.logo ? '✓ Logo' : '+ Logo'}
              </button>
              <input ref={wmInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickWatermark(e.target.files?.[0])} />
              <button type="button" onClick={() => wmInputRef.current?.click()} className="flex-1 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary">
                {layout.assets.watermark ? '✓ Watermark' : '+ Watermark'}
              </button>
            </div>
            {layout.assets.logo && (
              <div className="mb-1.5 flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] text-muted-foreground">Logo · {layout.assets.logoH ?? 46}px</span>
                <input type="range" min={24} max={90} value={layout.assets.logoH ?? 46} onChange={(e) => patchAssets({ logoH: Number(e.target.value) })} className="flex-1 accent-primary" />
                <button type="button" onClick={() => patchAssets({ logo: undefined })} className="text-muted-foreground hover:text-destructive">×</button>
              </div>
            )}
            {layout.assets.watermark && (
              <>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[10px] text-muted-foreground">Size · {layout.assets.wmScale ?? 60}%</span>
                  <input type="range" min={20} max={100} value={layout.assets.wmScale ?? 60} onChange={(e) => patchAssets({ wmScale: Number(e.target.value) })} className="flex-1 accent-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[10px] text-muted-foreground">Fade · {layout.assets.wmOpacity ?? 12}%</span>
                  <input type="range" min={3} max={40} value={layout.assets.wmOpacity ?? 12} onChange={(e) => patchAssets({ wmOpacity: Number(e.target.value) })} className="flex-1 accent-primary" />
                  <button type="button" onClick={() => patchAssets({ watermark: undefined })} className="text-muted-foreground hover:text-destructive">×</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground">Font</span>
        <button
          type="button"
          onClick={() => setOpenPanel((p) => (p === 'font' ? null : 'font'))}
          className="h-7 rounded-md border border-border bg-card px-2.5 text-xs font-semibold hover:border-primary/50"
        >
          A ▾
        </button>
        {openPanel === 'font' && (
          <div className="absolute top-[52px] left-0 z-50 w-[290px] rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold">Font settings</span>
              <button type="button" onClick={() => setOpenPanel(null)} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
            <select
              value={fontRole}
              onChange={(e) => setFontRole(e.target.value as FontRoleName)}
              className="mb-3 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none"
            >
              {FONT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>

            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Family</div>
            <div className="mb-3 flex flex-col gap-1">
              {FAMILY_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => patchFont({ family: f.value })}
                  className={`rounded-md px-2.5 py-1.5 text-left text-sm ${role.family === f.value ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Size · {role.scale}%</div>
            <input
              type="range" min={60} max={180} step={5} value={role.scale}
              onChange={(e) => patchFont({ scale: Number(e.target.value) })}
              className="mb-3 w-full accent-primary"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => patchFont({ bold: !role.bold })}
                className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold ${role.bold ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
              >
                B
              </button>
              {SWATCHES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  title={s.title}
                  onClick={() => patchFont({ color: s.value })}
                  className="h-6 w-6 rounded-full border-2"
                  style={{ background: s.value, borderColor: role.color === s.value ? PRESETS[layout.preset].ink : 'transparent' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
