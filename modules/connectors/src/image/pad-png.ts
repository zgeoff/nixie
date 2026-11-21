import { crc32, deflateSync } from 'node:zlib';
import type { ImageDimensions } from './image-size';
import { readPngPixels } from './read-png-pixels';

// Scales the picture to fit inside the canvas and centres it on transparent pixels, so a picture
// of any shape becomes an image of a size the providers draw at. Returns null for a PNG whose
// pixels this cannot read.
export async function padPng(png: Uint8Array, canvas: ImageDimensions): Promise<Uint8Array | null> {
  const fitted = await new Bun.Image(png)
    .resize(canvas.width, canvas.height, { fit: 'inside' })
    .png()
    .bytes();

  const pixels = readPngPixels(fitted);

  if (pixels === null) {
    return null;
  }

  const stride = canvas.width * 4;
  const rows = Buffer.alloc((stride + 1) * canvas.height);
  const left = Math.floor((canvas.width - pixels.width) / 2);
  const top = Math.floor((canvas.height - pixels.height) / 2);

  for (let row = 0; row < pixels.height; row += 1) {
    const from = row * pixels.width * 4;
    const to = (top + row) * (stride + 1) + 1 + left * 4;

    rows.set(pixels.rgba.subarray(from, from + pixels.width * 4), to);
  }

  return encodePng(rows, canvas);
}

const pngSignature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function encodePng(rows: Uint8Array, canvas: ImageDimensions): Uint8Array {
  const header = Buffer.alloc(13);

  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header.set([8, 6, 0, 0, 0], 8);

  return Buffer.concat([
    pngSignature,
    buildChunk('IHDR', header),
    buildChunk('IDAT', deflateSync(rows)),
    buildChunk('IEND', new Uint8Array(0)),
  ]);
}

function buildChunk(type: string, body: Uint8Array): Uint8Array {
  const chunk = Buffer.alloc(12 + body.byteLength);

  chunk.writeUInt32BE(body.byteLength, 0);
  chunk.write(type, 4, 'ascii');
  chunk.set(body, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + body.byteLength)), 8 + body.byteLength);

  return chunk;
}
