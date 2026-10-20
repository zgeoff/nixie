import type { Log, LogTables } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import type { OwnerMessage } from './gate-types';

export interface OwnerMessageQuery {
  readonly thread: string;
  readonly limit: number;
}

const spanSource = z.enum(['typed', 'pasted', 'dropped', 'unknown']);
const messageSpan = z.object({ start: z.int(), end: z.int(), source: spanSource });
const messageFields = z.object({ text: z.string(), spans: z.array(messageSpan) });

// Reads your latest messages in the thread, newest first, with their text and spans. A message
// whose text is gone, such as one a forget erased, is left out, because nothing in it can back a
// write any more.
export async function readOwnerMessages(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: OwnerMessageQuery,
): Promise<readonly OwnerMessage[]> {
  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'owner_message')
    .where('thread', '=', query.thread)
    .orderBy('sequence', 'desc')
    .limit(query.limit)
    .execute();

  const messages = await Promise.all(
    rows.map(async (row) => {
      const [entry] = await readRecords(log, { afterSequence: row.sequence - 1, limit: 1 });

      const erasable = entry?.record.erasable;

      if (erasable?.status !== 'readable') {
        return null;
      }

      const fields = messageFields.parse(erasable.fields);

      return { sequence: row.sequence, text: fields.text, spans: fields.spans };
    }),
  );

  return messages.filter((message) => message !== null);
}
