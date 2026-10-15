import type { InboxMessage } from '@heynixie/wire';

// The image bytes, in base64, that one inbox message carries to the model.
export function countImageBytes(message: InboxMessage): number {
  return (message.images ?? []).reduce((total, image) => total + image.data.length, 0);
}
