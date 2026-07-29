import React, { useMemo, useState } from 'react'
import { identifyChord, type ChordMatch } from '../../lib/chordIdentify'
import {
  ACCENT, TEXT, MUTED, FAINT, BORDER, BORDER_LIGHT, CARD_BG,
  KEY_W, WHITE_SEMIS, BLACK_SEMIS, BLACK_OFFSETS, OCTAVES,
} from './palette'

type Notation = 'english' | 'latin'

// ── Teclado interactivo ────────────────────────────────────────────────────
// Se guardan semitonos absolutos (0-35 sobre 3 octavas), no clases de altura. Importa:
// la nota mas grave es la que decide si el acorde esta invertido, y eso solo se sabe si
// se conserva en que octava pulso cada tecla. Tocar E-G-C se lee como C/E, que es
// justamente lo que el usuario esta tocando.

function InteractiveKeyboard({
  selected, onToggle, accent,
}: { selected: Set<number>; onToggle: (semi: number) => void; accent: string }) {
  const whites: { semi: number; x: number }[] = []
  for (let i = 0; i < OCTAVES * 7; i++) {
    whites.push({ semi: Math.floor(i / 7) * 12 + WHITE_SEMIS[i % 7], x: i * KEY_W + 1 })
  }
  const blacks: { semi: number; x: number }[] = []
  for (let o = 0; o < OCTAVES; o++) {
    for (let j = 0; j < 5; j++) {
      blacks.push({ semi: o * 12 + BLACK_SEMIS[j], x: (o * 7 + BLACK_OFFSETS[j]) * KEY_W + KEY_W - 10 })
    }
  }

  const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  const label = (semi: number) => NAMES[semi % 12]
  const lowest = selected.size ? Math.min(...selected) : null

  const keyBtn = (semi: number, isBlack: boolean, x: number) => {
    const on = selected.has(semi)
    const isBass = semi === lowest
    return (
      <button
        key={(isBlack ? 'b' : 'w') + semi}
        type="button"
        onClick={() => onToggle(semi)}
        aria-pressed={on}
        aria-label={`${label(semi)}${isBlack ? '' : ''} octave ${Math.floor(semi / 12) + 3}`}
        style={{
          position: 'absolute', top: 0, left: x,
          width: isBlack ? 20 : KEY_W - 2,
          height: isBlack ? 106 : 172,
          background: on ? accent : isBlack ? '#241d33' : '#ffffff',
          border: isBlack ? 'none' : '1px solid #d8d2e4',
          borderRadius: isBlack ? '0 0 4px 4px' : '0 0 6px 6px',
          boxSizing: 'border-box',
          zIndex: isBlack ? 2 : 1,
          padding: 0,
          cursor: 'pointer',
          boxShadow: on ? `0 5px 15px ${accent}77` : isBlack ? '0 2px 3px rgba(20,10,40,0.35)' : 'none',
          transition: 'background 0.12s ease, box-shadow 0.12s ease',
        }}
      >
        {on && (
          <span style={{
            position: 'absolute', bottom: isBlack ? 5 : 7, left: 0, right: 0, textAlign: 'center',
            fontSize: isBlack ? 9 : 11, fontWeight: 700, color: '#ffffff',
          }}>
            {label(semi)}
          </span>
        )}
        {/* La nota mas grave decide la inversion, asi que se marca */}
        {on && isBass && (
          <span style={{
            position: 'absolute', top: 5, left: 0, right: 0, textAlign: 'center',
            fontSize: 8, fontWeight: 700, color: '#ffffff', opacity: 0.75, letterSpacing: 0.5,
          }}>
            BASS
          </span>
        )}
      </button>
    )
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ position: 'relative', height: 172, width: OCTAVES * 7 * KEY_W, margin: '0 auto' }}>
        {whites.map(k => keyBtn(k.semi, false, k.x))}
        {blacks.map(k => keyBtn(k.semi, true, k.x))}
      </div>
    </div>
  )
}

// ── Resultados ─────────────────────────────────────────────────────────────

function Results({ matches, count, accent }: { matches: ChordMatch[]; count: number; accent: string }) {
  // Estado vacio: decir que hacer, no "sin resultados"
  if (count === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14.5, color: MUTED, textAlign: 'center' }}>
        Tap the notes you&rsquo;re playing and the chord name appears here.
      </p>
    )
  }
  if (count < 2) {
    return (
      <p style={{ margin: 0, fontSize: 14.5, color: MUTED, textAlign: 'center' }}>
        One note isn&rsquo;t a chord yet — add at least two more.
      </p>
    )
  }
  if (matches.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14.5, color: MUTED, textAlign: 'center' }}>
        Those notes don&rsquo;t form a chord we recognise. Try removing one.
      </p>
    )
  }

  const [best, ...rest] = matches
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <strong style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 30, fontWeight: 700, color: TEXT, letterSpacing: -0.5 }}>
          {best.name}
        </strong>
        {best.missing.length > 0 && (
          // Sin esto un C7 sin quinta parece un error del identificador
          <span style={{ fontSize: 13, color: MUTED }}>
            no {best.missing.join(', ')}
          </span>
        )}
      </div>

      {rest.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: MUTED }}>
            The same notes can also be read as:
          </span>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'center' }}>
            {rest.map((m, i) => (
              <span key={i} style={{
                fontSize: 13.5, fontWeight: 600, color: accent,
                border: `1.5px solid ${BORDER}`, borderRadius: 9, padding: '5px 11px', background: '#ffffff',
              }}>
                {m.name}{m.missing.length ? ` (no ${m.missing.join(', ')})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Seccion completa ───────────────────────────────────────────────────────

export function ChordIdentifier({
  accent = ACCENT, notation = 'english',
}: { accent?: string; notation?: Notation }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const toggle = (semi: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(semi)) next.delete(semi)
      else next.add(semi)
      return next
    })

  const matches = useMemo(() => {
    if (selected.size === 0) return []
    const semis = [...selected].sort((a, b) => a - b)
    return identifyChord(semis.map(s => s % 12), semis[0] % 12, { notation, limit: 4 })
  }, [selected, notation])

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER_LIGHT}`, borderRadius: 18,
      padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16,
      boxShadow: '0 1px 4px rgba(40,25,80,0.05)',
      fontFamily: "'Hanken Grotesk', system-ui, sans-serif", color: TEXT,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: accent }}>
            Identify a chord
          </span>
          <span style={{ fontSize: 14, color: MUTED }}>
            Play the notes on the keyboard and we&rsquo;ll name the chord.
          </span>
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            style={{
              border: `1.5px solid ${BORDER}`, background: '#ffffff', color: TEXT,
              borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      <InteractiveKeyboard selected={selected} onToggle={toggle} accent={accent} />

      <div style={{ minHeight: 58, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Results matches={matches} count={selected.size} accent={accent} />
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: FAINT, textAlign: 'center' }}>
        The lowest note you pick is treated as the bass, so inversions come out as slash
        chords like C/E.
      </p>
    </div>
  )
}
