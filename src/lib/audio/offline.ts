/**
 * Rendering a track to a file, minus the instrument.
 *
 * The bass tab had all of this inline in `bassTab/exportAudio.ts`, the chord
 * editor a copy of the WAV encoder in `mp3Encoder.ts`, and the drum tab nothing
 * at all. What is actually shared is the shape of the job: open an offline
 * context, let something schedule into it, normalise the result, hand the user
 * a file. Only the "let something schedule into it" part is per-instrument.
 */

export interface OfflineRenderOptions {
  /** Seconds of audio to render, tail included. */
  duration: number
  /**
   * Must match the live context when decoded samples are being reused: an
   * `AudioBuffer` played at a different rate than it was decoded at is
   * pitch-shifted, which would export a kit tuned a few percent off.
   */
  sampleRate?: number
  channels?: number
  /** Fills the context with sound. Everything must be scheduled, not played "now". */
  schedule(context: OfflineAudioContext): void | Promise<void>
}

export async function renderOffline(options: OfflineRenderOptions): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100
  const length = Math.max(1, Math.ceil(options.duration * sampleRate))
  const context = new OfflineAudioContext(options.channels ?? 2, length, sampleRate)
  await options.schedule(context)
  return context.startRendering()
}

/**
 * Scale to just under full scale.
 *
 * A drum kit peaks far higher than a bass line, so a fixed export gain would
 * either clip one or bury the other; measuring is the only thing that works for
 * both. 0.9 rather than 1.0 leaves room for the intersample peaks a lossy
 * encoder can introduce downstream.
 */
export function normalizeBuffer(buffer: AudioBuffer, ceiling = 0.9): void {
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i])
      if (abs > peak) peak = abs
    }
  }
  if (peak <= 0.001) return
  const gain = ceiling / peak
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) data[i] *= gain
  }
}

/** 16-bit PCM WAV. Uncompressed, but universally supported. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const dataBytes = frames * channels * 2
  const out = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(out)

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)          // PCM chunk size
  view.setUint16(20, 1, true)           // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)

  const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch))
  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, data[ch][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([out], { type: 'audio/wav' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadWav(buffer: AudioBuffer, filename: string): void {
  downloadBlob(encodeWav(buffer), filename.endsWith('.wav') ? filename : `${filename}.wav`)
}
