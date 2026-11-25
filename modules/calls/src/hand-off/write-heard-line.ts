import { writeRecords } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { Call, CallsContext } from '../types';

// One slice of the user's speech becomes an owner_message on the call's thread, whose one span is
// `dictated`. It waits for the next hand-off, because only a hand-off starts a turn.
export async function writeHeardLine(
  context: CallsContext,
  call: Pick<Call, 'taskID' | 'carryingSession'>,
  text: string,
): Promise<void> {
  await writeRecords(context.log, [
    {
      kind: ownerMessageCodec.kind,
      definitions: context.definitions(),
      thread: call.taskID,
      contentSource: 'owner',
      payload: ownerMessageCodec.encode({
        identityID: call.carryingSession,
        spans: 'as_sent',
        isDictated: true,
      }),
      erasable: { text, spans: [{ start: 0, end: text.length, source: 'dictated' }] },
    },
  ]);
}
