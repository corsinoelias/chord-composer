import React, { useMemo, useState } from 'react'
import { identifyChord, type ChordMatch } from '../../lib/chordIdentify'
import { GMID, UMID } from '../../lib/chordTheory'
import {
  ACCENT, TEXT, MUTED, FAINT, BORDER, BORDER_LIGHT, CARD_BG,
  KEY_W, WHITE_SEMIS, BLACK_SEMIS, BLACK_OFFSETS, OCTAVES,
} from './palette'

type Notation = 'english' | 'latin'
type Instrument = 'piano' | 'guitar' | 'ukulele'

/** null = cuerda muda. 0 = al aire. */
type StringState = number | null

// ── Teclado interactivo ────────────────────────────────────────────────────
// Se guardan semitonos absolutos (0-35 sobre 3 octavas), no clases de altura. Importa:
// la nota mas grave es la que dice si el acorde esta invertido y la que desempata cuando
// las mismas notas admiten varias lecturas, y eso solo se sabe conservando en que octava
// se pulso cada tecla.

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

// ── Diapason interactivo ───────────────────────────────────────────────────
// Caja de acorde vertical, como los diagramas del buscador: cuerdas en columnas y trastes
// en filas. Se muestran 5 trastes con un selector de posicion, que es lo que hace falta
// para las cebillas: sin el, cualquier forma por encima del traste 5 seria inalcanzable.

const FB_SW = 42   // separacion entre cuerdas
const FB_FH = 46   // alto de traste
const FB_PAD_T = 40
const FB_PAD_L = 30
const FRETS_SHOWN = 5

function InteractiveFretboard({
  tuning, strings, baseFret, onBaseFret, onToggle, accent,
}: {
  tuning: StringState[]
  strings: number
  baseFret: number
  onBaseFret: (f: number) => void
  onToggle: (stringIdx: number, fret: number | null) => void
  accent: string
}) {
  const gridW = (strings - 1) * FB_SW
  const w = FB_PAD_L * 2 + gridW
  const h = FB_PAD_T + FRETS_SHOWN * FB_FH + 30
  const X = (s: number) => FB_PAD_L + s * FB_SW
  const atNut = baseFret === 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button" onClick={() => onBaseFret(Math.max(1, baseFret - 1))}
          disabled={baseFret === 1} aria-label="Move down the neck"
          style={{
            border: `1.5px solid ${BORDER}`, background: '#fff', borderRadius: 8, width: 30, height: 30,
            fontSize: 15, fontWeight: 700, color: baseFret === 1 ? '#c9c2d8' : TEXT,
            cursor: baseFret === 1 ? 'default' : 'pointer',
          }}
        >&minus;</button>
        <span style={{ fontSize: 12.5, color: MUTED, minWidth: 92, textAlign: 'center' }}>
          {atNut ? 'Open position' : `From fret ${baseFret}`}
        </span>
        <button
          type="button" onClick={() => onBaseFret(Math.min(12, baseFret + 1))}
          disabled={baseFret === 12} aria-label="Move up the neck"
          style={{
            border: `1.5px solid ${BORDER}`, background: '#fff', borderRadius: 8, width: 30, height: 30,
            fontSize: 15, fontWeight: 700, color: baseFret === 12 ? '#c9c2d8' : TEXT,
            cursor: baseFret === 12 ? 'default' : 'pointer',
          }}
        >+</button>
      </div>

      <div style={{ position: 'relative', width: w, height: h }}>
        {/* Cuerdas */}
        {Array.from({ length: strings }, (_, s) => (
          <div key={`s${s}`} style={{
            position: 'absolute', left: X(s) - 1, top: FB_PAD_T,
            width: 2, height: FRETS_SHOWN * FB_FH, background: '#b9b0cc',
          }} />
        ))}
        {/* Trastes; la cejuela va gruesa solo en posicion abierta */}
        {Array.from({ length: FRETS_SHOWN + 1 }, (_, i) => {
          const isNut = i === 0 && atNut
          const th = isNut ? 5 : 2
          return (
            <div key={`f${i}`} style={{
              position: 'absolute', left: FB_PAD_L - 1, top: FB_PAD_T + i * FB_FH - th / 2,
              width: gridW + 2, height: th, background: isNut ? '#241d33' : '#b9b0cc',
            }} />
          )
        })}
        {!atNut && (
          <span style={{
            position: 'absolute', left: 2, top: FB_PAD_T + 0.5 * FB_FH - 9,
            fontSize: 11, fontWeight: 700, color: MUTED,
          }}>{baseFret}fr</span>
        )}

        {/* Al aire / muda, encima de cada cuerda */}
        {Array.from({ length: strings }, (_, s) => {
          const open = tuning[s] === 0
          const muted = tuning[s] === null
          return (
            <button
              key={`t${s}`} type="button"
              onClick={() => onToggle(s, open ? null : 0)}
              aria-label={`String ${s + 1}: ${open ? 'open' : muted ? 'muted' : `fret ${tuning[s]}`}`}
              style={{
                position: 'absolute', left: X(s) - 13, top: 4, width: 26, height: 26,
                border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                fontSize: 16, fontWeight: 700, lineHeight: '26px',
                color: open ? accent : muted ? FAINT : '#d5cee2',
              }}
            >{open ? '○' : muted ? '×' : '○'}</button>
          )
        })}

        {/* Celdas de traste */}
        {Array.from({ length: strings }, (_, s) =>
          Array.from({ length: FRETS_SHOWN }, (_, r) => {
            const fret = baseFret + r
            const on = tuning[s] === fret
            return (
              <button
                key={`c${s}-${r}`} type="button"
                onClick={() => onToggle(s, on ? null : fret)}
                aria-label={`String ${s + 1}, fret ${fret}`}
                style={{
                  position: 'absolute', left: X(s) - FB_SW / 2 + 1, top: FB_PAD_T + r * FB_FH + 1,
                  width: FB_SW - 2, height: FB_FH - 2,
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                }}
              >
                {on && (
                  <span style={{
                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                    width: 28, height: 28, borderRadius: '50%', background: accent,
                    boxShadow: `0 0 0 5px ${accent}33`,
                  }} />
                )}
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}

// ── Resultados ─────────────────────────────────────────────────────────────

function Results({ matches, count, accent, isPiano }: { matches: ChordMatch[]; count: number; accent: string; isPiano: boolean }) {
  // Estado vacio: decir que hacer, no "sin resultados"
  if (count === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14.5, color: MUTED, textAlign: 'center' }}>
        {isPiano
          ? 'Tap the notes you’re playing and the chord name appears here.'
          : 'Tap a fret on each string you’re playing and the chord name appears here.'}
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
      {/*
        Se muestra el acorde y nada mas. Un mi-sol-do es un DO MAYOR: poner "C/E" se lee
        como si el mi fuera la fundamental, y ademas esa notacion sugiere que el mi al bajo
        es una decision armonica buscada, cuando casi siempre es un detalle de como cae la
        forma bajo los dedos. La nota grave se sigue usando para desempatar lecturas, pero
        no se muestra.
      */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <strong style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 30, fontWeight: 700, color: TEXT, letterSpacing: -0.5 }}>
          {best.chordName}
        </strong>
        {best.missing.length > 0 && (
          // Sin esto un C7 sin quinta parece un error del identificador
          <span style={{ fontSize: 13, color: MUTED }}>
            no {best.missing.join(', ')}
          </span>
        )}
      </div>

      {best.inversion && (
        <span style={{ fontSize: 13.5, color: MUTED, textAlign: 'center' }}>
          {best.inversion} &mdash; same chord, just not with the root at the bottom
        </span>
      )}

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
  instrument = 'piano', accent = ACCENT, notation = 'english',
}: { instrument?: Instrument; accent?: string; notation?: Notation }) {
  const isPiano = instrument === 'piano'
  const midi = instrument === 'ukulele' ? UMID : GMID
  const stringCount = midi.length

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [strings, setStrings] = useState<StringState[]>(() => Array(stringCount).fill(null))
  const [baseFret, setBaseFret] = useState(1)

  const toggleKey = (semi: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(semi)) next.delete(semi)
      else next.add(semi)
      return next
    })

  const toggleString = (s: number, fret: number | null) =>
    setStrings(prev => prev.map((v, i) => (i === s ? fret : v)))

  const clear = () => {
    setSelected(new Set())
    setStrings(Array(stringCount).fill(null))
  }

  const sounding = strings.filter((f): f is number => f !== null)
  const count = isPiano ? selected.size : sounding.length

  const matches = useMemo(() => {
    if (isPiano) {
      if (selected.size === 0) return []
      const semis = [...selected].sort((a, b) => a - b)
      return identifyChord(semis.map(s => s % 12), semis[0] % 12, { notation, limit: 4 })
    }
    // El ukelele lleva sol reentrante (UMID[0]=67 es mas agudo que UMID[1]=60), asi que el
    // bajo no es la primera cuerda sino el MIDI mas grave que suene de verdad.
    const notes = strings
      .map((f, s) => (f === null ? null : midi[s] + f))
      .filter((m): m is number => m !== null)
    if (notes.length === 0) return []
    return identifyChord(notes.map(m => m % 12), Math.min(...notes) % 12, { notation, limit: 4 })
  }, [isPiano, selected, strings, midi, notation])

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
            {isPiano
              ? 'Play the notes on the keyboard and we’ll name the chord.'
              : 'Tap the shape you’re holding and we’ll name the chord.'}
          </span>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={clear}
            style={{
              border: `1.5px solid ${BORDER}`, background: '#ffffff', color: TEXT,
              borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {isPiano ? (
        <InteractiveKeyboard selected={selected} onToggle={toggleKey} accent={accent} />
      ) : (
        <InteractiveFretboard
          tuning={strings} strings={stringCount} baseFret={baseFret}
          onBaseFret={setBaseFret} onToggle={toggleString} accent={accent}
        />
      )}

      <div style={{ minHeight: 58, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Results matches={matches} count={count} accent={accent} isPiano={isPiano} />
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: FAINT, textAlign: 'center' }}>
        An inversion keeps the chord&rsquo;s name — the lowest note only decides which
        reading wins when the same notes have more than one.
      </p>
    </div>
  )
}
