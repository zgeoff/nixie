import type { InboxMessage } from '@heynixie/wire';
import type { ImageTally } from './types';

export function countImages(message: InboxMessage): ImageTally {
  const images = message.images ?? [];

  return {
    bytes: images.reduce((total, image) => total + image.data.length, 0),
    count: images.length,
  };
}
