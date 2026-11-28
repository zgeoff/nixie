import { readRecords } from '@heynixie/log';
import type { TasksContext } from '../types';
import { taskStepStartedCodec } from './task-step-started-codec';

// The text of the owner's message that woke the task's latest step that began before the given
// record, or null when no step began, an owner's message did not wake it, or a forget erased the
// text.
export async function readStepOwnerText(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  beforeSequence: number,
): Promise<string | null> {
  const [started] = await readRecords(context.log, {
    afterSequence: 0,
    beforeSequence,
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

  const [message] = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [source],
    thread: taskID,
    kinds: ['owner_message'],
    limit: 1,
  });

  const erasable = message?.record.erasable;
  const text = erasable?.status === 'readable' ? erasable.fields['text'] : undefined;

  return typeof text === 'string' ? text : null;
}
