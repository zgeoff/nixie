// The record kinds the sandbox module registers with the log, one for each lifecycle event.
export type SandboxRecordKind =
  | 'sandbox.created'
  | 'sandbox.granted'
  | 'sandbox.slept'
  | 'sandbox.woken'
  | 'sandbox.destroyed';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<SandboxRecordKind, true> {}
}
