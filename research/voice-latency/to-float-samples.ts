// 16-bit little-endian PCM, base64 encoded, as both voice APIs send it, to samples from -1 to 1.
export function toFloatSamples(base64: string): Float32Array {
  const bytes = Buffer.from(base64, 'base64');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let index = 0; index < samples.length; index++) {
    samples[index] = view.getInt16(index * 2, true) / 0x80_00;
  }
  return samples;
}
