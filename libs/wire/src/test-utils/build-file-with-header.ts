// a sealed spool file with its header replaced and its length prefix fixed up, and the ciphertext
// as it was
export function buildFileWithHeader(file: Uint8Array, header: Record<string, unknown>): Uint8Array {
  const oldLength = new DataView(file.buffer, file.byteOffset).getUint32(0);
  const bytes = new TextEncoder().encode(JSON.stringify(header));

  const rest = file.subarray(4 + oldLength);

  const out = new Uint8Array(4 + bytes.length + rest.length);

  new DataView(out.buffer).setUint32(0, bytes.length);

  out.set(bytes, 4);
  out.set(rest, 4 + bytes.length);

  return out;
}
