// The record kinds the server registers with the log.
export type ServerRecordKind = 'server.started';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<ServerRecordKind, true> {}
}
