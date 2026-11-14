import { readRecords, writeRecords } from '@heynixie/log';
import { seedConversationStep, seedStartedTask } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import type { APIContext } from '../types';

interface TaskStartSeed {
  readonly name: string;
  readonly brief: string;
}

interface TaskStartCall {
  readonly taskID: string;

  // the sequence of the starter's task.start call, and of its result
  readonly callSequence: number;
  readonly resultSequence: number;

  // the sequence of the started task's brief record
  readonly briefSequence: number;
}

// The conversation records the task.start call with its input, and the call's result names the
// task it started.
export async function seedTaskStartCall(
  context: APIContext,
  start: TaskStartSeed,
): Promise<TaskStartCall> {
  const step = await seedConversationStep(context);

  const [call] = await writeRecords(context.log, [
    {
      kind: 'tool_called',
      definitions: context.definitions(),
      thread: 'conversation',
      payload: { callID: 'call-1', runID: 'conversation', toolUseID: null, tool: 'task.start' },
      erasable: { input: { name: start.name, brief: start.brief } },
    },
  ]);

  invariant(call, 'the log wrote no tool_called record');

  const taskID = await seedStartedTask(context, {
    starter: step.claim,
    name: start.name,
    brief: start.brief,
  });

  const [result] = await writeRecords(context.log, [
    {
      kind: 'tool_result',
      definitions: context.definitions(),
      thread: 'conversation',
      parent: call.sequence,
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        outcome: 'result',
        actionID: null,
        sources: {},
      },
      erasable: { result: { taskID, name: start.name, note: 'The task starts on its brief now.' } },
    },
  ]);

  const [message] = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['task_message'],
  });

  invariant(result && message, 'the start left no result or no brief record');

  return {
    taskID,
    callSequence: call.sequence,
    resultSequence: result.sequence,
    briefSequence: message.record.sequence,
  };
}

interface UnansweredStartCall {
  readonly taskID: string;
  readonly callSequence: number;
  readonly briefSequence: number;
}

// The start committed and the process died before the call's result did, so the call names no task.
export async function seedUnansweredStartCall(
  context: APIContext,
  start: TaskStartSeed,
): Promise<UnansweredStartCall> {
  const step = await seedConversationStep(context);

  const [call] = await writeRecords(context.log, [
    {
      kind: 'tool_called',
      definitions: context.definitions(),
      thread: 'conversation',
      payload: { callID: 'call-1', runID: 'conversation', toolUseID: null, tool: 'task.start' },
      erasable: { input: { name: start.name, brief: start.brief } },
    },
  ]);

  invariant(call, 'the log wrote no tool_called record');

  const taskID = await seedStartedTask(context, {
    starter: step.claim,
    name: start.name,
    brief: start.brief,
  });

  const [message] = await readRecords(context.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['task_message'],
  });

  invariant(message, 'the start left no brief record');

  return { taskID, callSequence: call.sequence, briefSequence: message.record.sequence };
}
