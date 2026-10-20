import { imageLimits } from '@heynixie/contract';
import invariant from 'tiny-invariant';
import { ImageUnreadableError } from './image-unreadable-error';

// Turns an image you attach into the copy nixie keeps: the browser decodes it, HEIC included where
// the browser reads HEIC, and draws it with its long edge at most 1568 px, upright as the camera
// took it. The new encoding carries none of the file's metadata, such as where a photo was taken.
export async function normalizeImage(image: Blob): Promise<File> {
  const bitmap = await createImageBitmap(image).catch((error: unknown) => {
    throw new ImageUnreadableError(error);
  });

  const scale = Math.min(1, imageLimits.longEdge / Math.max(bitmap.width, bitmap.height));

  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * scale)),
    Math.max(1, Math.round(bitmap.height * scale)),
  );

  const context = canvas.getContext('2d');

  // a fresh OffscreenCanvas always has a 2d context to give
  invariant(context, 'the canvas has no 2d context');

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encoded = await encodeCanvas(canvas, pickEncoding(image.type));

  return new File([encoded], `image.${encoded.type === 'image/png' ? 'png' : 'jpg'}`, {
    type: encoded.type,
  });
}

interface Encoding {
  readonly type: 'image/png' | 'image/jpeg';
  readonly quality?: number;
}

// a PNG past the byte limit, such as a photo saved as PNG, goes again as JPEG
async function encodeCanvas(canvas: OffscreenCanvas, encoding: Encoding): Promise<Blob> {
  const encoded = await canvas.convertToBlob(encoding);

  if (encoded.size <= imageLimits.bytes || encoding.type === 'image/jpeg') {
    return encoded;
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

// a screenshot or a drawing keeps its sharp edges and its transparency as PNG; a photo goes as JPEG
function pickEncoding(type: string): Encoding {
  return type === 'image/png' || type === 'image/gif' || type === 'image/webp'
    ? { type: 'image/png' }
    : { type: 'image/jpeg', quality: 0.85 };
}
