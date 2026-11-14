export type RulesRecordKind =
  | 'rules.change_proposed'
  | 'rules.change_approved'
  | 'rules.change_rejected'
  | 'rules.change_lapsed'
  | 'rules.change_withdrawn'
  | 'rules.runtime_changed'
  | 'rules.conflict_resolved';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<RulesRecordKind, true> {}
}
