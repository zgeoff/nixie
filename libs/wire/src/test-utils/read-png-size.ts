export interface PNGSize {
  readonly width: number;
  readonly height: number;
}

// The width and height in the header of a PNG, which a render's picture tells its size by.
export function readPNGSize(bytes: Uint8Array): PNGSize {
  const header = new DataView(bytes.buffer, bytes.byteOffset, 24);

  return { width: header.getUint32(16), height: header.getUint32(20) };
}
