import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { buildModelView } from './build-model-view';
import type { ActionsTables, ModelView } from './types';

export interface WaitForActionOutcomeOptions {
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}

// Waits inside the turn, 10 s by default, for an action to settle, then returns what the model
// sees: the outcome, or "queued as <id>" while the action is still pending. The outcome reaches the
// task's inbox for its next turn either way.
export async function waitForActionOutcome(
  context: TasksContext,
  actionID: string,
  options: WaitForActionOutcomeOptions = {},
): Promise<ModelView> {
  const deadline = context.clock.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const db = context.log.writer.db.$extendTables<ActionsTables>();
  const readAction = () =>
    db
      .selectFrom('actions')
      .select(['action_id', 'status', 'reason', 'outcome_sequence'])
      .where('action_id', '=', actionID)
      .executeTakeFirstOrThrow();
  const action = { row: await readAction() };

  while (action.row.status === 'pending' && context.clock.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- a poll on the clock
    await context.clock.sleep(options.pollMs ?? DEFAULT_POLL_MS);

    // oxlint-disable-next-line no-await-in-loop -- each poll reads the row again
    action.row = await readAction();
  }
  const sequence = action.row.outcome_sequence;
  const [entry] =
    sequence === null
      ? []
      : await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });

  return buildModelView(action.row, entry?.record ?? null);
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_MS = 250;
