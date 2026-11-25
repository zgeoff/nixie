import { createHash } from 'node:crypto';
import { writeRecordsInTransaction } from '@heynixie/log';
import type {
  QueueRunnerActions,
  QueueRunnerActionsRequest,
  RunnerAction,
  TasksContext,
} from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { ActionsTables } from '../types';
import { buildCancelledCheck } from './build-cancelled-check';

type RunnerQueueContext = Pick<TasksContext, 'clock' | 'definitions' | 'log'>;

// Builds the function that queues the actions a runner returns, inside the caller's write
// transaction, so the actions and the records that cause them commit together. The caller has
// checked its own lease.
export function makeQueueRunnerActions(context: RunnerQueueContext): QueueRunnerActions {
  return async (tx, request) => {
    const actionIDs: string[] = [];

    for (const action of request.actions) {
      const actionID = await writeRunnerAction(tx, context, request, action);

      actionIDs.push(actionID);
    }

    return actionIDs;
  };
}

// The hash of a runner action covers its tool and its hash parts, so a step that runs again with
// the same parts queues nothing.
export function buildRunnerActionHash(action: Pick<RunnerAction, 'tool' | 'hashParts'>): string {
  const canonical = JSON.stringify([action.tool, ...action.hashParts]);

  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

async function writeRunnerAction(
  tx: Transaction<unknown>,
  context: RunnerQueueContext,
  request: Pick<QueueRunnerActionsRequest, 'taskID' | 'stepKey'>,
  action: RunnerAction,
): Promise<string> {
  const actionHash = buildRunnerActionHash(action);

  const earlier = await readRepeat(tx, request, actionHash);

  if (earlier !== null) {
    return earlier;
  }

  const callSequence = await readCauseSequence(tx, action);

  const actionID = crypto.randomUUID();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'action.queued',
      definitions: context.definitions(),
      thread: request.taskID,
      payload: {
        actionID,
        taskID: request.taskID,
        stepKey: request.stepKey,
        tool: action.tool,
        actionHash,
        nextAttemptAt: context.clock.now(),
        isRunner: true,
        ...(callSequence === null ? {} : { callSequence }),
      },
      erasable: { arguments: action.args },
    },
  ]);

  return actionID;
}

// The ID of an action of the same task and hash that the same step queued, or that is still
// pending or unknown: the one this action repeats.
async function readRepeat(
  tx: Transaction<unknown>,
  request: Pick<QueueRunnerActionsRequest, 'taskID' | 'stepKey'>,
  actionHash: string,
): Promise<string | null> {
  const earlier = await tx
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('action_id')
    .where('task_id', '=', request.taskID)
    .where('action_hash', '=', actionHash)
    .where((eb) => {
      const isLive = eb.not(buildCancelledCheck(eb));
      const isOpen = eb.and([eb('status', 'in', ['pending', 'unknown']), isLive]);

      return eb.or([eb('step_key', '=', request.stepKey), isOpen]);
    })
    .limit(1)
    .executeTakeFirst();

  return earlier?.action_id ?? null;
}

// The sequence of the record that caused the action: the record itself, or the call's record.
async function readCauseSequence(
  tx: Transaction<unknown>,
  action: RunnerAction,
): Promise<number | null> {
  if (action.causedBy.kind === 'record') {
    return action.causedBy.sequence;
  }

  const rows = await sql`
    select sequence from records
    where kind = 'tool_called' and json_extract(payload, '$.callID') = ${action.causedBy.callID}
    order by sequence desc limit 1`.execute(tx);

  const [row] = z.object({ sequence: z.int() }).array().parse(rows.rows);

  return row?.sequence ?? null;
}
