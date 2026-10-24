// Samples from -1 to 1 as 16-bit little-endian PCM, base64 encoded, as both voice APIs take it.
export function toPcmBase64(window: Float32Array): string {
  const pcm = new Int16Array(window.length);
  for (const [index, sample] of window.entries()) {
    pcm[index] = Math.round(Math.max(-1, Math.min(1, sample)) * 0x7f_ff);
  }
  return Buffer.from(pcm.buffer).toString('base64');
}
