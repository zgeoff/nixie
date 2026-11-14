import type { RecordInput } from '@heynixie/log';
import { modelTurnEndedCodec } from '@heynixie/models';

// Reads the records that the running step just built, and no stored record: an earlier release
// wrote turn records with no outcome.
export function hasFinishedTurn(records: readonly RecordInput[]): boolean {
  return records.some(
    (record) =>
      record.kind === modelTurnEndedCodec.kind &&
      modelTurnEndedCodec.tryDecodePartial(record.payload ?? {})?.outcome === 'finished',
  );
}
