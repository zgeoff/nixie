export type CodingRecordKind =
  | 'coding.session_bound'
  | 'coding.session_named'
  | 'coding.steered'
  | 'coding.delivered'
  | 'coding.answer_held'
  | 'coding.wake_set'
  | 'coding.session_unbound';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<CodingRecordKind, true> {}
}
