import type { LogRecord } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { findImageOfferSequence } from './find-image-offer-sequence';
import type { ImageOfferRequest, ImageRef } from './gate-types';
import { ImageOfferError } from './image-offer-error';
import { readThreadRecord } from './read-thread-record';
import { renderOfferLine } from './render-offer-line';
import type { StoreParts } from './types';

// Records the model's one offer for an image of yours, with its text sealed under the record's own
// key, and returns the line it says to you. The check and the record share a transaction, so 2
// offers for one image never both pass.
export async function writeImageOffer(
  parts: StoreParts,
  request: ImageOfferRequest,
): Promise<string> {
  const log = parts.context.log;
  const thread = request.caller.thread;

  if (invisible.test(request.text)) {
    throw new ImageOfferError(
      'The text holds an invisible character, so no offer was made. Offer plain text.',
    );
  }

  const message = await readThreadRecord(log, {
    thread,
    sequence: request.image.messageSequence,
  });

  requireOwnerImage(message, request.image);

  await withWriteTransaction(log.writer, async (tx) => {
    const offered = await findImageOfferSequence(tx, { thread, image: request.image });

    if (offered !== null) {
      throw new ImageOfferError(
        `You already offered to remember image ${String(request.image.image)} of #${String(request.image.messageSequence)}, so no offer was made. Offer once per image.`,
      );
    }

    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'memory.image_offered',
        definitions: parts.context.definitions(),
        thread,
        payload: {
          messageSequence: request.image.messageSequence,
          image: request.image.image,
          runID: request.caller.runID,
        },
        erasable: { text: request.text },
      },
    ]);
  });

  return renderOfferLine(request.text);
}

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;

// Refuses an image that is not one of your readable messages' images in the thread.
function requireOwnerImage(message: LogRecord | null, image: ImageRef): void {
  const images = message?.payload['images'];

  if (
    message === null ||
    message.kind !== 'owner_message' ||
    message.erasable.status !== 'readable' ||
    !Array.isArray(images) ||
    image.image > images.length
  ) {
    throw new ImageOfferError(
      `#${String(image.messageSequence)} holds no image ${String(image.image)} of the owner's, so no offer was made.`,
    );
  }
}
