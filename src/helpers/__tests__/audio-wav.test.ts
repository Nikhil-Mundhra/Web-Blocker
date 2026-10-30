/**
 * @jest-environment jsdom
 */

import { createWavBlob, floatTo16BitPCM, writeWavHeader } from "../audio-wav";

describe("audio-wav helper", () => {
  it("converts float32 audio samples to 16-bit PCM", () => {
    const samples = new Float32Array([-1.0, 0.0, 1.0, 0.5, -0.5]);
    const pcm = floatTo16BitPCM(samples);

    expect(pcm[0]).toBe(-32768); // -1.0 * 0x8000
    expect(pcm[1]).toBe(0);
    expect(pcm[2]).toBe(32767);  // 1.0 * 0x7FFF
    expect(pcm.length).toBe(5);
  });

  it("writes valid 44-byte RIFF WAVE header", () => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    writeWavHeader(view, 16000, 16000, 1);

    // Verify RIFF
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(riff).toBe("RIFF");

    // Verify WAVE
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(wave).toBe("WAVE");

    // Verify fmt chunk
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // Mono
    expect(view.getUint32(24, true)).toBe(16000); // Sample rate
    expect(view.getUint16(34, true)).toBe(16); // 16 bits
  });

  it("creates a valid WAV blob from channel data", () => {
    const samples = new Float32Array(16000); // 1 second of silence
    const wavBlob = createWavBlob(samples, 16000);

    expect(wavBlob.type).toBe("audio/wav");
    expect(wavBlob.size).toBe(44 + 16000 * 2);
  });
});
