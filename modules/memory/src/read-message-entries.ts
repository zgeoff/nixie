import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { findTypedText } from './find-typed-text';
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
    const text =
      record.erasable.status === 'readable' ? findTypedText(record.erasable.fields) : null;

    return text === null || forgotten.has(record.sequence)
      ? []
      : [{ itemID: String(record.sequence), text }];
  });
}
