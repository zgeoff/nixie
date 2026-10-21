import type { LogRecord as ContractRecord } from '@heynixie/contract';
import type { RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
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
  readonly lastStepEnd: ContractRecord | null;
}

const DEFAULT_LIMIT = 50;

// Reads one page of a thread, newest last, its newest step end, and the log sequence the page was
// read at. Nothing read is past that sequence, so a client that follows the log from it misses no
// record and repeats none. Answers null when no thread has the ID.
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
    .select((expressionBuilder) =>
      expressionBuilder.fn
        .coalesce(expressionBuilder.fn.max('sequence'), expressionBuilder.lit(0))
        .as('sequence'),
    )
    .executeTakeFirstOrThrow();

  const window = await readPageWindow(context, {
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
    lastStepEnd: await readLastStepEnd(context, input.thread, last.sequence),
  };
}

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
async function readPageWindow(context: APIContext, bounds: PageBounds): Promise<PageWindow> {
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

const stepEndKinds: readonly RecordKind[] = [
  'task.step_committed',
  'task.step_errored',
  'task.revived',
];

// the newest record on the thread that ended a step, at or before the sequence the page was read at
async function readLastStepEnd(
  context: APIContext,
  thread: string,
  readAtSequence: number,
): Promise<ContractRecord | null> {
  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('sequence')
    .where('thread', '=', thread)
    .where('kind', 'in', stepEndKinds)
    .where('sequence', '<=', readAtSequence)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const entries = await readRecords(context.log, {
    afterSequence: row.sequence - 1,
    limit: 1,
    thread,
  });

  const record = entries[0]?.record;

  return record === undefined ? null : toContractRecord(record);
}
