import type { Log } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { ImageRef } from './gate-types';
import { ImageSourceError } from './image-source-error';
import { readThreadRecord } from './read-thread-record';

export interface ImageSourceQuery {
  readonly thread: string;
  readonly image: ImageRef;
}

// Refuses an image source that is not one image of one of your readable messages in the write's
// thread.
export async function requireImageSource(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: ImageSourceQuery,
): Promise<void> {
  const image = query.image;

  const message = await readThreadRecord(log, {
    thread: query.thread,
    sequence: image.messageSequence,
  });

  const images =
    message?.kind === 'owner_message'
      ? ownerMessageCodec.tryDecodePartial(message.payload)?.images
      : undefined;

  if (
    message === null ||
    message.erasable.status !== 'readable' ||
    images === undefined ||
    image.image > images.length
  ) {
    throw new ImageSourceError(
      `#${String(image.messageSequence)} holds no image ${String(image.image)} of the owner's in this thread, so nothing was saved.`,
    );
  }
}
