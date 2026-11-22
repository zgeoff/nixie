import type { Log, RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';

// The records a note links to as events: a message or a tool result, as log.read lists them.
export const linkableEventKinds: readonly RecordKind[] = [
  'owner_message',
  'model.reply',
  'tool_result',
  'task_message',
];

export type EventState = 'live' | 'gone' | 'absent';

// An event is absent when no such record sits on the thread, and gone when a record forget or a
// reset of the conversation erased what it held.
export async function readEventState(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
  sequence: number,
): Promise<EventState> {
  const [entry] = await readRecords(log, {
    afterSequence: sequence - 1,
    beforeSequence: sequence + 1,
    thread,
    kinds: linkableEventKinds,
    limit: 1,
  });

  if (entry === undefined) {
    return 'absent';
  }

  return entry.record.erasable.status === 'shredded' ? 'gone' : 'live';
}
