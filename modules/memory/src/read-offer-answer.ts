import type { Log, LogRecord } from '@heynixie/log';
import { z } from 'zod';
import { findSourceEvidence } from './find-source-evidence';
import type { OfferAnswerRequest } from './gate-types';
import { ImageOfferError } from './image-offer-error';
import { isTypedYes } from './is-typed-yes';
import { readImageOffer } from './read-image-offer';
import { readThreadRecord } from './read-thread-record';
import { requireFirstAnswer } from './require-first-answer';
import type { QuoteEvidence } from './types';

// A yes that saves an offer: the offer's record, the offered text, your typed yes and where it lies.
export interface OfferYes {
  readonly offerSequence: number;
  readonly text: string;
  readonly typed: string;
  readonly evidence: QuoteEvidence;
}

// Reads your answer to the model's offer for an image, or null when it saves nothing: the answer is
// no plain yes you typed, or the offer's text or the image's message is gone. An answer to no offer,
// or a message that is not your first one after the offer, is refused.
export async function readOfferAnswer(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: OfferAnswerRequest,
): Promise<OfferYes | null> {
  const thread = request.caller.thread;

  const offer = await readImageOffer(log, { thread, image: request.image });

  if (offer === null) {
    throw new ImageOfferError(
      `You made no offer for image ${String(request.image.image)} of #${String(request.image.messageSequence)}, so nothing was saved.`,
    );
  }

  await requireFirstAnswer(log, {
    thread,
    offerSequence: offer.sequence,
    answerSequence: request.answerSequence,
  });

  return offer.text === null
    ? null
    : readTypedYes(log, request, { offerSequence: offer.sequence, text: offer.text });
}

interface ReadOffer {
  readonly offerSequence: number;
  readonly text: string;
}

// your answer when the image's message is still readable and the answer is a plain yes, typed
async function readTypedYes(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: OfferAnswerRequest,
  offer: ReadOffer,
): Promise<OfferYes | null> {
  const thread = request.caller.thread;

  const image = await readThreadRecord(log, { thread, sequence: request.image.messageSequence });
  const record = await readThreadRecord(log, { thread, sequence: request.answerSequence });

  const message = toSourceMessage(record);
  const typed = message?.text.trim() ?? '';

  if (image?.erasable.status !== 'readable' || message === null || !isTypedYes(typed)) {
    return null;
  }

  const found = await findSourceEvidence(log, message, typed);

  return found.status === 'found' ? { ...offer, typed, evidence: found.evidence } : null;
}

function toSourceMessage(record: LogRecord | null) {
  if (record?.erasable.status !== 'readable') {
    return null;
  }

  const fields = messageFields.safeParse(record.erasable.fields);

  return fields.success
    ? { sequence: record.sequence, text: fields.data.text, spans: fields.data.spans ?? [] }
    : null;
}

const messageSpan = z.object({ start: z.int(), end: z.int(), source: z.string() });
const messageFields = z.object({ text: z.string(), spans: z.array(messageSpan).optional() });
