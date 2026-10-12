import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { WriterRow, WriterTables } from './writer-types';

// The memory writer's status, as the memory view shows it: where its cursor stands, how many of
// your messages wait, whether the catch-up is still running, and its last error with when it tries
// again.
export interface WriterStatus {
  readonly cursor: number;
  readonly backlog: number;
  readonly startSequence: number;
  readonly isCatchingUp: boolean;
  readonly batches: number;
  readonly failures: number;
  readonly retryAt: number | null;
  readonly lastError: {
    readonly code: string;

    // null once the error's text is no longer readable
    readonly message: string | null;
    readonly at: number;
  } | null;
}

// Reads the writer's status. Before the writer's first start it reports an empty cursor and every
// message of yours as backlog.
export async function readWriterStatus(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<WriterStatus> {
  const db = log.writer.db.$extendTables<
    WriterTables & { records: { sequence: number; thread: string | null; kind: string } }
  >();
  const row = await db
    .selectFrom('memory_writer')
    .selectAll()
    .where('writer_id', '=', memoryWriterTaskID)
    .executeTakeFirst();
  const cursor = row?.cursor ?? 0;
  const backlog = await db
    .selectFrom('records')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('thread', '=', conversationTaskID)
    .where('kind', '=', 'owner_message')
    .where('sequence', '>', cursor)
    .executeTakeFirstOrThrow();

  return {
    cursor,
    backlog: Number(backlog.count),
    startSequence: row?.start_sequence ?? 0,
    isCatchingUp: row === undefined || row.caught_up_sequence === null,
    batches: row?.batches ?? 0,
    failures: row?.failures ?? 0,
    retryAt: row?.retry_at ?? null,
    lastError: row === undefined ? null : await readLastError(log, row),
  };
}

async function readLastError(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  row: WriterRow,
): Promise<WriterStatus['lastError']> {
  if (
    row.last_error_code === null ||
    row.last_error_sequence === null ||
    row.last_error_at === null
  ) {
    return null;
  }
  return {
    code: row.last_error_code,
    message: await readErrorMessage(log, row.last_error_sequence),
    at: row.last_error_at,
  };
}

async function readErrorMessage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number,
): Promise<string | null> {
  const [entry] = await readRecords(log, { afterSequence: sequence - 1, limit: 1 });
  const erasable = entry?.record.erasable;
  const message = erasable?.status === 'readable' ? erasable.fields['message'] : undefined;

  return typeof message === 'string' ? message : null;
}
