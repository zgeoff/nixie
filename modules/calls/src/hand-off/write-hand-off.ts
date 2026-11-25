import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { callHandedOffCodec } from '../record/call-handed-off-codec';
import type { Call, CallsContext, SmallTalkLine } from '../types';
import { buildSpokeRecord } from './build-spoke-record';

export interface HandOffWrite {
  readonly handOffID: string;
  readonly request: string;

  // the speech layer's small talk since the last hand-off
  readonly smallTalk: readonly SmallTalkLine[];
}

// Writes the small talk since the last hand-off, then the hand-off, in one transaction, so the turn
// that the hand-off starts reads the call so far and no line is written twice.
export async function writeHandOff(
  context: CallsContext,
  call: Pick<Call, 'callID' | 'taskID'>,
  handOff: HandOffWrite,
): Promise<void> {
  const spoke = handOff.smallTalk.map((line) => buildSpokeRecord(context, call, line));

  await withWriteTransaction(context.log.writer, (tx) =>
    writeRecordsInTransaction(tx, context.log, [
      ...spoke,
      {
        kind: callHandedOffCodec.kind,
        definitions: context.definitions(),
        thread: call.taskID,
        payload: callHandedOffCodec.encode({
          callID: call.callID,
          handOffID: handOff.handOffID,
          shortID: createShortID(),
        }),
        erasable: { request: handOff.request },
      },
    ]),
  );
}
