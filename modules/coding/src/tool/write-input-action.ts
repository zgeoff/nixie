import { withWriteTransaction } from '@heynixie/log';
import type { TasksTables } from '@heynixie/tasks';
import { isFinishedState, parseStepRunID, readLeasedStepHop } from '@heynixie/tasks';
import type { ToolCall, ToolContext } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { readBinding } from '../session/read-binding';
import type { Binding, CodingContext } from '../types';
import type { CodingInputKind } from './types';

export interface InputAction {
  readonly name: string;
  readonly kind: CodingInputKind;
  readonly call: ToolCall;
  readonly toolContext: ToolContext;
  readonly binding: Binding;
  readonly text: string;
}

export type InputQueued =
  | { readonly status: 'queued'; readonly actionID: string }
  | { readonly status: 'refused'; readonly sentence: string };

const endedTurn: InputQueued = {
  status: 'refused',
  sentence: 'This turn has ended, so the call cannot queue.',
};

// Reads the task and its binding again in the queue's transaction, so no input queues behind a stop
// that cancelled the task's actions after the tool's first read. The action keeps the hop of the
// calling turn, which the step writes once the session got the text.
export function writeInputAction(context: CodingContext, input: InputAction): Promise<InputQueued> {
  const run = input.toolContext.run;
  const step = parseStepRunID(run.stepRunID ?? '');
  const tasks = context.tasks;
  const taskID = input.binding.taskID;

  if (step === null) {
    return Promise.resolve(endedTurn);
  }

  return withWriteTransaction(tasks.log.writer, async (tx): Promise<InputQueued> => {
    const hop = await readLeasedStepHop(tx, run.thread, step, tasks.clock.now());

    if (hop === null) {
      return endedTurn;
    }

    const task = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select('state')
      .where('task_id', '=', taskID)
      .executeTakeFirstOrThrow();

    if (task.state === 'stopped' || isFinishedState(task.state)) {
      return { status: 'refused', sentence: `The task ${taskID} is ${task.state}.` };
    }

    const binding = await readBinding(tx, taskID);

    if (binding === null || binding.unboundAt !== null) {
      return { status: 'refused', sentence: `The task ${taskID} has no session.` };
    }

    invariant(tasks.queueRunnerActions, 'the coding tools need the actions queue');

    // A rerun of a crashed step calls the tool again with a new call ID but the model's same
    // tool-use ID, so the hash keys on that ID when the call has one.
    const [actionID] = await tasks.queueRunnerActions(tx, {
      taskID,
      stepKey: step.stepKey,
      actions: [
        {
          tool: input.name,
          args: {
            session: `${binding.adapter}:${binding.sessionID}`,
            text: input.text,
            hop,
            ...(input.kind === 'message' ? { messageID: null, from: run.thread } : {}),
          },
          hashParts: [input.call.toolUseID ?? input.call.callID],
          causedBy: { kind: 'tool_call', callID: input.call.callID },
        },
      ],
    });

    invariant(actionID !== undefined, 'the queue returns one ID per action');

    return { status: 'queued', actionID };
  });
}
