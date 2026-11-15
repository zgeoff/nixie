export type RulesRecordKind =
  | 'rules.change_proposed'
  | 'rules.change_approved'
  | 'rules.change_rejected'
  | 'rules.change_lapsed'
  | 'rules.change_withdrawn'
  | 'rules.runtime_changed'
  | 'rules.conflict_resolved'
  | 'rules.rule_proposed'
  | 'rules.rule_answered'
  | 'rules.rule_lapsed'
  | 'rules.mandate_proposed'
  | 'rules.mandate_started'
  | 'rules.mandate_declined'
  | 'rules.mandate_lapsed'
  | 'rules.mandate_ended';

type RulesErasableRecordKind = 'rules.rule_proposed' | 'rules.mandate_proposed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<RulesRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<RulesErasableRecordKind, true> {}
}
