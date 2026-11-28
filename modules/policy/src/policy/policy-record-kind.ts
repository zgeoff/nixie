export type PolicyRecordKind =
  | 'policy.action_proposed'
  | 'policy.action_answered'
  | 'policy.action_lapsed'
  | 'policy.contact_marked_known'
  | 'policy.contact_unmarked'
  | 'places.added'
  | 'places.changed'
  | 'places.removed'
  | 'places.narrowed'
  | 'places.acted';

type PolicyErasableRecordKind =
  | 'policy.action_proposed'
  | 'policy.action_answered'
  | 'policy.contact_marked_known'
  | 'places.added'
  | 'places.changed'
  | 'places.removed'
  | 'places.acted';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<PolicyRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<PolicyErasableRecordKind, true> {}
}
