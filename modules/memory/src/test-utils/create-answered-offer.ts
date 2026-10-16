import type { LogTables } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { ImageRef } from '../gate-types';
import { buildMockWriteCaller } from './build-mock-write-caller';
import type { TestMemory } from './start-test-memory';
import { writeModelReplyRecord } from './write-model-reply-record';
import { writeOwnerMessageRecord } from './write-owner-message-record';

export interface AnsweredOffer {
  readonly image: ImageRef;
  readonly answerSequence: number;

  // the key the offer record's erasable fields are sealed under
  readonly offerKeyID: string;
}

export interface AnsweredOfferRequest {
  // the text the model offers to save
  readonly text: string;
}

// Writes your message with one image, the model's offer to save the text for it, the reply that
// presents the offer, and your typed yes, which no one has passed on yet.
export async function createAnsweredOffer(
  memory: TestMemory,
  request: AnsweredOfferRequest,
): Promise<AnsweredOffer> {
  const photo = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'Here is a photo',
    spans: [{ start: 0, end: 15, source: 'typed' }],
    images: ['image/jpeg'],
  });

  const image = { messageSequence: photo, image: 1 };

  const line = await memory.store.writes.offerImage({
    image,
    text: request.text,
    caller: buildMockWriteCaller(),
  });

  await writeModelReplyRecord(memory.log, { thread: 'conversation', text: line });

  const answerSequence = await writeOwnerMessageRecord(memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  const offer = await memory.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('kind', '=', 'memory.image_offered')
    .where('sequence', '>', photo)
    .orderBy('sequence')
    .executeTakeFirstOrThrow();

  invariant(offer.key_id !== null, 'the offer record has no key');

  return { image, answerSequence, offerKeyID: offer.key_id };
}
