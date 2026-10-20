import type { Log } from '@heynixie/log';
import { z } from 'zod';
import type { ImageOfferQuery } from './read-image-offer-sequence';
import { readImageOfferSequence } from './read-image-offer-sequence';
import { readThreadRecord } from './read-thread-record';

// The model's offer for an image: its record's sequence, and the text it offered, or null once the
// record's key is gone.
export interface ImageOffer {
  readonly sequence: number;
  readonly text: string | null;
}

const offerFields = z.object({ text: z.string() });

// Reads the offer the model made for an image in the thread, or null when it made none.
export async function readImageOffer(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: ImageOfferQuery,
): Promise<ImageOffer | null> {
  const sequence = await readImageOfferSequence(log.writer.db, query);

  if (sequence === null) {
    return null;
  }

  const record = await readThreadRecord(log, { thread: query.thread, sequence });

  const erasable = record?.erasable.status === 'readable' ? record.erasable.fields : null;
  const fields = offerFields.safeParse(erasable);

  return { sequence, text: fields.success ? fields.data.text : null };
}
