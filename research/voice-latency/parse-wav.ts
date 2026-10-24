// A mono 16-bit PCM WAV file, as the runners write their recordings, back to samples from -1 to 1.
export function parseWav(bytes: Uint8Array): { sampleRate: number; samples: Float32Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readText = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (readText(0) !== 'RIFF' || readText(8) !== 'WAVE' || view.getUint16(20, true) !== 1) {
    throw new Error('not a PCM WAV file');
  }
  if (view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16) {
    throw new Error('not a mono 16-bit WAV file');
  }
  const sampleRate = view.getUint32(24, true);
  const dataBytes = view.getUint32(40, true);
  const samples = new Float32Array(dataBytes / 2);
  for (let index = 0; index < samples.length; index++) {
    samples[index] = view.getInt16(44 + index * 2, true) / 0x80_00;
  }
  return { sampleRate, samples };
}
