import type { BassTrack, BassSound } from './types'
import { renderTrackOffline } from './bassAudio'
import { encodeAndDownloadMp3 } from '../mp3Encoder'

function normalizeBuffer(buf: AudioBuffer): void {
  let peak = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i])
      if (abs > peak) peak = abs
    }
  }
  if (peak > 0.001) {
    const gain = 0.9 / peak
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < data.length; i++) data[i] *= gain
    }
  }
}

export async function exportTrackAsWav(
  track: BassTrack,
  sound: BassSound,
): Promise<void> {
  const buf = await renderTrackOffline(track, sound)
  normalizeBuffer(buf)
  const safeName = track.name.replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'bass-tab'
  await encodeAndDownloadMp3(buf, `${safeName}.wav`)
}
