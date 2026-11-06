import type { LogRecord as ContractRecord } from '@heynixie/contract';
import type { RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { readHeadSequence } from './read-head-sequence';
import { readRecordLookups } from './read-record-lookups';
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

  const head = await readHeadSequence(context);

  const window = await readPageWindow(context, {
    thread: input.thread,
    before: Math.min(input.beforeSequence ?? Number.POSITIVE_INFINITY, head + 1),
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

  const lookups = await readRecordLookups(
    context,
    entries.map((entry) => entry.record),
  );

  return {
    hasEarlier: window.hasEarlier,
    readAtSequence: head,
    records: entries.flatMap((entry) => toContractRecord(entry.record, lookups) ?? []),
    lastStepEnd: await readLastStepEnd(context, input.thread, head),
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

// A page that starts between a tool call and its result would show the result with no call, so the
// page reaches back to the call of each result it holds.
async function readPageWindow(context: APIContext, bounds: PageBounds): Promise<PageWindow> {
  const db = context.log.writer.db.$extendTables<APITables>();

  const newest = await db
    .selectFrom('records')
    .select('sequence')
    .where('thread', '=', bounds.thread)
    .where('sequence', '<', bounds.before)
    .orderBy('sequence', 'desc')
    .limit(bounds.limit)
    .execute();

  const oldest = newest.at(-1)?.sequence;

  if (oldest === undefined) {
    return { afterSequence: 0, count: 0, hasEarlier: false };
  }

  const first = await readCallReach(context, bounds, oldest);

  const counts = await db
    .selectFrom('records')
    .select((eb) => [
      eb.fn.countAll<number>().filterWhere('sequence', '>=', first).as('inPage'),
      eb.fn.countAll<number>().filterWhere('sequence', '<', first).as('earlier'),
    ])
    .where('thread', '=', bounds.thread)
    .where('sequence', '<', bounds.before)
    .executeTakeFirstOrThrow();

  return { afterSequence: first - 1, count: counts.inPage, hasEarlier: counts.earlier > 0 };
}

// Each reach can take in the result of an earlier call, so the page reaches again until every
// result it holds has its call.
async function readCallReach(
  context: APIContext,
  bounds: PageBounds,
  first: number,
): Promise<number> {
  const reach = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select((eb) => eb.fn.min('parent').as('parent'))
    .where('thread', '=', bounds.thread)
    .where('kind', '=', 'tool_result')
    .where('sequence', '>=', first)
    .where('sequence', '<', bounds.before)
    .executeTakeFirst();

  const parent = reach?.parent ?? first;

  return parent < first ? readCallReach(context, bounds, parent) : first;
}

const stepEndKinds: readonly RecordKind[] = [
  'task.step_committed',
  'task.step_errored',
  'task.revived',
];

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

  if (record === undefined) {
    return null;
  }

  const lookups = await readRecordLookups(context, [record]);

  return toContractRecord(record, lookups);
}
