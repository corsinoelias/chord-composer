import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareSoundfont, playGuitarToneAtMidi } from '../../lib/guitarTab/guitarAudio'
import { loadPianoSamples, getPianoSample } from '../../lib/virtualPiano/pianoSamples'

// Reproduccion de acordes de las paginas de lookup.
//
// Vivia dentro de ChordFinderTool. Se saca aqui para que el identificador toque exactamente
// igual que el buscador: mismas muestras, mismo arpegio y mismo resaltado. Si se duplicara,
// las dos mitades de la misma pagina acabarian sonando distinto.

export type Instrument = 'piano' | 'guitar' | 'ukulele'
export type NoteEvent = { midi: number; id: number | string }

function buildPianoVoice(ctx: AudioContext, dest: AudioNode, buf: AudioBuffer, t: number) {
  const src = ctx.createBufferSource()
  src.buffer = buf
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.85, t + 0.006)
  g.gain.setTargetAtTime(0.0001, t + 0.05, 1.1)
  src.connect(g); g.connect(dest)
  src.start(t)
  src.stop(t + 3.5)
}

export function useChordAudio(instrument: Instrument) {
  const isPiano = instrument === 'piano'
  const [playing, setPlaying] = useState(false)
  /** Que nota se esta oyendo: su id, o 'all' cuando suenan todas juntas. */
  const [activeId, setActiveId] = useState<number | string | null>(null)

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const pianoCtxRef = useRef<AudioContext | null>(null)
  const pianoGainRef = useRef<GainNode | null>(null)

  // Se precarga para que el primer Play no se quede colgado esperando las muestras
  useEffect(() => {
    if (isPiano) {
      if (!pianoCtxRef.current) {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        const g = ctx.createGain(); g.gain.value = 0.9; g.connect(ctx.destination)
        pianoCtxRef.current = ctx; pianoGainRef.current = g
      }
      loadPianoSamples(pianoCtxRef.current).catch(() => {})
    } else if (instrument === 'guitar') {
      prepareSoundfont('sf2').catch(() => {})
    }
  }, [isPiano, instrument])

  const stop = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setActiveId(null)
    setPlaying(false)
  }, [])

  // Al desmontar: cortar los temporizadores pendientes y cerrar el contexto. Los
  // navegadores limitan cuantos AudioContext puede tener una pestana, asi que dejarlos
  // abiertos acaba silenciando la pagina despues de varias navegaciones.
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout)
    pianoCtxRef.current?.close().catch(() => {})
  }, [])

  const playTone = useCallback((midi: number) => {
    if (isPiano) {
      const ctx = pianoCtxRef.current
      if (!ctx || !pianoGainRef.current) return
      if (ctx.state === 'suspended') ctx.resume()
      const buf = getPianoSample(midi)
      if (buf) buildPianoVoice(ctx, pianoGainRef.current, buf, ctx.currentTime + 0.01)
    } else {
      playGuitarToneAtMidi(midi, instrument === 'guitar' ? 'sf2' : 'nylon')
    }
  }, [isPiano, instrument])

  /** Arpegia las notas y despues las toca juntas. Un segundo Play corta. */
  const play = useCallback((notes: NoteEvent[]) => {
    if (playing) { stop(); return }
    if (!notes.length) return
    timersRef.current = []
    const gap = 0.5
    notes.forEach((n, i) => {
      timersRef.current.push(setTimeout(() => { playTone(n.midi); setActiveId(n.id) }, i * gap * 1000))
    })
    const tEnd = notes.length * gap + 0.15
    timersRef.current.push(setTimeout(() => {
      setActiveId('all')
      notes.forEach((n, i) => {
        timersRef.current.push(setTimeout(() => playTone(n.midi), i * 45))
      })
    }, tEnd * 1000))
    timersRef.current.push(setTimeout(() => { setActiveId(null); setPlaying(false) }, (tEnd + 1.5) * 1000))
    setPlaying(true)
  }, [playing, playTone, stop])

  // playNote suena una sola nota, al margen del arpegio. Es lo que permite picotear notas
  // sueltas del acorde sin arrancar (ni cortar) la reproduccion completa.
  return { play, playNote: playTone, stop, playing, activeId }
}
