import { readRecords } from '@heynixie/log';
import { z } from 'zod';
import type { TasksContext, WakeCause } from '../types';
import { readStepOwnerText } from './read-step-owner-text';
import { readStepWakeCause } from './read-step-wake-cause';
import { taskStepStartedCodec } from './task-step-started-codec';

export interface StepOrigin {
  readonly cause: WakeCause | null;
  readonly ownerText: string | null;
}

export interface StepOriginReads {
  // the key of the step that queued the action with that ID, or null when none has
  readonly readActionStepKey: (actionID: string) => Promise<string | null>;
}

const maxAskingHops = 8;

// What began the work of the task's latest step that began before the given record. A step that an
// approved call woke carries on the step that asked for the call, so the read goes back to that
// step and reads what woke it, as many times as the approvals chain.
export async function readStepOrigin(
  context: Pick<TasksContext, 'log'>,
  reads: StepOriginReads,
  taskID: string,
  beforeSequence: number,
): Promise<StepOrigin> {
  const askingBefore = await readAskingStepEnd(context, reads, taskID, {
    beforeSequence,
    hopsLeft: maxAskingHops,
  });

  const before = askingBefore ?? beforeSequence;

  const cause = await readStepWakeCause(context, taskID, before);

  return {
    cause,
    ownerText: cause?.kind === 'owner' ? await readStepOwnerText(context, taskID, before) : null,
  };
}

interface AskingPosition {
  readonly beforeSequence: number;
  readonly hopsLeft: number;
}

const wakeAnswerSchema = z.looseObject({ actionID: z.string() });

// The sequence just after the start of the step that asked for the call whose answer woke the
// latest step before the given record, or null when an approved call did not wake that step.
async function readAskingStepEnd(
  context: Pick<TasksContext, 'log'>,
  reads: StepOriginReads,
  taskID: string,
  position: AskingPosition,
): Promise<number | null> {
  if (position.hopsLeft === 0) {
    return null;
  }

  const [started] = await readRecords(context.log, {
    afterSequence: 0,
    beforeSequence: position.beforeSequence,
    thread: taskID,
    kinds: ['task.step_started'],
    order: 'newest',
    limit: 1,
  });

  const source =
    started === undefined ? undefined : taskStepStartedCodec.decode(started.record.payload).source;

  if (source === undefined) {
    return null;
  }

  const [wake] = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [source],
    thread: taskID,
    kinds: ['task.wake'],
    limit: 1,
  });

  const answered = wakeAnswerSchema.safeParse(wake?.record.payload);

  if (!answered.success) {
    return null;
  }

  const askingKey = await reads.readActionStepKey(answered.data.actionID);

  const askingStart =
    askingKey === null ? null : await readStepStart(context, taskID, source, askingKey);

  if (askingStart === null) {
    return null;
  }

  const deeper = await readAskingStepEnd(context, reads, taskID, {
    beforeSequence: askingStart + 1,
    hopsLeft: position.hopsLeft - 1,
  });

  return deeper ?? askingStart + 1;
}

async function readStepStart(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  beforeSequence: number,
  stepKey: string,
): Promise<number | null> {
  const starts = await readRecords(context.log, {
    afterSequence: 0,
    beforeSequence,
    thread: taskID,
    kinds: ['task.step_started'],
    order: 'newest',
  });

  const start = starts.find(
    (entry) => taskStepStartedCodec.decode(entry.record.payload).stepKey === stepKey,
  );

  return start?.record.sequence ?? null;
}
