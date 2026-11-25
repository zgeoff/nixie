export type CallRecordKind =
  | 'call.rang'
  | 'call.started'
  | 'call.answered'
  | 'call.reconnected'
  | 'call.ended'
  | 'call.spoke'
  | 'call.handed_off'
  | 'call.heard_cut'
  | 'call.turn_timed';

type CallErasableRecordKind = 'call.rang' | 'call.spoke' | 'call.handed_off';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<CallRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<CallErasableRecordKind, true> {}
}
