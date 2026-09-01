import { useState } from 'react';
import {
  PRESETS, SWATCHES, PAGE_SIZES, type StyleLayout, type PresetId, type FontRoleName, type FontFamily,
} from '@/lib/chordSheet/presets';

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

  function patchFont(patch: Partial<typeof role>) {
    onChange({ fonts: { ...layout.fonts, [fontRole]: { ...role, ...patch } } });
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
        <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {[1, 2].map((n) => (
            <button key={n} type="button" onClick={() => onChange({ columns: n as 1 | 2 })} className={segButton(layout.columns === n)}>{n}</button>
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
        <span className="text-[10px] font-semibold text-muted-foreground">Style</span>
        <button
          type="button"
          onClick={() => setOpenPanel((p) => (p === 'style' ? null : 'style'))}
          className="h-7 rounded-md border border-border bg-card px-2.5 text-xs font-semibold hover:border-primary/50"
        >
          {PRESETS[layout.preset].label} ▾
        </button>
        {openPanel === 'style' && (
          <div className="absolute top-[52px] left-0 z-50 w-[300px] rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold">Page style</span>
              <button type="button" onClick={() => setOpenPanel(null)} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyPreset(id)}
                  className={`rounded-lg border px-2.5 py-2 text-left text-xs font-semibold ${layout.preset === id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/40'}`}
                  style={{ background: layout.preset === id ? undefined : PRESETS[id].paper, color: layout.preset === id ? undefined : PRESETS[id].ink }}
                >
                  {PRESETS[id].label}
                </button>
              ))}
            </div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Diagrams</div>
            <div className="flex gap-1.5">
              {DIAGRAM_SPOTS.map((d) => (
                <button key={d.value} type="button" onClick={() => onChange({ diagramSpot: d.value })} className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${layout.diagramSpot === d.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  {d.label}
                </button>
              ))}
            </div>
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
