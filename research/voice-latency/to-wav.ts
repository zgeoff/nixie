// A mono 16-bit PCM WAV file, which every audio player opens.
export function toWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string): void => {
    for (const [index, character] of [...text].entries()) {
      view.setUint8(offset + index, character.charCodeAt(0));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (const [index, sample] of samples.entries()) {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(clipped * 0x7f_ff), true);
  }
  return bytes;
}
