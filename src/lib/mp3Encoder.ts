/**
 * Audio Exporter
 * 
 * This module handles encoding AudioBuffer data to WAV format for download.
 * WAV export is more reliable across browsers than MP3.
 */

/**
 * Converts an AudioBuffer to WAV format and triggers a download
 * 
 * WAV format is uncompressed but universally supported and more reliable.
 * 
 * @param audioBuffer - The rendered audio buffer from OfflineAudioContext
 * @param filename - Name for the downloaded file
 */
export async function encodeAndDownloadMp3(
  audioBuffer: AudioBuffer,
  filename: string = 'chord-progression.wav'
): Promise<void> {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  
  // Create WAV file
  const wavBuffer = createWavFile(audioBuffer, numChannels, sampleRate, length);
  
  // Create blob and trigger download
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace('.mp3', '.wav');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(url);
}

/**
 * Creates a WAV file from an AudioBuffer
 */
function createWavFile(
  audioBuffer: AudioBuffer,
  numChannels: number,
  sampleRate: number,
  length: number
): ArrayBuffer {
  const bytesPerSample = 2; // 16-bit audio
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  
  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  
  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // Bits per sample
  
  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write audio data
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }
  
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = channels[ch][i];
      // Convert float [-1, 1] to int16 [-32768, 32767]
      const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return buffer;
}

/**
 * Helper to write a string to a DataView
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
