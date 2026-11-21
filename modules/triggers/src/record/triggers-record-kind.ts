export type TriggersRecordKind = 'trigger.armed' | 'trigger.delivered' | 'trigger.deferred';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<TriggersRecordKind, true> {}
}
