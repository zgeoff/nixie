import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import { readForgottenSequences } from './read-forgotten-sequences';
import type { IndexEntry } from './start-memory-index';
import type { MemoryContext } from './types';

// The entries of one read of the log, and the last sequence the read reached.
export interface MessageEntries {
  readonly entries: readonly IndexEntry[];
  readonly through: number;
}

const pageSize = 200;

// Reads the words you typed in each of your messages after the sequence, each keyed by its
// sequence. A message with no typed words, one whose key is gone, or one that backed a forgotten
// item stays out, so neither a paste nor a forget comes back as your past message.
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

// your typed spans, with a line break for each other span so words beside a paste never join; the
// whole text when no span carries a label, as from a client that sends none; null with no typed
// words, or once a forget erased them
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
