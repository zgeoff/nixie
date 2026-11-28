import { readRecords } from '@heynixie/log';
import type { TasksContext } from '../types';

// The text of the owner's latest message before the task's latest step that began before the given
// record, or null when no step began, no message came before it, or a forget erased the text.
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

  if (started === undefined) {
    return null;
  }

  const [message] = await readRecords(context.log, {
    afterSequence: 0,
    beforeSequence: started.record.sequence,
    thread: taskID,
    kinds: ['owner_message'],
    order: 'newest',
    limit: 1,
  });

  const erasable = message?.record.erasable;
  const text = erasable?.status === 'readable' ? erasable.fields['text'] : undefined;

  return typeof text === 'string' ? text : null;
}
