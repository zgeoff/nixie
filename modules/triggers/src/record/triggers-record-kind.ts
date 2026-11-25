export type TriggersRecordKind =
  | 'trigger.armed'
  | 'trigger.delivered'
  | 'trigger.deferred'
  | 'trigger.wake_rule_set'
  | 'trigger.wake_rule_ended'
  | 'trigger.mail_arrived';

type TriggersErasableRecordKind = 'trigger.mail_arrived';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<TriggersRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<TriggersErasableRecordKind, true> {}
}
