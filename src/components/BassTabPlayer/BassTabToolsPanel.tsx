import type { BassSound } from '../../lib/bassTab/types'
import { v } from '../../lib/bassTab/theme'

/**
 * Panel de herramientas lateral (escritorio).
 *
 * Recoge los ajustes que *persisten mientras escribes* — duración de nota,
 * sonido, compás y volumen — y los saca del transporte, que hasta ahora los
 * mezclaba con los controles de reproducción. La distinción es la del
 * prototipo PentagramTab: a la izquierda lo que configura cómo escribes, abajo
 * lo que ocurre en el tiempo.
 *
 * Aquí solo hay controles ya cableados. Las secciones del prototipo que
 * dependen de campos que `BassNote` todavía no tiene — silencios,
 * articulaciones (hammer-on, pull-off, slide, bend) y armadura — se añadirán
 * cuando exista el modelo; poner los botones antes sería decorado que no hace
 * nada.
 */

const DURATIONS = [
  { v: 4,    key: '1', name: 'Whole · 4 beats' },
  { v: 2,    key: '2', name: 'Half · 2 beats' },
  { v: 1,    key: '3', name: 'Quarter · 1 beat' },
  { v: 0.5,  key: '4', name: '8th · ½ beat' },
  { v: 0.25, key: '5', name: '16th · ¼ beat' },
] as const

const SOUNDS: { value: BassSound; label: string }[] = [
  { value: 'fender', label: 'Fender' },
  { value: 'finger', label: 'Finger' },
  { value: 'slap',   label: 'Slap' },
  { value: 'muted',  label: 'Muted' },
]

interface Props {
  noteDuration: number
  onNoteDurationChange: (d: number) => void
  sound: BassSound
  onSoundChange: (s: BassSound) => void
  beatsPerBar: number
  onBeatsPerBarChange?: (n: number) => void
  volume: number
  onVolumeChange: (vol: number) => void
  /**
   * Si la vista coloca notas. La vista Bass Guitar no —solo se explora el
   * mástil—, así que allí Duration, compás y los atajos de escritura sobran, y
   * quedan solo Sound y Volume, que sí afectan a lo que suena.
   */
  editingTools?: boolean
}

export function BassTabToolsPanel({
  noteDuration, onNoteDurationChange,
  sound, onSoundChange,
  beatsPerBar, onBeatsPerBarChange,
  volume, onVolumeChange,
  editingTools = true,
}: Props) {
  const activeDuration = DURATIONS.find(d => d.v === noteDuration)

  return (
    <aside
      style={{
        width: 208, flexShrink: 0,
        background: v('card'),
        borderRight: `1px solid ${v('rule')}`,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {editingTools && (
      <Section title="Duration">
        <div style={{ display: 'flex', background: v('sunken'), borderRadius: 9, padding: 3, gap: 2 }}>
          {DURATIONS.map(d => {
            const active = d.v === noteDuration
            return (
              <button
                key={d.v}
                onClick={() => onNoteDurationChange(d.v)}
                title={`${d.name} — tecla ${d.key}`}
                aria-pressed={active}
                style={{
                  flex: 1, height: 38, border: 'none', borderRadius: 7,
                  background: active ? v('accent') : 'transparent',
                  color: active ? '#fff' : v('ink'),
                  cursor: 'pointer', position: 'relative',
                  display: 'grid', placeItems: 'center',
                  boxShadow: active ? v('shadow') : 'none',
                  transition: 'background .12s, color .12s',
                }}
              >
                <NoteGlyph value={d.v} />
                <span style={{
                  position: 'absolute', bottom: 1, right: 3,
                  fontSize: 8, opacity: .5, fontFamily: 'var(--bt-mono)',
                }}>{d.key}</span>
              </button>
            )
          })}
        </div>
        <div style={{
          fontSize: 10, color: v('dim'), textAlign: 'center',
          fontFamily: 'var(--bt-mono)',
        }}>
          {activeDuration?.name ?? `${noteDuration} beats`}
        </div>
      </Section>
      )}

      <Section title="Sound">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {SOUNDS.map(s => {
            const active = s.value === sound
            return (
              <button
                key={s.value}
                onClick={() => onSoundChange(s.value)}
                aria-pressed={active}
                style={{
                  height: 32, borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${active ? v('accent') : v('rule')}`,
                  background: active ? v('accent') : v('card'),
                  color: active ? '#fff' : v('ink'),
                  fontSize: 12, fontWeight: 600,
                  transition: 'background .12s, color .12s, border-color .12s',
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </Section>

      {editingTools && onBeatsPerBarChange && (
        <Section title="Time signature">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'flex', alignItems: 'center', flex: 1,
              border: `1px solid ${v('rule')}`, borderRadius: 8, overflow: 'hidden',
            }}>
              <Step label="−" onClick={() => onBeatsPerBarChange(Math.max(2, beatsPerBar - 1))} />
              <span style={{
                flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 13,
                fontFamily: 'var(--bt-mono)', fontVariantNumeric: 'tabular-nums',
              }}>{beatsPerBar}</span>
              <Step label="+" onClick={() => onBeatsPerBarChange(Math.min(8, beatsPerBar + 1))} />
            </span>
            <span style={{ fontFamily: 'var(--bt-mono)', fontWeight: 700, color: v('dim') }}>/ 4</span>
          </div>
        </Section>
      )}

      <Section title="Volume">
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          aria-label="Volumen"
          style={{ width: '100%', accentColor: v('accent') }}
        />
      </Section>

      <div style={{ padding: 12, fontSize: 10.5, lineHeight: 1.75, color: v('dim') }}>
        <h2 style={{
          fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
          color: v('dim'), fontWeight: 700, margin: '0 0 6px',
        }}>Shortcuts</h2>
        {editingTools ? (
          <>
            <div><Key>0–9</Key> traste · <Key>↑↓</Key> cuerda · <Key>←→</Key> nota</div>
            <div><Key>1–5</Key> duración · <Key>Del</Key> borrar</div>
            <div><Key>Space</Key> play · <Key>Ctrl+Z</Key> deshacer</div>
          </>
        ) : (
          <>
            <div><Key>Arrastra</Key> mover · <Key>Shift</Key> girar</div>
            <div><Key>Rueda</Key> zoom · <Key>Doble clic</Key> reencuadrar</div>
            <div><Key>Space</Key> play</div>
          </>
        )}
      </div>
    </aside>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 12, borderBottom: `1px solid ${v('sunken')}`,
      display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <h2 style={{
        fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
        color: v('dim'), fontWeight: 700, margin: 0,
      }}>{title}</h2>
      {children}
    </div>
  )
}

function Step({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 26, height: 30, border: 'none', background: v('sunken'),
        color: v('muted'), fontSize: 14, cursor: 'pointer',
      }}
    >{label}</button>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <b style={{ color: v('soft'), fontFamily: 'var(--bt-mono)', fontWeight: 700 }}>
      {children}
    </b>
  )
}

/** Figura musical dibujada como forma: no depende de que cargue ninguna fuente. */
function NoteGlyph({ value }: { value: number }) {
  const filled = value <= 1
  const stem   = value <= 2
  const flags  = value === 0.5 ? 1 : value === 0.25 ? 2 : 0
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
      <ellipse
        cx={stem ? 6.4 : 8.5} cy={stem ? 12 : 11}
        rx={4.2} ry={3}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth={1.7}
      />
      {stem && <path d="M10.4 12V3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />}
      {Array.from({ length: flags }, (_, i) => (
        <path
          key={i}
          d={`M10.4 ${3.4 + i * 3.2}c2.6 1 3.6 2.4 3.1 4.4`}
          stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round"
        />
      ))}
    </svg>
  )
}
