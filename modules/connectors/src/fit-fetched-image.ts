import { imageLimits } from '@heynixie/contract';
import type { ToolImage } from '@heynixie/tools';

export type FittedImage =
  | {
      readonly kind: 'image';
      readonly image: ToolImage;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: 'unreadable'; readonly reason: string };

// Bun.Image refuses a canvas past this many pixels from its header, before it decodes, so a small
// file that claims a huge canvas cannot take the host's memory: 25 million pixels decode to 100 MB.
const maxPixels = 25_000_000;
const jpegQuality = 85;

// Every image is decoded and encoded again: a clean header can come before pixels that never
// decode, and the SDK resends each image in every later request of the session. Bun runs the
// decode and the encode on its own worker threads, off the event loop.
export async function fitFetchedImage(bytes: Uint8Array, longEdge: number): Promise<FittedImage> {
  try {
    const image = new Bun.Image(bytes, { maxPixels }).resize(longEdge, longEdge, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    const metadata = await image.metadata();

    const format = metadata.format === 'jpeg' ? 'jpeg' : 'png';

    const encoded =
      format === 'png'
        ? await image.png().bytes()
        : await image.jpeg({ quality: jpegQuality }).bytes();

    // A PNG of a photo can stay past the model's limit at the long edge, where a JPEG fits, at the
    // cost of any transparency.
    const fitted =
      encoded.byteLength > imageLimits.bytes && format === 'png'
        ? { bytes: await image.jpeg({ quality: jpegQuality }).bytes(), format: 'jpeg' as const }
        : { bytes: encoded, format };

    if (fitted.bytes.byteLength > imageLimits.bytes) {
      return { kind: 'unreadable', reason: `past the ${imageLimits.bytes} bytes the model takes` };
    }

    return {
      kind: 'image',
      image: { mediaType: `image/${fitted.format}`, bytes: fitted.bytes },
      width: image.width,
      height: image.height,
    };
  } catch (error) {
    return { kind: 'unreadable', reason: toImageErrorReason(error) };
  }
}

function toImageErrorReason(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }

  return String(error);
}
