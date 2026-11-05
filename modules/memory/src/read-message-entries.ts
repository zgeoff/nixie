import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import { readForgottenSequences } from './read-forgotten-sequences';
import type { IndexEntry } from './start-memory-index';
import type { MemoryContext } from './types';

export interface MessageEntries {
  readonly entries: readonly IndexEntry[];
  readonly through: number;
}

const pageSize = 200;

export async function readMessageEntries(
  context: Pick<MemoryContext, 'log'>,
  afterSequence: number,
): Promise<MessageEntries> {
  const entries: IndexEntry[] = [];
  const page = { after: afterSequence, size: pageSize };

  while (page.size === pageSize) {
    const read = await readRecords(context.log, {
      afterSequence: page.after,
      kinds: ['owner_message'],
      limit: pageSize,
    });

    const records = read.map((entry) => entry.record);

    entries.push(...(await readReadableEntries(context, records)));

    page.size = records.length;
    page.after = records.at(-1)?.sequence ?? page.after;
  }

  return { entries, through: page.after };
}

async function readReadableEntries(
  context: Pick<MemoryContext, 'log'>,
  records: readonly LogRecord[],
): Promise<readonly IndexEntry[]> {
  const forgotten = await readForgottenSequences(
    context.log.writer.db,
    records.map((record) => record.sequence),
  );

  return records.flatMap((record) => {
    const text = findTypedText(record);

    return text === null || forgotten.has(record.sequence)
      ? []
      : [{ itemID: String(record.sequence), text }];
  });
}

const messageSpans = z.array(z.object({ start: z.int(), end: z.int(), source: z.string() }));

function findTypedText(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const fields = record.erasable.fields;
  const text = fields['text'];

  if (typeof text !== 'string') {
    return null;
  }

  const spans = messageSpans.safeParse(fields['spans']);

  const typed =
    spans.success && spans.data.some((span) => span.source !== 'unknown')
      ? spans.data
          .map((span) => (span.source === 'typed' ? text.slice(span.start, span.end) : '\n'))
          .join('')
      : text;

  return typed.trim() === '' ? null : typed;
}
