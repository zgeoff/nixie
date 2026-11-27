// The records of the features that carry text, which the record forget names. Each feature's own
// module defines them; the registry here lets the forget list them as kinds with no dependency.
export type FeatureForgettableRecordKind =
  | 'call.handed_off'
  | 'call.rang'
  | 'call.spoke'
  | 'device.idle_set'
  | 'device.page_event'
  | 'device.region_shown'
  | 'device.shown';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<FeatureForgettableRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<FeatureForgettableRecordKind, true> {}
}
