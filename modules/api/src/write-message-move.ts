import { withWriteTransaction } from '@heynixie/log';
import type { MessageMoveRefusal, MoveTarget } from '@heynixie/tasks';
import { writeMessageMoveInTransaction } from '@heynixie/tasks';
import { buildInputHash } from './build-input-hash';
import { probeLiveIdentity } from './probe-live-identity';
import type { ClientAction } from './read-client-action';
import { readClientAction } from './read-client-action';
import type { APIContext, Identity } from './types';
import { writeClientAction } from './write-client-action';

interface MessageMoveInput {
  readonly clientActionID: string;
  readonly thread: string;
  readonly sequence: number;
  readonly to: MoveTarget;
}

type MessageMoveResult =
  | { readonly status: 'moved'; readonly taskID: string; readonly movedAt: number }
  | { readonly status: 'refused'; readonly refusal: MessageMoveRefusal }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

export function writeMessageMove(
  context: APIContext,
  caller: Identity,
  input: MessageMoveInput,
): Promise<MessageMoveResult> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    // A new task's name and brief are free text, so the hash leaves them out.
    const inputHash = buildInputHash({
      thread: input.thread,
      sequence: input.sequence,
      to: input.to.kind === 'task' ? input.to.taskID : 'new',
    });

    const settled = pickSettledMove({ live, earlier, inputHash, callerID: caller.identityID });

    if (settled !== null) {
      return settled;
    }

    const outcome = await writeMessageMoveInTransaction(tx, context, {
      message: input.sequence,
      thread: input.thread,
      to: input.to,
    });

    if (outcome.status === 'refused') {
      return outcome;
    }

    const movedAt = context.clock.now();

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure: 'conversation.move',
      identityID: caller.identityID,
      inputHash,
      result: { taskID: outcome.taskID, movedAt },
      recordedAt: movedAt,
    });

    return { status: 'moved', taskID: outcome.taskID, movedAt };
  });
}

interface MoveState {
  readonly live: boolean;
  readonly earlier: ClientAction | null;
  readonly inputHash: string;
  readonly callerID: string;
}

function pickSettledMove(state: MoveState): MessageMoveResult | null {
  if (!state.live) {
    return { status: 'unauthorized' };
  }

  if (state.earlier === null) {
    return null;
  }

  return state.earlier.procedure === 'conversation.move' &&
    state.earlier.identityID === state.callerID &&
    state.earlier.inputHash === state.inputHash
    ? {
        status: 'moved',
        taskID: String(state.earlier.result['taskID']),
        movedAt: Number(state.earlier.result['movedAt']),
      }
    : { status: 'reused' };
}
