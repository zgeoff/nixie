import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { RecordInput } from '@heynixie/log';
import { callHandedOffCodec } from '../record/call-handed-off-codec';
import { callSpokeCodec } from '../record/call-spoke-codec';
import type { Call, CallsContext, SmallTalkLine } from '../types';

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
  const model = context.voice?.provider ?? 'gpt-live';

  const spoke: RecordInput[] = handOff.smallTalk.map((line) => ({
    kind: callSpokeCodec.kind,
    definitions: context.definitions(),
    thread: call.taskID,
    payload: callSpokeCodec.encode({
      callID: call.callID,
      lineID: createShortID(),
      speaker: 'speech_layer',
      model,
      heardChars: line.heardChars,
    }),
    erasable: { text: line.text },
  }));

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
