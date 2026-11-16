import { withWriteTransaction } from '@heynixie/log';
import type { TaskState } from '@heynixie/tasks';
import { writeTaskMarkInTransaction } from '@heynixie/tasks';
import { z } from 'zod';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';

interface CheckedTaskMarkInput {
  readonly clientActionID: string;
  readonly taskID: string;
  readonly disposable: boolean;
}

export type CheckedTaskMarkResult =
  | {
      readonly status: 'marked';
      readonly taskID: string;
      readonly disposable: boolean;
      readonly changedAt: number;
    }
  | { readonly status: 'unknown_task' }
  | { readonly status: 'no_mark' }
  | { readonly status: 'state_refused'; readonly state: TaskState }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

const procedure = 'tasks.setDisposable';

const markedResultSchema = z.object({
  taskID: z.string(),
  disposable: z.boolean(),
  changedAt: z.number(),
});

export function writeCheckedTaskMark(
  context: APIContext,
  caller: Identity,
  input: CheckedTaskMarkInput,
): Promise<CheckedTaskMarkResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    if (!live) {
      return { status: 'unauthorized' };
    }

    const inputHash = buildInputHash({ taskID: input.taskID, disposable: input.disposable });

    if (earlier !== null) {
      const isSameAction =
        earlier.procedure === procedure &&
        earlier.identityID === caller.identityID &&
        earlier.inputHash === inputHash;

      return isSameAction
        ? { status: 'marked', ...markedResultSchema.parse(earlier.result) }
        : { status: 'reused' };
    }

    const outcome = await writeTaskMarkInTransaction(tx, context, {
      taskID: input.taskID,
      disposable: input.disposable,
    });

    if (outcome.status !== 'set') {
      return outcome;
    }

    const changedAt = context.clock.now();
    const result = { taskID: input.taskID, disposable: input.disposable, changedAt };

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure,
      identityID: caller.identityID,
      inputHash,
      result,
      recordedAt: changedAt,
    });

    return { status: 'marked', ...result };
  });
}
