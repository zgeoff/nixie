export type ConnectionRecordKind = 'connection.revocation_recorded';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kind above to the registry
  interface RecordKinds extends Record<ConnectionRecordKind, true> {}
}
