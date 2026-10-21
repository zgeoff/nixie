import type { ImageMediaType } from '@heynixie/contract';
import { imageLimits } from '@heynixie/contract';
import { findImageMediaType } from './find-image-media-type';
import type { OwnerImage } from './types';

export type OwnerImagesResult =
  | { readonly status: 'read'; readonly images: readonly OwnerImage[] }
  | {
      readonly status: 'refused';
      readonly reason: 'too_many' | 'too_large' | 'unsupported_type';
      readonly position: number | null;
    };

export async function readOwnerImages(files: readonly Blob[]): Promise<OwnerImagesResult> {
  const refused = findSizeRefusal(files);

  if (refused !== null) {
    return refused;
  }

  const read = await Promise.all(files.map((file) => file.bytes()));

  const checked = read.map((bytes) => ({ bytes, mediaType: findImageMediaType(bytes) }));
  const images = checked.filter((image) => isOwnerImage(image));

  if (images.length < checked.length) {
    const position = checked.findIndex((image) => !isOwnerImage(image));

    return { status: 'refused', reason: 'unsupported_type', position };
  }

  return { status: 'read', images };
}

function findSizeRefusal(files: readonly Blob[]): OwnerImagesResult | null {
  if (files.length > imageLimits.count) {
    return { status: 'refused', reason: 'too_many', position: null };
  }

  const oversized = files.findIndex((file) => file.size > imageLimits.bytes);

  return oversized === -1 ? null : { status: 'refused', reason: 'too_large', position: oversized };
}

interface CheckedImage {
  readonly mediaType: ImageMediaType | null;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

function isOwnerImage(image: CheckedImage): image is OwnerImage {
  return image.mediaType !== null;
}
