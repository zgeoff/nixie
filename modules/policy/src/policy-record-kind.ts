export type PolicyRecordKind =
  | 'policy.action_proposed'
  | 'policy.action_answered'
  | 'policy.action_lapsed'
  | 'policy.contact_marked_known'
  | 'policy.contact_unmarked';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<PolicyRecordKind, true> {}
}
