import type { Log, LogRecord } from '@heynixie/log';
import { z } from 'zod';
import { findSourceEvidence } from './find-source-evidence';
import type { OfferAnswerRequest } from './gate-types';
import { isTypedYes } from './is-typed-yes';
import { readThreadRecord } from './read-thread-record';
import type { QuoteEvidence } from './types';

// The offer a yes would save: its record, the text it holds, and the reply that presented it.
export interface ReadOffer {
  readonly offerSequence: number;
  readonly text: string;
  readonly replySequence: number;
}

// A yes that saves an offer: the offer, your typed yes and where it lies.
export interface OfferYes extends ReadOffer {
  readonly typed: string;
  readonly evidence: QuoteEvidence;
}

// Reads your answer as the yes that saves an offer, or null when the image's message is gone or the
// answer is no plain yes you typed.
export async function readTypedYes(
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
