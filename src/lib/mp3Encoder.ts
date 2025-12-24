/**
 * MP3 Encoder
 * 
 * This module handles encoding AudioBuffer data to MP3 format using lamejs.
 * The encoding process converts the floating-point audio samples to 16-bit PCM,
 * then encodes them as MP3 data.
 */

// @ts-ignore - lamejs doesn't have TypeScript definitions
import lamejs from 'lamejs';

/**
 * Converts an AudioBuffer to MP3 format and triggers a download
 * 
 * The process:
 * 1. Extract raw audio samples from the AudioBuffer
 * 2. Convert from Float32 (-1 to 1) to Int16 (-32768 to 32767)
 * 3. Encode using LAME MP3 encoder
 * 4. Create a Blob and trigger download
 * 
 * @param audioBuffer - The rendered audio buffer from OfflineAudioContext
 * @param filename - Name for the downloaded file
 */
export async function encodeAndDownloadMp3(
  audioBuffer: AudioBuffer,
  filename: string = 'chord-progression.mp3'
): Promise<void> {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  
  // Get channel data
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
  
  // Convert Float32 to Int16
  const leftSamples = new Int16Array(samples);
  const rightSamples = new Int16Array(samples);
  
  for (let i = 0; i < samples; i++) {
    // Clamp and convert to 16-bit integer
    leftSamples[i] = Math.max(-32768, Math.min(32767, Math.round(leftChannel[i] * 32767)));
    rightSamples[i] = Math.max(-32768, Math.min(32767, Math.round(rightChannel[i] * 32767)));
  }
  
  // Create MP3 encoder
  // Parameters: channels, sample rate, bitrate (kbps)
  const mp3encoder = new lamejs.Mp3Encoder(2, sampleRate, 128);
  
  // Encode in chunks for memory efficiency
  const chunkSize = 1152; // Must be multiple of 576 for LAME
  const mp3Data: Uint8Array[] = [];
  
  for (let i = 0; i < samples; i += chunkSize) {
    const leftChunk = leftSamples.subarray(i, i + chunkSize);
    const rightChunk = rightSamples.subarray(i, i + chunkSize);
    
    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
  }
  
  // Flush the encoder
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(new Uint8Array(mp3buf));
  }
  
  // Combine all chunks into a single Uint8Array
  const totalLength = mp3Data.reduce((acc, chunk) => acc + chunk.length, 0);
  const mp3Array = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of mp3Data) {
    mp3Array.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Create blob and trigger download
  const blob = new Blob([mp3Array], { type: 'audio/mp3' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(url);
}
