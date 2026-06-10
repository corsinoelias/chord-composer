const A4_FREQ = 440
const A4_MIDI = 69
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface NoteInfo {
  note: string          // 'E'
  octave: number        // 1
  noteName: string      // 'E1'
  cents: number         // deviation: -50..+50
  targetFreq: number    // exact pitch of the note
  detectedFreq: number  // measured frequency
}

export function noteInfoFromFrequency(freq: number): NoteInfo {
  const midi = 12 * Math.log2(freq / A4_FREQ) + A4_MIDI
  const midiRounded = Math.round(midi)
  const cents = Math.round((midi - midiRounded) * 100)
  const noteIndex = ((midiRounded % 12) + 12) % 12
  const note = NOTE_NAMES[noteIndex]
  const octave = Math.floor(midiRounded / 12) - 1
  const targetFreq = A4_FREQ * Math.pow(2, (midiRounded - A4_MIDI) / 12)

  return {
    note,
    octave,
    noteName: `${note}${octave}`,
    cents: Math.max(-50, Math.min(50, cents)),
    targetFreq: Math.round(targetFreq * 10) / 10,
    detectedFreq: Math.round(freq * 10) / 10,
  }
}

// Autocorrelation pitch detection — works well for 30–2000 Hz range (covers all bass/guitar strings)
export function autoCorrelate(buf: Float32Array<ArrayBuffer>, sampleRate: number): number {
  const n = buf.length

  // Reject silence
  let sumSq = 0
  for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i]
  if (Math.sqrt(sumSq / n) < 0.008) return -1

  const minLag = Math.floor(sampleRate / 2000)          // 2000 Hz max
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / 30)) // 30 Hz min

  // Build autocorrelation array for the lag range
  const corr = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    const len = n - lag
    for (let j = 0; j < len; j++) sum += buf[j] * buf[j + lag]
    corr[lag] = sum
  }

  // Skip the initial self-similar region by finding the first dip
  let dip = minLag
  while (dip < maxLag - 1 && corr[dip] > corr[dip + 1]) dip++

  // Find the peak correlation after the dip
  let bestLag = -1
  let bestCorr = 0  // must beat zero (reject weak signals)
  for (let lag = dip; lag <= maxLag; lag++) {
    if (corr[lag] > bestCorr) {
      bestCorr = corr[lag]
      bestLag = lag
    }
  }

  if (bestLag < 1 || bestLag >= maxLag) return -1

  // Parabolic interpolation for sub-sample accuracy
  const y1 = corr[bestLag - 1]
  const y2 = corr[bestLag]
  const y3 = corr[bestLag + 1]
  const a = (y1 + y3 - 2 * y2) / 2
  const b = (y3 - y1) / 2
  const refinedLag = a !== 0 ? bestLag - b / (2 * a) : bestLag
  const freq = sampleRate / refinedLag

  return freq > 25 && freq < 2100 ? freq : -1
}
