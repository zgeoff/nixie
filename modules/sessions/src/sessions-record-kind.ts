// The record kinds the sessions module registers with the log. Memory writes a recall record through
// the memory port this module declares, and the session replay reads it back.
export type SessionsRecordKind = 'memory.recalled';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SessionsRecordKind, true> {}
}
