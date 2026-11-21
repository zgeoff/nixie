import { inflateSync } from 'node:zlib';

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngPixels {
  readonly width: number;
  readonly height: number;

  // width * height * 4 bytes, row by row
  readonly rgba: Uint8Array;
}

export interface PngSize {
  readonly width: number;
  readonly height: number;
}

// Reads a PNG of 8-bit red, green, blue and alpha with no interlacing. Any other PNG reads as null.
export function readPngPixels(png: Uint8Array): PngPixels | null {
  if (!signature.every((byte, index) => png[index] === byte)) {
    return null;
  }

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

  const compressed: Uint8Array[] = [];
  let size: PngSize | null = null;
  let offset = signature.length;

  while (offset + 8 <= png.byteLength) {
    const length = view.getUint32(offset);

    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));

    const body = png.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      const header = new DataView(body.buffer, body.byteOffset, body.byteLength);

      const isSupported = body[8] === 8 && body[9] === 6 && body[12] === 0;

      if (!isSupported) {
        return null;
      }

      size = { width: header.getUint32(0), height: header.getUint32(4) };
    }

    if (type === 'IDAT') {
      compressed.push(body);
    }

    offset += 12 + length;
  }

  if (size === null) {
    return null;
  }

  const raw = inflateSync(Buffer.concat(compressed));

  return { ...size, rgba: unfilterRows(raw, size) };
}

// 4 bytes a pixel: red, green, blue and alpha, which is what Bun encodes every PNG as
const bytesPerPixel = 4;

function unfilterRows(raw: Uint8Array, size: PngSize): Uint8Array {
  const stride = size.width * bytesPerPixel;

  const rgba = new Uint8Array(stride * size.height);

  for (let row = 0; row < size.height; row += 1) {
    const filter = raw[row * (stride + 1)] ?? 0;
    const input = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const current = rgba.subarray(row * stride, (row + 1) * stride);

    const above =
      row === 0 ? new Uint8Array(stride) : rgba.subarray((row - 1) * stride, row * stride);

    unfilterRow(filter, { input, current, above });
  }

  return rgba;
}

interface RowBuffers {
  readonly input: Uint8Array;
  readonly current: Uint8Array;
  readonly above: Uint8Array;
}

function unfilterRow(filter: number, row: RowBuffers): void {
  const input = row.input;
  const current = row.current;
  const above = row.above;

  for (let column = 0; column < input.length; column += 1) {
    const left = column >= bytesPerPixel ? (current[column - bytesPerPixel] ?? 0) : 0;
    const up = above[column] ?? 0;
    const upLeft = column >= bytesPerPixel ? (above[column - bytesPerPixel] ?? 0) : 0;

    current[column] = ((input[column] ?? 0) + predictByte(filter, left, up, upLeft)) & 0xff;
  }
}

function predictByte(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 1) {
    return left;
  }

  if (filter === 2) {
    return up;
  }

  if (filter === 3) {
    return (left + up) >> 1;
  }

  return filter === 4 ? pickPaeth(left, up, upLeft) : 0;
}

function pickPaeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  return upDistance <= upLeftDistance ? up : upLeft;
}
