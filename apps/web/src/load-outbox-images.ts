import { readOutboxImages } from './read-outbox-images';
import type { OutboxMessage } from './types';

export async function loadOutboxImages(message: OutboxMessage): Promise<OutboxMessage> {
  if (message.unreadImages === undefined) {
    return message;
  }

  const images = await readOutboxImages(message.clientMessageId).catch(() => []);

  if (images.length !== message.unreadImages) {
    return message;
  }

  return { ...message, images, unreadImages: undefined };
}
