export type TurnInputsRecordKind = 'model.input_log_set' | 'model.input_opened';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<TurnInputsRecordKind, true> {}
}
