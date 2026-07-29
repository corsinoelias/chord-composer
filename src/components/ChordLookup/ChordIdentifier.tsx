import React, { useMemo, useRef, useState } from 'react'
import { identifyChord, type ChordMatch } from '../../lib/chordIdentify'
import { GMID, UMID } from '../../lib/chordTheory'
import { useChordAudio } from './useChordAudio'
import {
  ACCENT, TEXT, MUTED, FAINT, BORDER, BORDER_LIGHT, CARD_BG,
  KEY_W, WHITE_SEMIS, BLACK_SEMIS, BLACK_OFFSETS, OCTAVES, PIANO_BASE_MIDI,
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
  selected, onToggle, accent, activeId,
}: { selected: Set<number>; onToggle: (semi: number) => void; accent: string; activeId: number | string | null }) {
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

  const keyBtn = (semi: number, isBlack: boolean, x: number) => {
    const on = selected.has(semi)
    const sounding = on && (activeId === semi || activeId === 'all')
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
          boxShadow: sounding ? `0 6px 18px ${accent}cc` : on ? `0 5px 15px ${accent}77` : isBlack ? '0 2px 3px rgba(20,10,40,0.35)' : 'none',
          transform: sounding ? 'translateY(2px)' : 'none',
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

// ── Diapason interactivo (horizontal) ──────────────────────────────────────
// Mastil completo en horizontal en vez de una caja de acorde de 5 trastes: asi se llega a
// cualquier traste de un clic, sin ir moviendo una ventana.
//
// Los trastes se guardan RELATIVOS AL CAPO, no absolutos. Es lo que hace que arrastrar el
// capo transponga la forma entera en vez de descolocarla, que es justamente para lo que
// sirve un capo: la misma posicion de dedos suena en otra tonalidad.

const FB_ROW_H = 34
const FB_FRET_W = 46
const FB_LABEL_W = 62
const FB_FRETS = 15
/** Trastes con marca de posicion, como en un mastil real */
const FB_MARKERS = [3, 5, 7, 9, 12, 15]

function InteractiveFretboard({
  tuning, strings, capo, onCapo, onToggle, accent, activeId, stringNames,
}: {
  tuning: StringState[]
  strings: number
  capo: number
  onCapo: (f: number) => void
  onToggle: (stringIdx: number, rel: number | null) => void
  accent: string
  activeId: number | string | null
  stringNames: string[]
}) {
  const [dragging, setDragging] = useState(false)
  const neckRef = useRef<HTMLDivElement | null>(null)

  const neckW = FB_LABEL_W + FB_FRETS * FB_FRET_W
  const neckH = strings * FB_ROW_H
  // Fila de arriba = cuerda mas aguda, como en una tablatura
  const rowOf = (s: number) => (strings - 1 - s) * FB_ROW_H
  const fretX = (f: number) => FB_LABEL_W + (f - 1) * FB_FRET_W

  const fretFromX = (clientX: number) => {
    const el = neckRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft - FB_LABEL_W
    return Math.max(0, Math.min(FB_FRETS, Math.round(x / FB_FRET_W)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: MUTED }}>
          {capo > 0
            ? <>Capo on fret <strong style={{ color: TEXT }}>{capo}</strong> &mdash; drag it and the shape moves with it</>
            : <>Drag the capo onto the neck to shift the whole shape</>}
        </span>
        {capo > 0 && (
          <button
            type="button" onClick={() => onCapo(0)}
            style={{
              border: `1.5px solid ${BORDER}`, background: '#fff', color: TEXT,
              borderRadius: 8, padding: '5px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}
          >Remove capo</button>
        )}
      </div>

      <div ref={neckRef} style={{ overflowX: 'auto', paddingBottom: 6 }}>
        <div
          style={{ position: 'relative', width: neckW, height: neckH + 26, userSelect: 'none' }}
          onPointerMove={e => { if (dragging) onCapo(fretFromX(e.clientX)) }}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
        >
          {/* Diapason */}
          <div style={{
            position: 'absolute', left: FB_LABEL_W, top: 0,
            width: FB_FRETS * FB_FRET_W, height: neckH,
            background: 'linear-gradient(#f6f2fb,#efe9f8)', borderRadius: '0 6px 6px 0',
          }} />
          {/* Cejuela */}
          <div style={{ position: 'absolute', left: FB_LABEL_W - 4, top: 0, width: 5, height: neckH, background: '#241d33', borderRadius: 2 }} />
          {/* Barras de traste */}
          {Array.from({ length: FB_FRETS }, (_, i) => (
            <div key={`fw${i}`} style={{
              position: 'absolute', left: FB_LABEL_W + (i + 1) * FB_FRET_W - 1, top: 0,
              width: 2, height: neckH, background: '#c8bfd8',
            }} />
          ))}
          {/* Marcas de posicion */}
          {FB_MARKERS.filter(f => f <= FB_FRETS).map(f => (
            <div key={`m${f}`} style={{
              position: 'absolute', left: fretX(f) + FB_FRET_W / 2 - 4, top: neckH / 2 - 4,
              width: 8, height: 8, borderRadius: '50%', background: '#d5cee2',
            }} />
          ))}
          {/* Numeros de traste */}
          {Array.from({ length: FB_FRETS }, (_, i) => (
            <span key={`fn${i}`} style={{
              position: 'absolute', left: fretX(i + 1), top: neckH + 6, width: FB_FRET_W,
              textAlign: 'center', fontSize: 10.5, color: FAINT, fontWeight: 600,
            }}>{i + 1}</span>
          ))}

          {/* Cuerdas: nombre, al aire / muda, y la linea */}
          {Array.from({ length: strings }, (_, s) => {
            const y = rowOf(s)
            const rel = tuning[s]
            const isOpen = rel === 0
            const muted = rel === null
            return (
              <div key={`str${s}`}>
                <span style={{
                  position: 'absolute', left: 0, top: y + FB_ROW_H / 2 - 8,
                  width: 26, textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: MUTED,
                }}>{stringNames[s]}</span>
                <button
                  type="button"
                  onClick={() => onToggle(s, isOpen ? null : 0)}
                  aria-label={`String ${stringNames[s]}: ${isOpen ? 'open' : muted ? 'muted' : 'fretted'}`}
                  style={{
                    position: 'absolute', left: 30, top: y + FB_ROW_H / 2 - 11,
                    width: 22, height: 22, border: 'none', background: 'transparent', padding: 0,
                    cursor: 'pointer', fontSize: 14, fontWeight: 700, lineHeight: '22px',
                    color: isOpen ? accent : muted ? FAINT : '#d5cee2',
                  }}
                >{muted ? '×' : '○'}</button>
                <div style={{
                  position: 'absolute', left: FB_LABEL_W, top: y + FB_ROW_H / 2,
                  width: FB_FRETS * FB_FRET_W, height: s < 2 ? 2.5 : 1.5,
                  background: muted ? '#ded7ea' : '#a99fc0',
                }} />
              </div>
            )
          })}

          {/* Celdas pulsables */}
          {Array.from({ length: strings }, (_, s) =>
            Array.from({ length: FB_FRETS }, (_, i) => {
              const abs = i + 1
              if (abs <= capo) return null // por debajo del capo no se puede pisar
              const rel = abs - capo
              const on = tuning[s] === rel
              const sounding = on && (activeId === s || activeId === 'all')
              return (
                <button
                  key={`c${s}-${i}`} type="button"
                  onClick={() => onToggle(s, on ? null : rel)}
                  aria-label={`String ${stringNames[s]}, fret ${abs}`}
                  style={{
                    position: 'absolute', left: fretX(abs), top: rowOf(s),
                    width: FB_FRET_W, height: FB_ROW_H,
                    border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                  }}
                >
                  {on && (
                    <span style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                      width: 24, height: 24, borderRadius: '50%', background: accent,
                      boxShadow: sounding ? `0 0 0 8px ${accent}44` : `0 0 0 4px ${accent}2a`,
                      transition: 'box-shadow 0.12s ease',
                    }} />
                  )}
                </button>
              )
            }),
          )}

          {/* Capo. Cuando esta fuera del mastil se muestra como una pastilla a la izquierda
              de la cejuela, para que se vea que es algo que se arrastra. */}
          <div
            onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setDragging(true) }}
            role="slider"
            aria-label="Capo position"
            aria-valuemin={0}
            aria-valuemax={FB_FRETS}
            aria-valuenow={capo}
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'ArrowRight') onCapo(Math.min(FB_FRETS, capo + 1))
              if (e.key === 'ArrowLeft') onCapo(Math.max(0, capo - 1))
            }}
            style={{
              position: 'absolute',
              left: capo === 0 ? 2 : fretX(capo) + FB_FRET_W / 2 - 7,
              top: capo === 0 ? neckH + 4 : -5,
              width: capo === 0 ? 46 : 14,
              height: capo === 0 ? 18 : neckH + 10,
              borderRadius: capo === 0 ? 9 : 7,
              background: capo === 0 ? '#cfc6de' : '#3c3452',
              boxShadow: dragging ? '0 4px 14px rgba(40,25,80,0.45)' : '0 2px 6px rgba(40,25,80,0.3)',
              cursor: dragging ? 'grabbing' : 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: dragging ? 'none' : 'left 0.1s ease',
              touchAction: 'none',
              zIndex: 3,
            }}
            title={capo === 0 ? 'Drag onto the neck to add a capo' : `Capo on fret ${capo}`}
          >
            <span style={{
              fontSize: 8.5, fontWeight: 700, color: capo === 0 ? '#4c4462' : '#fff',
              letterSpacing: 0.6,
              writingMode: capo === 0 ? undefined : ('vertical-rl' as const),
            }}>CAPO</span>
          </div>
        </div>
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
  /** 0 = sin capo. Los trastes de `strings` son relativos a el. */
  const [capo, setCapo] = useState(0)

  const toggleKey = (semi: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(semi)) next.delete(semi)
      else next.add(semi)
      return next
    })

  const toggleString = (s: number, fret: number | null) =>
    setStrings(prev => prev.map((v, i) => (i === s ? fret : v)))

  // Al subir el capo, una nota puede caerse del mastil. Se silencia esa cuerda en vez de
  // dejarla sonando sin punto visible, que se leeria como que la herramienta miente.
  const moveCapo = (f: number) => {
    setCapo(f)
    setStrings(prev => prev.map(v => (v !== null && f + v > FB_FRETS ? null : v)))
  }

  const clear = () => {
    setSelected(new Set())
    setStrings(Array(stringCount).fill(null))
  }

  // Nombres de las cuerdas al aire, para rotular el mastil
  const stringNames = useMemo(
    () => midi.map(m => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][m % 12]),
    [midi],
  )

  const sounding = strings.filter((f): f is number => f !== null)
  const count = isPiano ? selected.size : sounding.length

  const { play, playing, activeId } = useChordAudio(instrument)

  // Notas reales que suenan, graves primero, para que el arpegio salga de abajo a arriba
  // igual que en el buscador. El id es el semitono o el indice de cuerda, que es con lo
  // que el teclado y el diapason resaltan la nota que esta sonando.
  const noteEvents = useMemo(() => {
    if (isPiano) {
      return [...selected].sort((a, b) => a - b).map(s => ({ midi: PIANO_BASE_MIDI + s, id: s }))
    }
    return strings
      .map((f, s) => (f === null ? null : { midi: midi[s] + capo + f, id: s }))
      .filter((n): n is { midi: number; id: number } => n !== null)
      .sort((a, b) => a.midi - b.midi)
  }, [isPiano, selected, strings, midi, capo])

  const matches = useMemo(() => {
    if (isPiano) {
      if (selected.size === 0) return []
      const semis = [...selected].sort((a, b) => a - b)
      return identifyChord(semis.map(s => s % 12), semis[0] % 12, { notation, limit: 4 })
    }
    // El ukelele lleva sol reentrante (UMID[0]=67 es mas agudo que UMID[1]=60), asi que el
    // bajo no es la primera cuerda sino el MIDI mas grave que suene de verdad.
    const notes = strings
      .map((f, s) => (f === null ? null : midi[s] + capo + f))
      .filter((m): m is number => m !== null)
    if (notes.length === 0) return []
    return identifyChord(notes.map(m => m % 12), Math.min(...notes) % 12, { notation, limit: 4 })
  }, [isPiano, selected, strings, midi, capo, notation])

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
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => play(noteEvents)}
              style={{
                border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 700,
                background: playing ? '#3c3452' : accent, color: '#ffffff', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                boxShadow: '0 3px 11px rgba(90,50,180,0.28)',
              }}
            >
              <span style={{ fontSize: 11 }}>{playing ? '■' : '▶'}</span>
              {playing ? 'Stop' : 'Hear it'}
            </button>
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
          </div>
        )}
      </div>

      {isPiano ? (
        <InteractiveKeyboard selected={selected} onToggle={toggleKey} accent={accent} activeId={activeId} />
      ) : (
        <InteractiveFretboard
          tuning={strings} strings={stringCount} capo={capo} onCapo={moveCapo}
          onToggle={toggleString} accent={accent} activeId={activeId} stringNames={stringNames}
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
