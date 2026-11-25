import { writeRecords } from '@heynixie/log';
import { callHeardCutCodec } from '../record/call-heard-cut-codec';
import type { Call, CallsContext } from '../types';

export interface HeardCut {
  readonly handOffID: string;
  readonly replyRecordID: string;
  readonly heardChars: number;
}

// Marks how much of an answered reply the user heard before talking over it.
export async function writeHeardCut(
  context: CallsContext,
  call: Pick<Call, 'callID' | 'taskID'>,
  cut: HeardCut,
): Promise<void> {
  await writeRecords(context.log, [
    {
      kind: callHeardCutCodec.kind,
      definitions: context.definitions(),
      thread: call.taskID,
      payload: callHeardCutCodec.encode({ callID: call.callID, ...cut }),
    },
  ]);
}
