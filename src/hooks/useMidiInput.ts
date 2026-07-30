import { useState, useEffect, useCallback, useRef } from 'react'
import type { BassSound, StringIndex } from '../lib/bassTab/types'
import { previewNote } from '../lib/bassTab/bassAudio'

export interface MidiInputDevice { id: string; name: string }

export interface UseMidiInputOptions {
  /**
   * Si se pasa, el hook lleva la cuenta de que notas estan pulsadas A LA VEZ y avisa en
   * cada cambio, en vez de disparar el preview de bajo.
   *
   * Es la diferencia entre tocar y acompanar: al modo bajo solo le interesa el Note On
   * para sonar una nota, asi que descartaba el Note Off y nunca sabia que seguia pulsado.
   * Un identificador de acordes necesita justo lo contrario, porque un acorde ES el
   * conjunto de notas que suenan simultaneamente.
   */
  onNotesChange?: (midiNotes: number[]) => void
}

interface UseMidiInputReturn {
  available: boolean
  active: boolean
  devices: MidiInputDevice[]
  selectedDeviceId: string | null
  toggle: () => void
  selectDevice: (id: string | null) => void
}

// MIDI note 0 = C-1. Bass standard tuning (EADG):
// String 0 = G2  = MIDI 43
// String 1 = D2  = MIDI 38
// String 2 = A1  = MIDI 33
// String 3 = E1  = MIDI 28
const OPEN_MIDI: Record<number, number> = { 0: 43, 1: 38, 2: 33, 3: 28 }

function midiNoteToStringFret(midiNote: number): { si: StringIndex; fret: number } | null {
  // Try each string from highest (G) to lowest (E), prefer lower frets
  const strings = [3, 2, 1, 0] as const // E, A, D, G — prefer lower strings for typical bass playing
  for (const si of strings) {
    const fret = midiNote - OPEN_MIDI[si]
    if (fret >= 0 && fret <= 24) return { si, fret }
  }
  return null
}

export function useMidiInput(sound: BassSound | null, opts: UseMidiInputOptions = {}): UseMidiInputReturn {
  const [available, setAvailable]         = useState(false)
  const [active, setActive]               = useState(false)
  const [devices, setDevices]             = useState<MidiInputDevice[]>([])
  const [selectedDeviceId, setSelectedId] = useState<string | null>(null)
  const midiAccessRef                     = useRef<MIDIAccess | null>(null)
  const soundRef                          = useRef(sound)
  const optsRef                           = useRef(opts)
  /** Notas que siguen pulsadas. Se lleva en un ref para no resuscribir el listener. */
  const heldRef                           = useRef<Set<number>>(new Set())

  useEffect(() => { soundRef.current = sound }, [sound])
  useEffect(() => { optsRef.current = opts })

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) return
    setAvailable(true)
  }, [])

  const refreshDevices = useCallback((access: MIDIAccess) => {
    const list: MidiInputDevice[] = []
    access.inputs.forEach(input => list.push({ id: input.id, name: input.name || `MIDI Input ${input.id}` }))
    setDevices(list)
    if (list.length > 0) {
      setSelectedId(prev => (prev && list.find(d => d.id === prev)) ? prev : list[0].id)
    } else {
      setSelectedId(null)
    }
  }, [])

  // Attach MIDI message listener to the selected device
  useEffect(() => {
    if (!active || !midiAccessRef.current) return
    const access = midiAccessRef.current

    const onMessage = (e: MIDIMessageEvent) => {
      const [status, note, velocity] = e.data as unknown as [number, number, number]
      const type = status & 0xF0
      // Muchos teclados no mandan 0x80: sueltan la tecla con un Note On de velocidad 0.
      const isOn = type === 0x90 && velocity > 0
      const isOff = type === 0x80 || (type === 0x90 && velocity === 0)

      const notify = optsRef.current.onNotesChange
      if (notify) {
        if (isOn) heldRef.current.add(note)
        else if (isOff) heldRef.current.delete(note)
        else return
        notify([...heldRef.current].sort((a, b) => a - b))
        return
      }

      if (isOn && soundRef.current) {
        const mapped = midiNoteToStringFret(note)
        if (mapped) previewNote(mapped.si, mapped.fret, soundRef.current)
      }
    }

    access.inputs.forEach(input => {
      if (!selectedDeviceId || input.id === selectedDeviceId) {
        input.onmidimessage = onMessage
      }
    })

    return () => {
      access.inputs.forEach(input => { input.onmidimessage = null })
    }
  }, [active, selectedDeviceId])

  const toggle = useCallback(async () => {
    if (!available) return

    if (active) {
      midiAccessRef.current?.inputs.forEach(i => { i.onmidimessage = null })
      heldRef.current.clear()
      setActive(false)
      return
    }

    try {
      const access = await (navigator as Navigator & { requestMIDIAccess: () => Promise<MIDIAccess> }).requestMIDIAccess()
      midiAccessRef.current = access
      refreshDevices(access)
      access.onstatechange = () => refreshDevices(access)
      setActive(true)
    } catch {
      setActive(false)
    }
  }, [available, active, refreshDevices])

  const selectDevice = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  return { available, active, devices, selectedDeviceId, toggle, selectDevice }
}
