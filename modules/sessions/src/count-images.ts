import type { InboxMessage } from '@heynixie/wire';
import type { ImageTally } from './types';

// The images, their bytes in base64 and how many, that one inbox message carries to the model.
export function countImages(message: InboxMessage): ImageTally {
  const images = message.images ?? [];

  return {
    bytes: images.reduce((total, image) => total + image.data.length, 0),
    count: images.length,
  };
}
