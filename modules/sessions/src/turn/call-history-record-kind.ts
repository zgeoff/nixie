// The records of a call's small talk and cuts, which the history of a conversation reads. The call's
// own module defines them.
export type CallHistoryRecordKind = 'call.spoke' | 'call.heard_cut';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<CallHistoryRecordKind, true> {}
}
