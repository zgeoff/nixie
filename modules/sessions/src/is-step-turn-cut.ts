import type { RecordInput } from '@heynixie/log';
import { modelTurnEndedCodec } from '@heynixie/models';
import { hasFinishedTurn } from './has-finished-turn';

// An interrupt can land after the model's own end_turn, and that turn finished its work.
export function isStepTurnCut(interrupt: AbortSignal, records: readonly RecordInput[]): boolean {
  return (
    interrupt.aborted &&
    records.some((record) => record.kind === modelTurnEndedCodec.kind) &&
    !hasFinishedTurn(records)
  );
}
