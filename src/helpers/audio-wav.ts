/**
 * Converts an AudioBuffer (or Float32Array channel data) into a standard 16kHz 16-bit Mono WAV Blob.
 * This guarantees the Python MLX-Whisper server can read the audio directly using Python's standard
 * wave module without requiring external binaries like ffmpeg.
 */
export function writeWavHeader(view: DataView, numSamples: number, sampleRate = 16000, numChannels = 1): void {
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Chunk Descriptor
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  // "fmt " Sub-chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate (16000)
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample (16-bit)

  // "data" Sub-chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
}

export function floatTo16BitPCM(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm;
}

export function createWavBlob(channelData: Float32Array, sampleRate = 16000): Blob {
  const pcm = floatTo16BitPCM(channelData);
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);

  writeWavHeader(view, pcm.length, sampleRate, 1);

  // Copy PCM samples into buffer after the 44-byte WAV header
  const pcmView = new Int16Array(buffer, 44, pcm.length);
  pcmView.set(pcm);

  return new Blob([buffer], { type: "audio/wav" });
}

export async function convertBlobToWav(rawBlob: Blob, targetSampleRate = 16000): Promise<Blob> {
  // If the browser provides AudioContext, decode WebM/Opus into raw float32 samples
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return rawBlob;
  }

  const audioCtx = new AudioCtx({ sampleRate: targetSampleRate });
  try {
    const arrayBuffer = await rawBlob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Mixdown to mono if multiple channels
    const numChannels = audioBuffer.numberOfChannels;
    let monoData: Float32Array;

    if (numChannels === 1) {
      monoData = audioBuffer.getChannelData(0);
    } else {
      monoData = new Float32Array(audioBuffer.length);
      for (let c = 0; c < numChannels; c++) {
        const channelData = audioBuffer.getChannelData(c);
        for (let i = 0; i < audioBuffer.length; i++) {
          monoData[i] += channelData[i] / numChannels;
        }
      }
    }

    return createWavBlob(monoData, audioBuffer.sampleRate || targetSampleRate);
  } finally {
    await audioCtx.close().catch(() => {});
  }
}
