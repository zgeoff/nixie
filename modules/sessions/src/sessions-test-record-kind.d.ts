export type SessionsTestRecordKind = 'call.handed_off' | 'device.page_event';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SessionsTestRecordKind, true> {}
}
