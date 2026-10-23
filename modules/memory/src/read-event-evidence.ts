import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import { z } from 'zod';
import type { ReviewReason } from './gate-types';
import type { QuoteEvidenceResult } from './read-quote-evidence';
import { readSourceEvidence } from './read-source-evidence';
import type { SourceMessage } from './writer-types';

export interface EventSearch {
  readonly thread: string;
  readonly quote: string;

  readonly eventID: number;
}

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
    ? {
        sequence: entry.record.sequence,
        text: fields.data.text,
        spans: fields.data.spans ?? [],
        sentAt: entry.record.recordedAt.getTime(),
        timeZone: ownerMessageCodec.tryDecodePartial(entry.record.payload)?.timeZone ?? null,
      }
    : 'no_quote';
}
