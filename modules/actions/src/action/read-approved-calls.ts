import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import type { ActionsTables, ApprovedCall } from '../types';
import { pickApprovedCall } from './pick-approved-call';

// What became of each approved action, by action ID. An ID with no action row is left out.
export async function readApprovedCalls(
  context: Pick<TasksContext, 'log'>,
  actionIDs: readonly string[],
): Promise<ReadonlyMap<string, ApprovedCall>> {
  if (actionIDs.length === 0) {
    return new Map();
  }

  const rows = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'status', 'reason', 'outcome_sequence', 'cancelled_sequence'])
    .where('action_id', 'in', actionIDs)
    .execute();

  const failedRows = rows.filter((row) => row.status === 'failed');

  const outcomes = await readRecordsBySequence(
    context,
    failedRows.flatMap((row) => row.outcome_sequence ?? []),
  );

  const results = await readRecordsBySequence(
    context,
    [...outcomes.values()].flatMap((record) => {
      const sequence = record.payload['resultSequence'];

      return typeof sequence === 'number' ? [sequence] : [];
    }),
  );

  return new Map(
    rows.map((row) => {
      const outcome = outcomes.get(row.outcome_sequence ?? -1);
      const resultSequence = outcome?.payload['resultSequence'];

      return [
        row.action_id,
        pickApprovedCall({
          status: row.status,
          reason: row.reason,
          isCancelled: row.cancelled_sequence !== null,
          outcomeMessage: outcome === undefined ? null : toMessage(outcome),
          resultMessage:
            typeof resultSequence === 'number' ? toMessage(results.get(resultSequence)) : null,
        }),
      ];
    }),
  );
}

async function readRecordsBySequence(
  context: Pick<TasksContext, 'log'>,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, LogRecord>> {
  if (sequences.length === 0) {
    return new Map();
  }

  const entries = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [...sequences],
    limit: sequences.length,
  });

  return new Map(entries.map((entry) => [entry.record.sequence, entry.record]));
}

function toMessage(record: LogRecord | undefined): string | null {
  if (record === undefined || record.erasable.status !== 'readable') {
    return null;
  }

  const message = record.erasable.fields['message'];

  return typeof message === 'string' ? message : null;
}
