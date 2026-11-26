export type SpendRecordKind = 'spend.limit_raised' | 'spend.count_set';

// The records of other modules that the turn count folds. The spend module sits below the modules
// that write them, so it names the kinds here, and the registry merges them with their own.
export type SpendTurnKind = 'model.turn_ended' | 'worker.turn_ended';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SpendRecordKind | SpendTurnKind, true> {}
}
