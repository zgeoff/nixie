import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import type { OwnerMessage } from './gate-context';

// A sequence that names any record but an owner message, or a message a forget erased, is left out.
export async function readOwnerMessagesBySequence(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequences: readonly number[],
): Promise<readonly OwnerMessage[]> {
  if (sequences.length === 0) {
    return [];
  }

  const entries = await readRecords(log, {
    afterSequence: 0,
    sequences,
    kinds: ['owner_message'],
    limit: sequences.length,
  });

  return entries.flatMap((entry) => toOwnerMessages(entry.record));
}

const spanSchema = z.object({
  start: z.int(),
  end: z.int(),
  source: z.enum(['typed', 'pasted', 'dropped', 'unknown']),
});

const textSchema = z.string();
const spansSchema = z.array(spanSchema);

function toOwnerMessages(record: LogRecord): OwnerMessage[] {
  if (record.erasable.status !== 'readable') {
    return [];
  }

  const text = textSchema.parse(record.erasable.fields['text']);
  const spans = spansSchema.parse(record.erasable.fields['spans']);

  return [
    {
      sequence: record.sequence,
      text,
      spans,
      sentAt: record.recordedAt.getTime(),
      timeZone: null,
    },
  ];
}
