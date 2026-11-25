export type TasksTestRecordKind =
  | 'turn_finished'
  | 'memory.proposal_rejected'
  | 'skills.write_rejected'
  | 'call.rang'
  | 'call.started'
  | 'call.answered'
  | 'call.ended'
  | 'call.spoke'
  | 'call.handed_off'
  | 'call.heard_cut';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<TasksTestRecordKind, true> {}
}
