// the tools module declares tool_called, and policy's tests write it to reach the places fold
export type PolicyTestRecordKind = 'tool_called';

declare module '@heynixie/log' {
  // oxlint-disable-next-line typescript/no-empty-interface -- the merge adds the kinds above to the registry
  interface RecordKinds extends Record<PolicyTestRecordKind, true> {}
}
