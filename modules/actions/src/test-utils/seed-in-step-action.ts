import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { StartedClaim, TasksContext } from '@heynixie/tasks';
import { createApprovedAction } from '../action/create-approved-action';
import type { ActionRow } from '../types';
import { readTestAction } from './read-test-action';

export interface InStepActionSeed {
  readonly step: StartedClaim;
  readonly tool?: string;
  readonly deadlineAt?: number;
  readonly callSequence?: number;
  readonly arguments?: JSONObject;
}

// An approved call to a tool that runs inside the turn, queued as its approval queues it.
export async function seedInStepAction(
  context: TasksContext,
  input: InStepActionSeed,
): Promise<ActionRow> {
  const actionID = await withWriteTransaction(context.log.writer, (tx) =>
    createApprovedAction(tx, context, {
      proposalID: crypto.randomUUID(),
      taskID: input.step.lease.workID,
      stepKey: null,
      tool: input.tool ?? 'test.read',
      effects: ['read'],
      actionHash: `sha256:${crypto.randomUUID()}`,
      arguments: input.arguments ?? { query: 'tomatoes' },
      callSequence: input.callSequence ?? 1,
      riskClass: 'routine',
      deadlineAt: input.deadlineAt ?? null,
      runsInStep: true,
    }),
  );

  return readTestAction(context.log.writer, actionID);
}
