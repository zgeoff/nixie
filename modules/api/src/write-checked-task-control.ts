import { withWriteTransaction } from '@heynixie/log';
import type { TaskControl, TaskControlRefusal, TaskState } from '@heynixie/tasks';
import { taskStateSchema, writeTaskControlInTransaction } from '@heynixie/tasks';
import { z } from 'zod';
import { buildInputHash } from './build-input-hash';
import { probeLiveIdentity } from './probe-live-identity';
import type { ClientAction } from './read-client-action';
import { readClientAction } from './read-client-action';
import type { APIContext, Identity } from './types';
import { writeClientAction } from './write-client-action';

interface CheckedTaskControlInput {
  readonly clientActionID: string;
  readonly taskID: string;
  readonly control: TaskControl;
}

export type CheckedTaskControlResult =
  | {
      readonly status: 'controlled';
      readonly taskID: string;
      readonly state: TaskState;
      readonly isPauseRequested: boolean;
      readonly controlledAt: number;
    }
  | { readonly status: 'refused'; readonly refusal: TaskControlRefusal }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

export function writeCheckedTaskControl(
  context: APIContext,
  caller: Identity,
  input: CheckedTaskControlInput,
): Promise<CheckedTaskControlResult> {
  const procedure = `tasks.${input.control}`;

  return withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    const inputHash = buildInputHash({ taskID: input.taskID });

    const settled = pickSettledControl({
      live,
      earlier,
      procedure,
      inputHash,
      callerID: caller.identityID,
    });

    if (settled !== null) {
      return settled;
    }

    const outcome = await writeTaskControlInTransaction(tx, context, {
      taskID: input.taskID,
      control: input.control,
    });

    if (outcome.status === 'refused') {
      return outcome;
    }

    const controlledAt = context.clock.now();

    const result = {
      taskID: input.taskID,
      state: outcome.state,
      isPauseRequested: outcome.isPauseRequested,
      controlledAt,
    };

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure,
      identityID: caller.identityID,
      inputHash,
      result,
      recordedAt: controlledAt,
    });

    return { status: 'controlled', ...result };
  });
}

interface ControlState {
  readonly live: boolean;
  readonly earlier: ClientAction | null;
  readonly procedure: string;
  readonly inputHash: string;
  readonly callerID: string;
}

const controlledResultSchema = z.object({
  taskID: z.string(),
  state: taskStateSchema,
  isPauseRequested: z.boolean(),
  controlledAt: z.number(),
});

function pickSettledControl(state: ControlState): CheckedTaskControlResult | null {
  if (!state.live) {
    return { status: 'unauthorized' };
  }

  if (state.earlier === null) {
    return null;
  }

  const isSameAction =
    state.earlier.procedure === state.procedure &&
    state.earlier.identityID === state.callerID &&
    state.earlier.inputHash === state.inputHash;

  return isSameAction
    ? { status: 'controlled', ...controlledResultSchema.parse(state.earlier.result) }
    : { status: 'reused' };
}
