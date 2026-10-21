import type { Clock } from '@heynixie/clock';
import type { RecordWake } from '@heynixie/log';
import { readRecords, startRecordWake, subscribeToCommits } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { buildModelView } from './build-model-view';
import type { ActionRow, ActionsTables, ModelView } from './types';

export interface WaitForActionOutcomeOptions {
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export async function waitForActionOutcome(
  context: TasksContext,
  actionID: string,
  options: WaitForActionOutcomeOptions = {},
): Promise<ModelView> {
  const deadline = context.clock.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const wake = startRecordWake({
    subscribeToChanges: (onChange) => subscribeToCommits(context.log.writer, onChange),
  });

  try {
    const row = await waitForSettledRow(context, { actionID, deadline, wake });

    return await readModelView(context, row);
  } finally {
    wake.stop();
  }
}

type SettledRow = Pick<ActionRow, 'action_id' | 'outcome_sequence' | 'reason' | 'status'>;

interface SettledWait {
  readonly actionID: string;
  readonly deadline: number;
  readonly wake: RecordWake;
}

async function waitForSettledRow(context: TasksContext, wait: SettledWait): Promise<SettledRow> {
  const db = context.log.writer.db.$extendTables<ActionsTables>();

  for (;;) {
    wait.wake.reset();

    const row = await db
      .selectFrom('actions')
      .select(['action_id', 'status', 'reason', 'outcome_sequence'])
      .where('action_id', '=', wait.actionID)
      .executeTakeFirstOrThrow();

    const remainingMs = wait.deadline - context.clock.now();

    if (row.status !== 'pending' || remainingMs <= 0) {
      return row;
    }

    await waitForCommit(wait.wake, { clock: context.clock, timeoutMs: remainingMs });
  }
}

interface CommitWait {
  readonly clock: Clock;
  readonly timeoutMs: number;
}

async function waitForCommit(wake: RecordWake, wait: CommitWait): Promise<void> {
  const timer = new AbortController();

  try {
    await Promise.race([wake.wait(), wait.clock.sleep(wait.timeoutMs, timer.signal)]);
  } finally {
    timer.abort();
  }
}

async function readModelView(context: TasksContext, row: SettledRow): Promise<ModelView> {
  const sequence = row.outcome_sequence;

  const [entry] =
    sequence === null
      ? []
      : await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });

  return buildModelView(row, entry?.record ?? null);
}
