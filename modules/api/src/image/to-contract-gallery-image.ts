import type { GalleryImage } from '@heynixie/connectors';
import type { galleryImageSchema } from '@heynixie/contract';
import type { z } from 'zod';

export function toContractGalleryImage(image: GalleryImage): z.infer<typeof galleryImageSchema> {
  return {
    image: image.image,
    name: image.name,
    prompt: image.prompt,
    from: image.from,
    source: image.source,
    isPinned: image.isPinned,
    isForgotten: image.isForgotten,
    createdAt: new Date(image.createdAtMs),
  };
}
