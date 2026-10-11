import type { LogRecord as ContractRecord } from '@heynixie/contract';
import { readRecords } from '@heynixie/log';
import { sql } from 'kysely';
import { toContractRecord } from './to-contract-record';
import type { APIContext, APITables } from './types';

interface ThreadPageInput {
  readonly thread: string;
  readonly beforeSequence?: number | undefined;
  readonly limit?: number | undefined;
}

interface ThreadPage {
  readonly hasEarlier: boolean;
  readonly readAtSequence: number;
  readonly records: readonly ContractRecord[];
}

// Reads one page of a thread, newest last, and the log sequence the page was read at. The page
// holds no record past that sequence, so a client that follows the log from it misses no record and
// repeats none. Answers null when no thread has the ID.
export async function readThreadPage(
  context: APIContext,
  input: ThreadPageInput,
): Promise<ThreadPage | null> {
  const db = context.log.writer.db.$extendTables<APITables>();
  const thread = await db
    .selectFrom('threads')
    .select('thread')
    .where('thread', '=', input.thread)
    .executeTakeFirst();

  if (thread === undefined) {
    return null;
  }
  const last = await db
    .selectFrom('records')
    .select(sql<number>`coalesce(max(sequence), 0)`.as('sequence'))
    .executeTakeFirstOrThrow();
  const window = await findPageWindow(context, {
    thread: input.thread,
    before: Math.min(input.beforeSequence ?? Number.POSITIVE_INFINITY, last.sequence + 1),
    limit: input.limit ?? DEFAULT_LIMIT,
  });
  const entries =
    window.count === 0
      ? []
      : await readRecords(context.log, {
          afterSequence: window.afterSequence,
          limit: window.count,
          thread: input.thread,
        });

  return {
    hasEarlier: window.hasEarlier,
    readAtSequence: last.sequence,
    records: entries.flatMap((entry) => toContractRecord(entry.record) ?? []),
  };
}

const DEFAULT_LIMIT = 50;

interface PageBounds {
  readonly thread: string;
  readonly before: number;
  readonly limit: number;
}

interface PageWindow {
  readonly afterSequence: number;
  readonly count: number;
  readonly hasEarlier: boolean;
}

// the newest records below the bound, found by sequence alone, so the page reads forward from its
// oldest record and decrypts only what it returns
async function findPageWindow(context: APIContext, bounds: PageBounds): Promise<PageWindow> {
  const newest = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('sequence')
    .where('thread', '=', bounds.thread)
    .where('sequence', '<', bounds.before)
    .orderBy('sequence', 'desc')
    .limit(bounds.limit + 1)
    .execute();
  const count = Math.min(bounds.limit, newest.length);

  return {
    afterSequence: (newest.at(count - 1)?.sequence ?? 1) - 1,
    count,
    hasEarlier: newest.length > bounds.limit,
  };
}
