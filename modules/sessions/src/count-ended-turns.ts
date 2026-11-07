import type { RecordInput } from '@heynixie/log';
import { modelTurnEndedCodec } from '@heynixie/models';

export function countEndedTurns(records: readonly RecordInput[]): number {
  return records.filter((record) => record.kind === modelTurnEndedCodec.kind).length;
}
