import type { LogRecord } from '@heynixie/log';
import { readThreadNewestFirst } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';

// The lines of small talk that the speech layer said since the call's last hand-off, oldest first,
// for the record of a new hand-off. A line that a forget erased leaves no text.
export async function readSmallTalk(
  context: Pick<TasksContext, 'log'>,
  record: LogRecord,
): Promise<readonly string[]> {
  if (record.kind !== 'call.handed_off' || record.thread === null) {
    return [];
  }

  const lines: string[] = [];

  for await (const earlier of readThreadNewestFirst(context, record.thread, [
    'call.spoke',
    'call.handed_off',
  ])) {
    if (earlier.sequence >= record.sequence) {
      continue;
    }

    if (earlier.kind === 'call.handed_off') {
      break;
    }

    const text =
      earlier.erasable.status === 'readable' ? earlier.erasable.fields['text'] : undefined;

    if (typeof text === 'string') {
      lines.push(text);
    }
  }

  return lines.toReversed();
}
