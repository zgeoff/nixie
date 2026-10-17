import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { readForgottenSequences } from './read-forgotten-sequences';
import type { IndexEntry } from './start-memory-index';
import type { MemoryContext } from './types';

// The entries of one read of the log, and the last sequence the read reached.
export interface MessageEntries {
  readonly entries: readonly IndexEntry[];
  readonly through: number;
}

// Reads the text of each of your messages after the sequence for the message indexes, each keyed by
// its sequence. A message whose key is gone, or one that backed a forgotten item, stays out, so a
// forget never comes back through a past message.
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

    entries.push(...(await collectReadableEntries(context, records)));

    page.size = records.length;
    page.after = records.at(-1)?.sequence ?? page.after;
  }

  return { entries, through: page.after };
}

const pageSize = 200;

async function collectReadableEntries(
  context: Pick<MemoryContext, 'log'>,
  records: readonly LogRecord[],
): Promise<readonly IndexEntry[]> {
  const forgotten = await readForgottenSequences(
    context.log.writer.db,
    records.map((record) => record.sequence),
  );

  return records.flatMap((record) => {
    const text = findMessageText(record);

    return text === null || forgotten.has(record.sequence)
      ? []
      : [{ itemID: String(record.sequence), text }];
  });
}

// the message's words, or null once a forget erased them
function findMessageText(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const text = record.erasable.fields['text'];

  return typeof text === 'string' && text.trim() !== '' ? text : null;
}
