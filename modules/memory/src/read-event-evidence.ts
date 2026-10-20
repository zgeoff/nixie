import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import type { ReviewReason } from './gate-types';
import type { QuoteEvidenceResult } from './read-quote-evidence';
import { readSourceEvidence } from './read-source-evidence';
import type { SourceMessage } from './writer-types';

export interface EventSearch {
  readonly thread: string;
  readonly quote: string;

  // the sequence of the record the quote cites
  readonly eventID: number;
}

// Finds a quote in the one record it cites by event ID, however old: only a message of yours in the
// write's thread backs it, with the quote typed outside every quoted block. A reply or a tool result,
// such as a fetched page, holds no words you typed, and an erased message holds none at all.
export async function readEventEvidence(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  search: EventSearch,
): Promise<QuoteEvidenceResult> {
  const source = await readEventMessage(log, search);

  return typeof source === 'string'
    ? { status: 'review', reason: source }
    : readSourceEvidence(log, source, search.quote);
}

const messageSpan = z.object({ start: z.int(), end: z.int(), source: z.string() });
const messageFields = z.object({ text: z.string(), spans: z.array(messageSpan).optional() });

// the message the event ID names in the thread, or why it cannot back a quote
async function readEventMessage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  search: EventSearch,
): Promise<SourceMessage | ReviewReason> {
  const [entry] = await readRecords(log, {
    afterSequence: search.eventID - 1,
    beforeSequence: search.eventID + 1,
    thread: search.thread,
    limit: 1,
  });

  if (entry === undefined) {
    return 'no_quote';
  }

  if (entry.record.kind !== 'owner_message') {
    return 'quote_not_typed';
  }

  if (entry.record.erasable.status !== 'readable') {
    return 'forgotten_evidence';
  }

  const fields = messageFields.safeParse(entry.record.erasable.fields);

  return fields.success
    ? { sequence: entry.record.sequence, text: fields.data.text, spans: fields.data.spans ?? [] }
    : 'no_quote';
}
