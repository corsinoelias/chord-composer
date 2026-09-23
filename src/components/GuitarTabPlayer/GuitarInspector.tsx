import React, { useState } from 'react'
import type { GuitarNote, GuitarSound, GuitarTechnique } from '../../lib/guitarTab/types'
import { CHORD_SHAPES, fretToNoteName, type ChordShape } from '../../lib/guitarTab/guitarTheory'
import { T, STRING_COLORS, STRING_NAMES, sectionLabel } from './theme'

export const SOUNDS: { value: GuitarSound; label: string }[] = [
  { value: 'sf2',             label: 'Steel ★' },
  { value: 'sf2-nylon',       label: 'Nylon ★' },
  { value: 'sf2-clean',       label: 'Clean ★' },
  { value: 'sf2-jazz',        label: 'Jazz ★' },
  { value: 'sf2-muted',       label: 'Muted ★' },
  { value: 'sf2-distortion',  label: 'Distorted ★' },
  { value: 'sf2-overdrive',   label: 'Overdrive ★' },
  { value: 'sf2-harmonics',   label: 'Harmonics ★' },
  { value: 'acoustic',        label: 'Acoustic' },
  { value: 'nylon',           label: 'Nylon' },
  { value: 'clean',           label: 'Clean' },
  { value: 'synth',           label: 'Synth' },
]

export const DURATIONS = [
  { v: 4,    label: '𝅝',   title: 'Whole note (4 beats)'  },
  { v: 2,    label: '𝅗𝅥',  title: 'Half note (2 beats)'   },
  { v: 1,    label: '♩',   title: 'Quarter note (1 beat)' },
  { v: 0.5,  label: '♪',   title: 'Eighth note (½ beat)'  },
  { v: 0.25, label: '𝅘𝅥𝅮', title: '16th note (¼ beat)'   },
]

const TECHNIQUES: { value: GuitarTechnique | undefined; label: string; title: string }[] = [
  { value: undefined, label: '—',  title: 'No technique' },
  { value: 'h',       label: 'h',  title: 'Hammer-on' },
  { value: 'p',       label: 'p',  title: 'Pull-off' },
  { value: '/',       label: '/',  title: 'Slide up' },
  { value: '\\',      label: '\\', title: 'Slide down' },
  { value: 'b',       label: 'b',  title: 'Bend' },
]

interface InspectorProps {
  selectedNote: GuitarNote | null
  beatsPerBar: number
  noteDuration: number
  onNoteDurationChange: (beats: number) => void
  onFretChange: (fret: number) => void
  onTechniqueChange: (t: GuitarTechnique | undefined) => void
  sound: GuitarSound
  onSoundChange: (s: GuitarSound) => void
  capo: number
  onCapoChange: (capo: number) => void
  onBeatsPerBarChange: (bpb: number) => void
  totalBars: number
  onBarsChange: (bars: number) => void
  mutedStrings: boolean[]
  soloedStrings: boolean[]
  onToggleMute: (si: number) => void
  onToggleSolo: (si: number) => void
  onResetStrings: () => void
  onInsertChord: (chord: ChordShape) => void
  onClearAll: () => void
}

/** Design 1b's right column: the note under the cursor, the track's settings, the chords. */
export function GuitarInspector(p: InspectorProps) {
  const [flashed, setFlashed] = useState<string | null>(null)
  const note = p.selectedNote
  const soloActive = p.soloedStrings.some(Boolean)
  const stringsTouched = p.mutedStrings.some(Boolean) || soloActive

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: 20 }}>

      {/* ── Note */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={sectionLabel}>Note</span>
          {note && (
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted }}>
              <span style={{ color: STRING_COLORS[note.stringIndex], fontWeight: 700 }}>{STRING_NAMES[note.stringIndex]}</span>
              {' · '}bar {Math.floor(note.startBeat / p.beatsPerBar) + 1} · beat {formatBeat(note.startBeat % p.beatsPerBar + 1)}
            </span>
          )}
        </div>

        {note ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 10px' }}>
            <button title="Fret down" disabled={note.fret <= 0} onClick={() => p.onFretChange(note.fret - 1)} style={stepBtn(note.fret <= 0)}>−</button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontFamily: T.mono, fontSize: 26, fontWeight: 700, color: T.accentText, lineHeight: 1 }}>{note.muted ? 'x' : note.fret}</span>
              <span style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>{note.muted ? 'muted' : `fret · ${fretToNoteName(note.stringIndex, note.fret)}`}</span>
            </div>
            <button title="Fret up" disabled={note.fret >= 24} onClick={() => p.onFretChange(note.fret + 1)} style={stepBtn(note.fret >= 24)}>+</button>
          </div>
        ) : (
          <div style={{ fontSize: 12, lineHeight: 1.5, color: T.muted, background: T.panel, border: `1px dashed ${T.border}`, borderRadius: 10, padding: '10px 12px' }}>
            Click the tab and type a fret number, or tap the fretboard below.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Duration</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', background: T.well, borderRadius: 8, padding: 2, gap: 2 }}>
            {DURATIONS.map(d => {
              const on = (note ? note.durationBeats : p.noteDuration) === d.v
              return (
                <button key={d.v} title={d.title} onClick={() => p.onNoteDurationChange(d.v)}
                  style={{ height: 28, border: 'none', borderRadius: 6, fontSize: 16, lineHeight: 1, cursor: 'pointer', background: on ? T.bg : 'transparent', color: on ? T.accentText : T.muted, boxShadow: on ? '0 1px 2px rgba(15,23,42,0.10)' : 'none' }}>
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Technique</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4 }}>
            {TECHNIQUES.map(t => {
              const on = !!note && note.technique === t.value
              return (
                <button key={String(t.value)} title={note ? t.title : `${t.title} — select a note first`} disabled={!note}
                  onClick={() => p.onTechniqueChange(t.value)}
                  style={{ height: 28, borderRadius: 7, fontFamily: T.mono, fontSize: 12, fontWeight: 600, cursor: note ? 'pointer' : 'not-allowed', border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accentSoft : T.bg, color: on ? T.accentText : note ? T.text2 : T.borderStrong }}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Track */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ ...sectionLabel, marginBottom: 2 }}>Track</span>
        <Row label="Sound">
          <InlineSelect value={p.sound} onChange={v => p.onSoundChange(v as GuitarSound)}
            options={SOUNDS.map(s => ({ value: s.value, label: s.label }))} />
        </Row>
        <Row label="Capo">
          <InlineSelect value={String(p.capo)} onChange={v => p.onCapoChange(Number(v))}
            options={Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: i === 0 ? 'None' : `Fret ${i}` }))} />
        </Row>
        <Row label="Time">
          <InlineSelect value={String(p.beatsPerBar)} onChange={v => p.onBeatsPerBarChange(Number(v))}
            options={[2, 3, 4, 5, 6, 7].map(n => ({ value: String(n), label: `${n}/4` }))} />
        </Row>
        <Row label="Bars">
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button title="Remove a bar" onClick={() => p.onBarsChange(Math.max(1, p.totalBars - 1))} style={miniBtn}>−</button>
            <span style={{ minWidth: 22, textAlign: 'center', fontSize: 12, fontWeight: 600, color: T.text }}>{p.totalBars}</span>
            <button title="Add a bar" onClick={() => p.onBarsChange(p.totalBars + 1)} style={miniBtn}>+</button>
          </div>
        </Row>
      </section>

      <Divider />

      {/* ── Strings (mute / solo) */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={sectionLabel}>Strings</span>
          {stringsTouched
            ? <button onClick={p.onResetStrings} style={{ border: 'none', background: 'none', padding: 0, fontSize: 11, color: T.accentText, cursor: 'pointer' }}>Reset</button>
            : <span style={{ fontSize: 11, color: T.muted }}>Mute · Solo</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4 }}>
          {STRING_NAMES.map((name, si) => {
            const muted = p.mutedStrings[si]
            const soloed = p.soloedStrings[si]
            const dimmed = muted || (soloActive && !soloed)
            return (
              <div key={si} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: dimmed ? T.borderStrong : STRING_COLORS[si] }}>{name}</span>
                <button title={muted ? 'Unmute' : 'Mute'} onClick={() => p.onToggleMute(si)} style={msBtn(muted, '#dc2626', '#fee2e2')}>M</button>
                <button title={soloed ? 'Unsolo' : 'Solo'} onClick={() => p.onToggleSolo(si)} style={msBtn(soloed, '#16a34a', '#dcfce7')}>S</button>
              </div>
            )
          })}
        </div>
      </section>

      <Divider />

      {/* ── Chords */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={sectionLabel}>Chords</span>
          <span style={{ fontSize: 11, color: T.muted }}>Insert at cursor</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 5 }}>
          {CHORD_SHAPES.map(chord => {
            const on = flashed === chord.name
            return (
              <button key={chord.name} title={`Insert ${chord.name}`}
                onClick={() => { p.onInsertChord(chord); setFlashed(chord.name); setTimeout(() => setFlashed(null), 300) }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.borderColor = T.accent }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.borderColor = T.border }}
                style={{ height: 30, borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accentSoft : T.bg, color: on ? T.accentText : T.text, transition: 'border-color 0.1s' }}>
                {chord.name}
              </button>
            )
          })}
        </div>
      </section>

      <button
        onClick={p.onClearAll}
        style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, fontSize: 12, color: T.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        onMouseEnter={e => (e.currentTarget.style.color = T.danger)}
        onMouseLeave={e => (e.currentTarget.style.color = T.muted)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        Clear all notes
      </button>
    </div>
  )
}

function formatBeat(b: number): string {
  return Number.isInteger(b) ? String(b) : b.toFixed(2).replace(/0$/, '')
}

function Divider() {
  return <div style={{ height: 1, background: T.border, flexShrink: 0 }} />
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 28, fontSize: 12 }}>
      <span style={{ color: T.muted }}>{label}</span>
      {children}
    </div>
  )
}

/** A select that reads as plain bold text with a caret, as the design draws it. */
function InlineSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: T.text, cursor: 'pointer', textAlign: 'right', fontFamily: T.sans, padding: '4px 0', maxWidth: 150 }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function stepBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg,
    color: disabled ? T.borderStrong : T.text, fontSize: 16, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

const miniBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, border: 'none', background: T.well, color: T.text2,
  fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
}

function msBtn(on: boolean, color: string, bg: string): React.CSSProperties {
  return {
    width: '100%', height: 20, borderRadius: 5, fontSize: 9, fontWeight: 700, lineHeight: 1, cursor: 'pointer',
    border: `1px solid ${on ? color : T.border}`, background: on ? bg : T.bg, color: on ? color : T.faint,
  }
}
