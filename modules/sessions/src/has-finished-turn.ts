import type { RecordInput } from '@heynixie/log';
import { modelTurnEndedCodec } from '@heynixie/models';

// A turn that an interrupt cut ends at its last chain entry with the stop reason of that entry's
// call, so only end_turn shows that the model finished its work.
export function hasFinishedTurn(records: readonly RecordInput[]): boolean {
  return records.some(
    (record) =>
      record.kind === modelTurnEndedCodec.kind &&
      modelTurnEndedCodec.tryDecodePartial(record.payload ?? {})?.stopReason === 'end_turn',
  );
}
