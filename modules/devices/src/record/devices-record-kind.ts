export type DevicesRecordKind =
  | 'device.shown'
  | 'device.idle_set'
  | 'device.capability_changed'
  | 'device.layout_set'
  | 'device.region_shown';

type DevicesErasableRecordKind = 'device.shown' | 'device.idle_set' | 'device.region_shown';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<DevicesRecordKind, true> {}

  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface ErasableRecordKinds extends Record<DevicesErasableRecordKind, true> {}
}
