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
// Los trastes se guardan RELATIVOS AL CAPO, no absolutos. Es lo que hace que mover el capo
// transponga la forma entera en vez de descolocarla, que es justamente para lo que sirve
// un capo: la misma posicion de dedos suena en otra tonalidad.

const FB_ROW_H = 34
const FB_FRET_W = 46
const FB_LABEL_W = 62
const FB_FRETS = 15
/** Alto del carril del capo, encima del mastil */
const FB_LANE_H = 30
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
  const [hoverFret, setHoverFret] = useState<number | null>(null)
  const neckRef = useRef<HTMLDivElement | null>(null)

  const neckW = FB_LABEL_W + FB_FRETS * FB_FRET_W
  const neckTop = FB_LANE_H
  const neckH = strings * FB_ROW_H
  // Fila de arriba = cuerda mas aguda, como en una tablatura
  const rowOf = (s: number) => neckTop + (strings - 1 - s) * FB_ROW_H
  const fretX = (f: number) => FB_LABEL_W + (f - 1) * FB_FRET_W
  const capoX = (f: number) => fretX(f) + FB_FRET_W / 2

  const fretFromX = (clientX: number) => {
    const el = neckRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft - FB_LABEL_W
    return Math.max(0, Math.min(FB_FRETS, Math.round(x / FB_FRET_W)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div ref={neckRef} style={{ overflowX: 'auto', paddingBottom: 6 }}>
        <div
          style={{ position: 'relative', width: neckW, height: neckTop + neckH + 26, userSelect: 'none' }}
          onPointerMove={e => { if (dragging) onCapo(fretFromX(e.clientX)) }}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => { setDragging(false); setHoverFret(null) }}
        >
          {/* ── Carril del capo ────────────────────────────────────────────
              Existe para que colocar el capo sea un clic y no un descubrimiento.
              Los puntos fantasma dicen "aqui se puede poner algo" sin necesidad de
              instrucciones. */}
          <span style={{
            position: 'absolute', left: 0, top: 6, width: FB_LABEL_W - 10,
            textAlign: 'right', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
            textTransform: 'uppercase', color: capo > 0 ? accent : FAINT,
          }}>Capo</span>

          {Array.from({ length: FB_FRETS }, (_, i) => {
            const f = i + 1
            const here = capo === f
            const hot = hoverFret === f
            return (
              <button
                key={`lane${f}`} type="button"
                onClick={() => onCapo(here ? 0 : f)}
                onPointerEnter={() => setHoverFret(f)}
                aria-label={here ? `Remove capo from fret ${f}` : `Put capo on fret ${f}`}
                style={{
                  position: 'absolute', left: fretX(f), top: 0,
                  width: FB_FRET_W, height: FB_LANE_H,
                  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                }}
              >
                {!here && (
                  <span style={{
                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                    width: hot ? 13 : 7, height: hot ? 13 : 7, borderRadius: '50%',
                    background: hot ? `${accent}66` : '#ddd6e9',
                    transition: 'all 0.1s ease',
                  }} />
                )}
              </button>
            )
          })}

          {/* Diapason */}
          <div style={{
            position: 'absolute', left: FB_LABEL_W, top: neckTop,
            width: FB_FRETS * FB_FRET_W, height: neckH,
            background: 'linear-gradient(#f6f2fb,#efe9f8)', borderRadius: '0 6px 6px 0',
          }} />
          {/* Zona detras del capo: se apaga, porque ahi ya no se toca */}
          {capo > 0 && (
            <div style={{
              position: 'absolute', left: FB_LABEL_W, top: neckTop,
              width: capoX(capo) - FB_LABEL_W, height: neckH,
              background: 'repeating-linear-gradient(45deg,#e6e0f0,#e6e0f0 4px,#ded7ea 4px,#ded7ea 8px)',
              borderRadius: '0 0 0 0', opacity: 0.9,
            }} />
          )}
          {/* Cejuela */}
          <div style={{ position: 'absolute', left: FB_LABEL_W - 4, top: neckTop, width: 5, height: neckH, background: '#241d33', borderRadius: 2 }} />
          {/* Barras de traste */}
          {Array.from({ length: FB_FRETS }, (_, i) => (
            <div key={`fw${i}`} style={{
              position: 'absolute', left: FB_LABEL_W + (i + 1) * FB_FRET_W - 1, top: neckTop,
              width: 2, height: neckH, background: '#c8bfd8',
            }} />
          ))}
          {/* Marcas de posicion */}
          {FB_MARKERS.filter(f => f <= FB_FRETS).map(f => (
            <div key={`m${f}`} style={{
              position: 'absolute', left: fretX(f) + FB_FRET_W / 2 - 4, top: neckTop + neckH / 2 - 4,
              width: 8, height: 8, borderRadius: '50%', background: '#d5cee2',
            }} />
          ))}
          {/* Numeros de traste */}
          {Array.from({ length: FB_FRETS }, (_, i) => (
            <span key={`fn${i}`} style={{
              position: 'absolute', left: fretX(i + 1), top: neckTop + neckH + 6, width: FB_FRET_W,
              textAlign: 'center', fontSize: 10.5, color: FAINT, fontWeight: 600,
            }}>{i + 1}</span>
          ))}

          {/* Cuerdas: nombre, al aire / muda, y la linea */}
          {Array.from({ length: strings }, (_, s) => {
            const y = rowOf(s)
            const rel = tuning[s]
            const isOpen = rel === 0
            const muted = rel === null
            const stringSounding = !muted && (activeId === s || activeId === 'all')
            const openSounding = isOpen && stringSounding
            return (
              <div key={`str${s}`}>
                <span style={{
                  position: 'absolute', left: 0, top: y + FB_ROW_H / 2 - 8,
                  width: 26, textAlign: 'right', fontSize: 11.5, fontWeight: 700, color: MUTED,
                }}>{stringNames[s]}</span>
                {/* El circulo de cuerda al aire tambien se anima al sonar. Sin esto, con
                    todas las cuerdas al aire -- que es el estado inicial -- pulsar Play no
                    movia absolutamente nada: solo se animaban las cuerdas pisadas. Misma
                    escala y color que usa el diagrama del buscador. */}
                <button
                  type="button"
                  onClick={() => onToggle(s, isOpen ? null : 0)}
                  aria-label={`String ${stringNames[s]}: ${isOpen ? 'open' : muted ? 'muted' : 'fretted'}`}
                  style={{
                    position: 'absolute', left: 30, top: y + FB_ROW_H / 2 - 11,
                    width: 22, height: 22, border: 'none', background: 'transparent', padding: 0,
                    cursor: 'pointer', fontSize: 14, fontWeight: 700, lineHeight: '22px',
                    color: openSounding ? accent : isOpen ? accent : muted ? FAINT : '#d5cee2',
                    transform: openSounding ? 'scale(1.35)' : 'scale(1)',
                    textShadow: openSounding ? `0 0 10px ${accent}aa` : 'none',
                    transition: 'transform 0.1s ease, color 0.1s ease, text-shadow 0.1s ease',
                  }}
                >{muted ? '×' : '○'}</button>
                <div style={{
                  position: 'absolute', left: FB_LABEL_W, top: y + FB_ROW_H / 2,
                  width: FB_FRETS * FB_FRET_W, height: s < 2 ? 2.5 : 1.5,
                  background: stringSounding ? accent : muted ? '#ded7ea' : '#a99fc0',
                  boxShadow: stringSounding ? `0 0 8px ${accent}` : 'none',
                  transition: 'background 0.12s ease, box-shadow 0.12s ease',
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
                      position: 'absolute', left: '50%', top: '50%',
                      width: 24, height: 24, borderRadius: '50%', background: accent,
                      boxShadow: sounding ? `0 0 0 8px ${accent}44` : `0 0 0 4px ${accent}2a`,
                      transform: `translate(-50%,-50%) scale(${sounding ? 1.28 : 1})`,
                      transition: 'box-shadow 0.12s ease, transform 0.12s ease',
                    }} />
                  )}
                </button>
              )
            }),
          )}

          {/* La barra del capo. Solo existe cuando esta puesto: aparcarla fuera del mastil
              la hacia parecer un adorno. Se arrastra para ajustar, pero colocarlo ya no
              depende de descubrir el arrastre. */}
          {capo > 0 && (
            <div
              onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); setDragging(true) }}
              role="slider"
              aria-label="Capo position"
              aria-valuemin={1}
              aria-valuemax={FB_FRETS}
              aria-valuenow={capo}
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'ArrowRight') onCapo(Math.min(FB_FRETS, capo + 1))
                if (e.key === 'ArrowLeft') onCapo(Math.max(1, capo - 1))
              }}
              style={{
                position: 'absolute', left: capoX(capo) - 8, top: 4,
                width: 16, height: FB_LANE_H - 8 + neckH + 6,
                borderRadius: 8, background: '#3c3452',
                boxShadow: dragging ? '0 4px 16px rgba(40,25,80,0.5)' : '0 2px 7px rgba(40,25,80,0.35)',
                cursor: dragging ? 'grabbing' : 'grab',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: 4,
                transition: dragging ? 'none' : 'left 0.1s ease',
                touchAction: 'none',
                zIndex: 4,
              }}
              title={`Capo on fret ${capo} — drag to move`}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{capo}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, textAlign: 'center' }}>
          {capo > 0
            ? <>Capo on fret <strong style={{ color: TEXT }}>{capo}</strong> — the shape moves with it, so the chord changes.</>
            : <>Using a capo? Click the dots above the neck to place it — the same shape then sounds in a different key.</>}
        </p>
        {/* Quitar el capo necesita un boton propio y comodo: la barra tapa la celda del
            carril de su traste, asi que hacer clic ahi cae en la barra y empieza un
            arrastre en vez de quitarlo. */}
        {capo > 0 && (
          <button
            type="button" onClick={() => onCapo(0)}
            style={{
              border: `1.5px solid ${BORDER}`, background: '#fff', color: TEXT,
              borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >Remove capo</button>
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
          : 'The strings start open — fret or mute them to match what you’re playing.'}
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
  // Se arranca con todas las cuerdas al aire, que es como esta una guitarra encima de la
  // mesa. Empezar con todo en "x" dejaba la herramienta muda y sin resultado hasta que el
  // usuario adivinara que tenia que hacer; al aire ya se lee un acorde de verdad
  // (G6/9 en guitarra, C6 en ukelele) y se entiende de que va esto sin leer nada.
  const [strings, setStrings] = useState<StringState[]>(() => Array(stringCount).fill(0))
  /** 0 = sin capo. Los trastes de `strings` son relativos a el. */
  const [capo, setCapo] = useState(0)
  /**
   * Si el usuario ya ha tocado algo. Las cuerdas arrancan al aire porque asi esta una
   * guitarra de verdad, pero seis cuerdas al aire NO son un acorde: las clases de altura
   * dan G6/9 y nadie lo llamaria asi. Hasta que no se pisa, se silencia o se pone el capo,
   * no hay nada que nombrar.
   */
  const [touched, setTouched] = useState(false)

  const toggleKey = (semi: number) => {
    setTouched(true)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(semi)) next.delete(semi)
      else next.add(semi)
      return next
    })
  }

  const toggleString = (s: number, fret: number | null) => {
    setTouched(true)
    setStrings(prev => prev.map((v, i) => (i === s ? fret : v)))
  }

  // Al subir el capo, una nota puede caerse del mastil. Se silencia esa cuerda en vez de
  // dejarla sonando sin punto visible, que se leeria como que la herramienta miente.
  // Poner el capo NO cuenta como haber marcado un acorde. Es como esta montada la
  // guitarra, no lo que se esta tocando: cebillar las cuerdas al aire sigue siendo cuerdas
  // al aire, solo que transpuestas, y nombrar eso seria tan falso como llamar acorde al
  // estado inicial.
  const moveCapo = (f: number) => {
    setCapo(f)
    setStrings(prev => prev.map(v => (v !== null && f + v > FB_FRETS ? null : v)))
  }

  // Clear devuelve al estado inicial, no a todo mudo: si no, se llegaria a una pantalla
  // vacia que el arranque nunca produce. El capo NO se toca, porque representa como esta
  // montada la guitarra de verdad y no la forma que se esta probando.
  const clear = () => {
    setSelected(new Set())
    setStrings(Array(stringCount).fill(0))
    setTouched(false)
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
    if (!touched) return []
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
  }, [touched, isPiano, selected, strings, midi, capo, notation])

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
        {touched && count > 0 && (
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
        <Results matches={matches} count={touched ? count : 0} accent={accent} isPiano={isPiano} />
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: FAINT, textAlign: 'center' }}>
        An inversion keeps the chord&rsquo;s name — the lowest note only decides which
        reading wins when the same notes have more than one.
      </p>
    </div>
  )
}
