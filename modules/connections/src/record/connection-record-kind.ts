export type ConnectionRecordKind =
  | 'connection.revocation_recorded'
  | 'connection.client_registered'
  | 'connection.client_removed'
  | 'connection.picker_set'
  | 'connection.connected'
  | 'connection.consent_discarded'
  | 'connection.call_failed'
  | 'connection.status_reached'
  | 'connection.break_lasted'
  | 'connection.run_without';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ConnectionRecordKind, true> {}
}
