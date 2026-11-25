import { createShortID } from '@heynixie/db';
import type { RecordInput } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { callSpokeCodec } from '../record/call-spoke-codec';
import type { Call, CallsContext } from '../types';

export interface SpokeLine {
  readonly text: string;
  readonly heardChars: number;
}

// The record of one line that the speech layer said, for the call's thread.
export function buildSpokeRecord(
  context: Pick<CallsContext, 'definitions' | 'speech'>,
  call: Pick<Call, 'callID' | 'taskID'>,
  line: SpokeLine,
): RecordInput {
  invariant(context.speech !== null, 'a line was spoken, so a speech layer is wired');

  return {
    kind: callSpokeCodec.kind,
    definitions: context.definitions(),
    thread: call.taskID,
    payload: callSpokeCodec.encode({
      callID: call.callID,
      lineID: createShortID(),
      speaker: 'speech_layer',
      model: context.speech.model,
      heardChars: line.heardChars,
    }),
    erasable: { text: line.text },
  };
}
