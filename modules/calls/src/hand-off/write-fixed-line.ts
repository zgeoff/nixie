import { writeRecords } from '@heynixie/log';
import type { Call, CallsContext } from '../types';
import { buildSpokeRecord } from './build-spoke-record';

// Writes one fixed line from `voice/lines.yaml`, once the speech layer has it to say, as a
// `call.spoke` record. The user hears it whole, so every character counts as heard.
export async function writeFixedLine(
  context: CallsContext,
  call: Pick<Call, 'callID' | 'taskID'>,
  text: string,
): Promise<void> {
  await writeRecords(context.log, [
    buildSpokeRecord(context, call, { text, heardChars: text.length }),
  ]);
}
