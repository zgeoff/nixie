import { imageLimits } from './image-limits';

export type StoredPng =
  | {
      readonly kind: 'png';
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: 'unreadable'; readonly reason: string };

export interface StoredPngLimits {
  // scales the picture down until its long side fits; null keeps its size
  readonly longEdge: number | null;
}

const shrinkFactor = 0.75;
const shrinkTries = 8;

// Decodes the bytes and encodes them again as a PNG, scaled down while it passes the limits, so a
// stored image is always a PNG that decodes and that a provider takes whole.
export async function convertToPng(bytes: Uint8Array, limits: StoredPngLimits): Promise<StoredPng> {
  try {
    const metadata = await new Bun.Image(bytes, { maxPixels: imageLimits.maxPixels }).metadata();

    let edge = Math.min(limits.longEdge ?? Infinity, Math.max(metadata.width, metadata.height));

    for (let attempt = 0; attempt < shrinkTries; attempt += 1) {
      const png = await new Bun.Image(bytes, { maxPixels: imageLimits.maxPixels })
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .png()
        .bytes();

      if (png.byteLength <= imageLimits.maxStoredBytes) {
        const size = await new Bun.Image(png).metadata();

        return { kind: 'png', bytes: new Uint8Array(png), width: size.width, height: size.height };
      }

      if (limits.longEdge === null) {
        return {
          kind: 'unreadable',
          reason: 'the PNG is past the 8 MiB that a stored image takes',
        };
      }

      edge = Math.floor(edge * shrinkFactor);
    }

    return { kind: 'unreadable', reason: 'the picture stays past 8 MiB at any size' };
  } catch (error) {
    return { kind: 'unreadable', reason: error instanceof Error ? error.message : String(error) };
  }
}
